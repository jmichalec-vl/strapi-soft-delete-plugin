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
  mock.registerService('soft-delete', 'auth-resolver', {
    resolveAuth: vi.fn().mockReturnValue({ id: 1, strategy: 'admin' }),
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
    it('delegates delete to the soft-delete service with the request auth', async () => {
      const middleware = await importMiddleware();
      const next = vi.fn();
      const operationResult = { documentId: 'doc-1', entries: [{ id: 1, documentId: 'doc-1' }] };
      const softDeleteDocument = vi.fn().mockResolvedValue(operationResult);
      mock.registerService('soft-delete', 'soft-delete', { softDeleteDocument });

      const ctx = createMiddlewareContext({
        action: 'delete',
        params: { documentId: 'doc-1' },
      });

      const result = await middleware(ctx as never, next);

      expect(next).not.toHaveBeenCalled();
      expect(softDeleteDocument).toHaveBeenCalledWith(
        'api::article.article',
        'doc-1',
        { id: 1, strategy: 'admin' },
        { locale: undefined },
      );
      expect(result).toBe(operationResult);
    });

    it('threads the locale param through to the soft-delete service', async () => {
      const middleware = await importMiddleware();
      const next = vi.fn();
      const softDeleteDocument = vi.fn().mockResolvedValue({ documentId: 'doc-1', entries: [] });
      mock.registerService('soft-delete', 'soft-delete', { softDeleteDocument });

      const ctx = createMiddlewareContext({
        action: 'delete',
        params: { documentId: 'doc-1', locale: 'fr' },
      });

      await middleware(ctx as never, next);

      expect(softDeleteDocument).toHaveBeenCalledWith(
        'api::article.article',
        'doc-1',
        { id: 1, strategy: 'admin' },
        { locale: 'fr' },
      );
    });

    it('propagates rejections from the soft-delete service (hook veto)', async () => {
      const middleware = await importMiddleware();
      const next = vi.fn();
      const hookError = new Error('Operation cancelled by beforeSoftDelete hook');
      mock.registerService('soft-delete', 'soft-delete', {
        softDeleteDocument: vi.fn().mockRejectedValue(hookError),
      });

      const ctx = createMiddlewareContext({
        action: 'delete',
        params: { documentId: 'doc-1' },
      });

      await expect(middleware(ctx as never, next)).rejects.toBe(hookError);
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
