import { describe, it, expect, vi } from 'vitest';

import canRead from '../../../../server/src/policies/can-read';
import canRestore from '../../../../server/src/policies/can-restore';
import canDeletePermanently from '../../../../server/src/policies/can-delete-permanently';

const createPolicyContext = (canResult: boolean) => ({
  state: {
    userAbility: {
      can: vi.fn().mockReturnValue(canResult),
    },
  },
  params: {
    uid: 'api::article.article',
  },
});

describe('RBAC policies', () => {
  describe('can-read', () => {
    it('returns true when user has explorer.read permission', () => {
      const ctx = createPolicyContext(true);
      const result = (canRead as (ctx: unknown) => boolean)(ctx);

      expect(result).toBe(true);
      expect(ctx.state.userAbility.can).toHaveBeenCalledWith(
        'plugin::soft-delete.explorer.soft-deleted-read',
        'api::article.article',
      );
    });

    it('returns false when user lacks permission', () => {
      const ctx = createPolicyContext(false);
      const result = (canRead as (ctx: unknown) => boolean)(ctx);

      expect(result).toBe(false);
    });
  });

  describe('can-restore', () => {
    it('checks explorer.restore permission', () => {
      const ctx = createPolicyContext(true);
      const result = (canRestore as (ctx: unknown) => boolean)(ctx);

      expect(result).toBe(true);
      expect(ctx.state.userAbility.can).toHaveBeenCalledWith(
        'plugin::soft-delete.explorer.restore',
        'api::article.article',
      );
    });
  });

  describe('can-delete-permanently', () => {
    it('checks explorer.delete-permanently permission', () => {
      const ctx = createPolicyContext(true);
      const result = (canDeletePermanently as (ctx: unknown) => boolean)(ctx);

      expect(result).toBe(true);
      expect(ctx.state.userAbility.can).toHaveBeenCalledWith(
        'plugin::soft-delete.explorer.delete-permanently',
        'api::article.article',
      );
    });
  });
});
