import { errors } from '@strapi/utils';
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

    it('throws PolicyError (a ForbiddenError) when a before hook cancels', async () => {
      const service = createService();
      service.register('beforeSoftDelete', async () => ({ cancel: true }));

      // PolicyError so Strapi's route layer surfaces the message (plain
      // ForbiddenError messages are masked with a generic "Forbidden")
      await expect(service.fire('beforeSoftDelete', createPayload())).rejects.toThrow(
        errors.PolicyError,
      );
      await expect(service.fire('beforeSoftDelete', createPayload())).rejects.toThrow(
        errors.ForbiddenError,
      );
      await expect(service.fire('beforeSoftDelete', createPayload())).rejects.toThrow(
        'Operation cancelled by beforeSoftDelete hook',
      );
    });

    it('throws the custom error when a before hook cancels with one', async () => {
      const service = createService();
      const customError = new errors.ApplicationError('Cannot delete published product pages');
      service.register('beforeSoftDelete', async () => ({ cancel: true, error: customError }));

      await expect(service.fire('beforeSoftDelete', createPayload())).rejects.toBe(customError);
    });

    it('resolves when no before hook cancels', async () => {
      const service = createService();
      service.register('beforeSoftDelete', vi.fn());

      await expect(service.fire('beforeSoftDelete', createPayload())).resolves.toBeUndefined();
    });

    it('ignores cancel from after hooks', async () => {
      const service = createService();
      service.register('afterSoftDelete', async () => ({ cancel: true }));

      await expect(service.fire('afterSoftDelete', createPayload())).resolves.toBeUndefined();
    });

    it('logs and re-throws before-hook handler errors', async () => {
      const service = createService();
      const handlerError = new Error('handler error');
      service.register('beforeRestore', () => {
        throw handlerError;
      });

      await expect(service.fire('beforeRestore', createPayload())).rejects.toBe(handlerError);
      expect(mock.strapi.log.error).toHaveBeenCalledWith(
        expect.stringContaining('beforeRestore'),
        handlerError,
      );
    });

    it('re-throws after-hook handler errors', async () => {
      const service = createService();
      const handlerError = new Error('after hook failed');
      service.register('afterSoftDelete', () => {
        throw handlerError;
      });

      await expect(service.fire('afterSoftDelete', createPayload())).rejects.toBe(handlerError);
    });

    it('stops the handler chain at the first failure', async () => {
      const service = createService();
      const secondHandler = vi.fn();

      service.register('afterRestore', () => {
        throw new Error('fail');
      });
      service.register('afterRestore', secondHandler);

      await expect(service.fire('afterRestore', createPayload())).rejects.toThrow('fail');
      expect(secondHandler).not.toHaveBeenCalled();
    });

    it('resolves when no handlers are registered', async () => {
      const service = createService();

      await expect(
        service.fire('beforeDeletePermanently', createPayload()),
      ).resolves.toBeUndefined();
    });

    it('stops before hooks after first cancel', async () => {
      const service = createService();
      const secondHandler = vi.fn();

      service.register('beforeSoftDelete', async () => ({ cancel: true }));
      service.register('beforeSoftDelete', secondHandler);

      await expect(service.fire('beforeSoftDelete', createPayload())).rejects.toThrow();
      expect(secondHandler).not.toHaveBeenCalled();
    });
  });
});
