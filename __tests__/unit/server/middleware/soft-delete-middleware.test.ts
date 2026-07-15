import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createMockStrapi } from '../../../helpers/mock-strapi';

// Must set global before importing middleware
let mock: ReturnType<typeof createMockStrapi>;

beforeEach(() => {
  mock = createMockStrapi();
  (globalThis as Record<string, unknown>).strapi = mock.strapi;

  mock.registerService('soft-delete', 'lifecycle-hooks', {
    fire: vi.fn().mockResolvedValue(false),
  });
  mock.registerService('soft-delete', 'event-emitter', {
    emit: vi.fn().mockResolvedValue(undefined),
  });
  mock.registerService('soft-delete', 'db-subscriber', {
    bypass: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
  });
});

// Dynamic import to pick up the global strapi
const importMiddleware = async () => {
  const mod = await import('../../../../server/src/middleware/soft-delete-middleware');
  return mod.default;
};

const createMiddlewareContext = (overrides: Record<string, unknown> = {}) => ({
  uid: 'api::article.article',
  contentType: { uid: 'api::article.article' },
  action: 'findMany',
  params: {},
  ...overrides,
});

describe('soft-delete-middleware', () => {
  describe('unsupported content types', () => {
    it('passes through for admin:: content types', async () => {
      const middleware = await importMiddleware();
      const next = vi.fn().mockResolvedValue('original-result');
      const ctx = createMiddlewareContext({ uid: 'admin::user' });

      const result = await middleware(ctx as never, next);

      expect(next).toHaveBeenCalledOnce();
      expect(result).toBe('original-result');
    });

    it('passes through for plugin:: content types', async () => {
      const middleware = await importMiddleware();
      const next = vi.fn().mockResolvedValue('original-result');
      const ctx = createMiddlewareContext({ uid: 'plugin::users-permissions.user' });

      const result = await middleware(ctx as never, next);

      expect(next).toHaveBeenCalledOnce();
      expect(result).toBe('original-result');
    });
  });

  describe('delete action', () => {
    it('converts delete to soft-delete update', async () => {
      const middleware = await importMiddleware();
      const next = vi.fn();
      const entries = [{ id: 1, documentId: 'doc-1', title: 'Test' }];

      mock
        .getQueryForUid('api::article.article')
        .findMany.mockResolvedValueOnce(entries)
        .mockResolvedValueOnce([{ ...entries[0], _softDeletedAt: '2026-01-01T00:00:00.000Z' }]);

      const ctx = createMiddlewareContext({
        action: 'delete',
        params: { documentId: 'doc-1' },
      });

      const result = await middleware(ctx as never, next);

      expect(next).not.toHaveBeenCalled();
      expect(mock.strapi.db.lifecycles.disable).toHaveBeenCalled();
      expect(mock.strapi.db.lifecycles.enable).toHaveBeenCalled();
      expect(mock.getQueryForUid('api::article.article').updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { documentId: 'doc-1' },
          data: expect.objectContaining({
            _softDeletedAt: expect.any(String),
            _softDeletedById: 1,
            _softDeletedByType: 'admin',
          }),
        }),
      );
      expect(result).toHaveProperty('documentId', 'doc-1');
      expect(result).toHaveProperty('entries');
    });

    it('returns empty entries when document not found', async () => {
      const middleware = await importMiddleware();
      const next = vi.fn();

      mock.getQueryForUid('api::article.article').findMany.mockResolvedValueOnce([]);

      const ctx = createMiddlewareContext({
        action: 'delete',
        params: { documentId: 'nonexistent' },
      });

      const result = await middleware(ctx as never, next);

      expect(result).toEqual({ documentId: 'nonexistent', entries: [] });
      expect(mock.getQueryForUid('api::article.article').updateMany).not.toHaveBeenCalled();
    });

    it('propagates the error when beforeSoftDelete fire() rejects', async () => {
      const middleware = await importMiddleware();
      const next = vi.fn();
      const entries = [{ id: 1, documentId: 'doc-1' }];
      const hookError = new Error('Operation cancelled by beforeSoftDelete hook');

      mock.getQueryForUid('api::article.article').findMany.mockResolvedValueOnce(entries);
      mock.registerService('soft-delete', 'lifecycle-hooks', {
        fire: vi.fn().mockRejectedValue(hookError),
      });

      const ctx = createMiddlewareContext({
        action: 'delete',
        params: { documentId: 'doc-1' },
      });

      await expect(middleware(ctx as never, next)).rejects.toBe(hookError);
      expect(mock.getQueryForUid('api::article.article').updateMany).not.toHaveBeenCalled();
    });

    it('fires afterSoftDelete hook after update', async () => {
      const middleware = await importMiddleware();
      const next = vi.fn();
      const fireFn = vi.fn().mockResolvedValue(false);
      const entries = [{ id: 1, documentId: 'doc-1' }];

      mock
        .getQueryForUid('api::article.article')
        .findMany.mockResolvedValueOnce(entries)
        .mockResolvedValueOnce(entries);
      mock.registerService('soft-delete', 'lifecycle-hooks', { fire: fireFn });

      const ctx = createMiddlewareContext({
        action: 'delete',
        params: { documentId: 'doc-1' },
      });

      await middleware(ctx as never, next);

      expect(fireFn).toHaveBeenCalledWith('beforeSoftDelete', expect.any(Object));
      expect(fireFn).toHaveBeenCalledWith('afterSoftDelete', expect.any(Object));
    });

    it('emits entry.delete event for each soft-deleted entry', async () => {
      const middleware = await importMiddleware();
      const next = vi.fn();
      const emitFn = vi.fn().mockResolvedValue(undefined);
      const entries = [
        { id: 1, documentId: 'doc-1' },
        { id: 2, documentId: 'doc-1' },
      ];

      mock
        .getQueryForUid('api::article.article')
        .findMany.mockResolvedValueOnce(entries)
        .mockResolvedValueOnce(entries);
      mock.registerService('soft-delete', 'event-emitter', { emit: emitFn });

      const ctx = createMiddlewareContext({
        action: 'delete',
        params: { documentId: 'doc-1' },
      });

      await middleware(ctx as never, next);

      expect(emitFn).toHaveBeenCalledTimes(2);
      expect(emitFn).toHaveBeenCalledWith(
        expect.objectContaining({
          uid: 'api::article.article',
          event: 'entry.delete',
          action: 'soft-delete',
        }),
      );
    });

    it('re-enables lifecycles even when updateMany throws', async () => {
      const middleware = await importMiddleware();
      const next = vi.fn();
      const entries = [{ id: 1, documentId: 'doc-1' }];

      mock.getQueryForUid('api::article.article').findMany.mockResolvedValueOnce(entries);
      mock
        .getQueryForUid('api::article.article')
        .updateMany.mockRejectedValueOnce(new Error('DB error'));

      const ctx = createMiddlewareContext({
        action: 'delete',
        params: { documentId: 'doc-1' },
      });

      await expect(middleware(ctx as never, next)).rejects.toThrow('DB error');
      expect(mock.strapi.db.lifecycles.enable).toHaveBeenCalled();
    });
  });

  describe('findMany action', () => {
    it('injects soft-delete filter and merges with existing filters', async () => {
      const middleware = await importMiddleware();
      const next = vi.fn().mockResolvedValue([]);
      const ctx = createMiddlewareContext({
        action: 'findMany',
        params: { filters: { title: 'test' } },
      });

      await middleware(ctx as never, next);

      expect(next).toHaveBeenCalledOnce();
      expect((ctx.params as Record<string, unknown>).filters).toEqual({
        $and: [{ title: 'test' }, { _softDeletedAt: { $null: true } }],
      });
    });
  });

  describe('findOne action', () => {
    it('passes through to next', async () => {
      const middleware = await importMiddleware();
      const next = vi.fn().mockResolvedValue(null);
      const ctx = createMiddlewareContext({ action: 'findOne', params: {} });

      await middleware(ctx as never, next);

      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('count action', () => {
    it('passes through to next', async () => {
      const middleware = await importMiddleware();
      const next = vi.fn().mockResolvedValue(0);
      const ctx = createMiddlewareContext({ action: 'count', params: {} });

      await middleware(ctx as never, next);

      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('create action', () => {
    it('strips soft-delete fields from data', async () => {
      const middleware = await importMiddleware();
      const next = vi.fn().mockResolvedValue({ id: 1 });
      const ctx = createMiddlewareContext({
        action: 'create',
        params: {
          data: {
            title: 'Test',
            _softDeletedAt: '2026-01-01',
            _softDeletedById: 99,
            _softDeletedByType: 'admin',
          },
        },
      });

      await middleware(ctx as never, next);

      expect(next).toHaveBeenCalledOnce();
      const data = (ctx.params as Record<string, unknown>).data as Record<string, unknown>;
      expect(data).toEqual({ title: 'Test' });
      expect(data).not.toHaveProperty('_softDeletedAt');
      expect(data).not.toHaveProperty('_softDeletedById');
      expect(data).not.toHaveProperty('_softDeletedByType');
    });
  });

  describe('update action', () => {
    it('strips soft-delete fields from data', async () => {
      const middleware = await importMiddleware();
      const next = vi.fn().mockResolvedValue({ id: 1 });
      const ctx = createMiddlewareContext({
        action: 'update',
        params: {
          data: {
            title: 'Updated',
            _softDeletedAt: null,
          },
        },
      });

      await middleware(ctx as never, next);

      const data = (ctx.params as Record<string, unknown>).data as Record<string, unknown>;
      expect(data).toEqual({ title: 'Updated' });
    });
  });

  describe('passthrough actions', () => {
    it.each(['publish', 'unpublish', 'discardDraft'])(
      'passes through %s action',
      async (action) => {
        const middleware = await importMiddleware();
        const next = vi.fn().mockResolvedValue('result');
        const ctx = createMiddlewareContext({ action });

        const result = await middleware(ctx as never, next);

        expect(next).toHaveBeenCalledOnce();
        expect(result).toBe('result');
      },
    );
  });
});
