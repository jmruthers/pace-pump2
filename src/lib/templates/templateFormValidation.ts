import { hasMalformedMergeTokens, MERGE_TOKEN_SHAPE_MESSAGE } from './tokenValidation';
import type { TemplateFormValues } from './types';

export type TemplateFormSchemaValues = TemplateFormValues;

export interface TemplateFormValidationResult {
  success: boolean;
  errors: Partial<Record<keyof TemplateFormValues, string>>;
}

/** BR-FormValidation + BR-TokenValidation */
export function validateTemplateForm(values: TemplateFormValues): TemplateFormValidationResult {
  const errors: Partial<Record<keyof TemplateFormValues, string>> = {};

  if (values.name.trim().length === 0) {
    errors.name = 'Name is required.';
  }

  if (values.channel === 'email') {
    if (values.subject.trim().length === 0) {
      errors.subject = 'Subject is required for email templates.';
    }
    if (values.body.trim().length === 0) {
      errors.body = 'Body is required.';
    }
  } else if (values.body.trim().length === 0) {
    errors.body = 'Body is required.';
  }

  const fieldsToScan: Array<{ key: keyof TemplateFormValues; value: string }> = [
    { key: 'name', value: values.name },
    { key: 'body', value: values.body },
  ];
  if (values.channel === 'email') {
    fieldsToScan.push({ key: 'subject', value: values.subject });
  }

  for (const field of fieldsToScan) {
    if (hasMalformedMergeTokens(field.value)) {
      errors[field.key] = MERGE_TOKEN_SHAPE_MESSAGE;
    }
  }

  return {
    success: Object.keys(errors).length === 0,
    errors,
  };
}
