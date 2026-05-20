/* eslint-disable pace-core-compliance/prefer-pace-core-components */
// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ComposePage } from './ComposePage';

const navigateMock = vi.fn();
const toastMock = vi.fn();
const resetToOrgMembersDefaultMock = vi.fn();
let draftBodyText = '';
let adapterSourceContext: { sourceContextType?: string; sourceContextId?: string } = {};
let recipientMode: 'org_members' | 'event_participants' | 'manual' = 'org_members';
let canReadPage = true;
let canSend = true;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@solvera/pace-core/components', () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

vi.mock('@solvera/pace-core/hooks', () => ({
  useUnifiedAuth: () => ({
    selectedOrganisation: { id: 'org-1', display_name: 'Demo Org', name: 'Demo Org' },
    user: { id: 'user-1' },
  }),
}));

vi.mock('@solvera/pace-core/rbac', () => ({
  PagePermissionGuard: ({
    children,
    operation,
  }: {
    children: ReactNode;
    operation: string;
  }) => {
    if (operation === 'read' && !canReadPage) {
      return <p role="alert">Access denied</p>;
    }
    return <>{children}</>;
  },
}));

vi.mock('@/components/comms/CommRbacContextProvider', () => ({
  useCommRbacContext: () => ({
    canCompose: true,
    canSend,
    canSchedule: canSend,
    scopeType: 'organisation',
    scopeId: 'org-1',
  }),
}));

