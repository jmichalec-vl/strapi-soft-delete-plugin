/**
 * Soft-delete attribute definitions injected into all api::* content types.
 *
 * Column names are identical to the v4 strapi-plugin-soft-delete to ensure
 * backward compatibility — existing soft-deleted records are recognized
 * without any data migration.
 */

const HIDDEN_ATTRIBUTE_BASE = {
  configurable: false,
  visible: false,
  private: true,
  writable: false,
} as const;

export const SOFT_DELETED_AT_ATTRIBUTE = {
  ...HIDDEN_ATTRIBUTE_BASE,
  type: 'datetime' as const,
};

export const SOFT_DELETED_BY_ID_ATTRIBUTE = {
  ...HIDDEN_ATTRIBUTE_BASE,
  type: 'integer' as const,
};

export const SOFT_DELETED_BY_TYPE_ATTRIBUTE = {
  ...HIDDEN_ATTRIBUTE_BASE,
  type: 'string' as const,
};

export const SOFT_DELETE_FIELD_NAMES = {
  DELETED_AT: '_softDeletedAt',
  DELETED_BY_ID: '_softDeletedById',
  DELETED_BY_TYPE: '_softDeletedByType',
} as const;
