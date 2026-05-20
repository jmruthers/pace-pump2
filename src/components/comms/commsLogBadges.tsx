import { Badge } from '@solvera/pace-core/components';
import type { CommChannel, CommMessageStatus, CommRecipientStatus } from '@solvera/pace-core/comms';
import { Mail, Phone } from '@solvera/pace-core/icons';

export function ChannelBadge({ channel }: { channel: CommChannel }) {
  if (channel === 'sms') {
    return (
      <Badge variant="solid-sec-muted">
        <Phone aria-hidden size={14} />
        SMS
      </Badge>
    );
  }
  return (
    <Badge variant="solid-sec-muted">
      <Mail aria-hidden size={14} />
      Email
    </Badge>
  );
}

export function MessageStatusBadge({ status }: { status: CommMessageStatus }) {
  switch (status) {
    case 'draft':
      return <Badge variant="outline-sec-muted">Draft</Badge>;
    case 'scheduled':
      return <Badge variant="outline-main-muted">Scheduled</Badge>;
    case 'sending':
      return <Badge variant="solid-main-muted">Sending</Badge>;
    case 'sent':
      return <Badge variant="solid-main-normal">Sent</Badge>;
    case 'cancelled':
      return <Badge variant="outline-sec-muted">Cancelled</Badge>;
    case 'failed':
      return <Badge variant="solid-acc-strong">Failed</Badge>;
    default:
      return <Badge variant="outline-sec-muted">{status}</Badge>;
  }
}

export function RecipientStatusBadge({ status }: { status: CommRecipientStatus }) {
  switch (status) {
    case 'pending':
      return <Badge variant="outline-sec-muted">Pending</Badge>;
    case 'queued':
      return <Badge variant="outline-main-muted">Queued</Badge>;
    case 'delivered':
      return <Badge variant="solid-main-normal">Delivered</Badge>;
    case 'bounced':
      return <Badge variant="solid-acc-strong">Bounced</Badge>;
    case 'failed':
      return <Badge variant="solid-acc-strong">Failed</Badge>;
    case 'suppression_skipped':
      return <Badge variant="outline-sec-muted">Skipped (suppressed)</Badge>;
    default:
      return <Badge variant="outline-sec-muted">{status}</Badge>;
  }
}
