import { describe, it, expect } from 'vitest';

import { supportsContentType } from '../../../../server/src/utils/content-type-filter';

describe('supportsContentType', () => {
  it('returns true for api:: content types', () => {
    expect(supportsContentType('api::article.article')).toBe(true);
    expect(supportsContentType('api::page.page')).toBe(true);
    expect(supportsContentType('api::category.category')).toBe(true);
  });

  it('returns false for admin:: content types', () => {
    expect(supportsContentType('admin::user')).toBe(false);
    expect(supportsContentType('admin::role')).toBe(false);
  });

  it('returns false for plugin:: content types', () => {
    expect(supportsContentType('plugin::users-permissions.user')).toBe(false);
    expect(supportsContentType('plugin::upload.file')).toBe(false);
    expect(supportsContentType('plugin::i18n.locale')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(supportsContentType(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(supportsContentType('')).toBe(false);
  });

  it('returns false for partial match', () => {
    expect(supportsContentType('notapi::test')).toBe(false);
    expect(supportsContentType('API::test')).toBe(false);
  });
});
