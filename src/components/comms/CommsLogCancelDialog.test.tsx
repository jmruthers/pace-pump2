// @vitest-environment happy-dom
/** PUMP-02 QA S-11 — cancel confirmation dialog */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { setupUser } from '@test-utils';
import { CommsLogCancelDialog } from './CommsLogCancelDialog.js';

vi.mock('@solvera/pace-core/components', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solvera/pace-core/components')>();
  return {
    ...actual,
    Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <aside>{children}</aside> : null,
    DialogBody: ({ children }: { children: ReactNode }) => <section>{children}</section>,
    DialogContent: ({ children }: { children: ReactNode }) => <>{children}</>,
    DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
    DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
    DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    LoadingSpinner: () => <output aria-busy="true">Loading</output>,
  };
});

const row = {
  id: 'msg-1',
  channel: 'email' as const,
  subject: 'Weekly update',
  organisation_id: 'org-1',
};

describe('CommsLogCancelDialog', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders title, subject, and action labels', () => {
    render(
      <CommsLogCancelDialog
        row={row}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isPending={false}
      />
    );

    expect(screen.getByText('Cancel scheduled message?')).toBeTruthy();
    expect(screen.getByText('Weekly update')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep scheduled' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel message' })).toBeTruthy();
  });

  it('calls onConfirm when cancel message is clicked', async () => {
    const user = setupUser();
    const onConfirm = vi.fn();

    render(
      <CommsLogCancelDialog
        row={row}
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
        isPending={false}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Cancel message' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('dismisses via keep scheduled and disables actions while pending', async () => {
    const user = setupUser();
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <CommsLogCancelDialog
        row={row}
        open
        onOpenChange={onOpenChange}
        onConfirm={vi.fn()}
        isPending={false}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Keep scheduled' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    rerender(
      <CommsLogCancelDialog
        row={row}
        open
        onOpenChange={onOpenChange}
        onConfirm={vi.fn()}
        isPending
      />
    );

    expect(screen.getByRole('button', { name: 'Keep scheduled' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Loading' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('returns null when row is missing', () => {
    const { container } = render(
      <CommsLogCancelDialog
        row={null}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isPending={false}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
