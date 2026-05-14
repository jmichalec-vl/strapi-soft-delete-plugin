import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createMockStrapi } from '../../../helpers/mock-strapi';
import adminControllerFactory from '../../../../server/src/controllers/admin';

let mock: ReturnType<typeof createMockStrapi>;

beforeEach(() => {
  mock = createMockStrapi();

  mock.registerService('soft-delete', 'soft-delete', {
    findMany: vi
      .fn()
      .mockResolvedValue({
        results: [],
        pagination: { page: 1, pageSize: 10, total: 0, pageCount: 0 },
      }),
    findOne: vi.fn().mockResolvedValue(null),
    restore: vi.fn().mockResolvedValue({ documentId: 'doc-1', entries: [] }),
    deletePermanently: vi.fn().mockResolvedValue({ documentId: 'doc-1', entries: [] }),
    restoreMany: vi.fn().mockResolvedValue([]),
    deleteManyPermanently: vi.fn().mockResolvedValue([]),
  });

  mock.registerService('soft-delete', 'settings', {
    get: vi.fn().mockResolvedValue({ singleTypesRestorationBehavior: 'soft-delete' }),
    set: vi.fn().mockResolvedValue({ singleTypesRestorationBehavior: 'soft-delete' }),
  });
});

const createController = () => adminControllerFactory({ strapi: mock.strapi as never });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createCtx = (overrides: Record<string, unknown> = {}): any => ({
  params: {},
  query: {},
  request: { body: {} },
  body: undefined,
  notFound: vi.fn(),
  ...overrides,
});

describe('admin controller', () => {
  describe('findMany', () => {
    it('calls service with parsed query params', async () => {
      const controller = createController();
      const ctx = createCtx({
        params: { uid: 'api::article.article', kind: 'collectionType' },
        query: { page: '2', pageSize: '5', sort: '_softDeletedAt' },
      });

      await controller.findMany(ctx);

      const service = mock.services.get('soft-delete::soft-delete');
      expect(service?.findMany).toHaveBeenCalledWith('api::article.article', {
        page: 2,
        pageSize: 5,
        sort: '_softDeletedAt',
        filters: {},
      });
    });
  });

  describe('findOne', () => {
    it('returns 404 when entry not found', async () => {
      const controller = createController();
      const ctx = createCtx({
        params: { uid: 'api::article.article', documentId: 'nonexistent' },
      });

      await controller.findOne(ctx);

      expect(ctx.notFound).toHaveBeenCalledWith('Entry not found');
    });

    it('sets body when entry found', async () => {
      const entry = { id: 1, documentId: 'doc-1' };
      mock.registerService('soft-delete', 'soft-delete', {
        ...mock.services.get('soft-delete::soft-delete'),
        findOne: vi.fn().mockResolvedValue(entry),
      });
      const controller = createController();
      const ctx = createCtx({
        params: { uid: 'api::article.article', documentId: 'doc-1' },
      });

      await controller.findOne(ctx);

      expect(ctx.body).toEqual(entry);
    });
  });

  describe('delete', () => {
    it('calls deletePermanently', async () => {
      const controller = createController();
      const ctx = createCtx({
        params: { uid: 'api::article.article', documentId: 'doc-1' },
      });

      await controller.delete(ctx);

      const service = mock.services.get('soft-delete::soft-delete');
      expect(service?.deletePermanently).toHaveBeenCalledWith('api::article.article', 'doc-1');
    });
  });

  describe('restore', () => {
    it('calls restore with kind', async () => {
      const controller = createController();
      const ctx = createCtx({
        params: { uid: 'api::article.article', documentId: 'doc-1', kind: 'collectionType' },
      });

      await controller.restore(ctx);

      const service = mock.services.get('soft-delete::soft-delete');
      expect(service?.restore).toHaveBeenCalledWith(
        'api::article.article',
        'doc-1',
        'collectionType',
      );
    });
  });

  describe('deleteMany', () => {
    it('passes documentIds from request body', async () => {
      const controller = createController();
      const ctx = createCtx({
        params: { uid: 'api::article.article' },
        request: { body: { documentIds: ['doc-1', 'doc-2'] } },
      });

      await controller.deleteMany(ctx);

      const service = mock.services.get('soft-delete::soft-delete');
      expect(service?.deleteManyPermanently).toHaveBeenCalledWith('api::article.article', [
        'doc-1',
        'doc-2',
      ]);
    });
  });

  describe('getSettings', () => {
    it('returns settings', async () => {
      const controller = createController();
      const ctx = createCtx();

      await controller.getSettings(ctx);

      expect(ctx.body).toEqual({ singleTypesRestorationBehavior: 'soft-delete' });
    });
  });

  describe('setSettings', () => {
    it('writes and returns settings', async () => {
      const controller = createController();
      const ctx = createCtx({
        request: { body: { singleTypesRestorationBehavior: 'delete-permanently' } },
      });

      await controller.setSettings(ctx);

      const service = mock.services.get('soft-delete::settings');
      expect(service?.set).toHaveBeenCalled();
    });
  });
});
