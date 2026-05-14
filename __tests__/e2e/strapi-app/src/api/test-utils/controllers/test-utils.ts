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
};
