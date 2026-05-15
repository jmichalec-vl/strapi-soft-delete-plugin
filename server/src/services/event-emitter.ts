import type { Core, UID } from '@strapi/types';

import { PLUGIN_ID } from '../constants';

export interface EmitParams {
  readonly uid: string;
  readonly event: string;
  readonly action: string;
  readonly entity: Record<string, unknown>;
}

const eventEmitter = ({ strapi }: { strapi: Core.Strapi }) => ({
  async emit({ uid, event, action, entity }: EmitParams): Promise<void> {
    // SAFETY: uid is a dynamic string at runtime — cast to UID.Schema for getModel()
    const model = strapi.getModel(uid as UID.Schema);
    if (!model) return;

    await strapi.eventHub.emit(event, {
      model: model.modelName,
      uid,
      plugin: {
        id: PLUGIN_ID,
        action,
      },
      entry: entity,
    });
  },
});

export default eventEmitter;
