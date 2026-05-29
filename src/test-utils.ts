import userEvent from '@testing-library/user-event';

/** Fast userEvent for integration tests (no artificial typing delay). */
export function setupUser() {
  return userEvent.setup({ delay: null });
}
