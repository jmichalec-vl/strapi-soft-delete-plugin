export const prefixPluginTranslations = (
  translations: Record<string, string>,
  pluginId: string,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(translations).map(([key, value]) => [`${pluginId}.${key}`, value]),
  );
