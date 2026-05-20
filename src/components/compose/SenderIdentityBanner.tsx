import type { CommChannel } from '@solvera/pace-core/comms';
import { Alert, AlertDescription, AlertTitle, Card, CardContent } from '@solvera/pace-core/components';
import type { EffectivePumpSenderIdentity } from '@/lib/comms/senderIdentityContract';
import { deriveChannelReadiness } from '@/lib/comms/senderIdentityContract';

export interface SenderIdentityBannerProps {
  channel: CommChannel;
  identity: EffectivePumpSenderIdentity | null;
  isLoading: boolean;
  errorMessage: string | null;
}

export function SenderIdentityBanner({
  channel,
  identity,
  isLoading,
  errorMessage,
}: SenderIdentityBannerProps) {
  const readiness = identity != null ? deriveChannelReadiness(identity) : null;
  const channelUnavailable =
    readiness != null &&
    ((channel === 'email' && !readiness.canSendEmail) ||
      (channel === 'sms' && !readiness.canSendSms));

  return (
    <section className="grid gap-4">
      <Card>
        <CardContent>
          {isLoading ? (
            <p>Resolving sender identity…</p>
          ) : identity != null ? (
            <p>
              {channel === 'email' ? (
                <>
                  Sending as {identity.senderName} from {identity.fromAddress} · resolved from{' '}
                  {identity.resolvedFrom}
                </>
              ) : (
                <>
                  Sending as {identity.senderName} from {identity.senderPhone} · resolved from{' '}
                  {identity.resolvedFrom}
                </>
              )}
            </p>
          ) : null}
          <p>Sender identity is resolved automatically from your organisation&apos;s settings.</p>
        </CardContent>
      </Card>

      {errorMessage != null ? (
        <Alert variant="destructive">
          <AlertTitle>Sender identity could not be resolved</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {channelUnavailable && channel === 'email' ? (
        <Alert variant="destructive">
          <AlertTitle>Email is unavailable</AlertTitle>
          <AlertDescription>
            Email is unavailable — no sender address is configured for this organisation. Contact
            a platform administrator.
          </AlertDescription>
        </Alert>
      ) : null}

      {channelUnavailable && channel === 'sms' ? (
        <Alert variant="destructive">
          <AlertTitle>SMS is unavailable</AlertTitle>
          <AlertDescription>
            SMS is unavailable — no sender phone is configured for this organisation. Contact a
            platform administrator.
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
