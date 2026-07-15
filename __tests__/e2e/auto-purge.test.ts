import { describe, it, expect, beforeAll, afterEach } from 'vitest';

import { login, api } from './helpers/api-client';
import { createArticle, findArticleBySlug, deleteArticle } from './helpers/content-manager';
import { findSoftDeletedArticle, permanentlyDeleteArticle } from './helpers/soft-delete-api';

const ARTICLE_UID = 'api::article.article';
const PURGE_TTL_DAYS = 30;
const EXPIRED_DAYS_AGO = 40;

const uniqueSlug = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const daysAgoIso = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

const runAutoPurge = async (ttlDays: number): Promise<number> => {
  const { status, data } = await api.post('/api/test-utils/run-auto-purge', { ttlDays });
  expect(status).toBe(200);
  return (data as { purged: number }).purged;
};

const backdateSoftDelete = async (documentId: string, date: string): Promise<void> => {
  const { status } = await api.post('/api/test-utils/backdate-soft-delete', {
    uid: ARTICLE_UID,
    documentId,
    date,
  });
  expect(status).toBe(200);
};

const countRows = async (uid: string, where: Record<string, unknown>): Promise<number> => {
  const { data } = await api.post('/api/test-utils/count-rows', { uid, where });
  return (data as { count: number }).count;
};

interface HookLogEntry {
  readonly hook: string;
  readonly uid: string;
  readonly documentId: string;
}

const getHookLog = async (): Promise<readonly HookLogEntry[]> => {
  const { data } = await api.get('/api/test-utils/soft-delete-hook-log');
  return (data as { log: readonly HookLogEntry[] }).log;
};

const clearHookLog = async (): Promise<void> => {
  await api.post('/api/test-utils/soft-delete-hook-log/clear');
};

const setHookBehavior = async (hook: string, behavior: string): Promise<void> => {
  await api.post('/api/test-utils/soft-delete-hook-behavior', { hook, behavior });
};

const resetHookBehaviors = async (): Promise<void> => {
  await api.post('/api/test-utils/soft-delete-hook-behavior/reset');
};

beforeAll(async () => {
  await login();
});

afterEach(async () => {
  await resetHookBehaviors();
});

describe('auto-purge', () => {
  it('purges expired entries with component cleanup, fires hooks, and spares fresh trash', async () => {
    const marker = uniqueSlug('purge');
    const expiredSlug = `${marker}-expired`;
    const freshSlug = `${marker}-fresh`;

    const expired = await createArticle(expiredSlug, 'Expired Article', {
      seo: { metaTitle: `${marker}-seo`, metaDescription: 'Expired SEO' },
      links: [{ label: `${marker}-link`, url: 'https://example.com' }],
      blocks: [{ __component: 'shared.hero', heading: `${marker}-hero` }],
    });
    const fresh = await createArticle(freshSlug, 'Fresh Trashed Article');

    await deleteArticle(expired.documentId);
    await deleteArticle(fresh.documentId);
    await backdateSoftDelete(expired.documentId, daysAgoIso(EXPIRED_DAYS_AGO));

    expect(await countRows('shared.seo', { metaTitle: `${marker}-seo` })).toBe(1);
    expect(await countRows('shared.link', { label: `${marker}-link` })).toBe(1);
    expect(await countRows('shared.hero', { heading: `${marker}-hero` })).toBe(1);

    await clearHookLog();
    const purged = await runAutoPurge(PURGE_TTL_DAYS);

    expect(purged).toBeGreaterThan(0);

    // Expired document is fully gone — main rows and all component rows
    expect(await findSoftDeletedArticle(expired.documentId)).toBeNull();
    expect(await findArticleBySlug(expiredSlug)).toBeNull();
    expect(await countRows(ARTICLE_UID, { documentId: expired.documentId })).toBe(0);
    expect(await countRows('shared.seo', { metaTitle: `${marker}-seo` })).toBe(0);
    expect(await countRows('shared.link', { label: `${marker}-link` })).toBe(0);
    expect(await countRows('shared.hero', { heading: `${marker}-hero` })).toBe(0);

    // Permanent-delete hooks fired for the purged document
    const hookLog = await getHookLog();
    const expiredHooks = hookLog.filter((entry) => entry.documentId === expired.documentId);
    expect(expiredHooks.map((entry) => entry.hook)).toEqual(
      expect.arrayContaining(['beforeDeletePermanently', 'afterDeletePermanently']),
    );

    // Fresh trashed document is untouched
    expect(await findSoftDeletedArticle(fresh.documentId)).not.toBeNull();

    await permanentlyDeleteArticle(fresh.documentId);
  });

  it('continues the run when a beforeDeletePermanently hook vetoes one document', async () => {
    const slug = uniqueSlug('purge-veto');
    const article = await createArticle(slug, 'Vetoed Purge Article');
    await deleteArticle(article.documentId);
    await backdateSoftDelete(article.documentId, daysAgoIso(EXPIRED_DAYS_AGO));

    await setHookBehavior('beforeDeletePermanently', 'throw');
    const purged = await runAutoPurge(PURGE_TTL_DAYS);
    await resetHookBehaviors();

    // The vetoed document is skipped (logged) instead of failing the run
    expect(purged).toBe(0);
    expect(await findSoftDeletedArticle(article.documentId)).not.toBeNull();

    // Next run (veto lifted) purges it
    const purgedAfterReset = await runAutoPurge(PURGE_TTL_DAYS);
    expect(purgedAfterReset).toBeGreaterThan(0);
    expect(await findSoftDeletedArticle(article.documentId)).toBeNull();
  });

  it('does not purge trashed entries newer than the TTL', async () => {
    const slug = uniqueSlug('purge-fresh');
    const article = await createArticle(slug, 'Fresh Purge Article');
    await deleteArticle(article.documentId);

    const purged = await runAutoPurge(PURGE_TTL_DAYS);

    expect(purged).toBe(0);
    expect(await findSoftDeletedArticle(article.documentId)).not.toBeNull();

    await permanentlyDeleteArticle(article.documentId);
  });
});
