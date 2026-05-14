import { describe, it, expect, beforeEach } from 'vitest';

import { createMockStrapi } from '../../../helpers/mock-strapi';
import migrationFactory from '../../../../server/src/services/migration';

let mock: ReturnType<typeof createMockStrapi>;

beforeEach(() => {
  mock = createMockStrapi();
});

const createService = () => migrationFactory({ strapi: mock.strapi as never });

describe('migration service', () => {
  describe('migrateFromV4IfNeeded', () => {
    it('skips when migration version is current', async () => {
      mock.store.get.mockResolvedValue({ _migrationVersion: 1 });
      const service = createService();

      await service.migrateFromV4IfNeeded();

      expect(mock.store.set).not.toHaveBeenCalled();
    });

    it('stamps migration version on existing v4 settings', async () => {
      mock.store.get.mockResolvedValue({
        singleTypesRestorationBehavior: 'soft-delete',
        draftPublishRestorationBehavior: 'draft',
      });
      const service = createService();

      await service.migrateFromV4IfNeeded();

      expect(mock.store.set).toHaveBeenCalledWith({
        key: 'settings',
        value: expect.objectContaining({
          _migrationVersion: 1,
          singleTypesRestorationBehavior: 'soft-delete',
          draftPublishRestorationBehavior: 'draft',
        }),
      });
      expect(mock.strapi.log.info).toHaveBeenCalledWith(
        expect.stringContaining('existing settings'),
      );
    });

    it('writes defaults when no settings exist anywhere', async () => {
      // Both stores return null
      mock.store.get.mockResolvedValue(null);
      const service = createService();

      await service.migrateFromV4IfNeeded();

      expect(mock.store.set).toHaveBeenCalledWith({
        key: 'settings',
        value: expect.objectContaining({
          _migrationVersion: 1,
          singleTypesRestorationBehavior: 'soft-delete',
          draftPublishRestorationBehavior: 'unchanged',
        }),
      });
      expect(mock.strapi.log.info).toHaveBeenCalledWith(
        expect.stringContaining('Initialized default'),
      );
    });
  });
});
