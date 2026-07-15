import type { Core, UID } from '@strapi/types';
import type { Knex } from 'knex';

import { PLUGIN_ID, SOFT_DELETE_FIELD_NAMES } from '../constants';
import type {
  SoftDeletedEntry,
  PaginatedResult,
  PluginSettings,
  ResolvedAuth,
  SoftDeleteFindParams,
  SoftDeleteOperationResult,
} from '../types';
import type { EmitParams } from './event-emitter';

const { DELETED_AT, DELETED_BY_ID, DELETED_BY_TYPE } = SOFT_DELETE_FIELD_NAMES;

interface SoftDeleteColumnValues {
  readonly deletedAt: Date | null;
  readonly deletedById: number | null;
  readonly deletedByType: string | null;
}

/**
 * Options for `softDeleteDocument`. A concrete `locale` (anything but `'*'`,
 * `null`, or `undefined`) restricts the soft delete to that locale's rows;
 * otherwise every locale of the document is soft-deleted, matching core's
 * `documents().delete` semantics.
 */
export interface SoftDeleteDocumentOptions {
  readonly locale?: string | null;
}

const toLocaleConstraint = (locale: string | null | undefined): string | undefined =>
  locale && locale !== '*' ? locale : undefined;

/**
 * Raw, statement-scoped knex update of the soft-delete columns for every row
 * of a document (optionally restricted to one locale).
 *
 * Deliberately bypasses the query engine so core DB lifecycles
 * (beforeUpdate/afterUpdate/...) don't fire for the internal write. This
 * replaces the former process-global `strapi.db.lifecycles.disable()/enable()`
 * switch, which silently skipped every CONCURRENT request's lifecycles
 * (host validations, timestamps, ...) during the write window.
 */
const updateSoftDeleteColumns = async (
  uid: string,
  documentId: string,
  values: SoftDeleteColumnValues,
  trx: Knex.Transaction,
  locale?: string,
): Promise<void> => {
  const metadata = strapi.db.metadata.get(uid);

  const column = (attributeName: string): string => {
    const attribute = metadata.attributes[attributeName];
    const columnName = attribute && 'columnName' in attribute ? attribute.columnName : undefined;

    if (!columnName) {
      throw new Error(`[soft-delete] Missing column metadata for "${attributeName}" on "${uid}"`);
    }

    return columnName;
  };

  const query = strapi.db
    .getConnection(metadata.tableName)
    .transacting(trx)
    .where(column('documentId'), documentId);

  await (locale ? query.where(column('locale'), locale) : query).update({
    [column(DELETED_AT)]: values.deletedAt,
    [column(DELETED_BY_ID)]: values.deletedById,
    [column(DELETED_BY_TYPE)]: values.deletedByType,
  });
};

export type FindManyParams = SoftDeleteFindParams;

export type OperationResult = SoftDeleteOperationResult;

/**
 * Get attribute names that are components or dynamic zones for a content type.
 */
const getComponentAttributes = (uid: string): string[] => {
  const model = strapi.getModel(uid as UID.Schema);
  if (!model) return [];

  return Object.entries(model.attributes)
    .filter(
      ([, attr]) =>
        (attr as { type: string }).type === 'component' ||
        (attr as { type: string }).type === 'dynamiczone',
    )
    .map(([name]) => name);
};

/**
 * Recursively delete components attached to an entry.
 * Mirrors Strapi's internal deleteComponents logic.
 */
const deleteEntryComponents = async (
  uid: string,
  entity: Record<string, unknown>,
): Promise<void> => {
  const model = strapi.getModel(uid as UID.Schema);
  if (!model) return;

  for (const [attrName, attr] of Object.entries(model.attributes)) {
    const attrDef = attr as { type: string; component?: string; repeatable?: boolean };
    const value = entity[attrName];
    if (!value) continue;

    if (attrDef.type === 'component' && attrDef.component) {
      const items = attrDef.repeatable
        ? (value as Record<string, unknown>[])
        : [value as Record<string, unknown>];
      for (const item of items) {
        await deleteEntryComponents(attrDef.component, item);
        await strapi.db
          .query(attrDef.component)
          .delete({ where: { id: (item as unknown as { id: number }).id } });
      }
    }

    if (attrDef.type === 'dynamiczone') {
      for (const item of value as Array<Record<string, unknown> & { __component: string }>) {
        await deleteEntryComponents(item.__component, item);
        await strapi.db
          .query(item.__component)
          .delete({ where: { id: (item as unknown as { id: number }).id } });
      }
    }
  }
};

