// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { NotFoundPage } from './NotFoundPage';

vi.mock('@/lib/logUnmatchedRoute', () => ({
  logUnmatchedRoute: vi.fn(),
}));

import { logUnmatchedRoute } from '@/lib/logUnmatchedRoute';

describe('NotFoundPage', () => {
  it('renders 404 copy, home link, and logs unmatched path (AC-12)', () => {
    const logSpy = vi.mocked(logUnmatchedRoute);

    render(
      <MemoryRouter initialEntries={['/comms/unknown']}>
        <Routes>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: '404' })).toBeTruthy();
    expect(screen.getByText("The page you're looking for doesn't exist.")).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to home' }).getAttribute('href')).toBe('/');

    expect(logSpy).toHaveBeenCalledWith('/comms/unknown');
  });
});
