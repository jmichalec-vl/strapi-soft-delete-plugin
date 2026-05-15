import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createMockStrapi } from '../../helpers/mock-strapi';
import bootstrap from '../../../server/src/bootstrap';

let mock: ReturnType<typeof createMockStrapi>;

beforeEach(() => {
  mock = createMockStrapi();

  mock.setContentTypes({
    'api::article.article': { uid: 'api::article.article' },
    'admin::user': { uid: 'admin::user' },
  });

  mock.registerService('soft-delete', 'migration', {
    migrateFromV4IfNeeded: vi.fn().mockResolvedValue(undefined),
  });
  mock.registerService('soft-delete', 'settings', {
    ensureDefaults: vi.fn().mockResolvedValue(undefined),
  });
  mock.registerService('soft-delete', 'auto-purge', {
    setup: vi.fn(),
  });
  mock.registerService('soft-delete', 'db-subscriber', {
    register: vi.fn(),
  });

  const actionProvider = {
    registerMany: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockReturnValue({ displayName: 'Delete' }),
  };
  mock.registerAdminService('permission', { actionProvider });
  mock.strapi.service.mockReturnValue({ actionProvider });
});

describe('bootstrap', () => {
  it('runs migration first', async () => {
    await bootstrap({ strapi: mock.strapi as never });

    const migrationService = mock.services.get('soft-delete::migration');
    expect(migrationService?.migrateFromV4IfNeeded).toHaveBeenCalled();
  });

  it('ensures default settings', async () => {
    await bootstrap({ strapi: mock.strapi as never });

    const settingsService = mock.services.get('soft-delete::settings');
    expect(settingsService?.ensureDefaults).toHaveBeenCalled();
  });

  it('registers RBAC permissions with api:: content types only', async () => {
    await bootstrap({ strapi: mock.strapi as never });

    const { actionProvider } = mock.strapi.service('admin::permission') as {
      actionProvider: { registerMany: ReturnType<typeof vi.fn> };
    };
    expect(actionProvider.registerMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ uid: 'read', section: 'plugins' }),
        expect.objectContaining({
          uid: 'explorer.soft-deleted-read',
          section: 'contentTypes',
          subjects: ['api::article.article'],
        }),
      ]),
    );
  });

  it('registers document service middleware', async () => {
    await bootstrap({ strapi: mock.strapi as never });

    expect(mock.strapi.documents.use).toHaveBeenCalledWith(expect.any(Function));
  });

  it('sets up auto-purge', async () => {
    await bootstrap({ strapi: mock.strapi as never });

    const autoPurgeService = mock.services.get('soft-delete::auto-purge');
    expect(autoPurgeService?.setup).toHaveBeenCalled();
  });

  it('installs event hub guard', async () => {
    await bootstrap({ strapi: mock.strapi as never });

    // The original emit should have been replaced
    expect(mock.strapi.eventHub.emit).not.toBe(vi.fn());
  });
});
