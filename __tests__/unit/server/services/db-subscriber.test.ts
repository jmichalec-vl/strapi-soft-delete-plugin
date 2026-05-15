import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createMockStrapi } from '../../../helpers/mock-strapi';
import dbSubscriberFactory from '../../../../server/src/services/db-subscriber';

let mock: ReturnType<typeof createMockStrapi>;

beforeEach(() => {
  mock = createMockStrapi();
  mock.setContentTypes({
    'api::article.article': { uid: 'api::article.article' },
    'api::page.page': { uid: 'api::page.page' },
    'admin::user': { uid: 'admin::user' },
  });
});

const createService = () => dbSubscriberFactory({ strapi: mock.strapi as never });

describe('db-subscriber service', () => {
  it('registers a lifecycle subscriber', () => {
    const service = createService();
    service.register();

    expect(mock.strapi.db.lifecycles.subscribe).toHaveBeenCalledOnce();
  });

  it('subscribes only to api:: content types', () => {
    const service = createService();
    service.register();

    const subscriberArg = (mock.strapi.db.lifecycles.subscribe as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(subscriberArg.models).toEqual(['api::article.article', 'api::page.page']);
    expect(subscriberArg.models).not.toContain('admin::user');
  });

  it('injects soft-delete filter in beforeFindMany', () => {
    const service = createService();
    service.register();

    const subscriber = (mock.strapi.db.lifecycles.subscribe as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    const event = { params: { where: { title: 'test' } } };
    subscriber.beforeFindMany(event);

    expect(event.params.where).toEqual({
      $and: [{ title: 'test' }, { _softDeletedAt: { $null: true } }],
    });
  });

  it('injects soft-delete filter in beforeFindOne', () => {
    const service = createService();
    service.register();

    const subscriber = (mock.strapi.db.lifecycles.subscribe as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    const event = { params: {} as Record<string, unknown> };
    subscriber.beforeFindOne(event);

    expect(event.params.where).toEqual({ _softDeletedAt: { $null: true } });
  });

  it('injects soft-delete filter in beforeCount', () => {
    const service = createService();
    service.register();

    const subscriber = (mock.strapi.db.lifecycles.subscribe as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    const event = { params: {} as Record<string, unknown> };
    subscriber.beforeCount(event);

    expect(event.params.where).toEqual({ _softDeletedAt: { $null: true } });
  });

  it('merges with existing where clause using $and', () => {
    const service = createService();
    service.register();

    const subscriber = (mock.strapi.db.lifecycles.subscribe as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    const existing = { status: 'published', locale: 'en' };
    const event = { params: { where: existing } };
    subscriber.beforeFindMany(event);

    expect(event.params.where).toEqual({
      $and: [existing, { _softDeletedAt: { $null: true } }],
    });
  });
});
