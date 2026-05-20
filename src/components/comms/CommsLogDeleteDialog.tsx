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
import type { PumpMessageRow } from '@/lib/comms/commsLogTypes.js';

export function CommsLogDeleteDialog({
  row,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  row: Pick<PumpMessageRow, 'channel' | 'subject'> | null;
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
          <DialogTitle>Delete draft?</DialogTitle>
          <DialogDescription>
            {subjectLine(row.channel, row.subject)}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p>Delete this draft? This cannot be undone.</p>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? <LoadingSpinner /> : 'Delete draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
