import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('shows ready platform health on the auth workspace', async () => {
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
    expect(screen.getByRole('heading', { name: /secure workspace access/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /create workspace/i })).not.toBeNull();
  });

  it('shows an unreachable state instead of hiding failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );

    render(<App />);

    expect((await screen.findByRole('status')).textContent).toContain('API unreachable');
  });

  it('registers and displays the active workspace', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/health/ready')) {
        return Promise.resolve(new Response(JSON.stringify({ status: 'ready' }), { status: 200 }));
      }
      if (url.endsWith('/api/v1/auth/register')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              principal: {
                user: {
                  id: 'user-1',
                  email: 'trader@example.com',
                  createdAt: '2026-07-12T00:00:00.000Z',
                },
                workspace: {
                  id: 'workspace-1',
                  name: 'TradeAt Desk',
                  createdAt: '2026-07-12T00:00:00.000Z',
                },
                membership: {
                  userId: 'user-1',
                  workspaceId: 'workspace-1',
                  role: 'owner',
                  createdAt: '2026-07-12T00:00:00.000Z',
                },
                sessionId: 'session-1',
              },
              tokens: {
                accessToken: 'access-token',
                accessExpiresAt: '2026-07-12T00:15:00.000Z',
                refreshToken: 'refresh-token',
                refreshExpiresAt: '2026-08-11T00:00:00.000Z',
              },
            }),
            { status: 201 },
          ),
        );
      }
      if (url.endsWith('/api/v1/me')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              principal: {
                user: {
                  id: 'user-1',
                  email: 'trader@example.com',
                  createdAt: '2026-07-12T00:00:00.000Z',
                },
                workspace: {
                  id: 'workspace-1',
                  name: 'TradeAt Desk',
                  createdAt: '2026-07-12T00:00:00.000Z',
                },
                membership: {
                  userId: 'user-1',
                  workspaceId: 'workspace-1',
                  role: 'owner',
                  createdAt: '2026-07-12T00:00:00.000Z',
                },
                sessionId: 'session-1',
              },
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /create workspace/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'TradeAt Desk' })).not.toBeNull();
    });
    expect(screen.getByText('trader@example.com')).not.toBeNull();
  });
});
