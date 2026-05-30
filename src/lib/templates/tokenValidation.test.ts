/** PU04 — malformed merge token syntax */
import { describe, expect, it } from 'vitest';
import { hasMalformedMergeTokens } from './tokenValidation.js';

describe('tokenValidation', () => {
  describe('hasMalformedMergeTokens', () => {
    it.each([
      ['Hello {{first_name}}', false],
      ['No tokens here', false],
      ['{{unclosed', true],
      ['{{ bad token }}', true],
      ['{{}}', true],
    ])('"%s" → %s', (value, expected) => {
      expect(hasMalformedMergeTokens(value)).toBe(expected);
    });
  });
});
