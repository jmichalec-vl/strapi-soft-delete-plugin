import { describe, it, expect, beforeAll } from 'vitest';

import { login, api } from './helpers/api-client';
import { getBaseUrl } from './helpers/strapi-instance';
import { createArticle, deleteArticle } from './helpers/content-manager';
import { findSoftDeletedArticle } from './helpers/soft-delete-api';

const uniqueSlug = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const SD_ARTICLE_PATH = '/soft-delete/collectionType/api::article.article';

let restrictedToken: string;
let softDeletedDocumentId: string;

beforeAll(async () => {
  await login();

  const slug = uniqueSlug('rbac-test');
  const article = await createArticle(slug, 'RBAC Test Article');
  softDeletedDocumentId = article.documentId;
  await deleteArticle(softDeletedDocumentId);

  const entry = await findSoftDeletedArticle(softDeletedDocumentId);
  expect(entry).not.toBeNull();

  const { data: roleData } = await api.post('/admin/roles', {
    name: `restricted-${Date.now()}`,
    description: 'Role without soft-delete permissions',
  });
  const roleId = (roleData as { data: { id: number } }).data.id;

  await api.put(`/admin/roles/${roleId}/permissions`, {
    permissions: [
      {
        action: 'plugin::content-manager.explorer.read',
        subject: 'api::article.article',
        properties: { fields: ['title', 'content', 'slug'] },
        conditions: [],
      },
    ],
  });

  const restrictedEmail = `restricted-${Date.now()}@test.com`;
  const { data: userData } = await api.post('/admin/users', {
    email: restrictedEmail,
    firstname: 'Restricted',
    lastname: 'User',
    roles: [roleId],
  });

  const registrationToken = (userData as { data: { registrationToken: string } }).data
    .registrationToken;

  const { data: regData } = await api.post('/admin/register', {
    registrationToken,
    userInfo: {
      firstname: 'Restricted',
      lastname: 'User',
      password: 'Restricted1234!',
    },
  });

  restrictedToken = (regData as { data: { token: string } }).data.token;
});

const restrictedRequest = async (method: string, path: string) => {
  const url = `${getBaseUrl()}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${restrictedToken}`,
    },
  });
  return { status: response.status };
};

describe('RBAC: restricted user cannot access soft-delete operations', () => {
  it('cannot list soft-deleted entries', async () => {
    const { status } = await restrictedRequest('GET', `${SD_ARTICLE_PATH}?page=1&pageSize=10`);
    expect(status).toBe(403);
  });

  it('cannot restore a soft-deleted entry', async () => {
    const { status } = await restrictedRequest(
      'PUT',
      `${SD_ARTICLE_PATH}/${softDeletedDocumentId}/restore`,
    );
    expect(status).toBe(403);
  });

  it('cannot permanently delete a soft-deleted entry', async () => {
    const { status } = await restrictedRequest(
      'DELETE',
      `${SD_ARTICLE_PATH}/${softDeletedDocumentId}`,
    );
    expect(status).toBe(403);
  });
});

describe('RBAC: super admin CAN access soft-delete operations', () => {
  it('can list soft-deleted entries', async () => {
    const { status } = await api.get(`${SD_ARTICLE_PATH}?page=1&pageSize=10`);
    expect(status).toBe(200);
  });

  it('can restore a soft-deleted entry', async () => {
    const { status } = await api.put(`${SD_ARTICLE_PATH}/${softDeletedDocumentId}/restore`);
    expect(status).toBe(200);
  });
});
