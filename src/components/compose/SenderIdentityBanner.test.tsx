// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SenderIdentityBanner } from './SenderIdentityBanner';
import type { EffectivePumpSenderIdentity } from '@/lib/comms/senderIdentityContract';

const identity: EffectivePumpSenderIdentity = {
  organisationId: 'org-1',
  resolvedOrganisationId: 'org-1',
  senderName: 'Org Comms',
  fromAddress: 'comms@example.org',
  senderPhone: null,
  replyToAddress: null,
  resolvedFrom: 'organisation',
  canSendEmail: true,
  canSendSms: false,
};

describe('SenderIdentityBanner', () => {
  afterEach(cleanup);

  it('shows resolved sender copy for email channel', () => {
    render(
      <SenderIdentityBanner channel="email" identity={identity} isLoading={false} errorMessage={null} />
    );
    expect(screen.getByText(/Sending as Org Comms from comms@example.org/)).toBeTruthy();
    expect(
      screen.getByText(/Sender identity is resolved automatically/)
    ).toBeTruthy();
  });

  it('shows email unavailable alert when canSendEmail is false', () => {
    render(
      <SenderIdentityBanner
        channel="email"
        identity={{
          ...identity,
          fromAddress: null,
          canSendEmail: false,
        }}
        isLoading={false}
        errorMessage={null}
      />
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Email is unavailable');
    expect(alert.textContent).toContain(
      'no sender address is configured for this organisation'
    );
  });

  it('shows resolving copy while loading', () => {
    render(
      <SenderIdentityBanner channel="email" identity={null} isLoading errorMessage={null} />
    );
    expect(screen.getByText('Resolving sender identity…')).toBeTruthy();
  });
});
