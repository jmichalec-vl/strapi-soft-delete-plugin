import type { Core } from '@strapi/types';

import { supportsContentType } from './utils';

// `__schema__` is an internal Strapi property absent from the public types,
// so the registered content types are narrowed to the shape mutated below.
interface PatchableContentType {
  attributes: Record<string, unknown>;
  __schema__: { attributes: Record<string, unknown> };
}

const register = ({ strapi }: { strapi: Core.Strapi }) => {
  const contentTypes = strapi.contentTypes as unknown as Record<string, PatchableContentType>;

  for (const [uid, contentType] of Object.entries(contentTypes)) {
    if (!supportsContentType(uid)) continue;

    const _softDeletedAt = {
      type: 'datetime',
      configurable: false,
      writable: false,
      visible: false,
      private: true,
    };
    contentType.attributes._softDeletedAt = _softDeletedAt;
    contentType.__schema__.attributes._softDeletedAt = _softDeletedAt;

    const _softDeletedById = {
      type: 'integer',
      configurable: false,
      writable: false,
      visible: false,
      private: true,
    };
    contentType.attributes._softDeletedById = _softDeletedById;
    contentType.__schema__.attributes._softDeletedById = _softDeletedById;

    const _softDeletedByType = {
      type: 'string',
      configurable: false,
      writable: false,
      visible: false,
      private: true,
    };
    contentType.attributes._softDeletedByType = _softDeletedByType;
    contentType.__schema__.attributes._softDeletedByType = _softDeletedByType;
  }
};

export default register;
