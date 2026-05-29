import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CommComposer, useCommDraft } from '@solvera/pace-core/comms';
import { toast } from '@solvera/pace-core/components';
import type { CommDraft, CommScheduleCompletePayload, CommSendResult } from '@solvera/pace-core/comms';
import { useUnifiedAuth } from '@solvera/pace-core/hooks';
import { PagePermissionGuard } from '@solvera/pace-core/rbac';
import { useCommRbacContext } from '@/components/comms/CommRbacContextProvider';
import { useEffectivePumpSenderIdentity } from '@/hooks/useEffectivePumpSenderIdentity';
import { useComposeRecipientState } from '@/hooks/compose/useComposeRecipientState';
import { useOrganisationEvents } from '@/hooks/compose/useOrganisationEvents';
import { useMembershipTypes } from '@/hooks/compose/useMembershipTypes';
import { useOrganisationUnits } from '@/hooks/compose/useOrganisationUnits';
import { useEventRegistrationTypes } from '@/hooks/compose/useEventRegistrationTypes';
import { usePumpCommSendAdapter } from '@/hooks/compose/usePumpCommSendAdapter';
import {
  createInitialCommDraft,
  isComposeDraftDirty,
  lightResetDraftFields,
} from '@/lib/compose/composeDirtyState';
import {
  buildScheduleSuccessToast,
  buildSendSuccessToast,
  sendFailureToastTitle,
} from '@/lib/compose/sendToastMessages';
import { ComposePageChrome } from './ComposePageChrome';
import { DiscardChangesDialog } from './DiscardChangesDialog';
import { RecipientModeCard } from './RecipientModeCard';
import { SenderIdentityBanner } from './SenderIdentityBanner';
import type { ManualMemberChip } from './ManualMemberPicker';

