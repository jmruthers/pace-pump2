/* eslint-disable pace-core-compliance/prefer-pace-core-components -- test doubles */
// @vitest-environment happy-dom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useCommsLogSearchParams } from './useCommsLogSearchParams.js';

function SearchHarness() {
  const { state, setMessageId } = useCommsLogSearchParams();
  return (
    <div>
      <output data-testid="message-id">{state.messageId ?? ''}</output>
      <button type="button" onClick={() => setMessageId(null)}>
        Clear message
      </button>
    </div>
  );
}

describe('useCommsLogSearchParams', () => {
  it('clears the message param while preserving other filters', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [{ path: '/', element: <SearchHarness /> }],
      { initialEntries: ['/?message=msg-abc&channel=email'] }
    );
    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole('button', { name: 'Clear message' }));

    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.has('message')).toBe(false);
      expect(params.get('channel')).toBe('email');
    });
    expect(screen.getByTestId('message-id').textContent).toBe('');
  });
});
