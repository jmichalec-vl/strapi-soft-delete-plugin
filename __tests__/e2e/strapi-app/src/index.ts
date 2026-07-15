import { errors } from '@strapi/utils';

const ADMIN_USER = {
  username: 'admin',
  email: 'admin@test.com',
  password: 'Admin1234!',
  firstname: 'Test',
  lastname: 'Admin',
};

const ensureAdminUser = async (strapi: any): Promise<void> => {
  const existingAdmin = await strapi.db.query('admin::user').findOne({
    where: { email: ADMIN_USER.email },
  });

  if (existingAdmin) {
    strapi.log.info('[seed] Admin user already exists, skipping.');
    return;
  }

  const superAdminRole = await strapi.db.query('admin::role').findOne({
    where: { code: 'strapi-super-admin' },
  });

  if (!superAdminRole) {
    strapi.log.warn('[seed] Super admin role not found, skipping admin user creation.');
    return;
  }

  const hashedPassword = await strapi.service('admin::auth').hashPassword(ADMIN_USER.password);

  await strapi.db.query('admin::user').create({
    data: {
      ...ADMIN_USER,
      password: hashedPassword,
      isActive: true,
      blocked: false,
      roles: [superAdminRole.id],
    },
  });

  strapi.log.info(`[seed] Admin user created: ${ADMIN_USER.email} / ${ADMIN_USER.password}`);
};

// --- Soft-delete lifecycle test hooks ---------------------------------------
// Handlers are registered once at bootstrap; their behavior is switched at
// runtime by E2E tests via POST /api/test-utils/soft-delete-hook-behavior.

const SOFT_DELETE_HOOK_NAMES = [
  'beforeSoftDelete',
  'afterSoftDelete',
  'beforeRestore',
  'afterRestore',
  'beforeDeletePermanently',
  'afterDeletePermanently',
] as const;

type SoftDeleteHookBehavior = 'throw' | 'cancel' | 'cancel-with-error';

const getSoftDeleteHookBehaviors = (): Record<string, SoftDeleteHookBehavior | undefined> => {
  const globals = globalThis as Record<string, unknown>;
  globals.__softDeleteHookBehaviors = globals.__softDeleteHookBehaviors ?? {};
  return globals.__softDeleteHookBehaviors as Record<string, SoftDeleteHookBehavior | undefined>;
};

const registerSoftDeleteTestHooks = (strapi: any): void => {
  const hooks = strapi.plugin('soft-delete').service('lifecycle-hooks');

  for (const hookName of SOFT_DELETE_HOOK_NAMES) {
    hooks.register(hookName, async () => {
      const behavior = getSoftDeleteHookBehaviors()[hookName];

      if (behavior === 'throw') {
        throw new errors.ApplicationError(`Blocked by ${hookName} test hook`);
      }

      if (behavior === 'cancel') {
        return { cancel: true };
      }

      if (behavior === 'cancel-with-error') {
        return {
          cancel: true,
          error: new errors.ApplicationError(`Custom cancel error from ${hookName}`),
        };
      }

      return undefined;
    });
  }
};

export default {
  async bootstrap({ strapi }: { strapi: any }) {
    await ensureAdminUser(strapi);
    registerSoftDeleteTestHooks(strapi);
    strapi.log.info('[seed] Bootstrap complete. Admin user ready.');
  },
};
