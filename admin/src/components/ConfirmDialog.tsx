import { Dialog, Button, Flex, Typography } from '@strapi/design-system';
import { useIntl } from 'react-intl';

import { getTranslation } from '../utils/getTranslation';

interface ConfirmDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly variant?: 'danger-light' | 'success-light';
  readonly isLoading?: boolean;
}

export const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  variant = 'danger-light',
  isLoading = false,
}: ConfirmDialogProps) => {
  const { formatMessage } = useIntl();

  if (!isOpen) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Content>
        <Dialog.Header>{title}</Dialog.Header>
        <Dialog.Body>
          <Flex justifyContent="center">
            <Typography>{message}</Typography>
          </Flex>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Cancel>
            <Button variant="tertiary" onClick={onClose}>
              {formatMessage({
                id: getTranslation('dialog.cancel'),
                defaultMessage: 'Cancel',
              })}
            </Button>
          </Dialog.Cancel>
          <Dialog.Action>
            <Button variant={variant} onClick={onConfirm} loading={isLoading}>
              {confirmLabel ??
                formatMessage({
                  id: getTranslation('dialog.confirm'),
                  defaultMessage: 'Confirm',
                })}
            </Button>
          </Dialog.Action>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};
