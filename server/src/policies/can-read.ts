import { PLUGIN_ID } from '../constants';

// SAFETY: Strapi's PolicyContext type doesn't expose state.userAbility or params,
// but admin policies receive them at runtime via Koa context augmentation.
const canRead = (policyContext: Record<string, unknown>) => {
  const state = policyContext.state as {
    userAbility: { can: (action: string, subject: string) => boolean };
  };
  const params = policyContext.params as { uid: string };
  return state.userAbility.can(`plugin::${PLUGIN_ID}.explorer.soft-deleted-read`, params.uid);
};

export default canRead;
