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
    expect(screen.getByRole('heading', { name: /forward paper workspace/i })).not.toBeNull();
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
      if (url.endsWith('/api/v1/instruments')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              instruments: [
                {
                  id: 'nse-nifty50',
                  symbol: 'NIFTY 50',
                  name: 'NIFTY 50 Index',
                  venue: 'NSE',
                  provider_symbol: 'NIFTY',
                  asset_class: 'index',
                  currency: 'INR',
                  timezone: 'Asia/Kolkata',
                  created_at: '2026-07-12T00:00:00.000Z',
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/api/v1/market/bars')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              bars: [
                {
                  instrument_id: 'nse-nifty50',
                  timeframe: '5m',
                  open_time: '2026-07-12T03:55:00.000Z',
                  close_time: '2026-07-12T04:00:00.000Z',
                  open: 24648.3,
                  high: 24668.6,
                  low: 24643.7,
                  close: 24659.8,
                  volume: 194200,
                  source: 'sample-lite',
                  revision: 1,
                  received_at: '2026-07-12T09:20:00.000Z',
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/api/v1/market/status')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: {
                instrument_id: 'nse-nifty50',
                timeframe: '5m',
                status: 'stale',
                latest_bar_at: '2026-07-12T04:00:00.000Z',
                checked_at: '2026-07-12T05:00:00.000Z',
                stale_after_seconds: 900,
                gap_count: 0,
                source: 'sample-lite',
              },
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/api/v1/indicators')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              values: [
                {
                  kind: 'ema',
                  instrument_id: 'nse-nifty50',
                  timeframe: '5m',
                  period: 3,
                  observed_at: '2026-07-12T04:15:00.000Z',
                  value: 24688.2,
                  warmup_bars: 3,
                  input_bars: 6,
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/api/v1/regimes')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              regime: {
                instrument_id: 'nse-nifty50',
                timeframe: '5m',
                observed_at: '2026-07-12T04:15:00.000Z',
                trend: 'uptrend',
                volatility: 'normal',
                atr_percent: 0.12,
                fast_ema: 24688.2,
                slow_ema: 24680.1,
                close: 24701.2,
                reasons: ['Fast EMA 24688.2 vs slow EMA 24680.1 classified trend as uptrend.'],
              },
            }),
            { status: 200 },
          ),
        );
      }
      if (url.endsWith('/api/v1/replays')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              replay: {
                id: 'replay-1',
                instrument_id: 'nse-nifty50',
                timeframe: '5m',
                identity_hash: 'identity',
                status: 'ready',
                cursor: 0,
                event_count: 9,
                replay_time: '2026-07-12T03:20:00.000Z',
                speed: 1,
              },
            }),
            { status: 201 },
          ),
        );
      }
      if (url.includes('/api/v1/replays/replay-1/control')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              replay: {
                id: 'replay-1',
                instrument_id: 'nse-nifty50',
                timeframe: '5m',
                identity_hash: 'identity',
                status: 'completed',
                cursor: 9,
                event_count: 9,
                replay_time: '2026-07-12T04:00:00.000Z',
                speed: 1,
                result: {
                  decision_count: 3,
                  outcome_count: 2,
                  execution_version: '1.0.0',
                  baselines: [],
                },
              },
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/api/v1/statistics?')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              statistics: {
                origin: 'replay',
                definition_version: '1.0.0',
                execution_version: '1.0.0',
                costs_included: true,
                starting_equity: 100000,
                decision_count: 3,
                abstention_count: 0,
                coverage: 1,
                overall: {
                  eligible: false,
                  sample_size: 2,
                  maximum_drawdown: 4,
                  maximum_drawdown_percent: 0.00004,
                  total_costs: 9.8,
                },
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
    expect(await screen.findByText(/sample 5m bars/i)).not.toBeNull();
    expect(await screen.findByText('EMA')).not.toBeNull();
    expect(await screen.findByText(/uptrend \/ normal/i)).not.toBeNull();
    expect(screen.getByText('PAPER')).not.toBeNull();
    expect(screen.getByRole('button', { name: /create paper account/i })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /run historical replay/i }));
    expect(await screen.findByText('More samples required')).not.toBeNull();
    expect(screen.getByText(/3 decisions/i)).not.toBeNull();
  });
});
