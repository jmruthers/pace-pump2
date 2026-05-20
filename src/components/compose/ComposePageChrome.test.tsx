// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ComposePageChrome } from './ComposePageChrome';

describe('ComposePageChrome', () => {
  afterEach(cleanup);

  it('renders breadcrumb, back link, heading, and subtitle', () => {
    render(
      <MemoryRouter>
        <ComposePageChrome organisationName="Demo Org" />
      </MemoryRouter>
    );
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Comms log' }).getAttribute('href')).toBe('/');
    expect(screen.getAllByText('Compose').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('link', { name: 'Back to comms log' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('heading', { name: 'Compose' })).toBeTruthy();
    expect(screen.getByText('Send a message to members of Demo Org')).toBeTruthy();
  });
});
