import * as React from 'react';
import { useState, useMemo, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { useLocation, useNavigate } from 'react-router-dom';
import { Flex, Searchbar, Divider, Loader, Box, Typography } from '@strapi/design-system';
import { SubNav, Page, Layouts } from '@strapi/admin/strapi-admin';

import { PLUGIN_ID } from '../../constants/plugin';
import { useContentTypes } from '../../hooks/useContentTypes';
import { getTranslation } from '../../utils/getTranslation';
import { ContentTypeEntries } from './ContentTypeEntries';
import type { ContentType } from './types';

const PLUGIN_LABEL = 'Soft Delete';

const ROUTE_PREFIX = `/plugins/${PLUGIN_ID}/`;

const useSelectedContentType = (): { kind: string | null; uid: string | null } => {
  const { pathname } = useLocation();
  return useMemo(() => {
    const suffix = pathname.includes(ROUTE_PREFIX) ? pathname.split(ROUTE_PREFIX)[1] : null;
    if (!suffix) return { kind: null, uid: null };
    const [kind, ...uidParts] = suffix.split('/');
    const uid = uidParts.join('/') || null;
    return { kind: kind || null, uid };
  }, [pathname]);
};

const Sidebar = () => {
  const { formatMessage } = useIntl();
  const { data: contentTypes = [], isLoading } = useContentTypes();
  const [search, setSearch] = useState('');

  const label = formatMessage({
    id: getTranslation('explorer.nav.label'),
    defaultMessage: PLUGIN_LABEL,
  });

  if (isLoading) {
    return (
      <SubNav.Main aria-label={label}>
        <SubNav.Header label={label} />
        <Divider />
        <Flex padding={4} justifyContent="center">
          <Loader />
        </Flex>
      </SubNav.Main>
    );
  }

  const filteredTypes = search
    ? contentTypes.filter((ct: ContentType) =>
        ct.info.displayName.toLowerCase().includes(search.toLowerCase()),
      )
    : contentTypes;

  const collectionTypes = filteredTypes.filter((ct: ContentType) => ct.kind === 'collectionType');
  const singleTypes = filteredTypes.filter((ct: ContentType) => ct.kind === 'singleType');

  const sections = [
    {
      id: 'collectionTypes',
      title: formatMessage({
        id: getTranslation('explorer.nav.collectionTypes'),
        defaultMessage: 'Collection Types',
      }),
      links: collectionTypes,
    },
    {
      id: 'singleTypes',
      title: formatMessage({
        id: getTranslation('explorer.nav.singleTypes'),
        defaultMessage: 'Single Types',
      }),
      links: singleTypes,
    },
  ];

  return (
    <SubNav.Main aria-label={label}>
      <SubNav.Header label={label} />
      <Divider />
      <SubNav.Content>
        <Flex
          paddingLeft={5}
          paddingRight={5}
          paddingTop={5}
          paddingBottom={1}
          gap={3}
          direction="column"
          alignItems="stretch"
        >
          <Searchbar
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            onClear={() => setSearch('')}
            placeholder={formatMessage({
              id: getTranslation('explorer.nav.search'),
              defaultMessage: 'Search',
            })}
            size="S"
            name="search_softDelete"
            clearLabel={formatMessage({ id: 'clearLabel', defaultMessage: 'Clear' })}
          >
            {undefined}
          </Searchbar>
        </Flex>
        <SubNav.Sections>
          {sections.map((section) =>
            section.links.length > 0 ? (
              <SubNav.Section
                key={section.id}
                label={section.title}
                badgeLabel={section.links.length.toString()}
              >
                {section.links.map((ct: ContentType) => (
                  <SubNav.Link
                    key={ct.uid}
                    to={`/plugins/${PLUGIN_ID}/${ct.kind}/${ct.uid}`}
                    label={ct.info.displayName}
                  />
                ))}
              </SubNav.Section>
            ) : null,
          )}
        </SubNav.Sections>
      </SubNav.Content>
    </SubNav.Main>
  );
};

const ExplorerContent = () => {
  const { formatMessage } = useIntl();
  const navigate = useNavigate();
  const { uid } = useSelectedContentType();
  const { data: contentTypes = [], isLoading } = useContentTypes();

  const selectedType = uid ? (contentTypes.find((ct) => ct.uid === uid) ?? null) : null;

  useEffect(() => {
    if (!uid && !isLoading && contentTypes.length > 0) {
      const first = contentTypes[0];
      navigate(`/plugins/${PLUGIN_ID}/${first.kind}/${first.uid}`, { replace: true });
    }
  }, [uid, isLoading, contentTypes, navigate]);

  if (isLoading) {
    return <Page.Loading />;
  }

  if (contentTypes.length === 0) {
    return (
      <Box padding={10}>
        <Flex direction="column" alignItems="center" gap={6}>
          <Typography variant="alpha" textColor="neutral600">
            {formatMessage({
              id: getTranslation('explorer.noContentTypes'),
              defaultMessage: 'No content found',
            })}
          </Typography>
          <Typography variant="epsilon" textColor="neutral500">
            {formatMessage({
              id: getTranslation('explorer.noContentTypes.description'),
              defaultMessage: 'No content types are available.',
            })}
          </Typography>
        </Flex>
      </Box>
    );
  }

  if (!selectedType) {
    return <Page.Loading />;
  }

  return <ContentTypeEntries contentType={selectedType} />;
};

const ExplorerPage = () => (
  <Layouts.Root sideNav={<Sidebar />}>
    <ExplorerContent />
  </Layouts.Root>
);

export default ExplorerPage;
