/**
 * Public TypeScript types for host applications.
 *
 * The runtime API is server-only and reached through the plugin registry:
 *
 * ```ts
 * import type { SoftDeleteApi } from 'strapi-soft-delete-plugin';
 *
 * const api = strapi.plugin('soft-delete').service('api') as SoftDeleteApi;
 * ```
 */
export type {
  SoftDeleteApi,
  SoftDeleteApiOptions,
  SoftDeleteFindParams,
  SoftDeleteOperationResult,
  SoftDeletedBy,
  SoftDeletedEntry,
  PaginatedResult,
  AuthStrategy,
  ResolvedAuth,
  LifecycleHookPayload,
  LifecycleHookResult,
  LifecycleHookHandlerResult,
  PluginSettings,
  SingleTypeRestorationBehavior,
  DraftPublishRestorationBehavior,
} from './server/src/types';
