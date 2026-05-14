import type { Core } from '@strapi/types';

import { supportsContentType } from './utils';

const register = ({ strapi }: { strapi: Core.Strapi }) => {
  for (const [uid, contentType] of Object.entries(strapi.contentTypes) as [string, any][]) {
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
