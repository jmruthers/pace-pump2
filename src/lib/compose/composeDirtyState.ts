import type { CommDraft } from '@solvera/pace-core/comms';

const DEFAULT_DRAFT_SNAPSHOT: CommDraft = {
  channel: 'email',
  subject: '',
  body_html: '',
  body_text: '',
  template_id: undefined,
  sender_name: '',
  sender_email: '',
  sender_phone: '',
  reply_to: '',
  extra_merge_context: {},
};

function draftHasContent(draft: CommDraft): boolean {
  return (
    (draft.subject ?? '').trim().length > 0 ||
    (draft.body_html ?? '').trim().length > 0 ||
    (draft.body_text ?? '').trim().length > 0 ||
    draft.template_id != null
  );
}

/** BR-DirtyFlagDerivation — compare current draft to saved baseline or initial empty state. */
export function isComposeDraftDirty(
  draft: CommDraft,
  savedBaseline: CommDraft | null
): boolean {
  if (savedBaseline == null) {
    return draftHasContent(draft);
  }
  return JSON.stringify(draft) !== JSON.stringify(savedBaseline);
}

export function createInitialCommDraft(
  seed?: Partial<CommDraft>
): CommDraft {
  return { ...DEFAULT_DRAFT_SNAPSHOT, ...seed };
}

export function lightResetDraftFields(draft: CommDraft): CommDraft {
  return {
    ...draft,
    subject: '',
    body_html: '',
    body_text: '',
    template_id: undefined,
    extra_merge_context: {},
  };
}
