import type { PaginatedResult, ResolvedAuth, SoftDeletedEntry } from './soft-deleted-entry';

/**
 * Options accepted by the write methods of the programmatic API.
 */
export interface SoftDeleteApiOptions {
  /**
   * Attribution override for contexts without an HTTP request (cron jobs,
   * CLI scripts, bootstrap code). When omitted, the auth is resolved from
   * the current request context.
   */
  readonly auth?: ResolvedAuth;
}

/**
 * Query parameters for `findSoftDeleted`.
 */
export interface SoftDeleteFindParams {
  readonly page?: number;
  readonly pageSize?: number;
  readonly sort?: string;
  readonly filters?: Record<string, unknown>;
}

/**
 * Result of a soft-delete, restore, or permanent-delete operation.
 */
export interface SoftDeleteOperationResult {
  readonly documentId: string;
  readonly entries: readonly Record<string, unknown>[];
}

/**
 * Programmatic API exposed as `strapi.plugin('soft-delete').service('api')`.
 *
 * Error semantics: `softDelete`, `restore`, and `deletePermanently` run the
 * plugin's lifecycle hooks exactly like the intercepted admin operations do.
 * They REJECT when a `before*` hook handler throws or returns
 * `{ cancel: true }`, and when an `after*` hook handler throws — the caller
 * must be prepared to handle these rejections.
 *
 * All methods throw an `ApplicationError` when `uid` is not an `api::`
 * content type.
 */
export interface SoftDeleteApi {
  /**
   * Soft-delete a document. Same code path as an intercepted
   * `documents(uid).delete()` — fires `beforeSoftDelete`/`afterSoftDelete`
   * hooks and emits `entry.delete` events.
   */
  softDelete(
    uid: string,
    documentId: string,
    options?: SoftDeleteApiOptions,
  ): Promise<SoftDeleteOperationResult>;

  /**
   * Restore a soft-deleted document. Fires `beforeRestore`/`afterRestore`
   * hooks and respects the restoration-behavior settings. Resolves `null`
   * when no soft-deleted entries exist for the document.
   */
  restore(
    uid: string,
    documentId: string,
    options?: SoftDeleteApiOptions,
  ): Promise<SoftDeleteOperationResult | null>;

  /**
   * Permanently delete a document (including component cleanup). Fires
   * `beforeDeletePermanently`/`afterDeletePermanently` hooks. Resolves
   * `null` when the document has no entries.
   */
  deletePermanently(
    uid: string,
    documentId: string,
    options?: SoftDeleteApiOptions,
  ): Promise<SoftDeleteOperationResult | null>;

  /**
   * List soft-deleted documents (paginated, deduplicated by documentId).
   */
  findSoftDeleted(
    uid: string,
    params?: SoftDeleteFindParams,
  ): Promise<PaginatedResult<SoftDeletedEntry>>;

  /**
   * Run `fn` with the plugin's soft-delete read filter turned off — reads
   * inside the callback see soft-deleted rows. Only the plugin's own filter
   * is bypassed; all other lifecycle hooks stay active.
   */
  withSoftDeleted<T>(fn: () => Promise<T>): Promise<T>;
}
