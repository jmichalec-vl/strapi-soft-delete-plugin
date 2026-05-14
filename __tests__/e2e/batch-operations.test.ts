import { describe, it, expect, beforeAll } from 'vitest';

import { login, api } from './helpers/api-client';
import { createArticle, findArticleBySlug, deleteArticle } from './helpers/content-manager';
import {
  getSoftDeletedArticles,
  findSoftDeletedArticle,
} from './helpers/soft-delete-api';

const uniqueSlug = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const SD_ARTICLE_PATH = '/soft-delete/collectionType/api::article.article';

beforeAll(async () => {
  await login();
});

describe('batch restore', () => {
  const slugs = [
    uniqueSlug('batch-r1'),
    uniqueSlug('batch-r2'),
    uniqueSlug('batch-r3'),
  ];
  const documentIds: string[] = [];

  it('creates and soft-deletes 3 articles', async () => {
    for (const slug of slugs) {
      const article = await createArticle(slug, `Batch Restore ${slug}`);
      documentIds.push(article.documentId);
      await deleteArticle(article.documentId);
    }

    // All 3 should be in explorer
    for (const docId of documentIds) {
      expect(await findSoftDeletedArticle(docId)).not.toBeNull();
    }
  });

  it('batch restore brings all 3 back', async () => {
    const { status } = await api.post(`${SD_ARTICLE_PATH}/batch-restore`, {
      documentIds,
    });
    expect(status).toBe(200);

    // All 3 visible in content manager
    for (const slug of slugs) {
      const article = await findArticleBySlug(slug);
      expect(article).not.toBeNull();
    }

    // None in explorer
    for (const docId of documentIds) {
      expect(await findSoftDeletedArticle(docId)).toBeNull();
    }
  });
});

describe('batch permanent delete', () => {
  const slugs = [
    uniqueSlug('batch-d1'),
    uniqueSlug('batch-d2'),
    uniqueSlug('batch-d3'),
  ];
  const documentIds: string[] = [];

  it('creates and soft-deletes 3 articles', async () => {
    for (const slug of slugs) {
      const article = await createArticle(slug, `Batch Delete ${slug}`);
      documentIds.push(article.documentId);
      await deleteArticle(article.documentId);
    }

    for (const docId of documentIds) {
      expect(await findSoftDeletedArticle(docId)).not.toBeNull();
    }
  });

  it('batch permanent delete removes all 3', async () => {
    const { status } = await api.post(`${SD_ARTICLE_PATH}/batch-delete`, {
      documentIds,
    });
    expect(status).toBe(200);

    // None in explorer
    for (const docId of documentIds) {
      expect(await findSoftDeletedArticle(docId)).toBeNull();
    }

    // None in content manager
    for (const slug of slugs) {
      expect(await findArticleBySlug(slug)).toBeNull();
    }
  });
});