vi.mock('@/hooks/useEffectivePumpSenderIdentity', () => ({
  useEffectivePumpSenderIdentity: () => ({
    data: {
      organisationId: 'org-1',
      senderName: 'Org Comms',
      fromAddress: 'comms@example.org',
      senderPhone: null,
      replyToAddress: null,
      resolvedFrom: 'organisation',
      canSendEmail: true,
      canSendSms: false,
    },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

function buildRecipientMock() {
  const sourceContext =
    recipientMode === 'event_participants'
      ? { sourceContextType: 'event' as const, sourceContextId: 'evt-1' }
      : { sourceContextType: undefined, sourceContextId: undefined };
  const recipientPool =
    recipientMode === 'event_participants'
      ? { type: 'event_participants' as const, event_id: 'evt-1', filters: {} }
      : recipientMode === 'manual'
        ? { type: 'manual' as const, member_ids: ['m-1'] }
        : { type: 'org_members' as const, organisation_id: 'org-1', filters: {} };

  return {
    mode: recipientMode,
    setMode: vi.fn(),
    selectedEventId: recipientMode === 'event_participants' ? 'evt-1' : null,
    setSelectedEventId: vi.fn(),
    orgFilters: { memberTypeIds: [], unitIds: [], includeInactive: false },
    eventFilters: { registrationTypeIds: [], statuses: [], unitIds: [] },
    manualMemberIds: recipientMode === 'manual' ? ['m-1'] : [],
    recipientPool,
    sourceContext,
    resetToOrgMembersDefault: resetToOrgMembersDefaultMock,
    toggleMemberTypeId: vi.fn(),
    toggleOrgUnitId: vi.fn(),
    setIncludeInactive: vi.fn(),
    toggleRegistrationTypeId: vi.fn(),
    toggleRegistrationStatus: vi.fn(),
    toggleEventUnitId: vi.fn(),
    addManualMemberId: vi.fn(),
    removeManualMemberId: vi.fn(),
  };
}

vi.mock('@/hooks/compose/useComposeRecipientState', () => ({
  useComposeRecipientState: () => buildRecipientMock(),
}));

vi.mock('@/hooks/compose/useOrganisationEvents', () => ({
  useOrganisationEvents: () => ({ data: [] }),
}));
vi.mock('@/hooks/compose/useMembershipTypes', () => ({
  useMembershipTypes: () => ({ data: [] }),
}));
vi.mock('@/hooks/compose/useOrganisationUnits', () => ({
  useOrganisationUnits: () => ({ data: [] }),
}));
vi.mock('@/hooks/compose/useEventRegistrationTypes', () => ({
  useEventRegistrationTypes: () => ({ data: [] }),
}));

vi.mock('@/hooks/compose/usePumpCommSendAdapter', () => ({
  usePumpCommSendAdapter: (input: {
    sourceContext: { sourceContextType?: string; sourceContextId?: string };
  }) => {
    adapterSourceContext = input.sourceContext;
    return {
      resolvePool: vi.fn(),
      loadTemplates: vi.fn(),
      loadMergeFields: vi.fn(),
      send: vi.fn(),
      schedule: vi.fn(),
      sendTest: vi.fn(),
      saveDraft: vi.fn(),
    };
  },
}));

vi.mock('@solvera/pace-core/comms', () => ({
  useCommDraft: () => {
    const [draft, setDraft] = useState({
      channel: 'email',
      body_text: draftBodyText,
      sender_name: 'Org Comms',
      sender_email: 'comms@example.org',
    });
    return { draft, setDraft, updateDraft: vi.fn() };
  },
  CommComposer: ({
    onCancel,
    onSendComplete,
    onSendError,
    onScheduleComplete,
    sourceContextType,
    rbac,
  }: {
    onCancel?: () => void;
    onSendComplete?: (result: {
      message_id: string;
      total_recipients: number;
      suppression_skipped: number;
      warnings: [];
    }) => void;
    onSendError?: (message: string, action?: string) => void;
    onScheduleComplete?: (payload: { scheduledAtIso: string }) => void;
    sourceContextType?: string;
    sourceContextId?: string;
    rbac: { canSend: boolean };
  }) => (
    <section aria-label="Communication composer">
      <span data-testid="source-context-type">{String(sourceContextType)}</span>
      {rbac.canSend ? null : (
        <p>You have view-only access to this message.</p>
      )}
      <button type="button" onClick={() => onCancel?.()}>
        Cancel
      </button>
      <button
        type="button"
        onClick={() =>
          onSendComplete?.({
            message_id: 'msg-1',
            total_recipients: 10,
            suppression_skipped: 0,
            warnings: [],
          })
        }
      >
        Send now
      </button>
      <button
        type="button"
        onClick={() =>
          onSendError?.('Cannot send to an empty pool.', 'send')
        }
      >
        Trigger empty pool
      </button>
      <button
        type="button"
        onClick={() =>
          onSendError?.('Scheduled time must be in the future.', 'schedule')
        }
      >
        Trigger schedule error
      </button>
      <button
        type="button"
        onClick={() =>
          onScheduleComplete?.({ scheduledAtIso: '2026-12-01T10:00:00.000Z' })
        }
      >
        Confirm schedule
      </button>
    </section>
  ),
}));

vi.mock('./ComposePageChrome', () => ({
  ComposePageChrome: () => (
    <header>
      <h1>Compose</h1>
      <p>Send a message to members of Demo Org</p>
    </header>
  ),
}));
vi.mock('./SenderIdentityBanner', () => ({
  SenderIdentityBanner: () => <section>Sender banner</section>,
}));
vi.mock('./RecipientModeCard', () => ({
  RecipientModeCard: () => <section>Recipients</section>,
}));
vi.mock('./DiscardChangesDialog', () => ({
  DiscardChangesDialog: ({
    open,
    onDiscard,
    onOpenChange,
  }: {
    open: boolean;
    onDiscard: () => void;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div role="dialog">
        <h2>Discard unsaved changes?</h2>
        <button type="button" onClick={() => onOpenChange(false)}>
          Keep editing
        </button>
        <button type="button" onClick={onDiscard}>
          Discard
        </button>
      </div>
    ) : null,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ComposePage />
    </MemoryRouter>
  );
}

describe('ComposePage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    toastMock.mockReset();
    resetToOrgMembersDefaultMock.mockReset();
    draftBodyText = '';
    recipientMode = 'org_members';
    canReadPage = true;
    canSend = true;
  });

  afterEach(cleanup);

  it('renders compose shell and wires adapter source context for org_members', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Compose' })).toBeTruthy();
    expect(screen.getByText('Recipients')).toBeTruthy();
    expect(adapterSourceContext.sourceContextType).toBeUndefined();
  });

  it('wires event source context when recipient mode is event_participants', () => {
    recipientMode = 'event_participants';
    renderPage();
    expect(adapterSourceContext).toEqual({
      sourceContextType: 'event',
      sourceContextId: 'evt-1',
    });
    expect(screen.getByTestId('source-context-type').textContent).toBe('event');
  });

  it('shows access denied when read permission is missing', () => {
    canReadPage = false;
    renderPage();
    expect(screen.getByText('Access denied')).toBeTruthy();
    expect(screen.queryByLabelText('Communication composer')).toBeNull();
  });

  it('shows read-only composer footer when canSend is false', () => {
    canSend = false;
    renderPage();
    expect(screen.getByText('You have view-only access to this message.')).toBeTruthy();
  });

  it('navigates home on clean cancel', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('opens discard dialog when draft is dirty', async () => {
    draftBodyText = 'Hello';
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('shows send success toast without navigating away', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Send now' }));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success', title: 'Message sent' })
    );
    expect(navigateMock).not.toHaveBeenCalled();
    expect(resetToOrgMembersDefaultMock).toHaveBeenCalled();
  });

  it('shows destructive toast on send error', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Trigger empty pool' }));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        title: 'Send failed',
        description: 'Cannot send to an empty pool.',
      })
    );
  });

  it('shows schedule failed toast on schedule error', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Trigger schedule error' }));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        title: 'Schedule failed',
      })
    );
  });

  it('shows schedule success toast and light-resets recipient mode', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Confirm schedule' }));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success', title: 'Message scheduled' })
    );
    expect(resetToOrgMembersDefaultMock).toHaveBeenCalled();
  });
});
