// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from '@solvera/pace-core/components';
import { useCommsLogSearchParams } from './useCommsLogSearchParams.js';

const MESSAGE_UUID = '550e8400-e29b-41d4-a716-446655440000';

function SearchHarness({ mode }: { mode: 'clear' | 'set' }) {
  const { state, setMessageId } = useCommsLogSearchParams();
  return (
    <div>
      <output data-testid="message-id">{state.messageId ?? ''}</output>
      {mode === 'clear' ? (
        <Button type="button" onClick={() => setMessageId(null)}>
          Clear message
        </Button>
      ) : (
        <Button type="button" onClick={() => setMessageId(MESSAGE_UUID)}>
          Set message
        </Button>
      )}
    </div>
  );
}

describe('useCommsLogSearchParams', () => {
  afterEach(() => {
    cleanup();
  });

  it('clears the message param while preserving other filters', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [{ path: '/', element: <SearchHarness mode="clear" /> }],
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

  it('sets the message param in the URL', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [{ path: '/', element: <SearchHarness mode="set" /> }],
      { initialEntries: ['/?channel=email'] }
    );
    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole('button', { name: 'Set message' }));

    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get('message')).toBe(MESSAGE_UUID);
      expect(params.get('channel')).toBe('email');
    });
    expect(screen.getByTestId('message-id').textContent).toBe(MESSAGE_UUID);
  });
});
