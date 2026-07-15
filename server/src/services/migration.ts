import type { Core } from '@strapi/types';

import { PLUGIN_ID } from '../constants';
import { DEFAULT_SETTINGS } from '../types';

const MIGRATION_VERSION_KEY = '_migrationVersion';
// v1: settings migration; v2: adds the admin permission action rename
const CURRENT_MIGRATION_VERSION = 2;
const SETTINGS_KEY = 'settings';
const ADMIN_PERMISSION_UID = 'admin::permission';

/**
 * Admin permission actions renamed between the v4 plugin
 * (strapi-plugin-soft-delete) and this plugin. Audited against the v4
 * `server/bootstrap.ts` action registrations: `read`, `settings`,
 * `explorer.restore`, and `explorer.delete-permanently` are unchanged;
 * only `explorer.read` was renamed (to avoid clashing with the Content
 * Manager's own `read` action semantics).
 */
const V4_PERMISSION_ACTION_RENAMES: readonly { readonly from: string; readonly to: string }[] = [
  {
    from: `plugin::${PLUGIN_ID}.explorer.read`,
    to: `plugin::${PLUGIN_ID}.explorer.soft-deleted-read`,
  },
];

const migration = ({ strapi }: { strapi: Core.Strapi }) => {
  const getStore = () => strapi.store({ type: 'plugin', name: PLUGIN_ID });

  /**
   * Rewrite `admin::permission` rows that still carry v4 action names, so
   * roles keep their trash access after swapping the v4 plugin for this one.
   * Idempotent — once rewritten (or on a fresh install) no rows match.
   */
  const migratePermissionActions = async (): Promise<void> => {
    for (const { from, to } of V4_PERMISSION_ACTION_RENAMES) {
      const { count } = await strapi.db
        .query(ADMIN_PERMISSION_UID)
        .updateMany({ where: { action: from }, data: { action: to } });

      if (count > 0) {
        strapi.log.info(
          `[soft-delete] Migrated ${count} admin permission(s) from "${from}" to "${to}".`,
        );
      }
    }
  };

  const migrateFromV4IfNeeded = async (): Promise<void> => {
    const store = getStore();
    const existing = (await store.get({ key: SETTINGS_KEY })) as Record<string, unknown> | null;
    const storedVersion =
      typeof existing?.[MIGRATION_VERSION_KEY] === 'number'
        ? (existing[MIGRATION_VERSION_KEY] as number)
        : 0;

    if (storedVersion >= CURRENT_MIGRATION_VERSION) {
      return;
    }

    // Runs for v4 upgrades, 0.1.x upgrades (version 1), and fresh installs
    // (no-op there — no rows match the old action names).
    await migratePermissionActions();

    if (existing) {
      // v4 settings use same keys (singleTypesRestorationBehavior, draftPublishRestorationBehavior)
      // so no transformation needed — just stamp the migration version
      strapi.log.info('[soft-delete] Detected existing settings, stamping migration version.');
      await store.set({
        key: SETTINGS_KEY,
        value: { ...existing, [MIGRATION_VERSION_KEY]: CURRENT_MIGRATION_VERSION },
      });
      return;
    }

    // Check for v4 environment-scoped settings
    // SAFETY: v4 store accepted `environment` param which v5 types don't declare
    const v4EnvironmentStore = strapi.store({
      type: 'plugin',
      name: PLUGIN_ID,
      environment: strapi.config.environment,
    } as Record<string, unknown>);

    const v4Settings = (await v4EnvironmentStore.get({ key: SETTINGS_KEY })) as Record<
      string,
      unknown
    > | null;

    if (v4Settings) {
      strapi.log.info('[soft-delete] Migrating v4 environment-scoped settings.');
      await store.set({
        key: SETTINGS_KEY,
        value: { ...v4Settings, [MIGRATION_VERSION_KEY]: CURRENT_MIGRATION_VERSION },
      });
      return;
    }

    // No existing settings — write defaults
    await store.set({
      key: SETTINGS_KEY,
      value: { ...DEFAULT_SETTINGS, [MIGRATION_VERSION_KEY]: CURRENT_MIGRATION_VERSION },
    });

    strapi.log.info('[soft-delete] Initialized default settings.');
  };

  return { migrateFromV4IfNeeded, migratePermissionActions };
};

export default migration;
