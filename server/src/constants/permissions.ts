import { PLUGIN_ID } from './plugin.js';

type PermissionAction = {
  uid: string;
  section: string;
  displayName: string;
  pluginName: string;
  subjects?: string[];
  subCategory?: string;
};

const PLUGIN_LEVEL_ACTIONS: PermissionAction[] = [
  {
    uid: 'read',
    section: 'plugins',
    displayName: 'Read',
    pluginName: PLUGIN_ID,
    subCategory: 'general',
  },
  {
    uid: 'settings',
    section: 'plugins',
    displayName: 'Settings',
    pluginName: PLUGIN_ID,
    subCategory: 'general',
  },
];

const CONTENT_TYPE_ACTIONS: Array<Omit<PermissionAction, 'subjects'>> = [
  {
    uid: 'explorer.soft-deleted-read',
    section: 'contentTypes',
    displayName: 'Deleted Read',
    pluginName: PLUGIN_ID,
  },
  {
    uid: 'explorer.restore',
    section: 'contentTypes',
    displayName: 'Deleted Restore',
    pluginName: PLUGIN_ID,
  },
  {
    uid: 'explorer.delete-permanently',
    section: 'contentTypes',
    displayName: 'Delete Permanently',
    pluginName: PLUGIN_ID,
  },
];

export const buildPermissions = (contentTypeUids: string[]): PermissionAction[] => [
  ...PLUGIN_LEVEL_ACTIONS,
  ...CONTENT_TYPE_ACTIONS.map((action) => ({
    ...action,
    subjects: contentTypeUids,
  })),
];
