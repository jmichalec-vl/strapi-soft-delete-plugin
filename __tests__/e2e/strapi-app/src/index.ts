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

export default {
  async bootstrap({ strapi }: { strapi: any }) {
    await ensureAdminUser(strapi);
    strapi.log.info('[seed] Bootstrap complete. Admin user ready.');
  },
};
