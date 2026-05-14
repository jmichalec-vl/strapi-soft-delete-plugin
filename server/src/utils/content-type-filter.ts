const API_CONTENT_TYPE_PREFIX = 'api::';

export const supportsContentType = (uid?: string): boolean => {
  if (!uid) return false;
  return uid.startsWith(API_CONTENT_TYPE_PREFIX);
};
