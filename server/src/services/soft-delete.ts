import type { Core, UID } from '@strapi/types';

import { PLUGIN_ID, SOFT_DELETE_FIELD_NAMES } from '../constants';
import type { SoftDeletedEntry, PaginatedResult, PluginSettings, ResolvedAuth } from '../types';

const { DELETED_AT, DELETED_BY_ID, DELETED_BY_TYPE } = SOFT_DELETE_FIELD_NAMES;

export interface FindManyParams {
  readonly page?: number;
  readonly pageSize?: number;
  readonly sort?: string;
  readonly filters?: Record<string, unknown>;
}

export interface OperationResult {
  readonly documentId: string;
  readonly entries: readonly Record<string, unknown>[];
}

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

  const handleSingleTypeConflict = async (
    uid: string,
    restoredDocumentId: string,
    settings: PluginSettings,
    auth: ResolvedAuth,
  ): Promise<void> => {
    const conflictingEntries = await strapi.db.query(uid).findMany({
      where: {
        documentId: { $ne: restoredDocumentId },
        [DELETED_AT]: null,
      },
    });

    if (conflictingEntries.length === 0) return;

    const bypass = getBypass();
    const eventEmitter = getEventEmitter();
    const conflictingDocumentIds = [
      ...new Set(conflictingEntries.map((e: Record<string, unknown>) => e.documentId as string)),
    ];

    if (settings.singleTypesRestorationBehavior === 'soft-delete') {
      const now = new Date().toISOString();

      // Disable ALL lifecycles for update — suppress beforeUpdate/afterUpdate
      strapi.db.lifecycles.disable();
      try {
        for (const conflictDocId of conflictingDocumentIds) {
          await strapi.db.query(uid).updateMany({
            where: { documentId: conflictDocId },
            data: {
              [DELETED_AT]: now,
              [DELETED_BY_ID]: auth.id,
              [DELETED_BY_TYPE]: auth.strategy,
            },
          });
        }
      } finally {
        strapi.db.lifecycles.enable();
      }

      for (const entry of conflictingEntries) {
        await eventEmitter.emit({
          uid,
          event: 'entry.update',
          action: 'soft-delete',
          entity: entry,
        });
      }
      return;
    }

    // delete-permanently branch with component cleanup
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

    for (const entry of conflictingEntries) {
      await eventEmitter.emit({
        uid,
        event: 'entry.delete',
        action: 'delete-permanently',
        entity: entry,
      });
    }
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

    const auth = getAuthResolver().resolveAuth();

    const shouldCancel = await lifecycleHooks.fire('beforeRestore', {
      uid,
      documentId,
      entries: entriesToRestore,
      auth,
    });
    if (shouldCancel) return null;

    // Disable ALL lifecycles for update — suppress beforeUpdate/afterUpdate
    strapi.db.lifecycles.disable();
    try {
      await strapi.db.query(uid).updateMany({
        where: { documentId },
        data: { [DELETED_AT]: null, [DELETED_BY_ID]: null, [DELETED_BY_TYPE]: null },
      });
    } finally {
      strapi.db.lifecycles.enable();
    }

    const restoredEntries = await strapi.db.query(uid).findMany({
      where: { documentId },
    });

    const contentType = strapi.contentTypes[uid as keyof typeof strapi.contentTypes];
    const hasDraftAndPublish = contentType?.options?.draftAndPublish;

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

    if (kind === 'singleType') {
      await handleSingleTypeConflict(uid, documentId, settings, auth);
    }

    await lifecycleHooks.fire('afterRestore', { uid, documentId, entries: restoredEntries, auth });

    for (const entry of restoredEntries) {
      await eventEmitter.emit({ uid, event: 'entry.update', action: 'restore', entity: entry });
    }

    return { documentId, entries: restoredEntries };
  };

  const deletePermanently = async (
    uid: string,
    documentId: string,
  ): Promise<OperationResult | null> => {
    const bypass = getBypass();
    const lifecycleHooks = getLifecycleHooks();
    const eventEmitter = getEventEmitter();
    const auth = getAuthResolver().resolveAuth();

    const entriesToDelete = await bypass(() =>
      strapi.db.query(uid).findMany({ where: { documentId } }),
    );

    if (entriesToDelete.length === 0) return null;

    const shouldCancel = await lifecycleHooks.fire('beforeDeletePermanently', {
      uid,
      documentId,
      entries: entriesToDelete,
      auth,
    });
    if (shouldCancel) return null;

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
    findMany,
    findOne,
    restore,
    deletePermanently,
    restoreMany,
    deleteManyPermanently,
  };
};

export default softDelete;
