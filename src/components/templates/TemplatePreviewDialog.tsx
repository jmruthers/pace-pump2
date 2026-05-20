import { useEffect } from 'react';
import { MessagePreview } from '@solvera/pace-core/comms';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@solvera/pace-core/components';
import { toPreviewDraft } from '@/lib/templates/toPreviewDraft';
import type { OrganisationTemplateRow } from '@/lib/templates/types';

export interface TemplatePreviewDialogProps {
  template: OrganisationTemplateRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TemplatePreviewDialog({
  template,
  open,
  onOpenChange,
}: TemplatePreviewDialogProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>('[aria-label="Close preview"]')?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (template == null) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{`Preview: ${template.name}`}</DialogTitle>
        </DialogHeader>
        <MessagePreview
          draft={toPreviewDraft(template)}
          mergeFields={[]}
          sampleValues={{}}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            aria-label="Close preview"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
