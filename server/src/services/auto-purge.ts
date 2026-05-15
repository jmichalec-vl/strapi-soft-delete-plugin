import type { Core } from '@strapi/types';

import { PLUGIN_ID, SOFT_DELETE_FIELD_NAMES } from '../constants';
import { supportsContentType } from '../utils';

const { DELETED_AT } = SOFT_DELETE_FIELD_NAMES;

const DEFAULT_TTL_DAYS = 30;
const DEFAULT_CRON = '0 2 * * *';

interface AutoPurgeConfig {
  readonly enabled?: boolean;
  readonly ttlDays?: number;
  readonly cron?: string;
}

const autoPurge = ({ strapi }: { strapi: Core.Strapi }) => {
  const purgeExpiredEntries = async (ttlDays: number): Promise<number> => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - ttlDays);
    const cutoffIso = cutoffDate.toISOString();

    const uids = Object.keys(strapi.contentTypes).filter(supportsContentType);

    const counts = await Promise.all(
      uids.map(async (uid) => {
        const result = await strapi.db.query(uid).deleteMany({
          where: { [DELETED_AT]: { $lt: cutoffIso } },
        });
        return result?.count ?? 0;
      }),
    );

    const totalPurged = counts.reduce((sum, count) => sum + count, 0);

    if (totalPurged > 0) {
      strapi.log.info(
        `[soft-delete] Auto-purge: permanently deleted ${totalPurged} expired entries.`,
      );
    }

    return totalPurged;
  };

  const setup = (): void => {
    const config = strapi.config.get(`plugin::${PLUGIN_ID}`) as
      | { autoPurge?: AutoPurgeConfig }
      | undefined;

    if (!config?.autoPurge?.enabled) return;

    const ttlDays = config.autoPurge.ttlDays ?? DEFAULT_TTL_DAYS;
    const cronExpression = config.autoPurge.cron ?? DEFAULT_CRON;

    strapi.cron.add({
      'soft-delete-auto-purge': {
        task: () => purgeExpiredEntries(ttlDays),
        options: { rule: cronExpression },
      },
    });

    strapi.log.info(
      `[soft-delete] Auto-purge enabled: entries older than ${ttlDays} days will be permanently deleted (cron: ${cronExpression}).`,
    );
  };

  return { setup, purgeExpiredEntries };
};

export default autoPurge;
