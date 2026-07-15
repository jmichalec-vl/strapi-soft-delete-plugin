import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createMockStrapi } from '../../../helpers/mock-strapi';
import publicApiFactory from '../../../../server/src/services/public-api';

const UID = 'api::article.article';
const REQUEST_AUTH = { id: 1, strategy: 'admin' } as const;
const OVERRIDE_AUTH = { id: null, strategy: 'api-token' } as const;

let mock: ReturnType<typeof createMockStrapi>;
let softDeleteService: {
  softDeleteDocument: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  deletePermanently: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
};
let bypass: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mock = createMockStrapi();

  softDeleteService = {
    softDeleteDocument: vi.fn().mockResolvedValue({ documentId: 'doc-1', entries: [] }),
    restore: vi.fn().mockResolvedValue({ documentId: 'doc-1', entries: [] }),
    deletePermanently: vi.fn().mockResolvedValue({ documentId: 'doc-1', entries: [] }),
    findMany: vi.fn().mockResolvedValue({ results: [], pagination: {} }),
  };
  bypass = vi.fn(async <T>(fn: () => Promise<T>): Promise<T> => fn());

  mock.registerService('soft-delete', 'soft-delete', softDeleteService);
  mock.registerService('soft-delete', 'db-subscriber', { bypass });
  mock.registerService('soft-delete', 'auth-resolver', {
    resolveAuth: vi.fn().mockReturnValue(REQUEST_AUTH),
  });

  mock.setContentTypes({
    [UID]: { uid: UID, kind: 'collectionType' },
    'api::homepage.homepage': { uid: 'api::homepage.homepage', kind: 'singleType' },
  });
});

const createService = () => publicApiFactory({ strapi: mock.strapi as never });

describe('public api service', () => {
  describe('uid validation', () => {
    it.each([
      { method: 'softDelete' as const },
      { method: 'restore' as const },
      { method: 'deletePermanently' as const },
    ])('$method rejects non-api uids with ApplicationError', async ({ method }) => {
      const service = createService();

      await expect(service[method]('plugin::users-permissions.user', 'doc-1')).rejects.toThrow(
        'only "api::" content types are supported',
      );
      expect(softDeleteService.softDeleteDocument).not.toHaveBeenCalled();
      expect(softDeleteService.restore).not.toHaveBeenCalled();
      expect(softDeleteService.deletePermanently).not.toHaveBeenCalled();
    });

    it('findSoftDeleted rejects non-api uids with ApplicationError', async () => {
      const service = createService();

      await expect(service.findSoftDeleted('admin::user')).rejects.toThrow(
        'only "api::" content types are supported',
      );
      expect(softDeleteService.findMany).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('delegates to the soft-delete service with the request auth', async () => {
      const service = createService();

      const result = await service.softDelete(UID, 'doc-1');

      expect(softDeleteService.softDeleteDocument).toHaveBeenCalledWith(UID, 'doc-1', REQUEST_AUTH);
      expect(result).toEqual({ documentId: 'doc-1', entries: [] });
    });

    it('uses the auth override when provided', async () => {
      const service = createService();

      await service.softDelete(UID, 'doc-1', { auth: OVERRIDE_AUTH });

      expect(softDeleteService.softDeleteDocument).toHaveBeenCalledWith(
        UID,
        'doc-1',
        OVERRIDE_AUTH,
      );
    });

    it('rejects when a lifecycle hook vetoes the operation', async () => {
      const hookError = new Error('Operation cancelled by beforeSoftDelete hook');
      softDeleteService.softDeleteDocument.mockRejectedValue(hookError);
      const service = createService();

      await expect(service.softDelete(UID, 'doc-1')).rejects.toBe(hookError);
    });
  });

  describe('restore', () => {
    it('derives the content type kind for collection types', async () => {
      const service = createService();

      await service.restore(UID, 'doc-1');

      expect(softDeleteService.restore).toHaveBeenCalledWith(
        UID,
        'doc-1',
        'collectionType',
        REQUEST_AUTH,
      );
    });

    it('derives the content type kind for single types', async () => {
      const service = createService();

      await service.restore('api::homepage.homepage', 'doc-1', { auth: OVERRIDE_AUTH });

      expect(softDeleteService.restore).toHaveBeenCalledWith(
        'api::homepage.homepage',
        'doc-1',
        'singleType',
        OVERRIDE_AUTH,
      );
    });
  });

  describe('deletePermanently', () => {
    it('delegates to the soft-delete service with the resolved auth', async () => {
      const service = createService();

      await service.deletePermanently(UID, 'doc-1', { auth: OVERRIDE_AUTH });

      expect(softDeleteService.deletePermanently).toHaveBeenCalledWith(UID, 'doc-1', OVERRIDE_AUTH);
    });
  });

  describe('findSoftDeleted', () => {
    it('delegates to the soft-delete service with the given params', async () => {
      const service = createService();
      const params = { page: 2, pageSize: 5, filters: { deletedAfter: '2026-01-01' } };

      await service.findSoftDeleted(UID, params);

      expect(softDeleteService.findMany).toHaveBeenCalledWith(UID, params);
    });
  });

  describe('withSoftDeleted', () => {
    it('runs the callback through the db-subscriber bypass', async () => {
      const service = createService();
      const fn = vi.fn().mockResolvedValue(['trashed-row']);

      const result = await service.withSoftDeleted(fn);

      expect(bypass).toHaveBeenCalledWith(fn);
      expect(result).toEqual(['trashed-row']);
    });
  });
});
