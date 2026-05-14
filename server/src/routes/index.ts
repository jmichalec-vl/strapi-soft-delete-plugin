import adminContentTypes from './admin-content-types';
import adminSettings from './admin-settings';

export default {
  admin: {
    type: 'admin',
    routes: [...adminContentTypes.routes, ...adminSettings.routes],
  },
};
