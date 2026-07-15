export type {
  PluginSettings,
  SingleTypeRestorationBehavior,
  DraftPublishRestorationBehavior,
} from './settings';
export { DEFAULT_SETTINGS } from './settings';

export type {
  SoftDeletedBy,
  SoftDeletedEntry,
  PaginatedResult,
  AuthStrategy,
  ResolvedAuth,
  LifecycleHookPayload,
  LifecycleHookResult,
  LifecycleHookHandlerResult,
} from './soft-deleted-entry';

export type {
  SoftDeleteApi,
  SoftDeleteApiOptions,
  SoftDeleteApiSoftDeleteOptions,
  SoftDeleteFindParams,
  SoftDeleteOperationResult,
} from './public-api';
