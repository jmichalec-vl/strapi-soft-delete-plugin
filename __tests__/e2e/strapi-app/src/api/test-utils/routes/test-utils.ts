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
  ],
};
