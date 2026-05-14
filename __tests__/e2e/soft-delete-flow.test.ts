import { describe, it, expect, beforeAll } from 'vitest';

import { login } from './helpers/api-client';
import {
  createArticle,
  findArticleBySlug,
  deleteArticle,
  createCategory,
  findCategoryBySlug,
  createOrUpdateHomepage,
  getHomepage,
  deleteHomepage,
} from './helpers/content-manager';
import {
  findSoftDeletedArticle,
  restoreArticle,
  permanentlyDeleteArticle,
  findSoftDeletedHomepage,
  restoreHomepage,
} from './helpers/soft-delete-api';

const uniqueSlug = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

beforeAll(async () => {
  await login();
});

describe('soft-delete happy path', () => {
  const slug = uniqueSlug('happy-path');
  let documentId: string;

  it('creates a test article and it is visible', async () => {
    const article = await createArticle(slug, 'Happy Path Article');
    documentId = article.documentId;

    expect(documentId).toBeTruthy();

    const found = await findArticleBySlug(slug);
    expect(found).not.toBeNull();
    expect(found?.title).toBe('Happy Path Article');
  });

  it('deleting via content manager soft-deletes it', async () => {
    await deleteArticle(documentId);

    const found = await findArticleBySlug(slug);
    expect(found).toBeNull();

    const entry = await findSoftDeletedArticle(documentId);
    expect(entry).not.toBeNull();
    expect(entry?._softDeletedAt).toBeTruthy();
    expect(entry?._softDeletedBy?.type).toBe('admin');
  });

  it('restoring brings it back to content manager', async () => {
    await restoreArticle(documentId);

    const found = await findArticleBySlug(slug);
    expect(found).not.toBeNull();
    expect(found?.title).toBe('Happy Path Article');

    const entry = await findSoftDeletedArticle(documentId);
    expect(entry).toBeNull();
  });
});

describe('permanent delete', () => {
  const slug = uniqueSlug('perm-delete');

  it('soft-delete then permanent delete removes it everywhere', async () => {
    const article = await createArticle(slug, 'To Be Permanently Deleted');

    await deleteArticle(article.documentId);
    expect(await findSoftDeletedArticle(article.documentId)).not.toBeNull();

    await permanentlyDeleteArticle(article.documentId);

    expect(await findSoftDeletedArticle(article.documentId)).toBeNull();
    expect(await findArticleBySlug(slug)).toBeNull();
  });
});

describe('relations survive soft-delete', () => {
  const categorySlug = uniqueSlug('cat-relation');
  const articleSlug = uniqueSlug('art-relation');
  let articleDocumentId: string;
  let categoryDocumentId: string;

  it('creates category and article with relation', async () => {
    const category = await createCategory(categorySlug, 'Tech');
    categoryDocumentId = category.documentId;

    const article = await createArticle(articleSlug, 'Tech Article', categoryDocumentId);
    articleDocumentId = article.documentId;

    expect(articleDocumentId).toBeTruthy();
    expect(categoryDocumentId).toBeTruthy();
  });

  it('soft-deleting article does not affect category', async () => {
    await deleteArticle(articleDocumentId);

    // Category still exists
    const category = await findCategoryBySlug(categorySlug);
    expect(category).not.toBeNull();
    expect(category?.name).toBe('Tech');
  });

  it('category populated articles count excludes soft-deleted one', async () => {
    const category = await findCategoryBySlug(categorySlug, 'articles');
    expect(category).not.toBeNull();

    // Content Manager returns relations as { count: N } — soft-deleted should be excluded
    const articles = category?.articles as unknown as { count: number } | readonly unknown[];
    const count = Array.isArray(articles) ? articles.length : (articles as { count: number }).count;
    expect(count).toBe(0);
  });

  it('restoring article restores the relation', async () => {
    await restoreArticle(articleDocumentId);

    const article = await findArticleBySlug(articleSlug, 'category');
    expect(article).not.toBeNull();

    // Content Manager may return category as object or { count }
    const category = article?.category;
    expect(category).toBeTruthy();
  });
});

describe('single type soft-delete', () => {
  let homepageDocumentId: string;

  it('creates homepage', async () => {
    const homepage = await createOrUpdateHomepage('Test Homepage', 'Hero text');
    homepageDocumentId = homepage.documentId;
    expect(homepageDocumentId).toBeTruthy();
  });

  it('deleting homepage soft-deletes it', async () => {
    await deleteHomepage();

    // Homepage should be hidden from Content Manager
    const found = await getHomepage();
    expect(found?.documentId).not.toBe(homepageDocumentId);
  });

  it('homepage appears in soft-delete explorer', async () => {
    const entry = await findSoftDeletedHomepage(homepageDocumentId);
    expect(entry).not.toBeNull();
    expect(entry?._softDeletedAt).toBeTruthy();
  });

  it('restoring homepage brings it back', async () => {
    await restoreHomepage(homepageDocumentId);

    const found = await getHomepage();
    expect(found?.documentId).toBe(homepageDocumentId);

    const entry = await findSoftDeletedHomepage(homepageDocumentId);
    expect(entry).toBeNull();
  });
});
