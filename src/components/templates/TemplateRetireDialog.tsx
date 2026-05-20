import { useEffect } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@solvera/pace-core/components';
import type { OrganisationTemplateRow } from '@/lib/templates/types';

export interface TemplateRetireDialogProps {
  template: OrganisationTemplateRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function TemplateRetireDialog({
  template,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: TemplateRetireDialogProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>('[aria-label="Cancel retire template"]')?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (template == null) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Retire template?</DialogTitle>
        </DialogHeader>
        <p>{`Retire '${template.name}'? You can re-activate it later.`}</p>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            aria-label="Cancel retire template"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            Retire
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
