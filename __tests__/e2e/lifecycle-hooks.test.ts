import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import { login, api } from './helpers/api-client';
import { createArticle, findArticleBySlug, deleteArticle } from './helpers/content-manager';
import { restoreArticle, permanentlyDeleteArticle } from './helpers/soft-delete-api';

const uniqueSlug = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

    await api.put(
      `/content-manager/collection-types/api::article.article/${article!.documentId}`,
      { title: 'Updated Title' },
    );

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
