// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@test-utils';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from '@solvera/pace-core/components';
import { useCommsLogSearchParams } from './useCommsLogSearchParams.js';

const MESSAGE_UUID = '550e8400-e29b-41d4-a716-446655440000';

function SearchHarness({ mode }: { mode: 'clear' | 'set' | 'sync' }) {
  const { state, setMessageId, syncFromTable } = useCommsLogSearchParams();
  return (
    <div>
      <output data-testid="message-id">{state.messageId ?? ''}</output>
      <output data-testid="page-index">{state.pageIndex}</output>
      {mode === 'clear' ? (
        <Button type="button" onClick={() => setMessageId(null)}>
          Clear message
        </Button>
      ) : null}
      {mode === 'set' ? (
        <Button type="button" onClick={() => setMessageId(MESSAGE_UUID)}>
          Set message
        </Button>
      ) : null}
      {mode === 'sync' ? (
        <>
          <Button type="button" onClick={() => syncFromTable({ pageIndex: 2 })}>
            Sync page
          </Button>
          <Button type="button" onClick={() => syncFromTable({ pageIndex: 0 })}>
            Sync unchanged
          </Button>
        </>
      ) : null}
    </div>
  );
}

describe('useCommsLogSearchParams', () => {
  afterEach(() => {
    cleanup();
  });

  it('clears the message param while preserving other filters', async () => {
    const user = setupUser();
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
    const user = setupUser();
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

  it('syncFromTable updates pageIndex in the URL (S-06)', async () => {
    const user = setupUser();
    const router = createMemoryRouter(
      [{ path: '/', element: <SearchHarness mode="sync" /> }],
      { initialEntries: ['/?channel=email'] }
    );
    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole('button', { name: 'Sync page' }));

    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get('pageIndex')).toBe('2');
      expect(params.get('channel')).toBe('email');
    });
    expect(screen.getByTestId('page-index').textContent).toBe('2');
  });

  it('syncFromTable is a no-op when the built search string is unchanged (S-06)', async () => {
    const user = setupUser();
    const router = createMemoryRouter(
      [{ path: '/', element: <SearchHarness mode="sync" /> }],
      { initialEntries: ['/?channel=email'] }
    );
    render(<RouterProvider router={router} />);

    const searchBefore = router.state.location.search;
    await user.click(screen.getByRole('button', { name: 'Sync unchanged' }));

    expect(router.state.location.search).toBe(searchBefore);
    expect(screen.getByTestId('page-index').textContent).toBe('0');
  });
});
