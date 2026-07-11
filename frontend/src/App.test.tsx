import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('App', () => {
  it('shows ready platform health', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ status: 'ready', checkedAt: '2026-07-11T00:00:00.000Z' }), {
            status: 200,
          }),
        ),
      ),
    );
    render(<App />);
    expect((await screen.findByRole('status')).textContent).toContain('Platform ready');
    expect(screen.getByRole('heading', { name: /market context/i })).not.toBeNull();
  });
  it('shows an unreachable state instead of hiding failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    render(<App />);
    expect((await screen.findByRole('status')).textContent).toContain('API unreachable');
  });
});
