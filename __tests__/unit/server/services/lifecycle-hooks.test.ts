import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createMockStrapi } from '../../../helpers/mock-strapi';
import lifecycleHooksFactory from '../../../../server/src/services/lifecycle-hooks';

let mock: ReturnType<typeof createMockStrapi>;

beforeEach(() => {
  mock = createMockStrapi();
});

const createService = () => lifecycleHooksFactory({ strapi: mock.strapi as never });

const createPayload = () => ({
  uid: 'api::article.article',
  documentId: 'doc-1',
  entries: [{ id: 1, documentId: 'doc-1' }],
  auth: { id: 1, strategy: 'admin' as const },
});

describe('lifecycle-hooks service', () => {
  describe('register', () => {
    it('registers a handler for a hook', () => {
      const service = createService();
      const handler = vi.fn();

      expect(() => service.register('beforeSoftDelete', handler)).not.toThrow();
    });
  });

  describe('fire', () => {
    it('calls registered handlers with the payload', async () => {
      const service = createService();
      const handler = vi.fn();
      const payload = createPayload();

      service.register('beforeSoftDelete', handler);
      await service.fire('beforeSoftDelete', payload);

      expect(handler).toHaveBeenCalledWith(payload);
    });

    it('calls multiple handlers in registration order', async () => {
      const service = createService();
      const order: number[] = [];
      const handler1 = vi.fn(() => {
        order.push(1);
      });
      const handler2 = vi.fn(() => {
        order.push(2);
      });

      service.register('afterSoftDelete', handler1);
      service.register('afterSoftDelete', handler2);
      await service.fire('afterSoftDelete', createPayload());

      expect(order).toEqual([1, 2]);
    });

    it('returns true when a before hook cancels', async () => {
      const service = createService();
      service.register('beforeSoftDelete', async () => ({ cancel: true }));

      const cancelled = await service.fire('beforeSoftDelete', createPayload());

      expect(cancelled).toBe(true);
    });

    it('returns false when no before hook cancels', async () => {
      const service = createService();
      service.register('beforeSoftDelete', vi.fn());

      const cancelled = await service.fire('beforeSoftDelete', createPayload());

      expect(cancelled).toBe(false);
    });

    it('ignores cancel from after hooks', async () => {
      const service = createService();
      service.register('afterSoftDelete', async () => ({ cancel: true }));

      const cancelled = await service.fire('afterSoftDelete', createPayload());

      expect(cancelled).toBe(false);
    });

    it('catches and logs handler errors without crashing', async () => {
      const service = createService();
      service.register('beforeRestore', () => {
        throw new Error('handler error');
      });

      const cancelled = await service.fire('beforeRestore', createPayload());

      expect(cancelled).toBe(false);
      expect(mock.strapi.log.error).toHaveBeenCalledWith(
        expect.stringContaining('beforeRestore'),
        expect.any(Error),
      );
    });

    it('continues to next handler after error', async () => {
      const service = createService();
      const secondHandler = vi.fn();

      service.register('afterRestore', () => {
        throw new Error('fail');
      });
      service.register('afterRestore', secondHandler);
      await service.fire('afterRestore', createPayload());

      expect(secondHandler).toHaveBeenCalled();
    });

    it('returns false when no handlers are registered', async () => {
      const service = createService();

      const cancelled = await service.fire('beforeDeletePermanently', createPayload());

      expect(cancelled).toBe(false);
    });

    it('stops before hooks after first cancel', async () => {
      const service = createService();
      const secondHandler = vi.fn();

      service.register('beforeSoftDelete', async () => ({ cancel: true }));
      service.register('beforeSoftDelete', secondHandler);
      await service.fire('beforeSoftDelete', createPayload());

      expect(secondHandler).not.toHaveBeenCalled();
    });
  });
});
