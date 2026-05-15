import type { Modules } from '@strapi/types';

import { PLUGIN_ID, SOFT_DELETE_FIELD_NAMES } from '../constants';
import type { ResolvedAuth } from '../types';
import { supportsContentType } from '../utils';

const { DELETED_AT, DELETED_BY_ID, DELETED_BY_TYPE } = SOFT_DELETE_FIELD_NAMES;

type Middleware = Modules.Documents.Middleware.Middleware;

const INTERCEPTED_READ_ACTIONS = new Set(['findMany', 'findOne', 'count']);
const INTERCEPTED_WRITE_ACTIONS = new Set(['create', 'update']);

const injectSoftDeleteFilter = (params: Record<string, unknown>): void => {
  const softDeleteFilter = { [DELETED_AT]: { $null: true } };
  params.filters = params.filters ? { $and: [params.filters, softDeleteFilter] } : softDeleteFilter;
};

const stripSoftDeleteFields = (data: Record<string, unknown>): void => {
  delete data[DELETED_AT];
  delete data[DELETED_BY_ID];
  delete data[DELETED_BY_TYPE];
};

const resolveAuthFromContext = (): ResolvedAuth => {
  const requestContext = strapi.requestContext.get();
  const auth = requestContext?.state?.auth;

  return {
    id: auth?.credentials?.id ?? null,
    strategy: auth?.strategy?.name ?? 'unknown',
  } as ResolvedAuth;
};

const getBypass = () => strapi.plugin(PLUGIN_ID).service('db-subscriber').bypass;

/**
 * Document Service middleware.
 *
 * Two-layer filtering:
 * - This middleware: filters at Document Service level (findMany/findOne/count params.filters)
 * - DB subscriber (db-subscriber.ts): filters at DB level (params.where) for populated relations
 */
const stripSoftDeleteFieldsFromResult = (result: unknown): unknown => {
  if (!result) return result;

  if (Array.isArray(result)) {
    result.forEach((item) => {
      if (item && typeof item === 'object') {
        stripSoftDeleteFields(item as Record<string, unknown>);
      }
    });
    return result;
  }

  if (typeof result === 'object') {
    stripSoftDeleteFields(result as Record<string, unknown>);

    // Handle Document Service delete response shape { documentId, entries: [...] }
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.entries)) {
      r.entries.forEach((entry) => {
        if (entry && typeof entry === 'object') {
          stripSoftDeleteFields(entry as Record<string, unknown>);
        }
      });
    }
  }

  return result;
};

const softDeleteMiddleware: Middleware = async (ctx, next) => {
  if (!supportsContentType(ctx.uid)) {
    return next();
  }

  if (ctx.action === 'delete') {
    return handleDelete(ctx);
  }

  if (INTERCEPTED_READ_ACTIONS.has(ctx.action)) {
    injectSoftDeleteFilter(ctx.params as Record<string, unknown>);
  }

  if (INTERCEPTED_WRITE_ACTIONS.has(ctx.action)) {
    const data = (ctx.params as Record<string, unknown>).data;
    if (data && typeof data === 'object') {
      stripSoftDeleteFields(data as Record<string, unknown>);
    }
  }

  const result = await next();

  // Strip internal soft-delete fields from Document Service responses
  return stripSoftDeleteFieldsFromResult(result) as Awaited<ReturnType<typeof next>>;
};

interface AnyDocument {
  documentId: string;
  id: string | number;
  [key: string]: unknown;
}

const handleDelete = async (
  ctx: Parameters<Middleware>[0],
): Promise<{ documentId: string; entries: AnyDocument[] }> => {
  const { uid } = ctx;
  const { documentId } = ctx.params as { documentId: string };

  const auth = resolveAuthFromContext();
  const bypass = getBypass();

  const lifecycleHooksService = strapi.plugin(PLUGIN_ID).service('lifecycle-hooks');
  const eventEmitterService = strapi.plugin(PLUGIN_ID).service('event-emitter');

  // Bypass our subscriber filter to find all entries for this document
  const entriesToSoftDelete = await bypass(() =>
    strapi.db.query(uid).findMany({ where: { documentId } }),
  );

  if (entriesToSoftDelete.length === 0) {
    return { documentId, entries: [] };
  }

  const shouldCancel = await lifecycleHooksService.fire('beforeSoftDelete', {
    uid,
    documentId,
    entries: entriesToSoftDelete,
    auth,
  });

  if (shouldCancel) {
    return { documentId, entries: [] };
  }

  const now = new Date().toISOString();

  // Disable ALL lifecycles for the update — we don't want beforeUpdate/afterUpdate
  // to fire during soft-delete. Only our custom hooks should run.
  strapi.db.lifecycles.disable();
  try {
    await strapi.db.query(uid).updateMany({
      where: { documentId },
      data: {
        [DELETED_AT]: now,
        [DELETED_BY_ID]: auth.id,
        [DELETED_BY_TYPE]: auth.strategy,
      },
    });
  } finally {
    strapi.db.lifecycles.enable();
  }

  // Bypass subscriber to fetch the now-soft-deleted entries
  const softDeletedEntries = await bypass(() =>
    strapi.db.query(uid).findMany({ where: { documentId } }),
  );

  await lifecycleHooksService.fire('afterSoftDelete', {
    uid,
    documentId,
    entries: softDeletedEntries,
    auth,
  });

  for (const entry of softDeletedEntries) {
    await eventEmitterService.emit({
      uid,
      event: 'entry.delete',
      action: 'soft-delete',
      entity: entry,
    });
  }

  return { documentId, entries: softDeletedEntries };
};

export default softDeleteMiddleware;
