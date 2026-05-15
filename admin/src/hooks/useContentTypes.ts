import { useFetchClient } from '@strapi/strapi/admin';
import { useQuery } from 'react-query';

interface ContentType {
  readonly uid: string;
  readonly kind: 'collectionType' | 'singleType';
  readonly info: {
    readonly displayName: string;
  };
  readonly isDisplayed: boolean;
}

interface ContentManagerInit {
  readonly data: {
    readonly contentTypes: readonly ContentType[];
  };
}

const isApiContentType = (ct: ContentType): boolean => ct.uid.startsWith('api::') && ct.isDisplayed;

export const useContentTypes = () => {
  const { get } = useFetchClient();

  return useQuery({
    queryKey: ['soft-delete', 'content-types'],
    queryFn: async () => {
      const { data } = await get<ContentManagerInit>('/content-manager/init');
      return data.data.contentTypes.filter(isApiContentType);
    },
    staleTime: 60_000,
  });
};
