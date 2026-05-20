import { describe, expect, it } from 'vitest';
import { deriveBodyTextFromHtml } from './deriveBodyTextFromHtml';

describe('deriveBodyTextFromHtml', () => {
  it('strips HTML tags and collapses whitespace (PU04 §12 #2)', () => {
    const html = '<p>Hello <strong>{{first_name}}</strong>!</p>';
    expect(deriveBodyTextFromHtml(html)).toBe('Hello {{first_name}} !');
  });

  it('collapses multiple spaces and trims', () => {
    expect(deriveBodyTextFromHtml('  <div>  one   <span>two</span>  </div>  ')).toBe('one two');
  });
});
