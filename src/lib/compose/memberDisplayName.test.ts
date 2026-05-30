/** PU05 — manual member picker display names */
import { describe, expect, it } from 'vitest';
import { formatMemberDisplayName } from './memberDisplayName.js';

describe('formatMemberDisplayName', () => {
  it('uses preferred name when set', () => {
    expect(
      formatMemberDisplayName({
        preferred_name: 'Alex',
        first_name: 'Alexander',
        last_name: 'Smith',
      })
    ).toBe('Alex Smith');
  });

  it('falls back to first name when preferred name is blank', () => {
    expect(
      formatMemberDisplayName({
        preferred_name: '   ',
        first_name: 'Alexander',
        last_name: 'Smith',
      })
    ).toBe('Alexander Smith');
  });

  it('trims whitespace from names', () => {
    expect(
      formatMemberDisplayName({
        preferred_name: null,
        first_name: '  Jane  ',
        last_name: '  Doe  ',
      })
    ).toBe('Jane Doe');
  });
});
