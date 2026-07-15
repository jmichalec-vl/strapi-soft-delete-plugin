import { describe, it, expect, beforeAll, afterEach } from 'vitest';

import { login, api } from './helpers/api-client';
import { createArticle, findArticleBySlug, deleteArticle } from './helpers/content-manager';
import { findSoftDeletedArticle, permanentlyDeleteArticle } from './helpers/soft-delete-api';

const ARTICLE_UID = 'api::article.article';

const uniqueSlug = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type PublicApiMethod = 'softDelete' | 'restore' | 'deletePermanently' | 'findSoftDeleted';

interface PublicApiCall {
  readonly method: PublicApiMethod;
  readonly uid: string;
  readonly documentId?: string;
  readonly params?: Record<string, unknown>;
  readonly options?: Record<string, unknown>;
}

interface PublicApiResponse {
  readonly ok: boolean;
  readonly result?: {
    readonly documentId: string;
    readonly entries: readonly Record<string, unknown>[];
  } | null;
  readonly error?: { readonly name: string; readonly message: string };
}

const callPublicApi = async (
  call: PublicApiCall,
): Promise<{ status: number; body: PublicApiResponse }> => {
  const { status, data } = await api.post('/api/test-utils/public-api', call);
  return { status, body: data as PublicApiResponse };
};

