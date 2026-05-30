// @vitest-environment happy-dom
/** PU05 — recipient pool state drives descriptor output */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useComposeRecipientState } from './useComposeRecipientState';

describe('useComposeRecipientState', () => {
  it('defaults to org_members pool', () => {
    const { result } = renderHook(() => useComposeRecipientState('org-1'));

    expect(result.current.mode).toBe('org_members');
    expect(result.current.recipientPool).toEqual({
      type: 'org_members',
      organisation_id: 'org-1',
      filters: {},
    });
    expect(result.current.sourceContext).toEqual({
      sourceContextType: undefined,
      sourceContextId: undefined,
    });
  });

  it('builds manual pool when members are added', () => {
    const { result } = renderHook(() => useComposeRecipientState('org-1'));

    act(() => {
      result.current.setMode('manual');
      result.current.addManualMemberId('member-a');
      result.current.addManualMemberId('member-b');
    });

    expect(result.current.recipientPool).toEqual({
      type: 'manual',
      member_ids: ['member-a', 'member-b'],
    });
  });

  it('derives event source context for event participants mode', () => {
    const { result } = renderHook(() => useComposeRecipientState('org-1'));

    act(() => {
      result.current.setMode('event_participants');
      result.current.setSelectedEventId('evt-99');
    });

    expect(result.current.recipientPool).toMatchObject({
      type: 'event_participants',
      event_id: 'evt-99',
    });
    expect(result.current.sourceContext).toEqual({
      sourceContextType: 'event',
      sourceContextId: 'evt-99',
    });
  });

  it('resets to org_members defaults', () => {
    const { result } = renderHook(() => useComposeRecipientState('org-1'));

    act(() => {
      result.current.setMode('manual');
      result.current.addManualMemberId('member-a');
      result.current.toggleMemberTypeId(3);
      result.current.resetToOrgMembersDefault();
    });

    expect(result.current.mode).toBe('org_members');
    expect(result.current.manualMemberIds).toEqual([]);
    expect(result.current.orgFilters.memberTypeIds).toEqual([]);
  });
});
