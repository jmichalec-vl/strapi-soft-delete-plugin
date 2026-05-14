import type { Core } from '@strapi/types';

import { PLUGIN_ID, buildPermissions } from './constants';
import { softDeleteMiddleware } from './middleware';
import { supportsContentType } from './utils';

const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  await strapi.plugin(PLUGIN_ID).service('migration').migrateFromV4IfNeeded();
  await strapi.plugin(PLUGIN_ID).service('settings').ensureDefaults();
  await registerPermissions(strapi);
  relabelDeleteAction(strapi);

  strapi.documents.use(softDeleteMiddleware);
  strapi.plugin(PLUGIN_ID).service('db-subscriber').register();
  installEventHubGuard(strapi);

  strapi.plugin(PLUGIN_ID).service('auto-purge').setup();
};

const registerPermissions = async (strapi: Core.Strapi): Promise<void> => {
  const contentTypeUids = Object.keys(strapi.contentTypes).filter(supportsContentType);
  const permissions = buildPermissions(contentTypeUids);
  await strapi.service('admin::permission').actionProvider.registerMany(permissions);
};

const relabelDeleteAction = (strapi: Core.Strapi): void => {
  try {
    const deleteAction = strapi
      .service('admin::permission')
      .actionProvider.get('plugin::content-manager.explorer.delete');

    if (deleteAction) {
      deleteAction.displayName = 'Soft Delete';
    }
  } catch {
    // Content Manager action may not be available in all contexts
  }
};

interface EventData {
  readonly uid?: string;
  readonly entry?: { readonly id?: number };
  readonly plugin?: { readonly id?: string };
}

const installEventHubGuard = (strapi: Core.Strapi): void => {
  const originalEmit = strapi.eventHub.emit.bind(strapi.eventHub);

  strapi.eventHub.emit = async (event: string, ...args: unknown[]) => {
    if (event !== 'entry.update') {
      return originalEmit(event, ...args);
    }

    const data = args[0] as EventData | undefined;

    // Allow events explicitly from this plugin
    if (data?.plugin?.id === PLUGIN_ID) {
      return originalEmit(event, ...args);
    }

    // For supported content types, suppress events for soft-deleted entries
    const uid = data?.uid;
    if (!uid || !supportsContentType(uid) || !data?.entry?.id) {
      return originalEmit(event, ...args);
    }

    const entry = await strapi.db.query(uid).findOne({
      where: { id: data.entry.id, _softDeletedAt: null },
    });

    // Entry is soft-deleted — suppress the event
    if (!entry) return;

    return originalEmit(event, ...args);
  };
};

export default bootstrap;
