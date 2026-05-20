import { useEffect, useRef } from 'react';
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
  const formMethodsRef = useRef<{
    setError: (
      name: keyof TemplateFormSchemaValues,
      error: { type?: string; message: string }
    ) => void;
    clearErrors: () => void;
  } | null>(null);

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
    const methods = formMethodsRef.current;
    if (!result.success) {
      methods?.clearErrors();
      for (const [key, message] of Object.entries(result.errors)) {
        methods?.setError(key as keyof TemplateFormSchemaValues, {
          type: 'manual',
          message,
        });
      }
      toast({
        variant: 'destructive',
        title: 'Fix the highlighted fields before saving.',
      });
      return;
    }
    methods?.clearErrors();
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
          {(methods) => {
            formMethodsRef.current = {
              setError: methods.setError,
              clearErrors: methods.clearErrors,
            };
            return (
              <TemplateEditorFields
                watch={methods.watch}
                setValue={methods.setValue}
                canUpdateStrictMode={canUpdateStrictMode}
                isSaving={isSaving}
                onCancel={() => onOpenChange(false)}
              />
            );
          }}
        </Form>
      </DialogContent>
    </Dialog>
  );
}
