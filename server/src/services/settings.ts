import type { Core } from '@strapi/types';

import { PLUGIN_ID } from '../constants';
import type { PluginSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

const STORE_KEY = 'settings';

const isPluginSettings = (value: unknown): value is PluginSettings =>
  typeof value === 'object' &&
  value !== null &&
  'singleTypesRestorationBehavior' in value &&
  'draftPublishRestorationBehavior' in value;

const settings = ({ strapi }: { strapi: Core.Strapi }) => {
  const getStore = () => strapi.store({ type: 'plugin', name: PLUGIN_ID });

  const get = async (): Promise<PluginSettings> => {
    const stored = await getStore().get({ key: STORE_KEY });
    return isPluginSettings(stored) ? stored : DEFAULT_SETTINGS;
  };

  const set = async (newSettings: PluginSettings): Promise<PluginSettings> => {
    await getStore().set({ key: STORE_KEY, value: newSettings });
    return get();
  };

  const ensureDefaults = async (): Promise<void> => {
    const existing = await getStore().get({ key: STORE_KEY });
    if (!existing) {
      await getStore().set({ key: STORE_KEY, value: DEFAULT_SETTINGS });
    }
  };

  return { get, set, ensureDefaults };
};

export default settings;
