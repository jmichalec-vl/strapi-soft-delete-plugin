import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { login, api } from './helpers/api-client';
import { createArticle, findArticleBySlug, deleteArticle } from './helpers/content-manager';
import { findSoftDeletedArticle, restoreArticle } from './helpers/soft-delete-api';

const uniqueSlug = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const CM_ARTICLE_PATH = '/content-manager/collection-types/api::article.article';
const SETTINGS_PATH = '/soft-delete/settings';

const DEFAULT_SETTINGS = {
  singleTypesRestorationBehavior: 'soft-delete',
  draftPublishRestorationBehavior: 'unchanged',
};

const getSettings = async () => {
  const { data } = await api.get(SETTINGS_PATH);
  return data as Record<string, string>;
};

const updateSettings = async (settings: Record<string, string>) => {
  await api.put(SETTINGS_PATH, settings);
};

const publishArticle = async (documentId: string) => {
  await api.post(`${CM_ARTICLE_PATH}/${documentId}/actions/publish`);
};

const getArticleStatus = async (slug: string): Promise<string | null> => {
  const article = await findArticleBySlug(slug);
  if (!article) return null;
  return (article as unknown as { status: string }).status;
};

let originalSettings: Record<string, string>;

beforeAll(async () => {
  await login();
  originalSettings = await getSettings();
});

afterAll(async () => {
  // Always restore original settings regardless of test outcome
  await updateSettings(originalSettings ?? DEFAULT_SETTINGS);
});

describe('restore with "unchanged" setting preserves publish state', () => {
  const slug = uniqueSlug('dp-unchanged');
  let documentId: string;

  it('creates and publishes an article', async () => {
    await updateSettings({ ...DEFAULT_SETTINGS, draftPublishRestorationBehavior: 'unchanged' });

    const article = await createArticle(slug, 'Published Article');
    documentId = article.documentId;

    await publishArticle(documentId);

    const status = await getArticleStatus(slug);
    expect(status).toBe('published');
  });

  it('soft-delete then restore keeps it published', async () => {
    await deleteArticle(documentId);

    expect(await findArticleBySlug(slug)).toBeNull();
    expect(await findSoftDeletedArticle(documentId)).not.toBeNull();

    await restoreArticle(documentId);

    const status = await getArticleStatus(slug);
    expect(status).toBe('published');
  });
});

describe('restore with "draft" setting forces draft state', () => {
  const slug = uniqueSlug('dp-draft');
  let documentId: string;

  it('creates and publishes an article', async () => {
    await updateSettings({ ...DEFAULT_SETTINGS, draftPublishRestorationBehavior: 'draft' });

    const article = await createArticle(slug, 'Will Become Draft');
    documentId = article.documentId;

    await publishArticle(documentId);

    const status = await getArticleStatus(slug);
    expect(status).toBe('published');
  });

  it('soft-delete then restore forces it to draft', async () => {
    await deleteArticle(documentId);

    expect(await findSoftDeletedArticle(documentId)).not.toBeNull();

    await restoreArticle(documentId);

    const status = await getArticleStatus(slug);
    expect(status).toBe('draft');
  });
});
