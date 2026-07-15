import { describe, it, expect, beforeAll } from 'vitest';

import { login, api } from './helpers/api-client';

const POST_UID = 'api::post.post';
const CM_POST_PATH = '/content-manager/collection-types/api::post.post';
const SECONDARY_LOCALE = 'fr';

const uniqueSlug = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface Post {
  readonly id: number;
  readonly documentId: string;
  readonly title: string;
  readonly locale?: string;
}

const ensureSecondaryLocale = async (): Promise<void> => {
  const { data } = await api.get('/i18n/locales');
  const locales = (data as readonly { code: string }[]) ?? [];
  if (locales.some((locale) => locale.code === SECONDARY_LOCALE)) return;

  const { status } = await api.post('/i18n/locales', {
    code: SECONDARY_LOCALE,
    name: `French (${SECONDARY_LOCALE})`,
    isDefault: false,
  });
  expect([200, 201]).toContain(status);
};

const createLocalizedPost = async (
  slug: string,
): Promise<{ documentId: string; enTitle: string; frTitle: string }> => {
  const enTitle = `${slug}-en`;
  const frTitle = `${slug}-fr`;

  const { status: createStatus, data: created } = await api.post(`${CM_POST_PATH}?locale=en`, {
    title: enTitle,
    slug,
  });
  expect([200, 201]).toContain(createStatus);
  const documentId = ((created as { data: Post }).data ?? (created as Post)).documentId;

  // PUT with a new locale creates that locale's version of the document
  const { status: localizeStatus } = await api.put(
    `${CM_POST_PATH}/${documentId}?locale=${SECONDARY_LOCALE}`,
    { title: frTitle },
  );
  expect([200, 201]).toContain(localizeStatus);

  return { documentId, enTitle, frTitle };
};

const findPostInLocale = async (documentId: string, locale: string): Promise<Post | null> => {
  const { status, data } = await api.get(`${CM_POST_PATH}/${documentId}?locale=${locale}`);
  if (status === 404) return null;

  // The content-manager returns 200 with an empty data object when the
  // requested locale version does not exist (or is trashed)
  const post = (data as { data?: Post }).data ?? (data as Post);
  return post?.documentId ? post : null;
};

const countTrashedRows = async (documentId: string, locale?: string): Promise<number> => {
  const where: Record<string, unknown> = { documentId, _softDeletedAt: { $ne: null } };
  if (locale) where.locale = locale;

  const { data } = await api.post('/api/test-utils/count-rows', { uid: POST_UID, where });
  return (data as { count: number }).count;
};

const permanentlyDeletePost = async (documentId: string): Promise<void> => {
  await api.del(`/soft-delete/collectionType/${POST_UID}/${documentId}`);
};

beforeAll(async () => {
  await login();
  await ensureSecondaryLocale();
});

describe('locale-aware intercepted delete', () => {
  it('soft-deletes only the requested locale and keeps the other locale live', async () => {
    const slug = uniqueSlug('locale-scoped');
    const { documentId } = await createLocalizedPost(slug);

    const { status } = await api.del(`${CM_POST_PATH}/${documentId}?locale=${SECONDARY_LOCALE}`);
    expect(status).toBe(200);

    // fr locale is trashed...
    expect(await findPostInLocale(documentId, SECONDARY_LOCALE)).toBeNull();
    expect(await countTrashedRows(documentId, SECONDARY_LOCALE)).toBe(1);

    // ...while the en locale stays live
    const enPost = await findPostInLocale(documentId, 'en');
    expect(enPost?.documentId).toBe(documentId);
    expect(await countTrashedRows(documentId, 'en')).toBe(0);

    await permanentlyDeletePost(documentId);
  });

  it("soft-deletes every locale when the delete uses locale '*'", async () => {
    const slug = uniqueSlug('locale-star');
    const { documentId } = await createLocalizedPost(slug);

    const { status } = await api.del(`${CM_POST_PATH}/${documentId}?locale=*`);
    expect(status).toBe(200);

    expect(await findPostInLocale(documentId, 'en')).toBeNull();
    expect(await findPostInLocale(documentId, SECONDARY_LOCALE)).toBeNull();
    expect(await countTrashedRows(documentId)).toBe(2);

    await permanentlyDeletePost(documentId);
  });

  it('restricts api.softDelete to the locale given in options', async () => {
    const slug = uniqueSlug('locale-api');
    const { documentId } = await createLocalizedPost(slug);

    const { status, data } = await api.post('/api/test-utils/public-api', {
      method: 'softDelete',
      uid: POST_UID,
      documentId,
      options: { locale: SECONDARY_LOCALE },
    });

    expect(status).toBe(200);
    const body = data as {
      ok: boolean;
      result: { entries: readonly { locale?: string }[] };
    };
    expect(body.ok).toBe(true);
    expect(body.result.entries).toHaveLength(1);
    expect(body.result.entries[0]?.locale).toBe(SECONDARY_LOCALE);

    expect(await findPostInLocale(documentId, 'en')).not.toBeNull();
    expect(await countTrashedRows(documentId, SECONDARY_LOCALE)).toBe(1);

    await permanentlyDeletePost(documentId);
  });
});
