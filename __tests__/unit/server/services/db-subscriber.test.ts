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

  describe('bypass', () => {
    const yieldToEventLoop = (): Promise<void> =>
      new Promise((resolve) => {
        setImmediate(resolve);
      });

    const getSubscriber = (service: ReturnType<typeof createService>) => {
      service.register();
      return (mock.strapi.db.lifecycles.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][0];
    };

    it('skips filter injection for reads inside the bypass callback', async () => {
      const service = createService();
      const subscriber = getSubscriber(service);
      const event = { params: {} as Record<string, unknown> };

      await service.bypass(async () => {
        subscriber.beforeFindMany(event);
      });

      expect(event.params.where).toBeUndefined();
    });

    it('restores filter injection for reads after the bypass callback resolves', async () => {
      const service = createService();
      const subscriber = getSubscriber(service);
      const event = { params: {} as Record<string, unknown> };

      await service.bypass(async () => undefined);
      subscriber.beforeFindMany(event);

      expect(event.params.where).toEqual({ _softDeletedAt: { $null: true } });
    });

    it('filters interleaved plain reads while a concurrent bypass window is open', async () => {
      const service = createService();
      const subscriber = getSubscriber(service);
      const bypassedEvent = { params: {} as Record<string, unknown> };
      const plainEvent = { params: {} as Record<string, unknown> };

      await Promise.all([
        service.bypass(async () => {
          await yieldToEventLoop();
          subscriber.beforeFindMany(bypassedEvent);
          await yieldToEventLoop();
        }),
        (async () => {
          await yieldToEventLoop();
          subscriber.beforeFindMany(plainEvent);
        })(),
      ]);

      expect(bypassedEvent.params.where).toBeUndefined();
      expect(plainEvent.params.where).toEqual({ _softDeletedAt: { $null: true } });
    });

    it('does not leak an open bypass window into a plain read started before it', async () => {
      const service = createService();
      const subscriber = getSubscriber(service);
      const plainEvent = { params: {} as Record<string, unknown> };
      const bypassedEvent = { params: {} as Record<string, unknown> };

      const plainRead = (async () => {
        await yieldToEventLoop();
        await yieldToEventLoop();
        subscriber.beforeFindMany(plainEvent);
      })();
      const bypassedRead = service.bypass(async () => {
        await yieldToEventLoop();
        subscriber.beforeFindMany(bypassedEvent);
        await yieldToEventLoop();
        await yieldToEventLoop();
      });
      await Promise.all([plainRead, bypassedRead]);

      expect(plainEvent.params.where).toEqual({ _softDeletedAt: { $null: true } });
      expect(bypassedEvent.params.where).toBeUndefined();
    });

    it('propagates the bypass context into a strapi.db.transaction callback', async () => {
      const service = createService();
      const subscriber = getSubscriber(service);
      const event = { params: {} as Record<string, unknown> };

      await service.bypass(async () => {
        await mock.strapi.db.transaction(async () => {
          await yieldToEventLoop();
          subscriber.beforeFindMany(event);
        });
      });

      expect(event.params.where).toBeUndefined();
    });
  });
});
