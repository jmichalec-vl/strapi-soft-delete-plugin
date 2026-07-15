import type { Core, UID } from '@strapi/types';
import { sanitize } from '@strapi/utils';

import { PLUGIN_ID } from '../constants';

export interface EmitParams {
  readonly uid: string;
  readonly event: string;
  readonly action: string;
  readonly entity: Record<string, unknown>;
}

/**
 * Emits plugin events to the event hub (webhooks) with the entry sanitized
 * against the content type's schema — the same `defaultSanitizeOutput` the
 * core document service applies to its own entry.* events. Password-type
 * attributes and every `private: true` attribute are stripped before the
 * payload reaches webhook consumers.
 *
 * The plugin's own bookkeeping fields (`_softDeletedAt`, `_softDeletedById`,
 * `_softDeletedByType`) are injected as private attributes, so they are
 * sanitized away too — matching the v4 plugin's behavior. The event's
 * `plugin.action` field already carries the soft-delete semantics.
 */
const eventEmitter = ({ strapi }: { strapi: Core.Strapi }) => ({
  async emit({ uid, event, action, entity }: EmitParams): Promise<void> {
    // SAFETY: uid is a dynamic string at runtime — cast to UID.Schema for getModel()
    const model = strapi.getModel(uid as UID.Schema);
    if (!model) return;

    const sanitizedEntity = await sanitize.sanitizers.defaultSanitizeOutput(
      {
        schema: model,
        getModel: (modelUid: string) => strapi.getModel(modelUid as UID.Schema),
      },
      // SAFETY: entities come from db.query as plain records; the sanitizer's
      // Data parameter is the same shape with a narrower value union
      entity as Parameters<typeof sanitize.sanitizers.defaultSanitizeOutput>[1],
    );

    await strapi.eventHub.emit(event, {
      model: model.modelName,
      uid,
      plugin: {
        id: PLUGIN_ID,
        action,
      },
      entry: sanitizedEntity,
    });
  },
});

export default eventEmitter;
