export interface SoftDeletedBy {
  readonly id: number | null;
  readonly type: string;
  readonly name?: string;
}

export interface SoftDeletedEntry {
  readonly id: number;
  readonly documentId: string;
  readonly _softDeletedAt: string;
  readonly _softDeletedById: number | null;
  readonly _softDeletedByType: string;
  readonly _softDeletedBy?: SoftDeletedBy;
  readonly [key: string]: unknown;
}

export interface PaginatedResult<T> {
  readonly results: readonly T[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly pageCount: number;
  };
}

export const AUTH_STRATEGIES = [
  'admin',
  'api-token',
  'transfer-token',
  'users-permissions',
] as const;
export type AuthStrategy = (typeof AUTH_STRATEGIES)[number];

export interface ResolvedAuth {
  readonly id: number | null;
  readonly strategy: AuthStrategy;
}

export interface LifecycleHookPayload {
  readonly uid: string;
  readonly documentId: string;
  readonly entries: readonly Record<string, unknown>[];
  readonly auth: ResolvedAuth;
}

/**
 * Return value of a lifecycle hook handler.
 * `before*` handlers may return `{ cancel: true }` to abort the operation —
 * the plugin then throws `error` if provided, or a default ForbiddenError.
 */
export interface LifecycleHookResult {
  readonly cancel?: boolean;
  readonly error?: Error;
}

export type LifecycleHookHandlerResult = LifecycleHookResult | void;
