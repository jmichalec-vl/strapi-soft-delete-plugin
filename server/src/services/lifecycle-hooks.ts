import type { Core } from '@strapi/types';

import type { LifecycleHookPayload, LifecycleHookHandlerResult } from '../types';
import { getHostErrors } from '../utils';

type HookName =
  | 'beforeSoftDelete'
  | 'afterSoftDelete'
  | 'beforeRestore'
  | 'afterRestore'
  | 'beforeDeletePermanently'
  | 'afterDeletePermanently';

type HookHandler = (
  payload: LifecycleHookPayload,
) => Promise<LifecycleHookHandlerResult> | LifecycleHookHandlerResult;

const lifecycleHooks = ({ strapi }: { strapi: Core.Strapi }) => {
  const registry = new Map<HookName, HookHandler[]>();

  const getHandlers = (hookName: HookName): HookHandler[] => {
    if (!registry.has(hookName)) {
      registry.set(hookName, []);
    }
    return registry.get(hookName)!;
  };

  return {
    register(hookName: HookName, handler: HookHandler): void {
      getHandlers(hookName).push(handler);
    },

    /**
     * Run all handlers registered for a hook, in registration order.
     *
     * Error semantics (since 0.2.0):
     * - A handler exception is logged and re-thrown — it aborts the operation
     *   and surfaces to the caller (the admin/API request fails with that error).
     * - A `before*` handler returning `{ cancel: true }` throws `error` if
     *   provided, otherwise a default ForbiddenError. Later handlers don't run.
     * - `after*` handler exceptions also propagate. For soft-delete and
     *   restore the write and the `after*` hooks run inside a plugin-owned
     *   transaction, so the throw ROLLS BACK the operation — host cascades
     *   are atomic. For permanent delete the rows are already gone when
     *   `afterDeletePermanently` runs; a throw surfaces the error but does
     *   not bring them back.
     */
    async fire(hookName: HookName, payload: LifecycleHookPayload): Promise<void> {
      const handlers = getHandlers(hookName);
      const isBefore = hookName.startsWith('before');

      for (const handler of handlers) {
        let result: LifecycleHookHandlerResult;

        try {
          result = await handler(payload);
        } catch (error) {
          strapi.log.error(`[soft-delete] Lifecycle hook "${hookName}" threw an error:`, error);
          throw error;
        }

        if (isBefore && result?.cancel) {
          // PolicyError (a ForbiddenError subclass) instead of plain ForbiddenError:
          // Strapi's route layer masks ForbiddenError messages with a generic
          // "Forbidden" response, but explicitly lets PolicyError carry a
          // publicly visible message (see @strapi/core compose-endpoint.ts).
          const { PolicyError } = getHostErrors(strapi);
          throw result.error ?? new PolicyError(`Operation cancelled by ${hookName} hook`);
        }
      }
    },
  };
};

export default lifecycleHooks;