const compareReads = async (
  documentId: string,
): Promise<{ plainCount: number; bypassedCount: number }> => {
  const { data } = await api.post('/api/test-utils/public-api/compare-reads', {
    uid: ARTICLE_UID,
    documentId,
  });
  return data as { plainCount: number; bypassedCount: number };
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

describe('service api softDelete', () => {
  it('soft-deletes a document and hides it from normal reads', async () => {
    const slug = uniqueSlug('svc-soft-delete');
    const article = await createArticle(slug, 'Service Soft Delete Article');

    const { status, body } = await callPublicApi({
      method: 'softDelete',
      uid: ARTICLE_UID,
      documentId: article.documentId,
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result?.documentId).toBe(article.documentId);
    expect(body.result?.entries.length).toBeGreaterThan(0);

    expect(await findArticleBySlug(slug)).toBeNull();
    expect(await findSoftDeletedArticle(article.documentId)).not.toBeNull();

    await permanentlyDeleteArticle(article.documentId);
  });

  it('rejects and leaves the entry live when a beforeSoftDelete hook throws', async () => {
    const slug = uniqueSlug('svc-soft-delete-veto');
    const article = await createArticle(slug, 'Service Veto Article');

    await setHookBehavior('beforeSoftDelete', 'throw');
    const { status, body } = await callPublicApi({
      method: 'softDelete',
      uid: ARTICLE_UID,
      documentId: article.documentId,
    });
    await resetHookBehaviors();

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error?.message).toContain('Blocked by beforeSoftDelete test hook');

    // Entry must still be live — same veto semantics as the admin delete path
    expect((await findArticleBySlug(slug))?.documentId).toBe(article.documentId);
    expect(await findSoftDeletedArticle(article.documentId)).toBeNull();

    await deleteArticle(article.documentId);
    await permanentlyDeleteArticle(article.documentId);
  });

  it('records the auth override in _softDeletedBy', async () => {
    const slug = uniqueSlug('svc-auth-override');
    const article = await createArticle(slug, 'Service Auth Override Article');

    const { body } = await callPublicApi({
      method: 'softDelete',
      uid: ARTICLE_UID,
      documentId: article.documentId,
      options: { auth: { id: null, strategy: 'api-token' } },
    });

    expect(body.ok).toBe(true);
    const trashed = await findSoftDeletedArticle(article.documentId);
    expect(trashed?._softDeletedBy?.type).toBe('api-token');

    await permanentlyDeleteArticle(article.documentId);
  });
});

describe('service api restore', () => {
  it('restores a soft-deleted document', async () => {
    const slug = uniqueSlug('svc-restore');
    const article = await createArticle(slug, 'Service Restore Article');
    await deleteArticle(article.documentId);
    expect(await findSoftDeletedArticle(article.documentId)).not.toBeNull();

    const { status, body } = await callPublicApi({
      method: 'restore',
      uid: ARTICLE_UID,
      documentId: article.documentId,
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result?.documentId).toBe(article.documentId);

    expect((await findArticleBySlug(slug))?.documentId).toBe(article.documentId);
    expect(await findSoftDeletedArticle(article.documentId)).toBeNull();
  });

  it('resolves null when the document has no soft-deleted entries', async () => {
    const slug = uniqueSlug('svc-restore-noop');
    const article = await createArticle(slug, 'Service Restore Noop Article');

    const { status, body } = await callPublicApi({
      method: 'restore',
      uid: ARTICLE_UID,
      documentId: article.documentId,
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result).toBeNull();
  });

  it('rejects and keeps the entry trashed when a beforeRestore hook cancels', async () => {
    const slug = uniqueSlug('svc-restore-veto');
    const article = await createArticle(slug, 'Service Restore Veto Article');
    await deleteArticle(article.documentId);

    await setHookBehavior('beforeRestore', 'cancel');
    const { status, body } = await callPublicApi({
      method: 'restore',
      uid: ARTICLE_UID,
      documentId: article.documentId,
    });
    await resetHookBehaviors();

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error?.message).toContain('Operation cancelled by beforeRestore hook');
    expect(await findSoftDeletedArticle(article.documentId)).not.toBeNull();

    await permanentlyDeleteArticle(article.documentId);
  });
});

describe('service api deletePermanently', () => {
  it('permanently removes a soft-deleted document', async () => {
    const slug = uniqueSlug('svc-perm-delete');
    const article = await createArticle(slug, 'Service Permanent Delete Article');
    await deleteArticle(article.documentId);

    const { status, body } = await callPublicApi({
      method: 'deletePermanently',
      uid: ARTICLE_UID,
      documentId: article.documentId,
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(await findSoftDeletedArticle(article.documentId)).toBeNull();
    expect(await findArticleBySlug(slug)).toBeNull();
  });
});

describe('service api findSoftDeleted', () => {
  it('lists trashed documents with pagination metadata', async () => {
    const slug = uniqueSlug('svc-find');
    const article = await createArticle(slug, 'Service Find Article');
    await deleteArticle(article.documentId);

    const { status, body } = await callPublicApi({
      method: 'findSoftDeleted',
      uid: ARTICLE_UID,
      params: { page: 1, pageSize: 50 },
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const listing = body.result as unknown as {
      results: readonly { documentId: string }[];
      pagination: { page: number; pageSize: number; total: number };
    };
    expect(listing.pagination).toMatchObject({ page: 1, pageSize: 50 });
    expect(listing.results.map((entry) => entry.documentId)).toContain(article.documentId);

    await permanentlyDeleteArticle(article.documentId);
  });
});

describe('service api uid validation', () => {
  it('rejects non-api content types with an ApplicationError', async () => {
    const { status, body } = await callPublicApi({
      method: 'softDelete',
      uid: 'plugin::users-permissions.user',
      documentId: 'whatever',
    });

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error?.name).toBe('ApplicationError');
    expect(body.error?.message).toContain('only "api::" content types are supported');
  });
});

describe('service api withSoftDeleted', () => {
  it('exposes rows that a plain db.query hides', async () => {
    const slug = uniqueSlug('svc-bypass');
    const article = await createArticle(slug, 'Service Bypass Article');

    const liveReads = await compareReads(article.documentId);
    expect(liveReads.plainCount).toBeGreaterThan(0);
    expect(liveReads.bypassedCount).toBe(liveReads.plainCount);

    await deleteArticle(article.documentId);

    const trashedReads = await compareReads(article.documentId);
    expect(trashedReads.plainCount).toBe(0);
    expect(trashedReads.bypassedCount).toBeGreaterThan(0);

    await permanentlyDeleteArticle(article.documentId);
  });
});
