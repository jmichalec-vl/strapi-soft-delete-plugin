import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Flex, Box, Field, TextInput, Button } from '@strapi/design-system';

import { getTranslation } from '../utils/getTranslation';

interface FiltersProps {
  readonly onFilter: (filters: { deletedAfter?: string; deletedBefore?: string }) => void;
  readonly onClear: () => void;
}

export const Filters = ({ onFilter, onClear }: FiltersProps) => {
  const { formatMessage } = useIntl();
  const [deletedAfter, setDeletedAfter] = useState('');
  const [deletedBefore, setDeletedBefore] = useState('');

  const handleApply = () => {
    onFilter({
      deletedAfter: deletedAfter || undefined,
      deletedBefore: deletedBefore || undefined,
    });
  };

  const handleClear = () => {
    setDeletedAfter('');
    setDeletedBefore('');
    onClear();
  };

  const hasFilters = deletedAfter || deletedBefore;

  return (
    <Box paddingBottom={4}>
      <Flex gap={3} alignItems="flex-end" wrap="wrap">
        <Field.Root name="deletedAfter">
          <Field.Label>
            {formatMessage({
              id: getTranslation('filters.deletedAfter'),
              defaultMessage: 'Deleted after',
            })}
          </Field.Label>
          <TextInput
            type="date"
            value={deletedAfter}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeletedAfter(e.target.value)}
            size="S"
          />
        </Field.Root>
        <Field.Root name="deletedBefore">
          <Field.Label>
            {formatMessage({
              id: getTranslation('filters.deletedBefore'),
              defaultMessage: 'Deleted before',
            })}
          </Field.Label>
          <TextInput
            type="date"
            value={deletedBefore}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeletedBefore(e.target.value)}
            size="S"
          />
        </Field.Root>
        <Button onClick={handleApply} variant="secondary" size="S">
          {formatMessage({
            id: getTranslation('filters.apply'),
            defaultMessage: 'Filter',
          })}
        </Button>
        {hasFilters && (
          <Button onClick={handleClear} variant="tertiary" size="S">
            {formatMessage({
              id: getTranslation('filters.clear'),
              defaultMessage: 'Clear',
            })}
          </Button>
        )}
      </Flex>
    </Box>
  );
};
