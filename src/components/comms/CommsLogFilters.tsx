import {
  Button,
  DatePickerWithTimezone,
  MultiSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@solvera/pace-core/components';
import type { CommChannel, CommMessageStatus } from '@solvera/pace-core/comms';
import { RefreshCcw } from '@solvera/pace-core/icons';
import { dateYmdFromDate } from '@/lib/comms/commsLogSearchParams.js';
import { MESSAGE_STATUS_OPTIONS } from '@/lib/comms/commsLogTypes.js';
import type { CommsLogSearchState } from '@/lib/comms/commsLogTypes.js';

export function CommsLogFilters({
  state,
  onChannelChange,
  onStatusesChange,
  onFromChange,
  onToChange,
  onRefresh,
  isRefreshing,
}: {
  state: CommsLogSearchState;
  onChannelChange: (channel: CommChannel | null) => void;
  onStatusesChange: (statuses: CommMessageStatus[]) => void;
  onFromChange: (from: string | null) => void;
  onToChange: (to: string | null) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const channelValue = state.channel ?? 'all';

  return (
    <nav className="grid grid-flow-col auto-cols-max gap-3 max-w-full overflow-x-auto">
      <Select
        value={channelValue}
        onValueChange={(value) => {
          if (value === 'all') {
            onChannelChange(null);
            return;
          }
          onChannelChange(value as CommChannel);
        }}
      >
        <SelectTrigger className="w-full min-w-[10rem] sm:w-40">
          <SelectValue placeholder="All channels" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All channels</SelectItem>
          <SelectItem value="email">Email</SelectItem>
          <SelectItem value="sms">SMS</SelectItem>
        </SelectContent>
      </Select>

      <MultiSelect
        className="w-full min-w-[11rem] sm:w-44"
        placeholder="All statuses"
        options={MESSAGE_STATUS_OPTIONS}
        value={state.statuses}
        onValueChange={(values) =>
          onStatusesChange(values as CommMessageStatus[])
        }
      />

      <DatePickerWithTimezone
        placeholder="From"
        value={state.from != null ? new Date(`${state.from}T12:00:00`) : null}
        onChange={(date) => onFromChange(dateYmdFromDate(date))}
      />

      <DatePickerWithTimezone
        placeholder="To"
        value={state.to != null ? new Date(`${state.to}T12:00:00`) : null}
        onChange={(date) => onToChange(dateYmdFromDate(date))}
      />

      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Refresh"
        disabled={isRefreshing}
        onClick={onRefresh}
      >
        <RefreshCcw aria-hidden size={16} />
      </Button>
    </nav>
  );
}
