import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createMockStrapi } from '../../../helpers/mock-strapi';
import autoPurgeFactory from '../../../../server/src/services/auto-purge';

let mock: ReturnType<typeof createMockStrapi>;
let deletePermanently: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mock = createMockStrapi();
  mock.setContentTypes({
    'api::article.article': { uid: 'api::article.article' },
    'api::page.page': { uid: 'api::page.page' },
    'admin::user': { uid: 'admin::user' },
  });

  deletePermanently = vi.fn().mockResolvedValue({ documentId: 'doc', entries: [{ id: 1 }] });
  mock.registerService('soft-delete', 'soft-delete', { deletePermanently });
  mock.registerService('soft-delete', 'db-subscriber', {
    bypass: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
  });
});

const createService = () => autoPurgeFactory({ strapi: mock.strapi as never });

describe('auto-purge service', () => {
  describe('setup', () => {
    it('does not register cron when autoPurge is disabled', () => {
      mock.strapi.config.get.mockReturnValue({ autoPurge: { enabled: false } });
      const service = createService();

      service.setup();

      expect(mock.strapi.cron.add).not.toHaveBeenCalled();
    });

    it('does not register cron when config is empty', () => {
      mock.strapi.config.get.mockReturnValue({});
      const service = createService();

      service.setup();

      expect(mock.strapi.cron.add).not.toHaveBeenCalled();
    });

    it('registers cron when autoPurge is enabled', () => {
      mock.strapi.config.get.mockReturnValue({
        autoPurge: { enabled: true, ttlDays: 7, cron: '0 3 * * *' },
      });
      const service = createService();

      service.setup();

      expect(mock.strapi.cron.add).toHaveBeenCalledWith({
        'soft-delete-auto-purge': {
          task: expect.any(Function),
          options: { rule: '0 3 * * *' },
        },
      });
      expect(mock.strapi.log.info).toHaveBeenCalledWith(expect.stringContaining('7 days'));
    });

    it('uses defaults when ttlDays and cron are not specified', () => {
      mock.strapi.config.get.mockReturnValue({ autoPurge: { enabled: true } });
      const service = createService();

      service.setup();

      expect(mock.strapi.cron.add).toHaveBeenCalledWith({
        'soft-delete-auto-purge': {
          task: expect.any(Function),
          options: { rule: '0 2 * * *' },
        },
      });
    });
  });

  describe('purgeExpiredEntries', () => {
    const expiredEntry = (id: number, documentId: string) => ({
      id,
      documentId,
      _softDeletedAt: '2020-01-01T00:00:00.000Z',
    });

    it('routes each expired document through the permanent-delete path, grouped by documentId', async () => {
      const articleQuery = mock.getQueryForUid('api::article.article');
      articleQuery.findMany.mockResolvedValue([
        expiredEntry(1, 'doc-1'),
        expiredEntry(2, 'doc-1'),
        expiredEntry(3, 'doc-2'),
      ]);
      articleQuery.count.mockImplementation(async ({ where }: { where: { documentId: string } }) =>
        where.documentId === 'doc-1' ? 2 : 1,
      );
      const service = createService();

      await service.purgeExpiredEntries(30);

      expect(deletePermanently).toHaveBeenCalledTimes(2);
      expect(deletePermanently).toHaveBeenCalledWith('api::article.article', 'doc-1');
      expect(deletePermanently).toHaveBeenCalledWith('api::article.article', 'doc-2');
    });

    it('queries expired entries only for api:: content types', async () => {
      const service = createService();

      await service.purgeExpiredEntries(30);

      expect(mock.strapi.db.query).toHaveBeenCalledWith('api::article.article');
      expect(mock.strapi.db.query).toHaveBeenCalledWith('api::page.page');
      expect(mock.strapi.db.query).not.toHaveBeenCalledWith('admin::user');
    });

    it('passes correct cutoff date to the expired-entries query', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-14T00:00:00.000Z'));
      const service = createService();

      await service.purgeExpiredEntries(30);

      expect(mock.getQueryForUid('api::article.article').findMany).toHaveBeenCalledWith({
        where: { _softDeletedAt: { $lt: '2026-04-14T00:00:00.000Z' } },
      });

      vi.useRealTimers();
    });

    it('counts purged rows from the permanent-delete results', async () => {
      const articleQuery = mock.getQueryForUid('api::article.article');
      articleQuery.findMany.mockResolvedValue([expiredEntry(1, 'doc-1'), expiredEntry(2, 'doc-1')]);
      articleQuery.count.mockResolvedValue(2);
      deletePermanently.mockResolvedValue({
        documentId: 'doc-1',
        entries: [{ id: 1 }, { id: 2 }],
      });
      const service = createService();

      const total = await service.purgeExpiredEntries(30);

      expect(total).toBe(2);
    });

    it('skips documents that still have non-expired entries', async () => {
      const articleQuery = mock.getQueryForUid('api::article.article');
      articleQuery.findMany.mockResolvedValue([expiredEntry(1, 'doc-1')]);
      // Two rows total for doc-1 but only one is expired → a live or newer
      // trashed row would be destroyed by deletePermanently
      articleQuery.count.mockResolvedValue(2);
      const service = createService();

      const total = await service.purgeExpiredEntries(30);

      expect(deletePermanently).not.toHaveBeenCalled();
      expect(total).toBe(0);
    });

    it('continues the purge run when one document fails to delete', async () => {
      const articleQuery = mock.getQueryForUid('api::article.article');
      articleQuery.findMany.mockResolvedValue([expiredEntry(1, 'doc-1'), expiredEntry(2, 'doc-2')]);
      articleQuery.count.mockResolvedValue(1);
      deletePermanently
        .mockRejectedValueOnce(new Error('Vetoed by beforeDeletePermanently'))
        .mockResolvedValueOnce({ documentId: 'doc-2', entries: [{ id: 2 }] });
      const service = createService();

      const total = await service.purgeExpiredEntries(30);

      expect(deletePermanently).toHaveBeenCalledTimes(2);
      expect(total).toBe(1);
      expect(mock.strapi.log.error).toHaveBeenCalledWith(
        expect.stringContaining('doc-1'),
        expect.any(Error),
      );
    });

    it('returns 0 and does not log when nothing purged', async () => {
      const service = createService();

      const total = await service.purgeExpiredEntries(30);

      expect(total).toBe(0);
      expect(mock.strapi.log.info).not.toHaveBeenCalled();
    });

    it('logs the total of purged entries', async () => {
      const articleQuery = mock.getQueryForUid('api::article.article');
      articleQuery.findMany.mockResolvedValue([expiredEntry(1, 'doc-1')]);
      articleQuery.count.mockResolvedValue(1);
      deletePermanently.mockResolvedValue({
        documentId: 'doc-1',
        entries: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }],
      });
      const service = createService();

      await service.purgeExpiredEntries(30);

      expect(mock.strapi.log.info).toHaveBeenCalledWith(
        expect.stringContaining('5 expired entries'),
      );
    });
  });
});
