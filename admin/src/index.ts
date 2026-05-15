import { Trash } from '@strapi/icons';

import { PLUGIN_ID, PLUGIN_NAME } from './constants/plugin';
import { PERMISSIONS } from './constants/permissions';
import { prefixPluginTranslations } from './utils/prefixPluginTranslations';

export default {
  register(app: Record<string, (...args: unknown[]) => unknown>) {
    app.addMenuLink({
      to: `plugins/${PLUGIN_ID}`,
      icon: Trash,
      intlLabel: {
        id: `${PLUGIN_ID}.plugin.name`,
        defaultMessage: PLUGIN_NAME,
      },
      // Direct dynamic import — NOT an async wrapper (Strapi v5 requirement)
      Component: () =>
        import('./pages/Explorer/ExplorerPage').then((mod) => ({ default: mod.default })),
      permissions: PERMISSIONS.read,
    });

    app.registerPlugin({
      id: PLUGIN_ID,
      name: PLUGIN_NAME,
    });
  },

  bootstrap(app: Record<string, (...args: unknown[]) => unknown>) {
    app.addSettingsLink(
      {
        id: PLUGIN_ID,
        intlLabel: {
          id: `${PLUGIN_ID}.plugin.name`,
          defaultMessage: PLUGIN_NAME,
        },
      },
      [
        {
          id: `${PLUGIN_ID}.restoration-behavior`,
          intlLabel: {
            id: `${PLUGIN_ID}.settings.restorationBehavior`,
            defaultMessage: 'Restoration Behavior',
          },
          to: `${PLUGIN_ID}/restoration-behavior`,
          Component: () =>
            import('./pages/Settings/RestorationBehavior').then((mod) => ({
              default: mod.default,
            })),
          permissions: PERMISSIONS.settings,
        },
      ],
    );
  },

  async registerTrads({ locales }: { locales: readonly string[] }) {
    const GLOBAL_TRADS: Record<string, Record<string, string>> = {
      en: {
        [`global.plugins.${PLUGIN_ID}`]: PLUGIN_NAME,
        [`global.plugins.${PLUGIN_ID}.description`]:
          'Soft delete plugin — never lose content again.',
      },
      fr: {
        [`global.plugins.${PLUGIN_ID}`]: 'Suppression douce',
        [`global.plugins.${PLUGIN_ID}.description`]:
          'Plugin de suppression douce — ne perdez plus jamais de contenu.',
      },
    };

    return Promise.all(
      locales.map(async (locale) => {
        try {
          const { default: data } = await import(`./translations/${locale}.json`);
          return {
            data: {
              ...prefixPluginTranslations(data, PLUGIN_ID),
              ...(GLOBAL_TRADS[locale] ?? GLOBAL_TRADS.en),
            },
            locale,
          };
        } catch {
          return { data: GLOBAL_TRADS[locale] ?? GLOBAL_TRADS.en ?? {}, locale };
        }
      }),
    );
  },
};
