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
  PagePermissionGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/comms/CommRbacContextProvider', () => ({
  useCommRbacContext: () => ({
    canCompose: true,
    canSend: true,
    canSchedule: true,
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

vi.mock('@/hooks/compose/useComposeRecipientState', () => ({
  useComposeRecipientState: () => ({
    mode: 'org_members',
    setMode: vi.fn(),
    selectedEventId: null,
    setSelectedEventId: vi.fn(),
    orgFilters: { memberTypeIds: [], unitIds: [], includeInactive: false },
    eventFilters: { registrationTypeIds: [], statuses: [], unitIds: [] },
    manualMemberIds: [],
    recipientPool: { type: 'org_members', organisation_id: 'org-1' },
    sourceContext: { sourceContextType: undefined, sourceContextId: undefined },
    resetToOrgMembersDefault: resetToOrgMembersDefaultMock,
    toggleMemberTypeId: vi.fn(),
    toggleOrgUnitId: vi.fn(),
    setIncludeInactive: vi.fn(),
    toggleRegistrationTypeId: vi.fn(),
    toggleRegistrationStatus: vi.fn(),
    toggleEventUnitId: vi.fn(),
    addManualMemberId: vi.fn(),
    removeManualMemberId: vi.fn(),
  }),
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
    sourceContextType,
  }: {
    onCancel?: () => void;
    onSendComplete?: (result: {
      message_id: string;
      total_recipients: number;
      suppression_skipped: number;
      warnings: [];
    }) => void;
    onSendError?: (message: string, action?: string) => void;
    sourceContextType?: string;
    sourceContextId?: string;
  }) => (
    <section aria-label="Communication composer">
      <span data-testid="source-context-type">{String(sourceContextType)}</span>
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
      <button type="button" onClick={() => onSendError?.('Pool empty', 'send')}>
        Trigger send error
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
  });

  afterEach(cleanup);

  it('renders compose shell and wires adapter source context', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Compose' })).toBeTruthy();
    expect(screen.getByText('Recipients')).toBeTruthy();
    expect(adapterSourceContext.sourceContextType).toBeUndefined();
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
    await user.click(screen.getByRole('button', { name: 'Trigger send error' }));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Send failed' })
    );
  });
});
