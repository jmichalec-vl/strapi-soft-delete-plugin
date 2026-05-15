import type { Core } from '@strapi/types';

import { PLUGIN_ID } from '../constants';

// SAFETY: Strapi's Koa context type is not fully exported — using unknown with property access
export interface AdminContext {
  readonly params: Record<string, string>;
  readonly query: Record<string, string | undefined>;
  readonly request: { readonly body: Record<string, unknown> };
  body: unknown;
  notFound: (msg: string) => void;
}

const adminController = ({ strapi }: { strapi: Core.Strapi }) => {
  const getSoftDeleteService = () => strapi.plugin(PLUGIN_ID).service('soft-delete');
  const getSettingsService = () => strapi.plugin(PLUGIN_ID).service('settings');

  const findMany = async (ctx: AdminContext) => {
    const { uid } = ctx.params;
    const { page, pageSize, sort, ...filters } = ctx.query;

    ctx.body = await getSoftDeleteService().findMany(uid, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      sort,
      filters,
    });
  };

  const findOne = async (ctx: AdminContext) => {
    const { uid, documentId } = ctx.params;
    const entry = await getSoftDeleteService().findOne(uid, documentId);

    if (!entry) return ctx.notFound('Entry not found');

    ctx.body = entry;
  };

  const deletePermanently = async (ctx: AdminContext) => {
    const { uid, documentId } = ctx.params;
    const result = await getSoftDeleteService().deletePermanently(uid, documentId);

    if (!result) return ctx.notFound('Entry not found');

    ctx.body = result;
  };

  const restore = async (ctx: AdminContext) => {
    const { uid, documentId, kind } = ctx.params;
    const result = await getSoftDeleteService().restore(uid, documentId, kind);

    if (!result) return ctx.notFound('Entry not found');

    ctx.body = result;
  };

  const deleteMany = async (ctx: AdminContext) => {
    const { uid } = ctx.params;
    const { documentIds } = ctx.request.body as { documentIds: readonly string[] };

    ctx.body = await getSoftDeleteService().deleteManyPermanently(uid, documentIds);
  };

  const restoreMany = async (ctx: AdminContext) => {
    const { uid, kind } = ctx.params;
    const { documentIds } = ctx.request.body as { documentIds: readonly string[] };

    ctx.body = await getSoftDeleteService().restoreMany(uid, documentIds, kind);
  };

  const getSettings = async (ctx: AdminContext) => {
    ctx.body = await getSettingsService().get();
  };

  const setSettings = async (ctx: AdminContext) => {
    ctx.body = await getSettingsService().set(ctx.request.body);
  };

  return {
    findMany,
    findOne,
    delete: deletePermanently,
    restore,
    deleteMany,
    restoreMany,
    getSettings,
    setSettings,
  };
};

export default adminController;
