import { describe, expect, it } from 'vitest';
import { validateTemplateForm } from './templateFormValidation';

describe('validateTemplateForm', () => {
  const validEmail = {
    name: 'Welcome',
    description: '',
    channel: 'email' as const,
    subject: 'Hi',
    body: 'Hello {{first_name}}',
    require_merge_field_validation: false,
  };

  it('accepts well-formed merge tokens (AC-7)', () => {
    const result = validateTemplateForm({
      ...validEmail,
      body: 'Hello {{ first_name }}',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name (AC-6)', () => {
    const result = validateTemplateForm({ ...validEmail, name: '   ' });
    expect(result.success).toBe(false);
    expect(result.errors.name).toBe('Name is required.');
  });

  it('rejects shape-malformed merge tokens (AC-8)', () => {
    const result = validateTemplateForm({
      ...validEmail,
      body: 'Hello {{first_name',
    });
    expect(result.success).toBe(false);
    expect(result.errors.body).toContain('{{token_name}}');
  });
});
