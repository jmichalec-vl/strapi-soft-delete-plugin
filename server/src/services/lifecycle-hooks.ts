import type { Core } from '@strapi/types';

import type { LifecycleHookPayload } from '../types';

type HookName =
  | 'beforeSoftDelete'
  | 'afterSoftDelete'
  | 'beforeRestore'
  | 'afterRestore'
  | 'beforeDeletePermanently'
  | 'afterDeletePermanently';

type HookHandler = (payload: LifecycleHookPayload) => Promise<{ cancel?: boolean } | void> | void;

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

    async fire(hookName: HookName, payload: LifecycleHookPayload): Promise<boolean> {
      const handlers = getHandlers(hookName);
      const isBefore = hookName.startsWith('before');

      for (const handler of handlers) {
        try {
          const result = await handler(payload);
          if (isBefore && result?.cancel) {
            return true;
          }
        } catch (error) {
          strapi.log.error(`[soft-delete] Lifecycle hook "${hookName}" threw an error:`, error);
        }
      }

      return false;
    },
  };
};

export default lifecycleHooks;