const softDelete = ({ strapi }: { strapi: Core.Strapi }) => {
  const getAuthResolver = () => strapi.plugin(PLUGIN_ID).service('auth-resolver');
  const getEventEmitter = () => strapi.plugin(PLUGIN_ID).service('event-emitter');
  const getLifecycleHooks = () => strapi.plugin(PLUGIN_ID).service('lifecycle-hooks');
  const getSettingsService = () => strapi.plugin(PLUGIN_ID).service('settings');

  // bypass() skips only our soft-delete filter — all other lifecycle hooks stay active
  const getBypass = (): (<T>(fn: () => Promise<T>) => Promise<T>) =>
    strapi.plugin(PLUGIN_ID).service('db-subscriber').bypass;

  const enrichWithDeletedBy = async (entry: Record<string, unknown>): Promise<SoftDeletedEntry> => {
    const deletedBy = await getAuthResolver().resolveDisplayName(
      entry[DELETED_BY_ID],
      entry[DELETED_BY_TYPE],
    );
    return { ...entry, _softDeletedBy: deletedBy } as SoftDeletedEntry;
  };

  /**
   * Runs inside the restore transaction. Returns the events to emit once the
   * transaction commits instead of emitting them itself — consumers must not
   * be notified about writes that may still roll back.
   */
  const handleSingleTypeConflict = async (
    uid: string,
    restoredDocumentId: string,
    settings: PluginSettings,
    auth: ResolvedAuth,
    trx: Knex.Transaction,
  ): Promise<readonly EmitParams[]> => {
    const conflictingEntries = await strapi.db.query(uid).findMany({
      where: {
        documentId: { $ne: restoredDocumentId },
        [DELETED_AT]: null,
      },
    });

    if (conflictingEntries.length === 0) return [];

    const bypass = getBypass();
    const conflictingDocumentIds = [
      ...new Set(conflictingEntries.map((e: Record<string, unknown>) => e.documentId as string)),
    ];

    if (settings.singleTypesRestorationBehavior === 'soft-delete') {
      const deletedAt = new Date();

      for (const conflictDocId of conflictingDocumentIds) {
        await updateSoftDeleteColumns(
          uid,
          conflictDocId,
          { deletedAt, deletedById: auth.id, deletedByType: auth.strategy },
          trx,
        );
      }

      return conflictingEntries.map((entry: Record<string, unknown>) => ({
        uid,
        event: 'entry.update',
        action: 'soft-delete',
        entity: entry,
      }));
    }

    // delete-permanently branch with component cleanup — these db.query
    // deletes join the ambient transaction via Strapi's transaction context
    await bypass(async () => {
      for (const entry of conflictingEntries) {
        const entryId = (entry as { id: number }).id;
        const componentAttrs = getComponentAttributes(uid);
        const components =
          componentAttrs.length > 0 ? await strapi.db.query(uid).load(entry, componentAttrs) : {};
        await strapi.db.query(uid).delete({ where: { id: entryId } });
        if (componentAttrs.length > 0) {
          await deleteEntryComponents(uid, { ...entry, ...components });
        }
      }
    });

    return conflictingEntries.map((entry: Record<string, unknown>) => ({
      uid,
      event: 'entry.delete',
      action: 'delete-permanently',
      entity: entry,
    }));
  };

  /**
   * Core soft-delete path — shared by the Document Service middleware
   * (intercepted `documents(uid).delete()`) and the programmatic API.
   *
   * When `options.locale` is a concrete locale (not `'*'`), only that
   * locale's rows are soft-deleted — other locales stay live, matching
   * core's locale-scoped `documents().delete({ documentId, locale })`.
   *
   * Fires `beforeSoftDelete`/`afterSoftDelete` hooks and emits an
   * `entry.delete` event per affected entry. Rejects when a hook handler
   * throws or a `before*` handler cancels — the write does not happen.
   * The write and the `afterSoftDelete` hooks run in a plugin-owned
   * transaction, so an after-hook throw ROLLS BACK the soft delete.
   */
  const softDeleteDocument = async (
    uid: string,
    documentId: string,
    auth: ResolvedAuth,
    options: SoftDeleteDocumentOptions = {},
  ): Promise<OperationResult> => {
    const bypass = getBypass();
    const lifecycleHooks = getLifecycleHooks();
    const eventEmitter = getEventEmitter();

    const locale = toLocaleConstraint(options.locale);
    const where = locale ? { documentId, locale } : { documentId };

    // Bypass our subscriber filter to find the affected entries
    const entriesToSoftDelete = await bypass(() => strapi.db.query(uid).findMany({ where }));

    if (entriesToSoftDelete.length === 0) {
      return { documentId, entries: [] };
    }

    // Throws on handler error or { cancel: true } — the delete request then
    // fails with that error instead of reporting a silent empty success.
    // Fired BEFORE the transaction: a veto never opens one.
    await lifecycleHooks.fire('beforeSoftDelete', {
      uid,
      documentId,
      entries: entriesToSoftDelete,
      auth,
    });

    // Plugin-owned transaction: the middleware replaces the core delete, so
    // there is NO ambient document-service transaction here. Spanning the
    // write AND the after-hooks makes host cascades atomic — an
    // afterSoftDelete throw rolls the soft delete back.
    const softDeletedEntries = await strapi.db.transaction(async ({ trx }) => {
      await updateSoftDeleteColumns(
        uid,
        documentId,
        { deletedAt: new Date(), deletedById: auth.id, deletedByType: auth.strategy },
        trx,
        locale,
      );

      // db.query joins the transaction via Strapi's transaction context;
      // bypass our subscriber to fetch the now-soft-deleted entries
      const entries = await bypass(() => strapi.db.query(uid).findMany({ where }));

      await lifecycleHooks.fire('afterSoftDelete', { uid, documentId, entries, auth });

      return entries;
    });

    // Emitted only after the transaction commits — consumers are never
    // notified about a rolled-back write.
    for (const entry of softDeletedEntries) {
      await eventEmitter.emit({
        uid,
        event: 'entry.delete',
        action: 'soft-delete',
        entity: entry,
      });
    }

    return { documentId, entries: softDeletedEntries };
  };

  const findMany = async (
    uid: string,
    params: FindManyParams = {},
  ): Promise<PaginatedResult<SoftDeletedEntry>> => {
    const { page = 1, pageSize = 10, sort, filters = {} } = params;
    const bypass = getBypass();

    const { deletedAfter, deletedBefore, ...restFilters } = filters as Record<string, unknown>;
    const dateFilter: Record<string, unknown> = { $ne: null };
    if (deletedAfter) dateFilter.$gte = deletedAfter;
    if (deletedBefore) dateFilter.$lte = deletedBefore;

    const where = { [DELETED_AT]: dateFilter, ...restFilters };

    // Bypass our filter — we're intentionally querying soft-deleted entries
    const allEntries = await bypass(() =>
      strapi.db.query(uid).findMany({
        where,
        orderBy: sort ? { [sort]: 'desc' } : { [DELETED_AT]: 'desc' },
      }),
    );

    // Deduplicate by documentId (D&P content types have multiple rows per document)
    const seenDocumentIds = new Set<string>();
    const uniqueEntries = allEntries.filter((entry: Record<string, unknown>) => {
      const docId = entry.documentId as string;
      if (seenDocumentIds.has(docId)) return false;
      seenDocumentIds.add(docId);
      return true;
    });

    const total = uniqueEntries.length;
    const paginatedEntries = uniqueEntries.slice((page - 1) * pageSize, page * pageSize);
    const enrichedEntries = await Promise.all(paginatedEntries.map(enrichWithDeletedBy));

    return {
      results: enrichedEntries,
      pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  };

  const findOne = async (uid: string, documentId: string): Promise<SoftDeletedEntry | null> => {
    const bypass = getBypass();

    const entry = await bypass(() =>
      strapi.db.query(uid).findOne({
        where: { documentId, [DELETED_AT]: { $ne: null } },
      }),
    );

    if (!entry) return null;
    return enrichWithDeletedBy(entry);
  };

  const restore = async (
    uid: string,
    documentId: string,
    kind: string,
    authOverride?: ResolvedAuth,
  ): Promise<OperationResult | null> => {
    const bypass = getBypass();
    const lifecycleHooks = getLifecycleHooks();
    const eventEmitter = getEventEmitter();
    const settings = await getSettingsService().get();

    const entriesToRestore = await bypass(() =>
      strapi.db.query(uid).findMany({
        where: { documentId, [DELETED_AT]: { $ne: null } },
      }),
    );

    if (entriesToRestore.length === 0) return null;

    const auth = authOverride ?? getAuthResolver().resolveAuth();

    // Throws on handler error or { cancel: true } — the restore then fails
    // with that error. Fired BEFORE the transaction: a veto never opens one.
    await lifecycleHooks.fire('beforeRestore', {
      uid,
      documentId,
      entries: entriesToRestore,
      auth,
    });

    const contentType = strapi.contentTypes[uid as keyof typeof strapi.contentTypes];
    const hasDraftAndPublish = contentType?.options?.draftAndPublish;

    // Plugin-owned transaction spanning the restore write, the D&P/single-type
    // follow-ups, and the afterRestore hooks — an after-hook throw rolls the
    // whole restore back.
    const { restoredEntries, deferredEvents } = await strapi.db.transaction(async ({ trx }) => {
      await updateSoftDeleteColumns(
        uid,
        documentId,
        { deletedAt: null, deletedById: null, deletedByType: null },
        trx,
      );

      const entries = await strapi.db.query(uid).findMany({
        where: { documentId },
      });

      if (hasDraftAndPublish && settings.draftPublishRestorationBehavior === 'draft') {
        try {
          // SAFETY: strapi.documents() typing doesn't accept dynamic uid
          await (
            strapi.documents as unknown as (
              ...args: unknown[]
            ) => Record<string, (...args: unknown[]) => unknown>
          )(uid).unpublish({
            documentId,
          });
        } catch {
          /* Entry may already be in draft state */
        }
      }

      const singleTypeEvents =
        kind === 'singleType'
          ? await handleSingleTypeConflict(uid, documentId, settings, auth, trx)
          : [];

      await lifecycleHooks.fire('afterRestore', { uid, documentId, entries, auth });

      return { restoredEntries: entries, deferredEvents: singleTypeEvents };
    });

    // Emitted only after the transaction commits — consumers are never
    // notified about a rolled-back write.
    for (const event of deferredEvents) {
      await eventEmitter.emit(event);
    }

    for (const entry of restoredEntries) {
      await eventEmitter.emit({ uid, event: 'entry.update', action: 'restore', entity: entry });
    }

    return { documentId, entries: restoredEntries };
  };

  const deletePermanently = async (
    uid: string,
    documentId: string,
    authOverride?: ResolvedAuth,
  ): Promise<OperationResult | null> => {
    const bypass = getBypass();
    const lifecycleHooks = getLifecycleHooks();
    const eventEmitter = getEventEmitter();
    const auth = authOverride ?? getAuthResolver().resolveAuth();

    const entriesToDelete = await bypass(() =>
      strapi.db.query(uid).findMany({ where: { documentId } }),
    );

    if (entriesToDelete.length === 0) return null;

    // Throws on handler error or { cancel: true } — the deletion then fails with that error
    await lifecycleHooks.fire('beforeDeletePermanently', {
      uid,
      documentId,
      entries: entriesToDelete,
      auth,
    });

    // Delete each entry individually with component cleanup.
    // Bypass our filter so the WHERE clause finds soft-deleted entries.
    // Core beforeDelete/afterDelete hooks still fire.
    await bypass(async () => {
      for (const entry of entriesToDelete) {
        const entryId = (entry as { id: number }).id;

        // Load components before deleting (same pattern as Strapi's entries.delete)
        const componentAttributes = getComponentAttributes(uid);
        const componentsToDelete =
          componentAttributes.length > 0
            ? await strapi.db.query(uid).load(entry, componentAttributes)
            : {};

        // Delete the main entry
        await strapi.db.query(uid).delete({ where: { id: entryId } });

        // Delete orphaned components
        if (componentAttributes.length > 0) {
          await deleteEntryComponents(uid, { ...entry, ...componentsToDelete });
        }
      }
    });

    await lifecycleHooks.fire('afterDeletePermanently', {
      uid,
      documentId,
      entries: entriesToDelete,
      auth,
    });

    for (const entry of entriesToDelete) {
      await eventEmitter.emit({
        uid,
        event: 'entry.delete',
        action: 'delete-permanently',
        entity: entry,
      });
    }

    return { documentId, entries: entriesToDelete };
  };

  const restoreMany = async (
    uid: string,
    documentIds: readonly string[],
    kind: string,
  ): Promise<readonly OperationResult[]> => {
    const results: OperationResult[] = [];
    for (const documentId of documentIds) {
      const result = await restore(uid, documentId, kind);
      if (result) results.push(result);
    }
    return results;
  };

  const deleteManyPermanently = async (
    uid: string,
    documentIds: readonly string[],
  ): Promise<readonly OperationResult[]> => {
    const results: OperationResult[] = [];
    for (const documentId of documentIds) {
      const result = await deletePermanently(uid, documentId);
      if (result) results.push(result);
    }
    return results;
  };

  return {
    softDeleteDocument,
    findMany,
    findOne,
    restore,
    deletePermanently,
    restoreMany,
    deleteManyPermanently,
  };
};

export default softDelete;
