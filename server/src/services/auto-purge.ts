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

interface PurgeResult {
  readonly documentId: string;
  readonly entries: readonly Record<string, unknown>[];
}

/**
 * TTL-based purge of expired soft-deleted entries.
 *
 * Purging routes through the soft-delete service's `deletePermanently` —
 * the exact per-entry path the admin's "Delete permanently" uses — so every
 * purged document gets component/dynamic-zone cleanup, fires the
 * `beforeDeletePermanently`/`afterDeletePermanently` hooks, and emits an
 * `entry.delete` event per entry (after that document's rows are gone).
 * Like the interactive path, permanent deletion is NOT transactional.
 */
const autoPurge = ({ strapi }: { strapi: Core.Strapi }) => {
  const getSoftDeleteService = () => strapi.plugin(PLUGIN_ID).service('soft-delete');

  // bypass() lifts only our soft-delete read filter — required because the
  // purge queries intentionally target soft-deleted rows
  const getBypass = (): (<T>(fn: () => Promise<T>) => Promise<T>) =>
    strapi.plugin(PLUGIN_ID).service('db-subscriber').bypass;

  const collectExpiredDocumentIds = (
    expiredEntries: readonly Record<string, unknown>[],
  ): Map<string, number> =>
    expiredEntries.reduce((expiredRowsPerDocument, entry) => {
      const documentId = entry.documentId as string;
      expiredRowsPerDocument.set(documentId, (expiredRowsPerDocument.get(documentId) ?? 0) + 1);
      return expiredRowsPerDocument;
    }, new Map<string, number>());

  /**
   * Purge one document. Returns the number of deleted rows.
   *
   * Unlike the interactive permanent-delete path, where a
   * `beforeDeletePermanently` veto/throw propagates to the caller, purge
   * failures are caught per document, logged, and skipped: an unattended
   * cron run must not wedge on one bad document — the remaining expired
   * documents still get purged, and the failed one is retried next run.
   */
  const purgeDocument = async (
    uid: string,
    documentId: string,
    expiredRowCount: number,
  ): Promise<number> => {
    const bypass = getBypass();

    // deletePermanently removes EVERY row of the document. Skip documents
    // that still have live or not-yet-expired rows (e.g. only one locale was
    // soft-deleted) — purging them would destroy non-expired data.
    const totalRowCount = await bypass(() => strapi.db.query(uid).count({ where: { documentId } }));

    if (totalRowCount > expiredRowCount) {
      strapi.log.debug(
        `[soft-delete] Auto-purge: skipping "${uid}" document "${documentId}" — it still has non-expired entries.`,
      );
      return 0;
    }

    try {
      const result = (await getSoftDeleteService().deletePermanently(
        uid,
        documentId,
      )) as PurgeResult | null;
      return result?.entries.length ?? 0;
    } catch (error) {
      strapi.log.error(
        `[soft-delete] Auto-purge: failed to purge "${uid}" document "${documentId}" — skipping it this run.`,
        error,
      );
      return 0;
    }
  };

  const purgeExpiredEntriesForContentType = async (
    uid: string,
    cutoffIso: string,
  ): Promise<number> => {
    const bypass = getBypass();

    const expiredEntries = (await bypass(() =>
      strapi.db.query(uid).findMany({
        where: { [DELETED_AT]: { $lt: cutoffIso } },
      }),
    )) as readonly Record<string, unknown>[];

    const expiredRowsPerDocument = collectExpiredDocumentIds(expiredEntries);

    let purgedCount = 0;
    for (const [documentId, expiredRowCount] of expiredRowsPerDocument) {
      purgedCount += await purgeDocument(uid, documentId, expiredRowCount);
    }

    return purgedCount;
  };

  const purgeExpiredEntries = async (ttlDays: number): Promise<number> => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - ttlDays);
    const cutoffIso = cutoffDate.toISOString();

    const uids = Object.keys(strapi.contentTypes).filter(supportsContentType);

    let totalPurged = 0;
    for (const uid of uids) {
      totalPurged += await purgeExpiredEntriesForContentType(uid, cutoffIso);
    }

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
