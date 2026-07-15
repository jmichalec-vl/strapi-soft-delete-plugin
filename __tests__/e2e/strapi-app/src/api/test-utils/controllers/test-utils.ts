export default {
  async getLifecycleLog(ctx) {
    ctx.body = {
      log: (globalThis as Record<string, unknown>).__articleLifecycleLog ?? [],
    };
  },

  async clearLifecycleLog(ctx) {
    (globalThis as Record<string, unknown>).__articleLifecycleLog = [];
    ctx.body = { cleared: true };
  },

  async setSoftDeleteHookBehavior(ctx) {
    const { hook, behavior } = ctx.request.body as { hook: string; behavior: string };
    const globals = globalThis as Record<string, unknown>;
    const behaviors = (globals.__softDeleteHookBehaviors ?? {}) as Record<string, string>;

    behaviors[hook] = behavior;
    globals.__softDeleteHookBehaviors = behaviors;

    ctx.body = { hook, behavior };
  },

  async resetSoftDeleteHookBehaviors(ctx) {
    (globalThis as Record<string, unknown>).__softDeleteHookBehaviors = {};
    ctx.body = { reset: true };
  },
};
