import { describe, it, expect, beforeEach } from 'vitest';

import { createMockStrapi } from '../../../helpers/mock-strapi';
import authResolverFactory from '../../../../server/src/services/auth-resolver';

let mock: ReturnType<typeof createMockStrapi>;

beforeEach(() => {
  mock = createMockStrapi();
});

const createService = () => authResolverFactory({ strapi: mock.strapi as never });

describe('auth-resolver service', () => {
  describe('resolveAuth', () => {
    it('returns id and strategy from request context', () => {
      mock.setAuthContext(42, 'admin');
      const service = createService();

      const result = service.resolveAuth();

      expect(result).toEqual({ id: 42, strategy: 'admin' });
    });

    it('returns null id when no credentials', () => {
      mock.strapi.requestContext.get.mockReturnValue({
        state: { auth: { credentials: {}, strategy: { name: 'api-token' } } },
      });
      const service = createService();

      const result = service.resolveAuth();

      expect(result).toEqual({ id: null, strategy: 'api-token' });
    });

    it('returns unknown strategy when context is empty', () => {
      mock.strapi.requestContext.get.mockReturnValue(null);
      const service = createService();

      const result = service.resolveAuth();

      expect(result).toEqual({ id: null, strategy: 'unknown' });
    });
  });

  describe('resolveDisplayName', () => {
    it('resolves admin user name', async () => {
      mock.getQueryForUid('admin::user').findOne.mockResolvedValue({
        username: 'admin1',
        email: 'admin@test.com',
      });
      const service = createService();

      const result = await service.resolveDisplayName(1, 'admin');

      expect(result).toEqual({ id: 1, type: 'admin', name: 'admin1' });
    });

    it('falls back to firstname + lastname for admin', async () => {
      mock.getQueryForUid('admin::user').findOne.mockResolvedValue({
        username: '',
        firstname: 'John',
        lastname: 'Doe',
        email: 'john@test.com',
      });
      const service = createService();

      const result = await service.resolveDisplayName(1, 'admin');

      expect(result).toEqual({ id: 1, type: 'admin', name: 'John Doe' });
    });

    it('resolves api-token name', async () => {
      mock.getQueryForUid('admin::api-token').findOne.mockResolvedValue({
        name: 'My API Token',
      });
      const service = createService();

      const result = await service.resolveDisplayName(5, 'api-token');

      expect(result).toEqual({ id: 5, type: 'api-token', name: 'My API Token' });
    });

    it('resolves users-permissions user name', async () => {
      mock.getQueryForUid('plugin::users-permissions.user').findOne.mockResolvedValue({
        username: 'frontenduser',
        email: 'user@test.com',
      });
      const service = createService();

      const result = await service.resolveDisplayName(10, 'users-permissions');

      expect(result).toEqual({ id: 10, type: 'users-permissions', name: 'frontenduser' });
    });

    it('returns without name when id is null', async () => {
      const service = createService();

      const result = await service.resolveDisplayName(null, 'admin');

      expect(result).toEqual({ id: null, type: 'admin' });
      expect(result).not.toHaveProperty('name');
    });

    it('returns without name for unknown strategy', async () => {
      const service = createService();

      const result = await service.resolveDisplayName(1, 'unknown-strategy');

      expect(result).toEqual({ id: 1, type: 'unknown-strategy' });
    });

    it('returns without name when entity lookup fails', async () => {
      mock.getQueryForUid('admin::user').findOne.mockRejectedValue(new Error('DB error'));
      const service = createService();

      const result = await service.resolveDisplayName(1, 'admin');

      expect(result).toEqual({ id: 1, type: 'admin' });
    });

    it('returns without name when entity not found', async () => {
      mock.getQueryForUid('admin::user').findOne.mockResolvedValue(null);
      const service = createService();

      const result = await service.resolveDisplayName(999, 'admin');

      expect(result).toEqual({ id: 999, type: 'admin' });
    });
  });
});
