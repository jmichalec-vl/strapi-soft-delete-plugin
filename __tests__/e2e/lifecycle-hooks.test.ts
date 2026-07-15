import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

import { login, api } from './helpers/api-client';
import { createArticle, findArticleBySlug, deleteArticle } from './helpers/content-manager';
import {
  findSoftDeletedArticle,
  restoreArticle,
  permanentlyDeleteArticle,
} from './helpers/soft-delete-api';

const uniqueSlug = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const CM_ARTICLE_PATH = '/content-manager/collection-types/api::article.article';
const SD_ARTICLE_PATH = '/soft-delete/collectionType/api::article.article';

type HookBehavior = 'throw' | 'cancel' | 'cancel-with-error';

const setHookBehavior = async (hook: string, behavior: HookBehavior): Promise<void> => {
  await api.post('/api/test-utils/soft-delete-hook-behavior', { hook, behavior });
};

const resetHookBehaviors = async (): Promise<void> => {
  await api.post('/api/test-utils/soft-delete-hook-behavior/reset');
};

const getLifecycleLog = async (): Promise<readonly string[]> => {
  const { data } = await api.get('/api/test-utils/lifecycle-log');
  return (data as { log: readonly string[] }).log;
};

const clearLifecycleLog = async (): Promise<void> => {
  await api.post('/api/test-utils/lifecycle-log/clear');
};

beforeAll(async () => {
  await login();
});

describe('lifecycle hooks during normal operations', () => {
  const slug = uniqueSlug('lifecycle-normal');

  it('creating article triggers beforeCreate/afterCreate', async () => {
    await clearLifecycleLog();

    await createArticle(slug, 'Normal Lifecycle Article');

    const log = await getLifecycleLog();
    expect(log).toContain('beforeCreate');
    expect(log).toContain('afterCreate');
  });

  it('updating article triggers beforeUpdate/afterUpdate', async () => {
    const article = await findArticleBySlug(slug);
    await clearLifecycleLog();

    await api.put(`/content-manager/collection-types/api::article.article/${article!.documentId}`, {
      title: 'Updated Title',
    });

    const log = await getLifecycleLog();
    expect(log).toContain('beforeUpdate');
    expect(log).toContain('afterUpdate');
  });
});

describe('soft-delete does NOT trigger update/delete hooks', () => {
  const slug = uniqueSlug('lifecycle-softdel');
  let documentId: string;

  beforeEach(async () => {
    await clearLifecycleLog();
  });

  it('setup: create article', async () => {
    const article = await createArticle(slug, 'Soft Delete Lifecycle Article');
    documentId = article.documentId;
    expect(documentId).toBeTruthy();
  });

  it('soft-delete triggers NONE of beforeUpdate/afterUpdate/beforeDelete/afterDelete', async () => {
    await clearLifecycleLog();
    await deleteArticle(documentId);

    const log = await getLifecycleLog();

    expect(log).not.toContain('beforeUpdate');
    expect(log).not.toContain('afterUpdate');
    expect(log).not.toContain('beforeUpdateMany');
    expect(log).not.toContain('afterUpdateMany');
    expect(log).not.toContain('beforeDelete');
    expect(log).not.toContain('afterDelete');
    expect(log).not.toContain('beforeDeleteMany');
    expect(log).not.toContain('afterDeleteMany');
  });

  it('restore triggers NONE of beforeUpdate/afterUpdate hooks', async () => {
    await clearLifecycleLog();
    await restoreArticle(documentId);

    const log = await getLifecycleLog();

    expect(log).not.toContain('beforeUpdate');
    expect(log).not.toContain('afterUpdate');
    expect(log).not.toContain('beforeUpdateMany');
    expect(log).not.toContain('afterUpdateMany');
  });
});

