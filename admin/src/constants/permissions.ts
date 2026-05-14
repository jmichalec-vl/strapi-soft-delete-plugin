import { PLUGIN_ID } from './plugin';

export const PERMISSIONS = {
  read: [{ action: `plugin::${PLUGIN_ID}.read`, subject: null }],
  settings: [{ action: `plugin::${PLUGIN_ID}.settings`, subject: null }],
  explorerRead: (uid: string) => [
    { action: `plugin::${PLUGIN_ID}.explorer.soft-deleted-read`, subject: uid },
  ],
  explorerRestore: (uid: string) => [
    { action: `plugin::${PLUGIN_ID}.explorer.restore`, subject: uid },
  ],
  explorerDeletePermanently: (uid: string) => [
    { action: `plugin::${PLUGIN_ID}.explorer.delete-permanently`, subject: uid },
  ],
} as const;
