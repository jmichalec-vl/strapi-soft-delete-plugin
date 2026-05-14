import type { Core } from '@strapi/types';

import { PLUGIN_ID } from '../constants';
import { DEFAULT_SETTINGS } from '../types';

const MIGRATION_VERSION_KEY = '_migrationVersion';
const CURRENT_MIGRATION_VERSION = 1;
const SETTINGS_KEY = 'settings';

const migration = ({ strapi }: { strapi: Core.Strapi }) => {
  const getStore = () => strapi.store({ type: 'plugin', name: PLUGIN_ID });

  const migrateFromV4IfNeeded = async (): Promise<void> => {
    const store = getStore();
    const existing = (await store.get({ key: SETTINGS_KEY })) as Record<string, unknown> | null;

    if (existing?.[MIGRATION_VERSION_KEY] === CURRENT_MIGRATION_VERSION) {
      return;
    }

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

  return { migrateFromV4IfNeeded };
};

export default migration;
