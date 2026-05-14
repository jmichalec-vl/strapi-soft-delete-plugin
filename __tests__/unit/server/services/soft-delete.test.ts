import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createMockStrapi } from '../../../helpers/mock-strapi';
import softDeleteFactory from '../../../../server/src/services/soft-delete';

let mock: ReturnType<typeof createMockStrapi>;

beforeEach(() => {
  mock = createMockStrapi();
  (globalThis as Record<string, unknown>).strapi = mock.strapi;

  mock.registerService('soft-delete', 'auth-resolver', {
    resolveAuth: vi.fn().mockReturnValue({ id: 1, strategy: 'admin' }),
    resolveDisplayName: vi.fn().mockResolvedValue({ id: 1, type: 'admin', name: 'Admin' }),
  });
  mock.registerService('soft-delete', 'event-emitter', {
    emit: vi.fn().mockResolvedValue(undefined),
  });
  mock.registerService('soft-delete', 'lifecycle-hooks', {
    fire: vi.fn().mockResolvedValue(false),
  });
  mock.registerService('soft-delete', 'settings', {
    get: vi.fn().mockResolvedValue({
      singleTypesRestorationBehavior: 'soft-delete',
      draftPublishRestorationBehavior: 'unchanged',
    }),
  });
  mock.registerService('soft-delete', 'db-subscriber', {
    bypass: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
  });

  mock.setContentTypes({
    'api::article.article': {
      uid: 'api::article.article',
      options: { draftAndPublish: false },
    },
  });
});

const createService = () => softDeleteFactory({ strapi: mock.strapi as never });
const UID = 'api::article.article';

