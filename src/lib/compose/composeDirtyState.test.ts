import { describe, expect, it } from 'vitest';
import { createInitialCommDraft, isComposeDraftDirty, lightResetDraftFields } from './composeDirtyState';

describe('composeDirtyState', () => {
  it('treats empty initial draft as clean', () => {
    expect(isComposeDraftDirty(createInitialCommDraft(), null)).toBe(false);
  });

  it('treats edited body as dirty without baseline', () => {
    const draft = createInitialCommDraft({ body_text: 'Hello' });
    expect(isComposeDraftDirty(draft, null)).toBe(true);
  });

  it('treats draft matching baseline as clean', () => {
    const draft = createInitialCommDraft({ body_text: 'Saved' });
    expect(isComposeDraftDirty(draft, draft)).toBe(false);
  });

  it('light reset clears body fields but keeps channel and sender', () => {
    const draft = createInitialCommDraft({
      channel: 'email',
      sender_name: 'Org',
      subject: 'Hi',
      body_text: 'Body',
      template_id: 'tpl-1',
    });
    const reset = lightResetDraftFields(draft);
    expect(reset.channel).toBe('email');
    expect(reset.sender_name).toBe('Org');
    expect(reset.subject).toBe('');
    expect(reset.body_text).toBe('');
    expect(reset.template_id).toBeUndefined();
  });
});