function ComposePageContent() {
  const navigate = useNavigate();
  const rbac = useCommRbacContext();
  const { selectedOrganisation, user } = useUnifiedAuth();
  const organisationId = selectedOrganisation?.id ?? '';
  const organisationName =
    selectedOrganisation?.display_name ?? selectedOrganisation?.name ?? 'your organisation';

  const draftMessageId = useMemo(() => crypto.randomUUID(), []);
  const [savedBaseline, setSavedBaseline] = useState<CommDraft | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const previousOrganisationId = useRef(organisationId);

  const recipient = useComposeRecipientState(organisationId);
  const { resetToOrgMembersDefault } = recipient;
  const { data: events = [] } = useOrganisationEvents(organisationId);
  const { data: membershipTypes = [] } = useMembershipTypes(organisationId);
  const { data: units = [] } = useOrganisationUnits(organisationId);
  const { data: registrationTypes = [] } = useEventRegistrationTypes(recipient.selectedEventId);

  const senderContextType =
    recipient.sourceContext.sourceContextType === 'event' ? 'event' : null;
  const senderContextId = recipient.sourceContext.sourceContextId ?? null;

  const identityQuery = useEffectivePumpSenderIdentity({
    organisationId: organisationId.length > 0 ? organisationId : null,
    sourceContextType: senderContextType,
    sourceContextId: senderContextId,
  });

  const { draft, setDraft, updateDraft } = useCommDraft(createInitialCommDraft());

  const senderIdentityDraft = useMemo(() => {
    const data = identityQuery.data;
    if (data == null) {
      return null;
    }
    return {
      sender_name: data.senderName ?? '',
      sender_email: data.fromAddress ?? '',
      sender_phone: data.senderPhone ?? '',
      reply_to: data.replyToAddress ?? '',
    };
  }, [identityQuery.data]);

  useEffect(() => {
    if (identityQuery.isLoading || senderIdentityDraft == null) {
      return;
    }
    updateDraft(senderIdentityDraft);
  }, [identityQuery.isLoading, senderIdentityDraft, updateDraft]);

  useEffect(() => {
    if (previousOrganisationId.current === organisationId) {
      return;
    }
    previousOrganisationId.current = organisationId;
    resetToOrgMembersDefault();
    setSavedBaseline(null);
  }, [organisationId, resetToOrgMembersDefault]);

  const [manualMemberLabels, setManualMemberLabels] = useState<Record<string, string>>({});

  const handleAddManualMember = useCallback(
    (member: ManualMemberChip) => {
      setManualMemberLabels((current) => ({ ...current, [member.id]: member.label }));
      recipient.addManualMemberId(member.id);
    },
    [recipient]
  );

  const handleRemoveManualMember = useCallback(
    (memberId: string) => {
      setManualMemberLabels((current) => {
        const next = { ...current };
        delete next[memberId];
        return next;
      });
      recipient.removeManualMemberId(memberId);
    },
    [recipient]
  );

  const manualMembersWithLabels = useMemo(
    (): ManualMemberChip[] =>
      recipient.manualMemberIds.map((id) => ({
        id,
        label: manualMemberLabels[id] ?? id,
      })),
    [recipient.manualMemberIds, manualMemberLabels]
  );

  const showToastError = useCallback(
    (action: 'send' | 'schedule' | 'sendTest' | 'saveDraft', message: string) => {
      toast({
        variant: 'destructive',
        title: sendFailureToastTitle(action),
        description: message,
      });
    },
    []
  );

  const handleSaveDraftSuccess = useCallback(
    (saved: CommDraft) => {
      setSavedBaseline(saved);
      toast({ variant: 'success', title: 'Draft saved.' });
    },
    []
  );

  const adapter = usePumpCommSendAdapter({
    organisationId,
    sourceContext: recipient.sourceContext,
    draftMessageId,
    recipientPool: recipient.recipientPool,
    createdBy: user?.id ?? null,
    onSaveDraftSuccess: handleSaveDraftSuccess,
  });

  useEffect(() => {
    if (identityQuery.isError) {
      toast({
        variant: 'destructive',
        title: 'Sender identity could not be resolved',
        description:
          identityQuery.error instanceof Error
            ? identityQuery.error.message
            : 'Sender identity could not be resolved',
      });
    }
  }, [identityQuery.isError, identityQuery.error]);

  const performLightReset = useCallback(() => {
    setDraft((previous) => lightResetDraftFields(previous));
    resetToOrgMembersDefault();
    setSavedBaseline(null);
  }, [resetToOrgMembersDefault, setDraft]);

  const handleSendComplete = useCallback(
    (result: CommSendResult) => {
      const { title, description } = buildSendSuccessToast(result);
      toast({ variant: 'success', title, description });
      performLightReset();
    },
    [performLightReset]
  );

  const handleScheduleComplete = useCallback(
    (payload: CommScheduleCompletePayload) => {
      const { title, description } = buildScheduleSuccessToast(payload.scheduledAtIso);
      toast({ variant: 'success', title, description });
      performLightReset();
    },
    [performLightReset]
  );

  const handleCancel = useCallback(() => {
    if (isComposeDraftDirty(draft, savedBaseline)) {
      setDiscardOpen(true);
      return;
    }
    navigate('/');
  }, [draft, navigate, savedBaseline]);

  const composerKey = `${recipient.mode}-${recipient.selectedEventId ?? 'none'}-${draftMessageId}`;

  if (organisationId.length === 0) {
    return null;
  }

  return (
    <main className="grid gap-6">
      <ComposePageChrome organisationName={organisationName} />
      <SenderIdentityBanner
        channel={draft.channel}
        identity={identityQuery.data ?? null}
        isLoading={identityQuery.isLoading}
        errorMessage={
          identityQuery.isError
            ? identityQuery.error instanceof Error
              ? identityQuery.error.message
              : 'Sender identity could not be resolved'
            : null
        }
      />
      <RecipientModeCard
        organisationId={organisationId}
        events={events}
        membershipTypes={membershipTypes}
        units={units}
        registrationTypes={registrationTypes}
        manualMembers={manualMembersWithLabels}
        onAddManualMember={handleAddManualMember}
        onRemoveManualMember={handleRemoveManualMember}
        recipient={recipient}
      />
      <CommComposer
        key={composerKey}
        adapter={adapter}
        organisationId={organisationId}
        sourceApp="pump"
        recipientPool={recipient.recipientPool}
        rbac={rbac}
        draft={draft}
        onDraftChange={setDraft}
        blockSendOnUnresolvedTokens
        blockSendWhenPoolEmpty={false}
        lockSenderIdentity
        sourceContextType={recipient.sourceContext.sourceContextType}
        sourceContextId={recipient.sourceContext.sourceContextId}
        onCancel={handleCancel}
        onSendComplete={handleSendComplete}
        onSendError={(message, action = 'send') => showToastError(action, message)}
        onScheduleComplete={handleScheduleComplete}
      />
      <DiscardChangesDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onDiscard={() => {
          setDiscardOpen(false);
          navigate('/');
        }}
      />
    </main>
  );
}

/** `create` guard on route mount lives in App.tsx; this guard covers read access for page content. */
export function ComposePage() {
  const { selectedOrganisation } = useUnifiedAuth();
  const organisationId = selectedOrganisation?.id;

  return (
    <PagePermissionGuard
      pageName="comms-log"
      operation="read"
      scope={organisationId != null ? { organisationId } : undefined}
    >
      <ComposePageContent />
    </PagePermissionGuard>
  );
}
