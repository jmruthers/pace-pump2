import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@solvera/pace-core/components';

export interface DiscardChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
}

export function DiscardChangesDialog({
  open,
  onOpenChange,
  onDiscard,
}: DiscardChangesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discard unsaved changes?</DialogTitle>
          <DialogDescription>Any text you&apos;ve entered will be lost.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Keep editing
          </Button>
          <Button type="button" variant="destructive" onClick={onDiscard}>
            Discard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
