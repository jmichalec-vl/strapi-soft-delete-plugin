import { AsyncLocalStorage } from 'node:async_hooks';

import type { Core } from '@strapi/types';

import { SOFT_DELETE_FIELD_NAMES } from '../constants';
import { supportsContentType } from '../utils';

const { DELETED_AT } = SOFT_DELETE_FIELD_NAMES;

/**
 * Database lifecycle subscriber that injects `_softDeletedAt IS NULL` into
 * every findOne/findMany/count query for api::* content types.
 *
 * Uses a request-scoped bypass (AsyncLocalStorage) instead of
 * strapi.db.lifecycles.disable() to avoid globally disabling all lifecycle
 * hooks (timestamps, i18n, etc.) for concurrent requests — and instead of a
 * service-instance boolean, whose window would leak soft-deleted rows into
 * CONCURRENT requests' reads. The ALS context follows the async call chain,
 * so it also propagates into `strapi.db.transaction()` callbacks.
 */
const dbSubscriber = ({ strapi }: { strapi: Core.Strapi }) => {
  const bypassStorage = new AsyncLocalStorage<boolean>();

  const injectSoftDeleteFilter = (params: Record<string, unknown>): void => {
    if (bypassStorage.getStore()) return;

    const existing = params.where as Record<string, unknown> | undefined;
    const softDeleteFilter = { [DELETED_AT]: { $null: true } };

    params.where = existing ? { $and: [existing, softDeleteFilter] } : softDeleteFilter;
  };

  const register = (): void => {
    strapi.db.lifecycles.subscribe({
      models: Object.keys(strapi.contentTypes).filter(supportsContentType),

      // Strapi's lifecycle Params type lacks a string index signature,
      // but params is a mutable object with `where` at runtime.
      beforeFindOne(event) {
        injectSoftDeleteFilter(event.params as unknown as Record<string, unknown>);
      },

      beforeFindMany(event) {
        injectSoftDeleteFilter(event.params as unknown as Record<string, unknown>);
      },

      beforeCount(event) {
        injectSoftDeleteFilter(event.params as unknown as Record<string, unknown>);
      },
    });

    strapi.log.info('[soft-delete] Database lifecycle subscriber registered.');
  };

  /**
   * Run a callback with the soft-delete filter bypassed.
   * Only affects the plugin's subscriber — all other lifecycle hooks remain
   * active — and only within `fn`'s async execution context: reads started
   * concurrently outside the callback keep the filter on.
   */
  const bypass = async <T>(fn: () => Promise<T>): Promise<T> => bypassStorage.run(true, fn);

  return { register, bypass };
};

export default dbSubscriber;
