import type { Core } from '@strapi/types';

import type { ResolvedAuth, SoftDeletedBy, AuthStrategy } from '../types';

interface AuthLookup {
  readonly uid: string;
  readonly nameResolver: (entry: Record<string, unknown>) => string;
}

const AUTH_USER_LOOKUPS: Readonly<Record<string, AuthLookup>> = {
  admin: {
    uid: 'admin::user',
    nameResolver: (user) =>
      (user.username as string) ||
      [user.firstname, user.lastname].filter(Boolean).join(' ') ||
      (user.email as string),
  },
  'api-token': {
    uid: 'admin::api-token',
    nameResolver: (token) => token.name as string,
  },
  'transfer-token': {
    uid: 'admin::transfer-token',
    nameResolver: (token) => token.name as string,
  },
  'users-permissions': {
    uid: 'plugin::users-permissions.user',
    nameResolver: (user) => (user.username as string) || (user.email as string),
  },
};

const authResolver = ({ strapi }: { strapi: Core.Strapi }) => {
  const resolveAuth = (): ResolvedAuth => {
    const requestContext = strapi.requestContext.get();
    const auth = requestContext?.state?.auth;

    return {
      id: auth?.credentials?.id ?? null,
      strategy: (auth?.strategy?.name ?? 'unknown') as AuthStrategy,
    };
  };

  const resolveDisplayName = async (
    id: number | null,
    strategy: string,
  ): Promise<SoftDeletedBy> => {
    const result: SoftDeletedBy = { id, type: strategy };

    if (!id) return result;

    const lookup = AUTH_USER_LOOKUPS[strategy];
    if (!lookup) return result;

    try {
      const entity = await strapi.db.query(lookup.uid).findOne({ where: { id } });
      if (!entity) return result;

      return { ...result, name: lookup.nameResolver(entity) };
    } catch {
      // Entity may have been deleted — return without name
      return result;
    }
  };

  return { resolveAuth, resolveDisplayName };
};

export default authResolver;
