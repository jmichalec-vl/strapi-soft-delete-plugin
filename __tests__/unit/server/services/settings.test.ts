import { describe, it, expect, beforeEach } from 'vitest';

import { createMockStrapi } from '../../../helpers/mock-strapi';
import settingsFactory from '../../../../server/src/services/settings';

let mock: ReturnType<typeof createMockStrapi>;

beforeEach(() => {
  mock = createMockStrapi();
});

const createService = () => settingsFactory({ strapi: mock.strapi as never });

const validSettings = {
  singleTypesRestorationBehavior: 'soft-delete' as const,
  draftPublishRestorationBehavior: 'unchanged' as const,
};

describe('settings service', () => {
  describe('get', () => {
    it('returns stored settings when valid', async () => {
      mock.store.get.mockResolvedValue(validSettings);
      const service = createService();

      const result = await service.get();

      expect(result).toEqual(validSettings);
    });

    it('returns defaults when store is empty', async () => {
      mock.store.get.mockResolvedValue(null);
      const service = createService();

      const result = await service.get();

      expect(result).toEqual({
        singleTypesRestorationBehavior: 'soft-delete',
        draftPublishRestorationBehavior: 'unchanged',
      });
    });

    it('returns defaults when stored value is not valid settings', async () => {
      mock.store.get.mockResolvedValue({ unrelated: true });
      const service = createService();

      const result = await service.get();

      expect(result).toEqual({
        singleTypesRestorationBehavior: 'soft-delete',
        draftPublishRestorationBehavior: 'unchanged',
      });
    });
  });

  describe('set', () => {
    it('writes settings to store and returns them', async () => {
      const newSettings = {
        singleTypesRestorationBehavior: 'delete-permanently' as const,
        draftPublishRestorationBehavior: 'draft' as const,
      };
      mock.store.get.mockResolvedValue(newSettings);
      const service = createService();

      const result = await service.set(newSettings);

      expect(mock.store.set).toHaveBeenCalledWith({
        key: 'settings',
        value: newSettings,
      });
      expect(result).toEqual(newSettings);
    });
  });

  describe('ensureDefaults', () => {
    it('writes defaults when store is empty', async () => {
      mock.store.get.mockResolvedValue(null);
      const service = createService();

      await service.ensureDefaults();

      expect(mock.store.set).toHaveBeenCalledWith({
        key: 'settings',
        value: {
          singleTypesRestorationBehavior: 'soft-delete',
          draftPublishRestorationBehavior: 'unchanged',
        },
      });
    });

    it('does not overwrite existing settings', async () => {
      mock.store.get.mockResolvedValue(validSettings);
      const service = createService();

      await service.ensureDefaults();

      expect(mock.store.set).not.toHaveBeenCalled();
    });
  });
});
