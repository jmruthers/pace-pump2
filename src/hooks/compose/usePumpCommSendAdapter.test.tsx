// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { CommDraft, CommSendAdapter } from '@solvera/pace-core/comms';
import { usePumpCommSendAdapter } from './usePumpCommSendAdapter';

const upsertMock = vi.fn();
const baseSendTest = vi.fn();
const baseSaveDraft = vi.fn();
const baseSend = vi.fn();

type AdapterOptions = {
  organisationId: string;
  sourceApp: string;
  sourceContextType?: string;
  sourceContextId?: string;
};

let capturedAdapterOptions: AdapterOptions | null = null;

vi.mock('@solvera/pace-core/comms', async () => {
  const actual = await vi.importActual<typeof import('@solvera/pace-core/comms')>(
    '@solvera/pace-core/comms'
  );
  return {
    ...actual,
    useCommSendAdapter: (options: AdapterOptions) => {
      capturedAdapterOptions = options;
      return {
        resolvePool: vi.fn(),
        loadTemplates: vi.fn(),
        loadMergeFields: vi.fn(),
        send: baseSend,
        schedule: scheduleMock,
        sendTest: baseSendTest,
        saveDraft: baseSaveDraft,
      } satisfies CommSendAdapter;
    },
  };
});

vi.mock('@solvera/pace-core/rbac', () => ({
  useSecureSupabase: () => ({
    from: () => ({
      upsert: upsertMock,
    }),
  }),
}));

const { toastMock, scheduleMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
  scheduleMock: vi.fn(),
}));

vi.mock('@solvera/pace-core/components', () => ({
  toast: toastMock,
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
    baseSend.mockReset();
    scheduleMock.mockReset();
    toastMock.mockReset();
    capturedAdapterOptions = null;
    upsertMock.mockResolvedValue({ error: null });
  });

  it('upserts pump_message on saveDraft with stable id', async () => {
    const { result } = renderHook(() =>
      usePumpCommSendAdapter({
        organisationId: 'org-1',
        sourceContext: { sourceContextType: undefined, sourceContextId: undefined },
        draftMessageId: 'draft-uuid',
        recipientPool: { type: 'org_members', organisation_id: 'org-1', filters: {} },
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

  it('returns error when saveDraft upsert fails', async () => {
    upsertMock.mockResolvedValue({ error: { message: 'RLS denied', code: '42501' } });
    const { result } = renderHook(() =>
      usePumpCommSendAdapter({
        organisationId: 'org-1',
        sourceContext: { sourceContextType: undefined, sourceContextId: undefined },
        draftMessageId: 'draft-uuid',
        recipientPool: { type: 'org_members', organisation_id: 'org-1', filters: {} },
        createdBy: 'user-1',
      })
    );

    const saved = await result.current.saveDraft(draft);
    expect(saved.ok).toBe(false);
    if (!saved.ok) {
      expect(saved.error.message).toBeTruthy();
    }
  });

  it('mounts useCommSendAdapter with pump sourceApp and org source context', () => {
    renderHook(() =>
      usePumpCommSendAdapter({
        organisationId: 'org-1',
        sourceContext: { sourceContextType: undefined, sourceContextId: undefined },
        draftMessageId: 'draft-uuid',
        recipientPool: { type: 'org_members', organisation_id: 'org-1', filters: {} },
        createdBy: 'user-1',
      })
    );
    expect(capturedAdapterOptions).toEqual({
      organisationId: 'org-1',
      sourceApp: 'pump',
      sourceContextType: undefined,
      sourceContextId: undefined,
    });
  });

  it('mounts useCommSendAdapter with event source context for event_participants', () => {
    renderHook(() =>
      usePumpCommSendAdapter({
        organisationId: 'org-1',
        sourceContext: { sourceContextType: 'event', sourceContextId: 'evt-5' },
        draftMessageId: 'draft-uuid',
        recipientPool: {
          type: 'event_participants',
          event_id: 'evt-5',
          filters: {},
        },
        createdBy: 'user-1',
      })
    );
    expect(capturedAdapterOptions).toMatchObject({
      sourceApp: 'pump',
      sourceContextType: 'event',
      sourceContextId: 'evt-5',
    });
  });

  it('mounts useCommSendAdapter with undefined source context for manual pool', () => {
    renderHook(() =>
      usePumpCommSendAdapter({
        organisationId: 'org-1',
        sourceContext: { sourceContextType: undefined, sourceContextId: undefined },
        draftMessageId: 'draft-uuid',
        recipientPool: { type: 'manual', member_ids: ['m1', 'm2'] },
        createdBy: 'user-1',
      })
    );
    expect(capturedAdapterOptions?.sourceContextType).toBeUndefined();
    expect(capturedAdapterOptions?.sourceContextId).toBeUndefined();
    expect(capturedAdapterOptions?.sourceApp).toBe('pump');
  });

  it('returns validation error when draft is invalid', async () => {
    const { result } = renderHook(() =>
      usePumpCommSendAdapter({
        organisationId: 'org-1',
        sourceContext: { sourceContextType: undefined, sourceContextId: undefined },
        draftMessageId: 'draft-uuid',
        recipientPool: { type: 'org_members', organisation_id: 'org-1', filters: {} },
        createdBy: 'user-1',
      })
    );

    const saved = await result.current.saveDraft({
      channel: 'email',
      body_text: '',
      sender_name: 'Org',
    });
    expect(saved.ok).toBe(false);
    if (!saved.ok) {
      expect(saved.error.code).toBe('COMMS_DRAFT_INVALID');
    }
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('shows success toast when sendTest succeeds', async () => {
    baseSendTest.mockResolvedValueOnce({ ok: true, data: { sent: true } });

    const { result } = renderHook(() =>
      usePumpCommSendAdapter({
        organisationId: 'org-1',
        sourceContext: { sourceContextType: undefined, sourceContextId: undefined },
        draftMessageId: 'draft-uuid',
        recipientPool: { type: 'org_members', organisation_id: 'org-1', filters: {} },
        createdBy: 'user-1',
      })
    );

    const sendResult = await result.current.sendTest({
      organisation_id: 'org-1',
      channel: 'email',
      body_text: draft.body_text ?? '',
      sender_name: draft.sender_name ?? '',
      sender_email: draft.sender_email,
      source_app: 'pump',
    });

    expect(sendResult.ok).toBe(true);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success' })
    );
  });

  it('does not show toast when sendTest fails', async () => {
    baseSendTest.mockResolvedValueOnce({
      ok: false,
      error: { code: 'SEND_FAILED', message: 'failed' },
    });

    const { result } = renderHook(() =>
      usePumpCommSendAdapter({
        organisationId: 'org-1',
        sourceContext: { sourceContextType: undefined, sourceContextId: undefined },
        draftMessageId: 'draft-uuid',
        recipientPool: { type: 'org_members', organisation_id: 'org-1', filters: {} },
        createdBy: 'user-1',
      })
    );

    const sendResult = await result.current.sendTest({
      organisation_id: 'org-1',
      channel: 'email',
      body_text: draft.body_text ?? '',
      sender_name: draft.sender_name ?? '',
      sender_email: draft.sender_email,
      source_app: 'pump',
    });

    expect(sendResult.ok).toBe(false);
    expect(toastMock).not.toHaveBeenCalled();
  });
});
