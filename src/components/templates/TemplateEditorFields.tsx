import { useEffect } from 'react';
import {
  Button,
  DialogFooter,
  FormField,
  Label,
  LoadingSpinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from '@solvera/pace-core/components';
import type { TemplateFormSchemaValues } from '@/lib/templates/templateFormValidation';

export interface TemplateEditorFieldsProps {
  watch: (name: keyof TemplateFormSchemaValues) => TemplateFormSchemaValues[keyof TemplateFormSchemaValues];
  setValue: (
    name: keyof TemplateFormSchemaValues,
    value: TemplateFormSchemaValues[keyof TemplateFormSchemaValues]
  ) => void;
  canUpdateStrictMode: boolean;
  isSaving: boolean;
  onCancel: () => void;
}

export function TemplateEditorFields({
  watch,
  setValue,
  canUpdateStrictMode,
  isSaving,
  onCancel,
}: TemplateEditorFieldsProps) {
  const channel = watch('channel');

  useEffect(() => {
    if (channel === 'sms') {
      setValue('subject', '');
    }
  }, [channel, setValue]);

  return (
    <>
      <FormField<TemplateFormSchemaValues>
        name="name"
        label="Name"
        required
        placeholder="Welcome email"
      />
      <FormField<TemplateFormSchemaValues>
        name="description"
        label="Description (optional)"
        render={({ field }) => (
          <Textarea
            id="form-field-description"
            value={(field.value as string) ?? ''}
            onChange={(value) => field.onChange(value)}
            onBlur={field.onBlur}
            placeholder="Short summary of when this template is used."
            rows={2}
          />
        )}
      />
      <FormField<TemplateFormSchemaValues>
        name="channel"
        label="Channel"
        required
        render={({ field }) => (
          <Select
            value={(field.value as string) ?? 'email'}
            onValueChange={(value) => field.onChange(value ?? 'email')}
          >
            <SelectTrigger aria-label="Channel">
              <SelectValue placeholder="Select channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
            </SelectContent>
          </Select>
        )}
      />
      {channel === 'email' ? (
        <FormField<TemplateFormSchemaValues>
          name="subject"
          label="Subject"
          required
          placeholder="Welcome to {organisation}"
        />
      ) : null}
      <FormField<TemplateFormSchemaValues>
        name="body"
        label="Body"
        required
        render={({ field }) => (
          <Textarea
            id="form-field-body"
            value={(field.value as string) ?? ''}
            onChange={(value) => field.onChange(value)}
            onBlur={field.onBlur}
            placeholder={
              channel === 'email'
                ? 'Hi {first_name}, welcome to our community.'
                : 'Reminder: your appointment is tomorrow at 10am.'
            }
            rows={8}
          />
        )}
      />
      <section className="grid gap-1">
        <Label htmlFor="form-field-strict">
          <Switch
            id="form-field-strict"
            checked={Boolean(watch('require_merge_field_validation'))}
            onChange={(checked) => setValue('require_merge_field_validation', checked)}
            disabled={!canUpdateStrictMode}
            aria-label="Require merge-field validation at send time"
          />
          Require merge-field validation at send time
        </Label>
        <p>
          When on, send is blocked if any merge token cannot be resolved for a recipient.
        </p>
      </section>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" variant="default" disabled={isSaving}>
          {isSaving ? (
            <>
              <LoadingSpinner />
              Save template
            </>
          ) : (
            'Save template'
          )}
        </Button>
      </DialogFooter>
    </>
  );
}
