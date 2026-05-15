import { describe, it, expect, beforeAll } from 'vitest';

import { login, api } from './helpers/api-client';
import { createArticle, deleteArticle } from './helpers/content-manager';
import { restoreArticle } from './helpers/soft-delete-api';
import { getBaseUrl } from './helpers/strapi-instance';

const uniqueSlug = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Public API doesn't need auth — but we need to enable public access first
// For testing, we query directly without auth token
const publicGet = async (path: string) => {
  const response = await fetch(`${getBaseUrl()}${path}`);
  return { status: response.status, data: await response.json() };
};

beforeAll(async () => {
  await login();

  // Enable public access to articles via permissions API
  const { data: rolesData } = await api.get('/users-permissions/roles');
  const roles = (rolesData as { roles: readonly { id: number; type: string }[] }).roles;
  const publicRole = roles.find((r) => r.type === 'public');

  if (publicRole) {
    // Get current permissions
    const { data: roleData } = await api.get(`/users-permissions/roles/${publicRole.id}`);
    const role = (roleData as { role: { permissions: Record<string, unknown> } }).role;

    // Enable find and findOne for articles
    const permissions = role.permissions as Record<
      string,
      Record<string, Record<string, Record<string, unknown>>>
    >;
    if (permissions?.['api::article']?.controllers?.article) {
      permissions['api::article'].controllers.article.find = { enabled: true };
      permissions['api::article'].controllers.article.findOne = { enabled: true };
    }

    await api.put(`/users-permissions/roles/${publicRole.id}`, {
      ...role,
      permissions,
    });
  }
});

describe('public REST API excludes soft-deleted entries', () => {
  const slugVisible = uniqueSlug('pub-visible');
  const slugDeleted = uniqueSlug('pub-deleted');
  let deletedDocumentId: string;

  it('creates two articles — one will be soft-deleted', async () => {
    await createArticle(slugVisible, 'Visible Article');
    const toDelete = await createArticle(slugDeleted, 'Will Be Deleted');
    deletedDocumentId = toDelete.documentId;

    // Publish both so they appear in public API
    const CM = '/content-manager/collection-types/api::article.article';
    await api.post(
      `${CM}/${(await createArticle(slugVisible, 'Visible Article')).documentId}/actions/publish`,
    );
    await api.post(`${CM}/${deletedDocumentId}/actions/publish`);
  });

  it('public API shows both articles before soft-delete', async () => {
    const { status, data } = await publicGet('/api/articles');

    expect(status).toBe(200);
    const slugs = ((data as { data: readonly { slug: string }[] }).data ?? []).map((a) => a.slug);
    expect(slugs).toContain(slugDeleted);
  });

  it('soft-deleted article is excluded from public API', async () => {
    await deleteArticle(deletedDocumentId);

    const { data } = await publicGet('/api/articles');
    const slugs = ((data as { data: readonly { slug: string }[] }).data ?? []).map((a) => a.slug);

    expect(slugs).not.toContain(slugDeleted);
  });

  it('restored article reappears in public API', async () => {
    await restoreArticle(deletedDocumentId);

    const { data } = await publicGet('/api/articles');
    const slugs = ((data as { data: readonly { slug: string }[] }).data ?? []).map((a) => a.slug);

    expect(slugs).toContain(slugDeleted);
  });
});
