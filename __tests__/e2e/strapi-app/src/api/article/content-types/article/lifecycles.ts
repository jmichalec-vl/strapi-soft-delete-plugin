/**
 * Lifecycle hooks that log every invocation to a global array.
 * Used by E2E tests to verify which hooks fire during soft-delete operations.
 */

// Global hook log — accessible via GET /api/test-utils/lifecycle-log
(globalThis as Record<string, unknown>).__articleLifecycleLog =
  (globalThis as Record<string, unknown>).__articleLifecycleLog ?? [];

const log = (hookName: string) => {
  const arr = (globalThis as Record<string, unknown>).__articleLifecycleLog as string[];
  arr.push(hookName);
};

export default {
  beforeCreate() {
    log('beforeCreate');
  },
  afterCreate() {
    log('afterCreate');
  },
  beforeUpdate() {
    log('beforeUpdate');
  },
  afterUpdate() {
    log('afterUpdate');
  },
  beforeDelete() {
    log('beforeDelete');
  },
  afterDelete() {
    log('afterDelete');
  },
  beforeUpdateMany() {
    log('beforeUpdateMany');
  },
  afterUpdateMany() {
    log('afterUpdateMany');
  },
  beforeDeleteMany() {
    log('beforeDeleteMany');
  },
  afterDeleteMany() {
    log('afterDeleteMany');
  },
};
