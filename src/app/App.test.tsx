import { render, screen } from '@testing-library/react';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router/routes';

function RoutesRenderer() {
  return useRoutes(routes);
}

/**
 * The route table is rendered through a memory router rather than the browser
 * data router: identical route matching, without jsdom's fetch/AbortSignal
 * mismatch during navigation.
 */
function renderAt(path: string) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <RoutesRenderer />
      </MemoryRouter>
    </AppProviders>,
  );
}

describe('application shell', () => {
  it('renders the dashboard inside the app layout', async () => {
    renderAt('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.getByText('Build roadmap')).toBeInTheDocument();
  });

  it('redirects the root path to the dashboard', async () => {
    renderAt('/');

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
  });

  it('shows a placeholder for modules that are not implemented', async () => {
    renderAt('/customers');

    expect(
      await screen.findByRole('heading', { name: 'Customer Management', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Not implemented')).toBeInTheDocument();
  });

  it('renders the sign-in screen in the auth layout', async () => {
    renderAt('/login');

    expect(await screen.findByText('Sign in')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
  });

  it('renders a 404 page for unknown routes', async () => {
    renderAt('/this-route-does-not-exist');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
