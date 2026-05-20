import { describe, expect, it } from 'vitest';
import { buildTemplateSavePayload } from './buildTemplateSavePayload';
import type { TemplateFormValues } from './types';

const baseForm: TemplateFormValues = {
  name: 'Welcome',
  description: '',
  channel: 'email',
  subject: 'Hi',
  body: '<p>Hello {{first_name}}</p>',
  require_merge_field_validation: false,
};

describe('buildTemplateSavePayload', () => {
  it('derives body_text from HTML on email save (AC-5)', () => {
    const payload = buildTemplateSavePayload({
      form: baseForm,
      organisationId: 'org-1',
      userId: 'user-1',
      mode: 'create',
    });
    expect(payload.body_text).toBe('Hello {{first_name}}');
    expect(payload.merge_fields_used).toEqual(['{{first_name}}']);
    expect(payload.created_by).toBe('user-1');
  });

  it('deduplicates merge_fields_used (PU04 §12 #3)', () => {
    const payload = buildTemplateSavePayload({
      form: {
        ...baseForm,
        body: '<p>Hi {{first_name}} — {{first_name}} is great. {{org_name}} welcomes you.</p>',
      },
      organisationId: 'org-1',
      userId: 'user-1',
      mode: 'create',
    });
    expect(payload.merge_fields_used).toEqual(['{{first_name}}', '{{org_name}}']);
  });

  it('clears subject and body_html for SMS (AC-17)', () => {
    const payload = buildTemplateSavePayload({
      form: {
        name: 'SMS reminder',
        description: '',
        channel: 'sms',
        subject: 'ignored',
        body: 'Reminder text',
        require_merge_field_validation: false,
      },
      organisationId: 'org-1',
      userId: 'user-1',
      mode: 'create',
    });
    expect(payload.subject).toBeNull();
    expect(payload.body_html).toBeNull();
    expect(payload.body_text).toBe('Reminder text');
  });
});
