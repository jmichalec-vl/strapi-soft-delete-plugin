import { describe, it, expect, beforeAll } from 'vitest';

import { login } from './helpers/api-client';
import { createArticle, findArticleBySlug, deleteArticle } from './helpers/content-manager';
import {
  findSoftDeletedArticle,
  restoreArticle,
  permanentlyDeleteArticle,
} from './helpers/soft-delete-api';

const uniqueSlug = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const FULL_POPULATE = 'seo,links,blocks';

const ARTICLE_WITH_ALL_COMPONENTS = {
  seo: { metaTitle: 'Test SEO Title', metaDescription: 'Test SEO description' },
  links: [
    { label: 'Homepage', url: 'https://example.com' },
    { label: 'Blog', url: 'https://example.com/blog' },
  ],
  blocks: [
    { __component: 'shared.hero' as const, heading: 'Welcome', subheading: 'Sub text' },
    { __component: 'shared.seo' as const, metaTitle: 'Block SEO', metaDescription: 'In DZ' },
  ],
};

const assertArticleHasAllComponents = (article: unknown, label: string) => {
  const entry = article as Record<string, unknown>;

  // Single component (seo)
  const seo = entry.seo as Record<string, unknown> | undefined;
  expect(seo, `${label}: seo missing`).toBeTruthy();
  expect(seo?.metaTitle, `${label}: seo.metaTitle`).toBeTruthy();

  // Repeatable component (links)
  const links = entry.links as unknown[] | undefined;
  expect(links, `${label}: links missing`).toBeTruthy();
  expect(links?.length, `${label}: links count`).toBe(2);

  // Dynamic zone (blocks)
  const blocks = entry.blocks as unknown[] | undefined;
  expect(blocks, `${label}: blocks missing`).toBeTruthy();
  expect(blocks?.length, `${label}: blocks count`).toBe(2);
};

beforeAll(async () => {
  await login();
});

describe('permanent delete cleans up all component types', () => {
  const slugToDelete = uniqueSlug('comp-del');
  const slugToKeep = uniqueSlug('comp-keep');
  let deleteDocumentId: string;

  it('creates two articles with components, repeatable components, and dynamic zones', async () => {
    const toDelete = await createArticle(slugToDelete, 'To Delete', ARTICLE_WITH_ALL_COMPONENTS);
    deleteDocumentId = toDelete.documentId;

    await createArticle(slugToKeep, 'To Keep', ARTICLE_WITH_ALL_COMPONENTS);

    // Verify both have all components
    const foundDelete = await findArticleBySlug(slugToDelete, FULL_POPULATE);
    const foundKeep = await findArticleBySlug(slugToKeep, FULL_POPULATE);

    assertArticleHasAllComponents(foundDelete, 'toDelete');
    assertArticleHasAllComponents(foundKeep, 'toKeep');
  });

  it('permanently deleting one article does not affect the other', async () => {
    // Soft-delete then permanent-delete
    await deleteArticle(deleteDocumentId);
    await permanentlyDeleteArticle(deleteDocumentId);

    // Deleted article is gone
    expect(await findArticleBySlug(slugToDelete)).toBeNull();
    expect(await findSoftDeletedArticle(deleteDocumentId)).toBeNull();

    // Kept article is fully intact with all components
    const kept = await findArticleBySlug(slugToKeep, FULL_POPULATE);
    expect(kept).not.toBeNull();
    assertArticleHasAllComponents(kept, 'kept after delete');
  });
});

describe('soft-delete preserves all component types for restore', () => {
  const slug = uniqueSlug('comp-restore');
  let documentId: string;

  it('creates article with all component types', async () => {
    const article = await createArticle(slug, 'Restore Components', ARTICLE_WITH_ALL_COMPONENTS);
    documentId = article.documentId;

    const found = await findArticleBySlug(slug, FULL_POPULATE);
    assertArticleHasAllComponents(found, 'before soft-delete');
  });

  it('soft-delete then restore preserves all components', async () => {
    await deleteArticle(documentId);

    // Entry is soft-deleted
    expect(await findSoftDeletedArticle(documentId)).not.toBeNull();
    expect(await findArticleBySlug(slug)).toBeNull();

    // Restore
    await restoreArticle(documentId);

    // All components intact
    const restored = await findArticleBySlug(slug, FULL_POPULATE);
    expect(restored).not.toBeNull();
    assertArticleHasAllComponents(restored, 'after restore');

    // Verify specific values survived the round-trip
    const entry = restored as unknown as Record<string, unknown>;
    const seo = entry.seo as unknown as Record<string, unknown>;
    expect(seo.metaTitle).toBe('Test SEO Title');

    const links = entry.links as unknown as Array<Record<string, unknown>>;
    expect(links[0].label).toBe('Homepage');
    expect(links[1].url).toBe('https://example.com/blog');

    const blocks = entry.blocks as unknown as Array<Record<string, unknown>>;
    expect(blocks[0].heading).toBe('Welcome');
  });
});
