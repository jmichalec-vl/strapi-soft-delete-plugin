import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { login, api } from './helpers/api-client';
import { createOrUpdateHomepage, getHomepage, deleteHomepage } from './helpers/content-manager';
import {
  getSoftDeletedHomepages,
  findSoftDeletedHomepage,
  restoreHomepage,
  permanentlyDeleteHomepage,
} from './helpers/soft-delete-api';

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

let originalSettings: Record<string, string>;

beforeAll(async () => {
  await login();
  originalSettings = await getSettings();
});

afterAll(async () => {
  await updateSettings(originalSettings ?? DEFAULT_SETTINGS);
  // Cleanup any soft-deleted homepages
  const { results } = await getSoftDeletedHomepages();
  for (const entry of results) {
    await permanentlyDeleteHomepage(entry.documentId);
  }
});

describe('single type restoration: "soft-delete" existing entry', () => {
  let firstDocId: string;
  let secondDocId: string;

  it('setup: set singleTypesRestorationBehavior to "soft-delete"', async () => {
    await updateSettings({ ...DEFAULT_SETTINGS, singleTypesRestorationBehavior: 'soft-delete' });
  });

  it('creates first homepage, soft-deletes it, creates second', async () => {
    // Create first homepage
    const first = await createOrUpdateHomepage('First Homepage', 'First hero');
    firstDocId = first.documentId;

    // Soft-delete first
    await deleteHomepage();

    // Create second homepage (becomes active)
    const second = await createOrUpdateHomepage('Second Homepage', 'Second hero');
    secondDocId = second.documentId;

    // Verify second is active
    const active = await getHomepage();
    expect(active?.documentId).toBe(secondDocId);
    expect(active?.title).toBe('Second Homepage');
  });

  it('restoring first homepage soft-deletes the existing second one', async () => {
    // First is soft-deleted
    expect(await findSoftDeletedHomepage(firstDocId)).not.toBeNull();

    // Restore first
    await restoreHomepage(firstDocId);

    // First is now active
    const active = await getHomepage();
    expect(active?.documentId).toBe(firstDocId);
    expect(active?.title).toBe('First Homepage');

    // Second got soft-deleted (not permanently deleted)
    const secondSoftDeleted = await findSoftDeletedHomepage(secondDocId);
    expect(secondSoftDeleted).not.toBeNull();
  });
});

describe('single type restoration: "delete-permanently" existing entry', () => {
  let firstDocId: string;
  let secondDocId: string;

  it('setup: cleanup and set singleTypesRestorationBehavior to "delete-permanently"', async () => {
    // Cleanup from previous test
    const { results } = await getSoftDeletedHomepages();
    for (const entry of results) {
      await permanentlyDeleteHomepage(entry.documentId);
    }

    await updateSettings({
      ...DEFAULT_SETTINGS,
      singleTypesRestorationBehavior: 'delete-permanently',
    });
  });

  it('creates first homepage, soft-deletes it, creates second', async () => {
    const first = await createOrUpdateHomepage('First Homepage', 'First hero');
    firstDocId = first.documentId;

    await deleteHomepage();

    const second = await createOrUpdateHomepage('Second Homepage', 'Second hero');
    secondDocId = second.documentId;

    const active = await getHomepage();
    expect(active?.documentId).toBe(secondDocId);
  });

  it('restoring first homepage permanently deletes the existing second one', async () => {
    await restoreHomepage(firstDocId);

    // First is now active
    const active = await getHomepage();
    expect(active?.documentId).toBe(firstDocId);
    expect(active?.title).toBe('First Homepage');

    // Second is GONE — not in explorer, not anywhere
    const secondSoftDeleted = await findSoftDeletedHomepage(secondDocId);
    expect(secondSoftDeleted).toBeNull();
  });
});
