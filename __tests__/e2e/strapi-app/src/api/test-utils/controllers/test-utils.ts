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

  // Invokes the plugin's programmatic API (server-only) so E2E tests can
  // exercise it over HTTP: { method, uid, documentId?, params?, options? }.
  async invokePublicApi(ctx) {
    const { method, uid, documentId, params, options } = ctx.request.body as {
      method: 'softDelete' | 'restore' | 'deletePermanently' | 'findSoftDeleted';
      uid: string;
      documentId?: string;
      params?: Record<string, unknown>;
      options?: Record<string, unknown>;
    };

    const api = strapi.plugin('soft-delete').service('api');

    try {
      const result =
        method === 'findSoftDeleted'
          ? await api.findSoftDeleted(uid, params)
          : await api[method](uid, documentId, options);
      ctx.body = { ok: true, result };
    } catch (error) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: {
          name: error instanceof Error ? error.name : 'Error',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },

  // Compares a plain db.query read (soft-delete filter ON) with the same read
  // inside withSoftDeleted (filter OFF) for a given document.
  async compareSoftDeletedReads(ctx) {
    const { uid, documentId } = ctx.request.body as { uid: string; documentId: string };
    const api = strapi.plugin('soft-delete').service('api');

    const plainRows = await strapi.db.query(uid).findMany({ where: { documentId } });
    const bypassedRows = await api.withSoftDeleted(() =>
      strapi.db.query(uid).findMany({ where: { documentId } }),
    );

    ctx.body = { plainCount: plainRows.length, bypassedCount: bypassedRows.length };
  },
};
