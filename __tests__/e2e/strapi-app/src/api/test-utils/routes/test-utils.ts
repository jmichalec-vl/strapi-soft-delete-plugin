export default {
  routes: [
    {
      method: 'GET',
      path: '/test-utils/lifecycle-log',
      handler: 'test-utils.getLifecycleLog',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/test-utils/lifecycle-log/clear',
      handler: 'test-utils.clearLifecycleLog',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/test-utils/soft-delete-hook-behavior',
      handler: 'test-utils.setSoftDeleteHookBehavior',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/test-utils/soft-delete-hook-behavior/reset',
      handler: 'test-utils.resetSoftDeleteHookBehaviors',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/test-utils/public-api',
      handler: 'test-utils.invokePublicApi',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/test-utils/public-api/compare-reads',
      handler: 'test-utils.compareSoftDeletedReads',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/test-utils/v4-permission-migration',
      handler: 'test-utils.runV4PermissionMigration',
      config: {
        auth: false,
      },
    },
  ],
};
