import { api } from './api-client';

export interface SoftDeletedEntry {
  readonly documentId: string;
  readonly _softDeletedAt: string;
  readonly _softDeletedBy?: {
    readonly name?: string;
    readonly type: string;
  };
}

interface SoftDeleteListResponse {
  readonly results: readonly SoftDeletedEntry[];
  readonly pagination: { readonly total: number };
}

const getSoftDeleted = async (kind: string, uid: string): Promise<SoftDeleteListResponse> => {
  const { data } = await api.get(`/soft-delete/${kind}/${uid}?page=1&pageSize=50`);
  return data as SoftDeleteListResponse;
};

const findSoftDeleted = async (
  kind: string,
  uid: string,
  documentId: string,
): Promise<SoftDeletedEntry | null> => {
  const { results } = await getSoftDeleted(kind, uid);
  return results.find((r) => r.documentId === documentId) ?? null;
};

const restore = async (kind: string, uid: string, documentId: string): Promise<void> => {
  await api.put(`/soft-delete/${kind}/${uid}/${documentId}/restore`);
};

const permanentlyDelete = async (kind: string, uid: string, documentId: string): Promise<void> => {
  await api.del(`/soft-delete/${kind}/${uid}/${documentId}`);
};

// --- Article shortcuts ---

const ARTICLE_KIND = 'collectionType';
const ARTICLE_UID = 'api::article.article';

export const getSoftDeletedArticles = () => getSoftDeleted(ARTICLE_KIND, ARTICLE_UID);
export const findSoftDeletedArticle = (documentId: string) =>
  findSoftDeleted(ARTICLE_KIND, ARTICLE_UID, documentId);
export const restoreArticle = (documentId: string) =>
  restore(ARTICLE_KIND, ARTICLE_UID, documentId);
export const permanentlyDeleteArticle = (documentId: string) =>
  permanentlyDelete(ARTICLE_KIND, ARTICLE_UID, documentId);

// --- Homepage shortcuts ---

const HOMEPAGE_KIND = 'singleType';
const HOMEPAGE_UID = 'api::homepage.homepage';

export const getSoftDeletedHomepages = () => getSoftDeleted(HOMEPAGE_KIND, HOMEPAGE_UID);
export const findSoftDeletedHomepage = (documentId: string) =>
  findSoftDeleted(HOMEPAGE_KIND, HOMEPAGE_UID, documentId);
export const restoreHomepage = (documentId: string) =>
  restore(HOMEPAGE_KIND, HOMEPAGE_UID, documentId);
export const permanentlyDeleteHomepage = (documentId: string) =>
  permanentlyDelete(HOMEPAGE_KIND, HOMEPAGE_UID, documentId);
