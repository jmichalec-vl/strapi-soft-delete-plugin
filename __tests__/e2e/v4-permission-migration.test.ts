import { describe, it, expect, beforeAll } from 'vitest';

import { login, api } from './helpers/api-client';

/**
 * The boot-time trigger (migrateFromV4IfNeeded) runs during plugin bootstrap,
 * before any test code can seed data into the fresh per-run database — so the
 * boot wiring is covered by unit tests. Here the test-utils endpoint seeds a
 * real v4-style admin::permission row and invokes the migration step directly
 * against the live database.
 */

beforeAll(async () => {
  await login();
});

describe('v4 RBAC permission migration', () => {
  it('rewrites a seeded v4 explorer.read permission row to explorer.soft-deleted-read', async () => {
    const { status, data } = await api.post('/api/test-utils/v4-permission-migration');

    expect(status).toBe(200);
    expect(data).toMatchObject({
      seededAction: 'plugin::soft-delete.explorer.read',
      migratedAction: 'plugin::soft-delete.explorer.soft-deleted-read',
    });
  });
});
