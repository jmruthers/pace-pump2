import { useEffect, useState } from 'react';
import { Button, Input, Label } from '@solvera/pace-core/components';
import { useManualMemberSearch } from '@/hooks/compose/useManualMemberSearch';

export interface ManualMemberChip {
  id: string;
  label: string;
}

export interface ManualMemberPickerProps {
  organisationId: string;
  selectedMembers: ManualMemberChip[];
  onAddMember: (member: ManualMemberChip) => void;
  onRemoveMember: (memberId: string) => void;
}

export function ManualMemberPicker({
  organisationId,
  selectedMembers,
  onAddMember,
  onRemoveMember,
}: ManualMemberPickerProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  const { data: options = [] } = useManualMemberSearch(organisationId, debouncedQuery);

  const selectedIds = new Set(selectedMembers.map((member) => member.id));
  const suggestions = options.filter((option) => !selectedIds.has(option.id));

  return (
    <section className="grid gap-4">
      <Label htmlFor="manual-member-search">
        Search and add members
        <Input
          id="manual-member-search"
          value={query}
          onChange={setQuery}
          placeholder="Search and add members"
        />
      </Label>
      {suggestions.length > 0 ? (
        <menu className="grid gap-2 p-0">
          {suggestions.map((option) => (
            <li key={option.id}>
              <Button
                type="button"
                variant="outline"
                size="small"
                onClick={() => {
                  onAddMember(option);
                  setQuery('');
                }}
              >
                {option.label}
              </Button>
            </li>
          ))}
        </menu>
      ) : null}
      {selectedMembers.length > 0 ? (
        <>
          <menu className="grid auto-cols-max grid-flow-col gap-2 p-0">
            {selectedMembers.map((member) => (
              <li key={member.id}>
                <Button type="button" variant="default" size="small">
                  {member.label}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${member.label}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveMember(member.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onRemoveMember(member.id);
                      }
                    }}
                  >
                    ×
                  </span>
                </Button>
              </li>
            ))}
          </menu>
          <p>{selectedMembers.length} members selected</p>
        </>
      ) : null}
    </section>
  );
}
