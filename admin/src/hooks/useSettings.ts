import { useFetchClient } from '@strapi/strapi/admin';
import { useQuery, useMutation, useQueryClient } from 'react-query';

import { PLUGIN_ID } from '../constants/plugin';

interface PluginSettings {
  readonly singleTypesRestorationBehavior: 'soft-delete' | 'delete-permanently';
  readonly draftPublishRestorationBehavior: 'draft' | 'unchanged';
}

export const useSettings = () => {
  const { get } = useFetchClient();

  return useQuery({
    queryKey: ['soft-delete', 'settings'],
    queryFn: async () => {
      const { data } = await get<PluginSettings>(`/${PLUGIN_ID}/settings`);
      return data;
    },
  });
};

export const useUpdateSettings = () => {
  const { put } = useFetchClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: PluginSettings) => put(`/${PLUGIN_ID}/settings`, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['soft-delete', 'settings'] });
    },
  });
};
