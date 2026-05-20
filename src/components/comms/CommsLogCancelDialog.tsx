import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LoadingSpinner,
} from '@solvera/pace-core/components';
import { subjectLine } from '@/lib/comms/commsLogFormat.js';
import type { CancelTargetRow } from '@/hooks/comms/useCancelPumpMessage.js';

export function CommsLogCancelDialog({
  row,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  row: CancelTargetRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  if (row == null) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel scheduled message?</DialogTitle>
          <DialogDescription>
            {subjectLine(row.channel, row.subject)}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p>Cancel this scheduled message? It will not send.</p>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            autoFocus
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Keep scheduled
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? <LoadingSpinner /> : 'Cancel message'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
