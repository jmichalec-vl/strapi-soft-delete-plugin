import { describe, it, expect, beforeEach } from 'vitest';

import { createMockStrapi } from '../../helpers/mock-strapi';
import register from '../../../server/src/register';

let mock: ReturnType<typeof createMockStrapi>;

beforeEach(() => {
  mock = createMockStrapi();
  mock.setContentTypes({
    'api::article.article': {
      uid: 'api::article.article',
      attributes: {},
      __schema__: { attributes: {} },
    },
    'api::page.page': {
      uid: 'api::page.page',
      attributes: {},
      __schema__: { attributes: {} },
    },
    'admin::user': {
      uid: 'admin::user',
      attributes: {},
      __schema__: { attributes: {} },
    },
    'plugin::upload.file': {
      uid: 'plugin::upload.file',
      attributes: {},
      __schema__: { attributes: {} },
    },
  });
});

describe('register', () => {
  it('adds soft-delete attributes only to api:: content types', () => {
    register({ strapi: mock.strapi as never });

    const articleAttrs = mock.strapi.contentTypes['api::article.article'].attributes as Record<
      string,
      unknown
    >;
    const pageAttrs = mock.strapi.contentTypes['api::page.page'].attributes as Record<
      string,
      unknown
    >;
    const adminAttrs = mock.strapi.contentTypes['admin::user'].attributes as Record<
      string,
      unknown
    >;

    expect(articleAttrs).toHaveProperty('_softDeletedAt');
    expect(articleAttrs).toHaveProperty('_softDeletedById');
    expect(articleAttrs).toHaveProperty('_softDeletedByType');

    expect(pageAttrs).toHaveProperty('_softDeletedAt');

    expect(adminAttrs).not.toHaveProperty('_softDeletedAt');
  });

  it('sets correct attribute properties', () => {
    register({ strapi: mock.strapi as never });

    const attrs = mock.strapi.contentTypes['api::article.article'].attributes as Record<
      string,
      Record<string, unknown>
    >;

    expect(attrs._softDeletedAt).toMatchObject({
      type: 'datetime',
      private: true,
      visible: false,
      configurable: false,
      writable: false,
    });

    expect(attrs._softDeletedById).toMatchObject({
      type: 'integer',
      private: true,
      visible: false,
    });

    expect(attrs._softDeletedByType).toMatchObject({
      type: 'string',
      private: true,
      visible: false,
    });
  });

  it('also sets attributes on __schema__', () => {
    register({ strapi: mock.strapi as never });

    const schema = (mock.strapi.contentTypes['api::article.article'] as Record<string, unknown>)
      .__schema__ as { attributes: Record<string, unknown> };

    expect(schema.attributes).toHaveProperty('_softDeletedAt');
    expect(schema.attributes).toHaveProperty('_softDeletedById');
    expect(schema.attributes).toHaveProperty('_softDeletedByType');
  });

  it('uses same object reference for attributes and __schema__', () => {
    register({ strapi: mock.strapi as never });

    const ct = mock.strapi.contentTypes['api::article.article'] as Record<string, unknown>;
    const attrs = (ct.attributes as Record<string, unknown>)._softDeletedAt;
    const schemaAttrs = (ct.__schema__ as { attributes: Record<string, unknown> }).attributes
      ._softDeletedAt;

    expect(attrs).toBe(schemaAttrs);
  });

  it('handles empty content types', () => {
    mock.setContentTypes({});

    register({ strapi: mock.strapi as never });

    // No error thrown
  });
});
