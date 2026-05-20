import { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Form,
  toast,
} from '@solvera/pace-core/components';
import {
  validateTemplateForm,
  type TemplateFormSchemaValues,
} from '@/lib/templates/templateFormValidation';
import type { OrganisationTemplateRow } from '@/lib/templates/types';
import { TemplateEditorFields } from './TemplateEditorFields';

export interface TemplateEditorDialogProps {
  mode: 'create' | 'edit';
  template: OrganisationTemplateRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues: TemplateFormSchemaValues;
  canUpdateStrictMode: boolean;
  onSave: (values: TemplateFormSchemaValues) => Promise<void>;
  isSaving: boolean;
}

export function TemplateEditorDialog({
  mode,
  open,
  onOpenChange,
  defaultValues,
  canUpdateStrictMode,
  onSave,
  isSaving,
}: TemplateEditorDialogProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      document.getElementById('form-field-name')?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, mode]);

  const handleSubmit = async (values: TemplateFormSchemaValues) => {
    const result = validateTemplateForm(values);
    if (!result.success) {
      toast({
        variant: 'destructive',
        title: 'Fix the highlighted fields before saving.',
      });
      return;
    }
    try {
      await onSave(values);
    } catch (saveError: unknown) {
      if (saveError instanceof Error && saveError.message.length > 0) {
        return;
      }
      throw saveError;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create template' : 'Edit template'}</DialogTitle>
        </DialogHeader>
        <Form<TemplateFormSchemaValues>
          key={`${mode}-${open ? 'open' : 'closed'}`}
          defaultValues={defaultValues}
          onSubmit={handleSubmit}
          className="grid gap-4"
        >
          {(methods) => (
            <TemplateEditorFields
              watch={methods.watch}
              setValue={methods.setValue}
              canUpdateStrictMode={canUpdateStrictMode}
              isSaving={isSaving}
              onCancel={() => onOpenChange(false)}
            />
          )}
        </Form>
      </DialogContent>
    </Dialog>
  );
}
