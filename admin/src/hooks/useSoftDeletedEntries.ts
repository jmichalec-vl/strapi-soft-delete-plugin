import { useFetchClient } from '@strapi/strapi/admin';
import { useQuery, useMutation, useQueryClient } from 'react-query';

import { PLUGIN_ID } from '../constants/plugin';

interface FetchParams {
  readonly page?: number;
  readonly pageSize?: number;
  readonly deletedAfter?: string;
  readonly deletedBefore?: string;
}

interface Pagination {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pageCount: number;
}

interface SoftDeletedEntry {
  readonly id: number;
  readonly documentId: string;
  readonly _softDeletedAt: string;
  readonly _softDeletedBy?: {
    readonly id: number | null;
    readonly type: string;
    readonly name?: string;
  };
  readonly [key: string]: unknown;
}

interface FetchResult {
  readonly results: readonly SoftDeletedEntry[];
  readonly pagination: Pagination;
}

export const useSoftDeletedEntries = (uid: string, kind: string, params: FetchParams = {}) => {
  const { get } = useFetchClient();

  return useQuery({
    queryKey: ['soft-delete', 'entries', uid, params],
    queryFn: async () => {
      const { data } = await get<FetchResult>(`/${PLUGIN_ID}/${kind}/${uid}`, {
        params: {
          page: params.page ?? 1,
          pageSize: params.pageSize ?? 10,
          ...(params.deletedAfter ? { deletedAfter: params.deletedAfter } : {}),
          ...(params.deletedBefore ? { deletedBefore: params.deletedBefore } : {}),
        },
      });
      return data;
    },
    enabled: Boolean(uid),
    keepPreviousData: true,
  });
};

export const useRestoreEntries = (uid: string, kind: string) => {
  const { put, post } = useFetchClient();
  const queryClient = useQueryClient();

  const restoreOne = useMutation({
    mutationFn: (documentId: string) => put(`/${PLUGIN_ID}/${kind}/${uid}/${documentId}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['soft-delete', 'entries', uid] });
    },
  });

  const restoreMany = useMutation({
    mutationFn: (documentIds: readonly string[]) =>
      post(`/${PLUGIN_ID}/${kind}/${uid}/batch-restore`, { documentIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['soft-delete', 'entries', uid] });
    },
  });

  return { restoreOne, restoreMany };
};

export const useDeleteEntries = (uid: string, kind: string) => {
  const { del, post } = useFetchClient();
  const queryClient = useQueryClient();

  const deleteOne = useMutation({
    mutationFn: (documentId: string) => del(`/${PLUGIN_ID}/${kind}/${uid}/${documentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['soft-delete', 'entries', uid] });
    },
  });

  const deleteMany = useMutation({
    mutationFn: (documentIds: readonly string[]) =>
      post(`/${PLUGIN_ID}/${kind}/${uid}/batch-delete`, { documentIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['soft-delete', 'entries', uid] });
    },
  });

  return { deleteOne, deleteMany };
};
