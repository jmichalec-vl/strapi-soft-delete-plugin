import authResolver from './auth-resolver';
import eventEmitter from './event-emitter';
import lifecycleHooks from './lifecycle-hooks';
import settings from './settings';
import migration from './migration';
import softDelete from './soft-delete';
import autoPurge from './auto-purge';
import dbSubscriber from './db-subscriber';

export default {
  'auth-resolver': authResolver,
  'event-emitter': eventEmitter,
  'lifecycle-hooks': lifecycleHooks,
  settings,
  migration,
  'soft-delete': softDelete,
  'auto-purge': autoPurge,
  'db-subscriber': dbSubscriber,
};