describe('lifecycle hook error propagation', () => {
  afterEach(async () => {
    await resetHookBehaviors();
  });

  it('beforeSoftDelete throw → delete fails with 400 and entry is NOT soft-deleted', async () => {
    const slug = uniqueSlug('hook-throw-before-sd');
    const article = await createArticle(slug, 'Blocked Delete Article');

    await setHookBehavior('beforeSoftDelete', 'throw');

    const { status, data } = await api.del(`${CM_ARTICLE_PATH}/${article.documentId}?locale=*`);

    expect(status).toBe(400);
    expect(JSON.stringify(data)).toContain('Blocked by beforeSoftDelete test hook');

    await resetHookBehaviors();

    // Entry must still be live — not soft-deleted
    const live = await findArticleBySlug(slug);
    expect(live?.documentId).toBe(article.documentId);
    expect(await findSoftDeletedArticle(article.documentId)).toBeNull();
  });

  it('beforeSoftDelete {cancel: true} → delete fails with 403 ForbiddenError, entry not deleted', async () => {
    const slug = uniqueSlug('hook-cancel-before-sd');
    const article = await createArticle(slug, 'Cancelled Delete Article');

    await setHookBehavior('beforeSoftDelete', 'cancel');

    const { status, data } = await api.del(`${CM_ARTICLE_PATH}/${article.documentId}?locale=*`);

    expect(status).toBe(403);
    expect(JSON.stringify(data)).toContain('Operation cancelled by beforeSoftDelete hook');

    await resetHookBehaviors();

    const live = await findArticleBySlug(slug);
    expect(live?.documentId).toBe(article.documentId);
    expect(await findSoftDeletedArticle(article.documentId)).toBeNull();
  });

  it('beforeSoftDelete {cancel: true, error} → the custom error surfaces, entry not deleted', async () => {
    const slug = uniqueSlug('hook-cancel-error-before-sd');
    const article = await createArticle(slug, 'Custom Cancel Article');

    await setHookBehavior('beforeSoftDelete', 'cancel-with-error');

    const { status, data } = await api.del(`${CM_ARTICLE_PATH}/${article.documentId}?locale=*`);

    expect(status).toBe(400);
    expect(JSON.stringify(data)).toContain('Custom cancel error from beforeSoftDelete');

    await resetHookBehaviors();

    const live = await findArticleBySlug(slug);
    expect(live?.documentId).toBe(article.documentId);
    expect(await findSoftDeletedArticle(article.documentId)).toBeNull();
  });

  it('afterSoftDelete throw → request fails and the soft delete is ROLLED BACK', async () => {
    const slug = uniqueSlug('hook-throw-after-sd');
    const article = await createArticle(slug, 'After Hook Throw Article');

    await setHookBehavior('afterSoftDelete', 'throw');

    const { status, data } = await api.del(`${CM_ARTICLE_PATH}/${article.documentId}?locale=*`);

    expect(status).toBe(400);
    expect(JSON.stringify(data)).toContain('Blocked by afterSoftDelete test hook');

    await resetHookBehaviors();

    // Since 0.2.0 the plugin opens its own transaction spanning the
    // soft-delete write AND the afterSoftDelete hooks — the throw rolls the
    // write back, so the entry is still live (atomic host cascades).
    expect((await findArticleBySlug(slug))?.documentId).toBe(article.documentId);
    expect(await findSoftDeletedArticle(article.documentId)).toBeNull();
  });

  it('afterRestore throw → request fails and the restore is ROLLED BACK', async () => {
    const slug = uniqueSlug('hook-throw-after-restore');
    const article = await createArticle(slug, 'After Restore Throw Article');
    await deleteArticle(article.documentId);
    expect(await findSoftDeletedArticle(article.documentId)).not.toBeNull();

    await setHookBehavior('afterRestore', 'throw');

    const { status, data } = await api.put(`${SD_ARTICLE_PATH}/${article.documentId}/restore`);

    expect(status).toBe(400);
    expect(JSON.stringify(data)).toContain('Blocked by afterRestore test hook');

    await resetHookBehaviors();

    // The restore transaction rolled back — the entry is still in the trash
    expect(await findSoftDeletedArticle(article.documentId)).not.toBeNull();
    expect(await findArticleBySlug(slug)).toBeNull();

    await restoreArticle(article.documentId);
  });

  it('beforeRestore throw → restore fails with 400 and entry stays in trash', async () => {
    const slug = uniqueSlug('hook-throw-before-restore');
    const article = await createArticle(slug, 'Blocked Restore Article');
    await deleteArticle(article.documentId);
    expect(await findSoftDeletedArticle(article.documentId)).not.toBeNull();

    await setHookBehavior('beforeRestore', 'throw');

    const { status, data } = await api.put(`${SD_ARTICLE_PATH}/${article.documentId}/restore`);

    expect(status).toBe(400);
    expect(JSON.stringify(data)).toContain('Blocked by beforeRestore test hook');

    await resetHookBehaviors();

    // Entry must still be soft-deleted — restore was vetoed
    expect(await findSoftDeletedArticle(article.documentId)).not.toBeNull();
    expect(await findArticleBySlug(slug)).toBeNull();

    await restoreArticle(article.documentId);
  });

  it('beforeRestore {cancel: true} → restore fails with 403, entry stays in trash', async () => {
    const slug = uniqueSlug('hook-cancel-before-restore');
    const article = await createArticle(slug, 'Cancelled Restore Article');
    await deleteArticle(article.documentId);

    await setHookBehavior('beforeRestore', 'cancel');

    const { status, data } = await api.put(`${SD_ARTICLE_PATH}/${article.documentId}/restore`);

    expect(status).toBe(403);
    expect(JSON.stringify(data)).toContain('Operation cancelled by beforeRestore hook');

    await resetHookBehaviors();

    expect(await findSoftDeletedArticle(article.documentId)).not.toBeNull();

    await restoreArticle(article.documentId);
  });
});

describe('scoped lifecycle suppression', () => {
  // The former implementation flipped the process-global
  // strapi.db.lifecycles.disable() switch around its internal writes, so a
  // concurrent request's lifecycles could be silently skipped. The write is
  // now a raw, statement-scoped knex update — other writes keep their
  // lifecycles no matter when they run. (True cross-request parallelism is
  // not reliably observable against the sqlite test app, whose connection
  // pool serializes writes — the unit suite additionally asserts that no
  // code path calls lifecycles.disable at all.)
  it('host lifecycles keep firing for other writes immediately after a soft delete', async () => {
    const trashedSlug = uniqueSlug('scoped-suppress-a');
    const freshSlug = uniqueSlug('scoped-suppress-b');
    const trashed = await createArticle(trashedSlug, 'Scoped Suppression Article A');
    await deleteArticle(trashed.documentId);

    await clearLifecycleLog();
    await createArticle(freshSlug, 'Scoped Suppression Article B');

    const log = await getLifecycleLog();
    expect(log).toContain('beforeCreate');
    expect(log).toContain('afterCreate');

    await permanentlyDeleteArticle(trashed.documentId);
  });
});

describe('permanent delete DOES trigger delete hooks', () => {
  const slug = uniqueSlug('lifecycle-permdel');

  it('permanent delete triggers beforeDelete/afterDelete', async () => {
    const article = await createArticle(slug, 'Perm Delete Lifecycle Article');
    await deleteArticle(article.documentId);

    await clearLifecycleLog();
    await permanentlyDeleteArticle(article.documentId);

    const log = await getLifecycleLog();

    // Permanent delete uses individual delete per entry (for component cleanup)
    // Core beforeDelete/afterDelete hooks fire — users' cleanup logic runs
    expect(log).toContain('beforeDelete');
    expect(log).toContain('afterDelete');
  });
});
