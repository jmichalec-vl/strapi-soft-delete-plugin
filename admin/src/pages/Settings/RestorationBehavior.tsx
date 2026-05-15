import { useIntl } from 'react-intl';
import {
  Box,
  Flex,
  Typography,
  Button,
  SingleSelect,
  SingleSelectOption,
} from '@strapi/design-system';
import { Page, Layouts, useNotification, useRBAC } from '@strapi/strapi/admin';

import { PERMISSIONS } from '../../constants/permissions';
import { useSettings, useUpdateSettings } from '../../hooks/useSettings';
import { getTranslation } from '../../utils/getTranslation';
import { useState, useEffect } from 'react';

const SINGLE_TYPE_OPTIONS = [
  {
    value: 'soft-delete',
    labelId: 'settings.singleType.softDelete',
    defaultMessage: 'Soft Delete existing entry',
  },
  {
    value: 'delete-permanently',
    labelId: 'settings.singleType.deletePermanently',
    defaultMessage: 'Delete Permanently existing entry',
  },
] as const;

const DRAFT_PUBLISH_OPTIONS = [
  { value: 'draft', labelId: 'settings.draftPublish.draft', defaultMessage: 'Restore as Draft' },
  {
    value: 'unchanged',
    labelId: 'settings.draftPublish.unchanged',
    defaultMessage: 'Restore Unchanged',
  },
] as const;

const RestorationBehaviorPage = () => {
  const { formatMessage } = useIntl();
  const { toggleNotification } = useNotification();
  // useRBAC derives action name from last segment: plugin::soft-delete.settings → canSettings
  const { allowedActions } = useRBAC([...PERMISSIONS.settings]);

  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();

  type SingleTypeBehavior = 'soft-delete' | 'delete-permanently';
  type DraftPublishBehavior = 'draft' | 'unchanged';

  const [singleType, setSingleType] = useState<SingleTypeBehavior>('soft-delete');
  const [draftPublish, setDraftPublish] = useState<DraftPublishBehavior>('unchanged');
  const [isModified, setIsModified] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setSingleType(settings.singleTypesRestorationBehavior);
    setDraftPublish(settings.draftPublishRestorationBehavior);
    setIsModified(false);
  }, [settings]);

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        singleTypesRestorationBehavior: singleType,
        draftPublishRestorationBehavior: draftPublish,
      });

      toggleNotification({
        type: 'success',
        message: formatMessage({
          id: getTranslation('settings.save.success'),
          defaultMessage: 'Settings saved',
        }),
      });

      setIsModified(false);
    } catch {
      toggleNotification({
        type: 'danger',
        message: formatMessage({
          id: getTranslation('settings.save.error'),
          defaultMessage: 'Failed to save settings',
        }),
      });
    }
  };

  if (isLoading) return <Page.Loading />;

  return (
    <Page.Protect permissions={[...PERMISSIONS.settings]}>
      <Page.Main>
        <Layouts.Header
          title={formatMessage({
            id: getTranslation('settings.title'),
            defaultMessage: 'Restoration Behavior',
          })}
          subtitle={formatMessage({
            id: getTranslation('settings.subtitle'),
            defaultMessage: 'Configure how entries are restored from soft delete.',
          })}
          primaryAction={
            allowedActions.canSettings ? (
              <Button
                onClick={handleSave}
                disabled={!isModified}
                loading={updateSettings.isLoading}
              >
                {formatMessage({
                  id: getTranslation('settings.save'),
                  defaultMessage: 'Save',
                })}
              </Button>
            ) : null
          }
        />

        <Layouts.Content>
          <Box background="neutral0" padding={6} shadow="filterShadow" hasRadius>
            <Flex direction="column" gap={6} alignItems="stretch">
              <Box>
                <Typography variant="delta" tag="h2">
                  {formatMessage({
                    id: getTranslation('settings.singleType.title'),
                    defaultMessage: 'Single Type Restoration',
                  })}
                </Typography>
                <Typography variant="pi" textColor="neutral600">
                  {formatMessage({
                    id: getTranslation('settings.singleType.description'),
                    defaultMessage:
                      'When restoring a single type entry, choose what happens to the existing active entry.',
                  })}
                </Typography>
                <Box paddingTop={2}>
                  <SingleSelect
                    value={singleType}
                    onChange={(value: string | number) => {
                      setSingleType(value as SingleTypeBehavior);
                      setIsModified(true);
                    }}
                    disabled={!allowedActions.canSettings}
                  >
                    {SINGLE_TYPE_OPTIONS.map((option) => (
                      <SingleSelectOption key={option.value} value={option.value}>
                        {formatMessage({
                          id: getTranslation(option.labelId),
                          defaultMessage: option.defaultMessage,
                        })}
                      </SingleSelectOption>
                    ))}
                  </SingleSelect>
                </Box>
              </Box>

              <Box>
                <Typography variant="delta" tag="h2">
                  {formatMessage({
                    id: getTranslation('settings.draftPublish.title'),
                    defaultMessage: 'Draft & Publish Restoration',
                  })}
                </Typography>
                <Typography variant="pi" textColor="neutral600">
                  {formatMessage({
                    id: getTranslation('settings.draftPublish.description'),
                    defaultMessage:
                      'When restoring an entry from a content type with Draft & Publish enabled, choose the publish state.',
                  })}
                </Typography>
                <Box paddingTop={2}>
                  <SingleSelect
                    value={draftPublish}
                    onChange={(value: string | number) => {
                      setDraftPublish(value as DraftPublishBehavior);
                      setIsModified(true);
                    }}
                    disabled={!allowedActions.canSettings}
                  >
                    {DRAFT_PUBLISH_OPTIONS.map((option) => (
                      <SingleSelectOption key={option.value} value={option.value}>
                        {formatMessage({
                          id: getTranslation(option.labelId),
                          defaultMessage: option.defaultMessage,
                        })}
                      </SingleSelectOption>
                    ))}
                  </SingleSelect>
                </Box>
              </Box>
            </Flex>
          </Box>
        </Layouts.Content>
      </Page.Main>
    </Page.Protect>
  );
};

export default RestorationBehaviorPage;
