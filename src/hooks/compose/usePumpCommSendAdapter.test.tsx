// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { CommDraft, CommSendAdapter } from '@solvera/pace-core/comms';
import { usePumpCommSendAdapter } from './usePumpCommSendAdapter';

const upsertMock = vi.fn();
const baseSendTest = vi.fn();
const baseSaveDraft = vi.fn();

vi.mock('@solvera/pace-core/comms', async () => {
  const actual = await vi.importActual<typeof import('@solvera/pace-core/comms')>(
    '@solvera/pace-core/comms'
  );
  return {
    ...actual,
    useCommSendAdapter: () =>
      ({
        resolvePool: vi.fn(),
        loadTemplates: vi.fn(),
        loadMergeFields: vi.fn(),
        send: vi.fn(),
        schedule: vi.fn(),
        sendTest: baseSendTest,
        saveDraft: baseSaveDraft,
      }) satisfies CommSendAdapter,
  };
});

vi.mock('@solvera/pace-core/rbac', () => ({
  useSecureSupabase: () => ({
    from: () => ({
      upsert: upsertMock,
    }),
  }),
}));

vi.mock('@solvera/pace-core/components', () => ({
  toast: vi.fn(),
}));

const draft: CommDraft = {
  channel: 'email',
  body_text: 'Hello',
  sender_name: 'Org',
  sender_email: 'org@example.test',
};

describe('usePumpCommSendAdapter', () => {
  beforeEach(() => {
    upsertMock.mockReset();
    baseSendTest.mockReset();
    baseSaveDraft.mockReset();
    upsertMock.mockResolvedValue({ error: null });
  });

  it('upserts pump_message on saveDraft with stable id', async () => {
    const { result } = renderHook(() =>
      usePumpCommSendAdapter({
        organisationId: 'org-1',
        sourceContext: { sourceContextType: undefined, sourceContextId: undefined },
        draftMessageId: 'draft-uuid',
        recipientPool: { type: 'org_members', organisation_id: 'org-1' },
        createdBy: 'user-1',
      })
    );

    const saved = await result.current.saveDraft(draft);
    expect(saved.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0]?.[0]).toMatchObject({
      id: 'draft-uuid',
      organisation_id: 'org-1',
      status: 'draft',
      source_app: 'pump',
    });
  });

  it('reuses the same id on second saveDraft call', async () => {
    const { result } = renderHook(() =>
      usePumpCommSendAdapter({
        organisationId: 'org-1',
        sourceContext: { sourceContextType: undefined, sourceContextId: undefined },
        draftMessageId: 'draft-uuid',
        recipientPool: { type: 'manual', member_ids: [] },
        createdBy: 'user-1',
      })
    );

    await result.current.saveDraft(draft);
    await result.current.saveDraft({ ...draft, body_text: 'Updated' });
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock.mock.calls[0]?.[0].id).toBe('draft-uuid');
    expect(upsertMock.mock.calls[1]?.[0].id).toBe('draft-uuid');
  });
});
