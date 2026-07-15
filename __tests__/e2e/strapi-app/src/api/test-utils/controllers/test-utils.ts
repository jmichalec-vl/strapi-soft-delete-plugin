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

  async getSoftDeleteHookLog(ctx) {
    ctx.body = {
      log: (globalThis as Record<string, unknown>).__softDeleteHookLog ?? [],
    };
  },

  async clearSoftDeleteHookLog(ctx) {
    (globalThis as Record<string, unknown>).__softDeleteHookLog = [];
    ctx.body = { cleared: true };
  },

  // Runs the plugin's auto-purge service directly (instead of waiting for
  // cron) so E2E tests can exercise the TTL purge on demand.
  async runAutoPurge(ctx) {
    const { ttlDays } = ctx.request.body as { ttlDays: number };

    const purged = await strapi
      .plugin('soft-delete')
      .service('auto-purge')
      .purgeExpiredEntries(ttlDays);

    ctx.body = { purged };
  },

  // Rewrites _softDeletedAt for a document so tests can simulate entries
  // trashed in the past (beyond the auto-purge TTL).
  async backdateSoftDelete(ctx) {
    const { uid, documentId, date } = ctx.request.body as {
      uid: string;
      documentId: string;
      date: string;
    };
    const api = strapi.plugin('soft-delete').service('api');

    const result = await api.withSoftDeleted(() =>
      strapi.db.query(uid).updateMany({
        where: { documentId },
        data: { _softDeletedAt: date },
      }),
    );

    ctx.body = { count: result?.count ?? 0 };
  },

  // Raw row count with the soft-delete filter off — works for content types
  // AND component tables, so tests can assert component rows were purged.
  async countRows(ctx) {
    const { uid, where } = ctx.request.body as { uid: string; where: Record<string, unknown> };
    const api = strapi.plugin('soft-delete').service('api');

    const count = await api.withSoftDeleted(() => strapi.db.query(uid).count({ where }));

    ctx.body = { count };
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

  // Seeds an admin::permission row with the v4 action name, runs the plugin's
  // permission migration, and reports the row's action before/after.
  // Direct service invocation: the boot-time trigger (migrateFromV4IfNeeded)
  // already ran against this fresh DB, so we exercise the migration step itself.
  async runV4PermissionMigration(ctx) {
    const V4_ACTION = 'plugin::soft-delete.explorer.read';

    const superAdminRole = await strapi.db.query('admin::role').findOne({
      where: { code: 'strapi-super-admin' },
    });

    const seeded = await strapi.db.query('admin::permission').create({
      data: {
        action: V4_ACTION,
        actionParameters: {},
        subject: 'api::article.article',
        properties: {},
        conditions: [],
        role: superAdminRole.id,
      },
    });

    await strapi.plugin('soft-delete').service('migration').migratePermissionActions();

    const migrated = await strapi.db.query('admin::permission').findOne({
      where: { id: seeded.id },
    });

    // Clean up the seeded row so repeated runs stay isolated
    await strapi.db.query('admin::permission').delete({ where: { id: seeded.id } });

    ctx.body = { seededAction: V4_ACTION, migratedAction: migrated.action };
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