describe('soft-delete service', () => {
  describe('findMany', () => {
    it('returns paginated results with enriched entries', async () => {
      const entries = [
        {
          id: 1,
          documentId: 'doc-1',
          _softDeletedAt: '2026-01-01',
          _softDeletedById: 1,
          _softDeletedByType: 'admin',
        },
      ];
      mock.getQueryForUid(UID).findMany.mockResolvedValue(entries);
      mock.getQueryForUid(UID).count.mockResolvedValue(1);
      const service = createService();

      const result = await service.findMany(UID, { page: 1, pageSize: 10 });

      expect(result.pagination).toEqual({ page: 1, pageSize: 10, total: 1, pageCount: 1 });
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toHaveProperty('_softDeletedBy');
    });

    it('paginates deduplicated results for page 2', async () => {
      const entries = Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        documentId: `doc-${i + 1}`,
        _softDeletedAt: '2026-01-01',
        _softDeletedById: 1,
        _softDeletedByType: 'admin',
      }));
      mock.getQueryForUid(UID).findMany.mockResolvedValue(entries);
      const service = createService();

      const result = await service.findMany(UID, { page: 2, pageSize: 5 });

      expect(result.results).toHaveLength(5);
      expect(result.pagination).toEqual({ page: 2, pageSize: 5, total: 15, pageCount: 3 });
    });

    it('deduplicates entries with same documentId (D&P)', async () => {
      const entries = [
        { id: 1, documentId: 'doc-1', _softDeletedAt: '2026-01-01', _softDeletedById: 1, _softDeletedByType: 'admin' },
        { id: 2, documentId: 'doc-1', _softDeletedAt: '2026-01-01', _softDeletedById: 1, _softDeletedByType: 'admin' },
        { id: 3, documentId: 'doc-2', _softDeletedAt: '2026-01-01', _softDeletedById: 1, _softDeletedByType: 'admin' },
      ];
      mock.getQueryForUid(UID).findMany.mockResolvedValue(entries);
      const service = createService();

      const result = await service.findMany(UID, { page: 1, pageSize: 10 });

      expect(result.results).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });
  });

  describe('findOne', () => {
    it('returns enriched entry when found', async () => {
      const entry = {
        id: 1,
        documentId: 'doc-1',
        _softDeletedAt: '2026-01-01',
        _softDeletedById: 1,
        _softDeletedByType: 'admin',
      };
      mock.getQueryForUid(UID).findOne.mockResolvedValue(entry);
      const service = createService();

      const result = await service.findOne(UID, 'doc-1');

      expect(result).toHaveProperty('_softDeletedBy');
      expect(result?.documentId).toBe('doc-1');
    });

    it('returns null when not found', async () => {
      mock.getQueryForUid(UID).findOne.mockResolvedValue(null);
      const service = createService();

      const result = await service.findOne(UID, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('restore', () => {
    it('clears soft-delete fields with lifecycles disabled', async () => {
      const entries = [{ id: 1, documentId: 'doc-1', _softDeletedAt: '2026-01-01' }];
      mock
        .getQueryForUid(UID)
        .findMany.mockResolvedValueOnce(entries)
        .mockResolvedValueOnce([{ ...entries[0], _softDeletedAt: null }]);
      const service = createService();

      await service.restore(UID, 'doc-1', 'collectionType');

      expect(mock.strapi.db.lifecycles.disable).toHaveBeenCalled();
      expect(mock.getQueryForUid(UID).updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            _softDeletedAt: null,
            _softDeletedById: null,
            _softDeletedByType: null,
          }),
        }),
      );
      expect(mock.strapi.db.lifecycles.enable).toHaveBeenCalled();
    });

    it('returns null when no entries to restore', async () => {
      mock.getQueryForUid(UID).findMany.mockResolvedValue([]);
      const service = createService();

      const result = await service.restore(UID, 'nonexistent', 'collectionType');

      expect(result).toBeNull();
    });

    it('cancels when beforeRestore hook returns cancel', async () => {
      mock.getQueryForUid(UID).findMany.mockResolvedValue([{ id: 1, documentId: 'doc-1' }]);
      mock.registerService('soft-delete', 'lifecycle-hooks', {
        fire: vi.fn().mockResolvedValue(true),
      });
      const service = createService();

      const result = await service.restore(UID, 'doc-1', 'collectionType');

      expect(result).toBeNull();
      expect(mock.getQueryForUid(UID).updateMany).not.toHaveBeenCalled();
    });
  });

  describe('deletePermanently', () => {
    it('hard-deletes each entry individually', async () => {
      const entries = [{ id: 1, documentId: 'doc-1' }];
      mock.getQueryForUid(UID).findMany.mockResolvedValue(entries);
      const service = createService();

      await service.deletePermanently(UID, 'doc-1');

      expect(mock.getQueryForUid(UID).delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('fires lifecycle hooks and emits events', async () => {
      const entries = [{ id: 1, documentId: 'doc-1' }];
      const fireFn = vi.fn().mockResolvedValue(false);
      const emitFn = vi.fn().mockResolvedValue(undefined);

      mock.getQueryForUid(UID).findMany.mockResolvedValue(entries);
      mock.registerService('soft-delete', 'lifecycle-hooks', { fire: fireFn });
      mock.registerService('soft-delete', 'event-emitter', { emit: emitFn });
      const service = createService();

      await service.deletePermanently(UID, 'doc-1');

      expect(fireFn).toHaveBeenCalledWith('beforeDeletePermanently', expect.any(Object));
      expect(fireFn).toHaveBeenCalledWith('afterDeletePermanently', expect.any(Object));
      expect(emitFn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'entry.delete', action: 'delete-permanently' }),
      );
    });

    it('returns null when no entries found', async () => {
      mock.getQueryForUid(UID).findMany.mockResolvedValue([]);
      const service = createService();

      const result = await service.deletePermanently(UID, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('restoreMany', () => {
    it('restores multiple documents', async () => {
      const entry1 = [{ id: 1, documentId: 'doc-1' }];
      const entry2 = [{ id: 2, documentId: 'doc-2' }];

      mock
        .getQueryForUid(UID)
        .findMany.mockResolvedValueOnce(entry1)
        .mockResolvedValueOnce(entry1)
        .mockResolvedValueOnce(entry2)
        .mockResolvedValueOnce(entry2);
      const service = createService();

      const results = await service.restoreMany(UID, ['doc-1', 'doc-2'], 'collectionType');

      expect(results).toHaveLength(2);
    });
  });

  describe('deleteManyPermanently', () => {
    it('deletes multiple documents permanently', async () => {
      mock
        .getQueryForUid(UID)
        .findMany.mockResolvedValueOnce([{ id: 1, documentId: 'doc-1' }])
        .mockResolvedValueOnce([{ id: 2, documentId: 'doc-2' }]);
      const service = createService();

      const results = await service.deleteManyPermanently(UID, ['doc-1', 'doc-2']);

      expect(results).toHaveLength(2);
      expect(mock.getQueryForUid(UID).delete).toHaveBeenCalledTimes(2);
    });
  });
});
