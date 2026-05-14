import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createMockStrapi } from '../../../helpers/mock-strapi';
import autoPurgeFactory from '../../../../server/src/services/auto-purge';

let mock: ReturnType<typeof createMockStrapi>;

beforeEach(() => {
  mock = createMockStrapi();
  mock.setContentTypes({
    'api::article.article': { uid: 'api::article.article' },
    'api::page.page': { uid: 'api::page.page' },
    'admin::user': { uid: 'admin::user' },
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
    it('deletes expired entries from all api:: content types', async () => {
      mock.getQueryForUid('api::article.article').deleteMany.mockResolvedValue({ count: 3 });
      mock.getQueryForUid('api::page.page').deleteMany.mockResolvedValue({ count: 1 });
      const service = createService();

      const total = await service.purgeExpiredEntries(30);

      expect(total).toBe(4);
      expect(mock.strapi.db.query).toHaveBeenCalledWith('api::article.article');
      expect(mock.strapi.db.query).toHaveBeenCalledWith('api::page.page');
      expect(mock.strapi.db.query).not.toHaveBeenCalledWith('admin::user');
    });

    it('passes correct cutoff date to query', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-14T00:00:00.000Z'));

      mock.getQueryForUid('api::article.article').deleteMany.mockResolvedValue({ count: 0 });
      mock.getQueryForUid('api::page.page').deleteMany.mockResolvedValue({ count: 0 });
      const service = createService();

      await service.purgeExpiredEntries(30);

      expect(mock.getQueryForUid('api::article.article').deleteMany).toHaveBeenCalledWith({
        where: { _softDeletedAt: { $lt: '2026-04-14T00:00:00.000Z' } },
      });

      vi.useRealTimers();
    });

    it('returns 0 and does not log when nothing purged', async () => {
      mock.getQueryForUid('api::article.article').deleteMany.mockResolvedValue({ count: 0 });
      mock.getQueryForUid('api::page.page').deleteMany.mockResolvedValue({ count: 0 });
      const service = createService();

      const total = await service.purgeExpiredEntries(30);

      expect(total).toBe(0);
      expect(mock.strapi.log.info).not.toHaveBeenCalled();
    });

    it('logs when entries are purged', async () => {
      mock.getQueryForUid('api::article.article').deleteMany.mockResolvedValue({ count: 5 });
      mock.getQueryForUid('api::page.page').deleteMany.mockResolvedValue({ count: 0 });
      const service = createService();

      await service.purgeExpiredEntries(30);

      expect(mock.strapi.log.info).toHaveBeenCalledWith(
        expect.stringContaining('5 expired entries'),
      );
    });
  });
});
