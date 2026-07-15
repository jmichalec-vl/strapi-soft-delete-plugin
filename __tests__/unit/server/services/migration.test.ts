import { describe, it, expect, beforeEach } from 'vitest';

import { createMockStrapi } from '../../../helpers/mock-strapi';
import migrationFactory from '../../../../server/src/services/migration';

const V4_EXPLORER_READ = 'plugin::soft-delete.explorer.read';
const V5_EXPLORER_READ = 'plugin::soft-delete.explorer.soft-deleted-read';
const ADMIN_PERMISSION_UID = 'admin::permission';

let mock: ReturnType<typeof createMockStrapi>;

beforeEach(() => {
  mock = createMockStrapi();
});

const createService = () => migrationFactory({ strapi: mock.strapi as never });

describe('migration service', () => {
  describe('migrateFromV4IfNeeded', () => {
    it('skips everything when migration version is current', async () => {
      mock.store.get.mockResolvedValue({ _migrationVersion: 2 });
      const service = createService();

      await service.migrateFromV4IfNeeded();

      expect(mock.store.set).not.toHaveBeenCalled();
      expect(mock.getQueryForUid(ADMIN_PERMISSION_UID).updateMany).not.toHaveBeenCalled();
    });

    it('runs the permission migration when upgrading from version 1 (0.1.x)', async () => {
      mock.store.get.mockResolvedValue({
        _migrationVersion: 1,
        singleTypesRestorationBehavior: 'soft-delete',
        draftPublishRestorationBehavior: 'unchanged',
      });
      const service = createService();

      await service.migrateFromV4IfNeeded();

      expect(mock.getQueryForUid(ADMIN_PERMISSION_UID).updateMany).toHaveBeenCalledWith({
        where: { action: V4_EXPLORER_READ },
        data: { action: V5_EXPLORER_READ },
      });
      expect(mock.store.set).toHaveBeenCalledWith({
        key: 'settings',
        value: expect.objectContaining({ _migrationVersion: 2 }),
      });
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
          _migrationVersion: 2,
          singleTypesRestorationBehavior: 'soft-delete',
          draftPublishRestorationBehavior: 'draft',
        }),
      });
      expect(mock.strapi.log.info).toHaveBeenCalledWith(
        expect.stringContaining('existing settings'),
      );
    });

    it('rewrites v4 permission rows when migrating v4 settings', async () => {
      mock.store.get.mockResolvedValue({
        singleTypesRestorationBehavior: 'soft-delete',
        draftPublishRestorationBehavior: 'draft',
      });
      mock.getQueryForUid(ADMIN_PERMISSION_UID).updateMany.mockResolvedValue({ count: 3 });
      const service = createService();

      await service.migrateFromV4IfNeeded();

      expect(mock.getQueryForUid(ADMIN_PERMISSION_UID).updateMany).toHaveBeenCalledWith({
        where: { action: V4_EXPLORER_READ },
        data: { action: V5_EXPLORER_READ },
      });
    });

    it('writes defaults when no settings exist anywhere', async () => {
      // Both stores return null
      mock.store.get.mockResolvedValue(null);
      const service = createService();

      await service.migrateFromV4IfNeeded();

      expect(mock.store.set).toHaveBeenCalledWith({
        key: 'settings',
        value: expect.objectContaining({
          _migrationVersion: 2,
          singleTypesRestorationBehavior: 'soft-delete',
          draftPublishRestorationBehavior: 'unchanged',
        }),
      });
      expect(mock.strapi.log.info).toHaveBeenCalledWith(
        expect.stringContaining('Initialized default'),
      );
    });
  });

  describe('migratePermissionActions', () => {
    it('rewrites v4 explorer.read rows to explorer.soft-deleted-read', async () => {
      mock.getQueryForUid(ADMIN_PERMISSION_UID).updateMany.mockResolvedValue({ count: 2 });
      const service = createService();

      await service.migratePermissionActions();

      expect(mock.getQueryForUid(ADMIN_PERMISSION_UID).updateMany).toHaveBeenCalledExactlyOnceWith({
        where: { action: V4_EXPLORER_READ },
        data: { action: V5_EXPLORER_READ },
      });
      expect(mock.strapi.log.info).toHaveBeenCalledWith(
        expect.stringContaining('Migrated 2 admin permission(s)'),
      );
    });

    it('stays silent when no v4 permission rows exist', async () => {
      mock.getQueryForUid(ADMIN_PERMISSION_UID).updateMany.mockResolvedValue({ count: 0 });
      const service = createService();

      await service.migratePermissionActions();

      expect(mock.strapi.log.info).not.toHaveBeenCalled();
    });

    it('is idempotent — a second run matches no rows and logs nothing', async () => {
      const updateMany = mock.getQueryForUid(ADMIN_PERMISSION_UID).updateMany;
      updateMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 0 });
      const service = createService();

      await service.migratePermissionActions();
      await service.migratePermissionActions();

      expect(updateMany).toHaveBeenCalledTimes(2);
      expect(mock.strapi.log.info).toHaveBeenCalledTimes(1);
    });
  });
});
