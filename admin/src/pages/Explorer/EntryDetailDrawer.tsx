import { Box, Flex, Typography, Divider } from '@strapi/design-system';
import { useIntl } from 'react-intl';

import { getTranslation } from '../../utils/getTranslation';
import type { SoftDeletedEntry } from './types';

const HIDDEN_FIELDS = new Set([
  'id',
  'documentId',
  '_softDeletedAt',
  '_softDeletedById',
  '_softDeletedByType',
  '_softDeletedBy',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'publishedAt',
  'locale',
]);

interface EntryDetailDrawerProps {
  readonly entry: SoftDeletedEntry | null;
  readonly onClose: () => void;
}

const formatFieldValue = (value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

export const EntryDetailDrawer = ({ entry, onClose }: EntryDetailDrawerProps) => {
  const { formatMessage, formatDate } = useIntl();

  if (!entry) return null;

  const visibleFields = Object.entries(entry).filter(([key]) => !HIDDEN_FIELDS.has(key));

  return (
    <>
      <Box
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0, 0, 0, 0.2)',
          zIndex: 9,
        }}
      />
      <Box
        padding={6}
        background="neutral0"
        shadow="tableShadow"
        hasRadius
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 420,
          height: '100vh',
          overflow: 'auto',
          zIndex: 10,
        }}
      >
        <Flex justifyContent="space-between" alignItems="center" paddingBottom={4}>
          <Typography variant="beta">
            {formatMessage({
              id: getTranslation('explorer.detail.title'),
              defaultMessage: 'Entry Details',
            })}
          </Typography>
          <Typography
            variant="pi"
            textColor="neutral600"
            style={{ cursor: 'pointer' }}
            onClick={onClose}
          >
            {formatMessage({
              id: getTranslation('explorer.detail.close'),
              defaultMessage: 'Close',
            })}
          </Typography>
        </Flex>

        <Divider />

        <Box paddingTop={4} paddingBottom={2}>
          <Typography variant="sigma" textColor="neutral600" tag="div">
            Document ID
          </Typography>
          <Box paddingTop={1}>
            <Typography tag="span" style={{ wordBreak: 'break-word' }}>
              {entry.documentId}
            </Typography>
          </Box>
        </Box>

        <Box paddingBottom={2}>
          <Typography variant="sigma" textColor="neutral600" tag="div">
            {formatMessage({
              id: getTranslation('explorer.detail.deletedAt'),
              defaultMessage: 'Deleted At',
            })}
          </Typography>
          <Box paddingTop={1}>
            <Typography tag="span">
              {formatDate(entry._softDeletedAt, { dateStyle: 'long', timeStyle: 'medium' })}
            </Typography>
          </Box>
        </Box>

        <Box paddingBottom={4}>
          <Typography variant="sigma" textColor="neutral600" tag="div">
            {formatMessage({
              id: getTranslation('explorer.detail.deletedBy'),
              defaultMessage: 'Deleted By',
            })}
          </Typography>
          <Box paddingTop={1}>
            <Typography tag="span">
              {entry._softDeletedBy?.name ?? entry._softDeletedBy?.type ?? '—'}
            </Typography>
          </Box>
        </Box>

        <Divider />

        <Box paddingTop={4}>
          <Typography variant="delta" paddingBottom={2}>
            {formatMessage({
              id: getTranslation('explorer.detail.fields'),
              defaultMessage: 'Fields',
            })}
          </Typography>

          {visibleFields.map(([key, value]) => (
            <Box key={key} paddingTop={2} paddingBottom={2}>
              <Typography variant="sigma" textColor="neutral600" tag="div">
                {key}
              </Typography>
              <Box paddingTop={1}>
                <Typography
                  tag="div"
                  style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {formatFieldValue(value)}
                </Typography>
              </Box>
            </Box>
          ))}

          {visibleFields.length === 0 && (
            <Typography textColor="neutral500">
              {formatMessage({
                id: getTranslation('explorer.detail.noFields'),
                defaultMessage: 'No fields to display.',
              })}
            </Typography>
          )}
        </Box>
      </Box>
    </>
  );
};
