import { PLUGIN_ID } from '../constants/plugin';

export const getService = (name: string) => {
  return strapi.plugin(PLUGIN_ID).service(name);
};
