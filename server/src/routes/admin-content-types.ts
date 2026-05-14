export default {
  type: 'admin',
  routes: [
    {
      method: 'GET',
      path: '/:kind/:uid',
      handler: 'admin.findMany',
      config: {
        policies: ['can-read'],
      },
    },
    {
      method: 'GET',
      path: '/:kind/:uid/:documentId',
      handler: 'admin.findOne',
      config: {
        policies: ['can-read'],
      },
    },
    {
      method: 'DELETE',
      path: '/:kind/:uid/:documentId',
      handler: 'admin.delete',
      config: {
        policies: ['can-delete-permanently'],
      },
    },
    {
      method: 'PUT',
      path: '/:kind/:uid/:documentId/restore',
      handler: 'admin.restore',
      config: {
        policies: ['can-restore'],
      },
    },
    {
      method: 'POST',
      path: '/:kind/:uid/batch-delete',
      handler: 'admin.deleteMany',
      config: {
        policies: ['can-delete-permanently'],
      },
    },
    {
      method: 'POST',
      path: '/:kind/:uid/batch-restore',
      handler: 'admin.restoreMany',
      config: {
        policies: ['can-restore'],
      },
    },
  ],
};
