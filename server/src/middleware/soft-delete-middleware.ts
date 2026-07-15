import type { Modules } from '@strapi/types';

import { PLUGIN_ID, SOFT_DELETE_FIELD_NAMES } from '../constants';
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

/**
 * Delegates to the soft-delete service so the intercepted delete and the
 * programmatic API (`service('api').softDelete`) share ONE code path —
 * lifecycle hooks and events fire identically for both. Rejects when a hook
 * handler throws or cancels; the delete request then fails with that error.
 *
 * A concrete `locale` param (not `'*'`) restricts the soft delete to that
 * locale's rows, matching core's locale-scoped delete semantics.
 */
const handleDelete = async (
  ctx: Parameters<Middleware>[0],
): Promise<{ documentId: string; entries: AnyDocument[] }> => {
  const { uid } = ctx;
  const { documentId, locale } = ctx.params as { documentId: string; locale?: string | null };

  const auth = strapi.plugin(PLUGIN_ID).service('auth-resolver').resolveAuth();

  return strapi
    .plugin(PLUGIN_ID)
    .service('soft-delete')
    .softDeleteDocument(uid, documentId, auth, { locale });
};

export default softDeleteMiddleware;
