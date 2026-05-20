export const MALFORMED_MERGE_TOKEN_PATTERN =
  /\{\{(?!\s*[a-zA-Z0-9_.-]+\s*\}\})[^}]*?\}\}|\{\{[^}]*$/;

export const MERGE_TOKEN_SHAPE_MESSAGE =
  'Merge tokens must be in the form {{token_name}}.';

export function hasMalformedMergeTokens(value: string): boolean {
  return MALFORMED_MERGE_TOKEN_PATTERN.test(value);
}
