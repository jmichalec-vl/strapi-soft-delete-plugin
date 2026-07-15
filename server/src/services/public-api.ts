import type { Core } from '@strapi/types';

import { PLUGIN_ID } from '../constants';
import type {
  PaginatedResult,
  ResolvedAuth,
  SoftDeleteApi,
  SoftDeleteApiOptions,
  SoftDeleteApiSoftDeleteOptions,
  SoftDeleteFindParams,
  SoftDeleteOperationResult,
  SoftDeletedEntry,
} from '../types';
import { getHostErrors, supportsContentType } from '../utils';

/**
 * Programmatic API for host applications:
 * `strapi.plugin('soft-delete').service('api')`.
 *
 * Thin, validated façade over the plugin internals. Write methods share the
 * exact code paths of the intercepted admin operations, so lifecycle hooks
 * fire and events are emitted identically — and they REJECT when a hook
 * handler throws or a `before*` handler returns `{ cancel: true }`.
 */
const publicApi = ({ strapi }: { strapi: Core.Strapi }): SoftDeleteApi => {
  const getSoftDeleteService = () => strapi.plugin(PLUGIN_ID).service('soft-delete');
  const getDbSubscriber = () => strapi.plugin(PLUGIN_ID).service('db-subscriber');
  const getAuthResolver = () => strapi.plugin(PLUGIN_ID).service('auth-resolver');

  const assertSupportedContentType = (uid: string): void => {
    if (supportsContentType(uid)) return;

    const { ApplicationError } = getHostErrors(strapi);
    throw new ApplicationError(
      `[soft-delete] Content type "${uid}" is not handled by the soft-delete plugin — only "api::" content types are supported`,
    );
  };

  const resolveAuth = (options?: SoftDeleteApiOptions): ResolvedAuth =>
    options?.auth ?? getAuthResolver().resolveAuth();

  const resolveKind = (uid: string): string => {
    const contentType = strapi.contentTypes[uid as keyof typeof strapi.contentTypes];
    return contentType?.kind ?? 'collectionType';
  };

  return {
    async softDelete(
      uid: string,
      documentId: string,
      options?: SoftDeleteApiSoftDeleteOptions,
    ): Promise<SoftDeleteOperationResult> {
      assertSupportedContentType(uid);
      return getSoftDeleteService().softDeleteDocument(uid, documentId, resolveAuth(options), {
        locale: options?.locale,
      });
    },

    async restore(
      uid: string,
      documentId: string,
      options?: SoftDeleteApiOptions,
    ): Promise<SoftDeleteOperationResult | null> {
      assertSupportedContentType(uid);
      return getSoftDeleteService().restore(
        uid,
        documentId,
        resolveKind(uid),
        resolveAuth(options),
      );
    },

    async deletePermanently(
      uid: string,
      documentId: string,
      options?: SoftDeleteApiOptions,
    ): Promise<SoftDeleteOperationResult | null> {
      assertSupportedContentType(uid);
      return getSoftDeleteService().deletePermanently(uid, documentId, resolveAuth(options));
    },

    async findSoftDeleted(
      uid: string,
      params?: SoftDeleteFindParams,
    ): Promise<PaginatedResult<SoftDeletedEntry>> {
      assertSupportedContentType(uid);
      return getSoftDeleteService().findMany(uid, params);
    },

    async withSoftDeleted<T>(fn: () => Promise<T>): Promise<T> {
      return getDbSubscriber().bypass(fn);
    },
  };
};

export default publicApi;
