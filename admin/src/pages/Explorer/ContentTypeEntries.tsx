import { useState, useCallback, useMemo } from 'react';
import { useIntl } from 'react-intl';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Typography,
  Checkbox,
  Flex,
  Box,
  IconButton,
  Button,
  EmptyStateLayout,
} from '@strapi/design-system';
import { ArrowClockwise, Trash } from '@strapi/icons';
import { EmptyDocuments } from '@strapi/icons/symbols';
import {
  Page,
  Layouts,
  Pagination,
  useNotification,
  useRBAC,
  useQueryParams,
} from '@strapi/strapi/admin';

import { PERMISSIONS } from '../../constants/permissions';
import {
  useSoftDeletedEntries,
  useRestoreEntries,
  useDeleteEntries,
} from '../../hooks/useSoftDeletedEntries';
import { getTranslation } from '../../utils/getTranslation';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EntryDetailDrawer } from './EntryDetailDrawer';
import { Filters } from '../../components/Filters';
import type { ContentType, SoftDeletedEntry } from './types';

interface ContentTypeEntriesProps {
  readonly contentType: ContentType;
}

export const ContentTypeEntries = ({ contentType }: ContentTypeEntriesProps) => {
  const { formatMessage, formatDate } = useIntl();
  const { toggleNotification } = useNotification();
  const [{ query }] = useQueryParams<{ page?: string; pageSize?: string }>();
  const page = Number(query?.page ?? 1);
  const pageSize = Number(query?.pageSize ?? 10);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<{
    readonly type: 'restore' | 'delete';
    readonly documentIds: readonly string[];
  } | null>(null);
  const [detailEntry, setDetailEntry] = useState<SoftDeletedEntry | null>(null);
  const [filters, setFilters] = useState<{ deletedAfter?: string; deletedBefore?: string }>({});

  // useRBAC derives action names from the last segment of the permission action:
  // plugin::soft-delete.explorer.soft-deleted-read → canSoftDeletedRead
  // plugin::soft-delete.explorer.restore → canRestore
  // plugin::soft-delete.explorer.delete-permanently → canDeletePermanently
  const { allowedActions } = useRBAC([
    ...PERMISSIONS.explorerRead(contentType.uid),
    ...PERMISSIONS.explorerRestore(contentType.uid),
    ...PERMISSIONS.explorerDeletePermanently(contentType.uid),
  ]);

  const { data, isLoading } = useSoftDeletedEntries(contentType.uid, contentType.kind, {
    page,
    pageSize,
    ...filters,
  });

  const { restoreOne, restoreMany } = useRestoreEntries(contentType.uid, contentType.kind);
  const { deleteOne, deleteMany } = useDeleteEntries(contentType.uid, contentType.kind);

  const entries = useMemo(() => data?.results ?? [], [data?.results]);
  const pagination = data?.pagination ?? { page: 1, pageSize: 10, total: 0, pageCount: 0 };

  const isAllSelected = entries.length > 0 && entries.every((e) => selected.has(e.documentId));

  const toggleSelectAll = useCallback(() => {
    setSelected(() => (isAllSelected ? new Set() : new Set(entries.map((e) => e.documentId))));
  }, [entries, isAllSelected]);

  const toggleSelectOne = useCallback((documentId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(documentId)) {
        next.delete(documentId);
      } else {
        next.add(documentId);
      }
      return next;
    });
  }, []);

  const handleConfirm = async () => {
    if (!confirmAction) return;

    const { type, documentIds } = confirmAction;

    try {
      if (type === 'restore') {
        if (documentIds.length === 1) {
          await restoreOne.mutateAsync(documentIds[0]);
        } else {
          await restoreMany.mutateAsync(documentIds);
        }
      } else {
        if (documentIds.length === 1) {
          await deleteOne.mutateAsync(documentIds[0]);
        } else {
          await deleteMany.mutateAsync(documentIds);
        }
      }

      toggleNotification({
        type: 'success',
        message: formatMessage({
          id: getTranslation(`explorer.${type}.success`),
          defaultMessage: type === 'restore' ? 'Entries restored' : 'Entries deleted permanently',
        }),
      });

      setSelected(new Set());
    } catch {
      toggleNotification({
        type: 'danger',
        message: formatMessage({
          id: getTranslation(`explorer.${type}.error`),
          defaultMessage: 'An error occurred',
        }),
      });
    } finally {
      setConfirmAction(null);
    }
  };

  const selectedArray = [...selected];

  return (
    <>
      <Layouts.Header
        title={contentType.info.displayName}
        subtitle={formatMessage(
          {
            id: getTranslation('explorer.header.subtitle'),
            defaultMessage: '{count} soft-deleted entries',
          },
          { count: pagination.total },
        )}
        primaryAction={
          selectedArray.length > 0 && (
            <Flex gap={2}>
              {allowedActions.canRestore && (
                <Button
                  variant="secondary"
                  startIcon={<ArrowClockwise />}
                  onClick={() => setConfirmAction({ type: 'restore', documentIds: selectedArray })}
                >
                  {formatMessage(
                    {
                      id: getTranslation('explorer.action.restoreSelected'),
                      defaultMessage: 'Restore ({count})',
                    },
                    { count: selectedArray.length },
                  )}
                </Button>
              )}
              {allowedActions.canDeletePermanently && (
                <Button
                  variant="danger-light"
                  startIcon={<Trash />}
                  onClick={() => setConfirmAction({ type: 'delete', documentIds: selectedArray })}
                >
                  {formatMessage(
                    {
                      id: getTranslation('explorer.action.deleteSelected'),
                      defaultMessage: 'Delete ({count})',
                    },
                    { count: selectedArray.length },
                  )}
                </Button>
              )}
            </Flex>
          )
        }
      />

      <Layouts.Content>
        <Filters
          onFilter={(f) => setFilters(f)}
          onClear={() => setFilters({})}
        />
        {isLoading ? (
          <Page.Loading />
        ) : entries.length === 0 ? (
          <Box background="neutral0" shadow="filterShadow" hasRadius>
            <EmptyStateLayout
              content={formatMessage({
                id: getTranslation('explorer.empty'),
                defaultMessage: 'No content found',
              })}
              hasRadius
              icon={<EmptyDocuments width="16rem" />}
            />
          </Box>
        ) : (
          <>
            <Table colCount={5} rowCount={entries.length + 1}>
              <Thead>
                <Tr>
                  <Th>
                    <Checkbox checked={isAllSelected} onCheckedChange={toggleSelectAll} />
                  </Th>
                  <Th>
                    <Typography variant="sigma">
                      {formatMessage({
                        id: getTranslation('explorer.table.documentId'),
                        defaultMessage: 'Document ID',
                      })}
                    </Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">
                      {formatMessage({
                        id: getTranslation('explorer.table.deletedAt'),
                        defaultMessage: 'Deleted At',
                      })}
                    </Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">
                      {formatMessage({
                        id: getTranslation('explorer.table.deletedBy'),
                        defaultMessage: 'Deleted By',
                      })}
                    </Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">
                      {formatMessage({
                        id: getTranslation('explorer.table.actions'),
                        defaultMessage: 'Actions',
                      })}
                    </Typography>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {entries.map((entry: SoftDeletedEntry) => (
                  <Tr
                    key={entry.documentId}
                    onClick={() => setDetailEntry(entry)}
                    style={{ cursor: 'pointer' }}
                  >
                    <Td onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(entry.documentId)}
                        onCheckedChange={() => toggleSelectOne(entry.documentId)}
                      />
                    </Td>
                    <Td>
                      <Typography>{entry.documentId}</Typography>
                    </Td>
                    <Td>
                      <Typography>
                        {formatDate(entry._softDeletedAt, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </Typography>
                    </Td>
                    <Td>
                      <Typography>
                        {entry._softDeletedBy?.name ?? entry._softDeletedBy?.type ?? '—'}
                      </Typography>
                    </Td>
                    <Td onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                      <Flex gap={1}>
                        {allowedActions.canRestore && (
                          <IconButton
                            label={formatMessage({
                              id: getTranslation('explorer.action.restore'),
                              defaultMessage: 'Restore',
                            })}
                            onClick={() =>
                              setConfirmAction({
                                type: 'restore',
                                documentIds: [entry.documentId],
                              })
                            }
                          >
                            <ArrowClockwise />
                          </IconButton>
                        )}
                        {allowedActions.canDeletePermanently && (
                          <IconButton
                            label={formatMessage({
                              id: getTranslation('explorer.action.deletePermanently'),
                              defaultMessage: 'Delete permanently',
                            })}
                            onClick={() =>
                              setConfirmAction({
                                type: 'delete',
                                documentIds: [entry.documentId],
                              })
                            }
                          >
                            <Trash />
                          </IconButton>
                        )}
                      </Flex>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>

            <Box paddingTop={4}>
              <Pagination.Root {...pagination} defaultPageSize={pagination.pageSize}>
                <Pagination.PageSize />
                <Pagination.Links />
              </Pagination.Root>
            </Box>
          </>
        )}
      </Layouts.Content>

      <ConfirmDialog
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirm}
        title={formatMessage({
          id: getTranslation(
            confirmAction?.type === 'restore' ? 'dialog.restore.title' : 'dialog.delete.title',
          ),
          defaultMessage:
            confirmAction?.type === 'restore' ? 'Restore entries?' : 'Delete permanently?',
        })}
        message={formatMessage(
          {
            id: getTranslation(
              confirmAction?.type === 'restore'
                ? 'dialog.restore.message'
                : 'dialog.delete.message',
            ),
            defaultMessage:
              confirmAction?.type === 'restore'
                ? 'Are you sure you want to restore {count} entries?'
                : 'This action is irreversible. {count} entries will be permanently deleted.',
          },
          { count: confirmAction?.documentIds.length ?? 0 },
        )}
        variant={confirmAction?.type === 'restore' ? 'success-light' : 'danger-light'}
        confirmLabel={formatMessage({
          id: getTranslation(
            confirmAction?.type === 'restore' ? 'dialog.restore.confirm' : 'dialog.delete.confirm',
          ),
          defaultMessage: confirmAction?.type === 'restore' ? 'Restore' : 'Delete permanently',
        })}
        isLoading={
          restoreOne.isLoading ||
          restoreMany.isLoading ||
          deleteOne.isLoading ||
          deleteMany.isLoading
        }
      />

      {detailEntry && (
        <EntryDetailDrawer entry={detailEntry} onClose={() => setDetailEntry(null)} />
      )}
    </>
  );
};
