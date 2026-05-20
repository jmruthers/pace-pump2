import {
  Card,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  LoadingSpinner,
} from '@solvera/pace-core/components';
import {
  deliveryEventFailureReason,
  formatShortDateTime,
  subjectLine,
} from '@/lib/comms/commsLogFormat.js';
import type { PumpMessageRow } from '@/lib/comms/commsLogTypes.js';
import { useCommsLogDrillDown } from '@/hooks/comms/useCommsLogDrillDown.js';
import { ChannelBadge, MessageStatusBadge, RecipientStatusBadge } from './commsLogBadges.js';
import { CommsLogStatePanel } from './CommsLogStatePanel.js';

function SectionSkeleton() {
  return (
    <section className="grid gap-2" aria-busy="true">
      <LoadingSpinner />
      <LoadingSpinner />
    </section>
  );
}

export function CommsLogDrillDownDialog({
  messageId,
  cachedRow,
  open,
  onOpenChange,
}: {
  messageId: string | null;
  cachedRow: PumpMessageRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    row,
    notFound,
    messageLoadError,
    recipientsQuery,
    eventsQuery,
    retryMessage,
    retryRecipients,
    retryEvents,
  } = useCommsLogDrillDown({ messageId, cachedRow, open });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          {row != null && !notFound ? (
            <>
              <DialogTitle>
                {subjectLine(row.channel, row.subject)}
              </DialogTitle>
              <p>
                <ChannelBadge channel={row.channel} />
              </p>
              <p>
                <MessageStatusBadge status={row.status} />
              </p>
              <>
                <p>Source: {row.source_app ?? '—'}</p>
                <p>Created {formatShortDateTime(row.created_at)}</p>
                {row.scheduled_at != null ? (
                  <p>Scheduled {formatShortDateTime(row.scheduled_at)}</p>
                ) : null}
                {row.sent_at != null ? (
                  <p>Sent {formatShortDateTime(row.sent_at)}</p>
                ) : null}
              </>
            </>
          ) : (
            <DialogTitle>Message details</DialogTitle>
          )}
          <DialogDescription className="sr-only">
            Message details and recipient delivery timeline.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {notFound ? (
            <p>Message not found or not visible.</p>
          ) : messageLoadError ? (
            <CommsLogStatePanel
              message="Couldn't load message details."
              actionLabel="Retry"
              onAction={retryMessage}
            />
          ) : (
            <>
              <section className="grid gap-2">
                <h2>Recipients</h2>
                {recipientsQuery.isLoading ? (
                  <SectionSkeleton />
                ) : recipientsQuery.isError ? (
                  <CommsLogStatePanel
                    message="Couldn't load recipient details."
                    actionLabel="Retry"
                    onAction={retryRecipients}
                  />
                ) : recipientsQuery.data != null && recipientsQuery.data.length === 0 ? (
                  <p>No recipients on this message yet.</p>
                ) : (
                  <Card>
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Address</th>
                          <th scope="col">Member</th>
                          <th scope="col">Status</th>
                          <th scope="col">Delivered at</th>
                          <th scope="col">Engagement</th>
                          <th scope="col">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recipientsQuery.data?.map((recipient) => {
                          const showReason = ['failed', 'bounced', 'suppression_skipped'].includes(
                            recipient.status
                          );
                          return (
                            <tr key={recipient.id}>
                              <td>{recipient.address}</td>
                              <td>{recipient.core_member?.full_name ?? ''}</td>
                              <td>
                                <RecipientStatusBadge status={recipient.status} />
                              </td>
                              <td>
                                {recipient.delivered_at != null
                                  ? formatShortDateTime(recipient.delivered_at)
                                  : '—'}
                              </td>
                              <td>
                                {row?.channel === 'email' ? (
                                  <>
                                    <p>
                                      Opened{' '}
                                      {recipient.opened_at != null
                                        ? formatShortDateTime(recipient.opened_at)
                                        : '—'}
                                    </p>
                                    <p>
                                      Clicked{' '}
                                      {recipient.clicked_at != null
                                        ? formatShortDateTime(recipient.clicked_at)
                                        : '—'}
                                    </p>
                                  </>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td>{showReason ? recipient.failure_reason ?? '' : ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </Card>
                )}
              </section>

              <section className="grid gap-2">
                <h2>Delivery events</h2>
                {eventsQuery.isLoading ? (
                  <SectionSkeleton />
                ) : eventsQuery.isError ? (
                  <CommsLogStatePanel
                    message="Couldn't load delivery events."
                    actionLabel="Retry"
                    onAction={retryEvents}
                  />
                ) : eventsQuery.data != null && eventsQuery.data.length === 0 ? (
                  <p>No delivery events recorded yet.</p>
                ) : (
                  <Card>
                    <ul>
                      {eventsQuery.data?.map((event) => {
                        const address =
                          event.pump_message_recipient?.address ?? '—';
                        const reason = deliveryEventFailureReason(event.raw_payload);
                        return (
                          <li key={event.id}>
                            {formatShortDateTime(event.occurred_at)} — {address} —{' '}
                            {event.event_type} — {event.gateway}
                            {reason != null ? ` — ${reason}` : ''}
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                )}
              </section>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
