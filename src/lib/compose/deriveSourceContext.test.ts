import { describe, expect, it } from 'vitest';
import { deriveSourceContext } from './deriveSourceContext';

describe('deriveSourceContext', () => {
  it('returns event context for event_participants with selected event', () => {
    expect(deriveSourceContext('event_participants', 'evt-1')).toEqual({
      sourceContextType: 'event',
      sourceContextId: 'evt-1',
    });
  });

  it('returns undefined context for org_members', () => {
    expect(deriveSourceContext('org_members', null)).toEqual({
      sourceContextType: undefined,
      sourceContextId: undefined,
    });
  });

  it('returns undefined context for manual', () => {
    expect(deriveSourceContext('manual', null)).toEqual({
      sourceContextType: undefined,
      sourceContextId: undefined,
    });
  });
});
