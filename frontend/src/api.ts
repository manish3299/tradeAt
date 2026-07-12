export type ApiHealth = Readonly<{
  state: 'ready' | 'degraded' | 'unreachable';
  checkedAt?: string;
}>;

export type Principal = Readonly<{
  user: { id: string; email: string; createdAt: string };
  workspace: { id: string; name: string; createdAt: string };
  membership: { userId: string; workspaceId: string; role: 'owner' | 'member'; createdAt: string };
  sessionId: string;
}>;

export type AuthSession = Readonly<{
  principal: Principal;
  tokens: {
    accessToken: string;
    accessExpiresAt: string;
    refreshToken: string;
    refreshExpiresAt: string;
  };
}>;

export type Instrument = Readonly<{
  id: string;
  symbol: string;
  name: string;
  venue: string;
  provider_symbol: string;
  asset_class: string;
  currency: string;
  timezone: string;
  created_at: string;
}>;

export type MarketBar = Readonly<{
  instrument_id: string;
  timeframe: string;
  open_time: string;
  close_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: string;
  revision: number;
  received_at: string;
}>;

export type MarketStatus = Readonly<{
  instrument_id: string;
  timeframe: string;
  status: 'fresh' | 'stale' | 'empty';
  latest_bar_at?: string;
  checked_at: string;
  stale_after_seconds: number;
  gap_count: number;
  source: string;
}>;

export type IndicatorValue = Readonly<{
  kind: 'ema' | 'rsi' | 'atr';
  instrument_id: string;
  timeframe: string;
  period: number;
  observed_at: string;
  value: number;
  warmup_bars: number;
  input_bars: number;
}>;

export type RegimeClassification = Readonly<{
  instrument_id: string;
  timeframe: string;
  observed_at: string;
  trend: 'uptrend' | 'downtrend' | 'sideways' | 'unknown';
  volatility: 'low' | 'normal' | 'high' | 'unknown';
  atr_percent?: number;
  fast_ema?: number;
  slow_ema?: number;
  close?: number;
  reasons: readonly string[];
}>;

const configuredUrl: unknown = import.meta.env['VITE_API_URL'];
const baseUrl = typeof configuredUrl === 'string' ? configuredUrl : 'http://127.0.0.1:3000';

export async function fetchApiHealth(signal?: AbortSignal): Promise<ApiHealth> {
  try {
    const response = await fetch(`${baseUrl}/health/ready`, signal ? { signal } : undefined);
    const body = (await response.json()) as { status?: string; checkedAt?: string };
    return {
      state: response.ok && body.status === 'ready' ? 'ready' : 'degraded',
      ...(body.checkedAt ? { checkedAt: body.checkedAt } : {}),
    };
  } catch {
    return { state: 'unreachable' };
  }
}

export async function registerAccount(input: {
  email: string;
  password: string;
  workspaceName: string;
}): Promise<AuthSession> {
  return postJson<AuthSession>('/api/v1/auth/register', input);
}

export async function login(input: { email: string; password: string }): Promise<AuthSession> {
  return postJson<AuthSession>('/api/v1/auth/login', input);
}

export async function logout(refreshToken: string): Promise<void> {
  await postJson('/api/v1/auth/logout', { refreshToken });
}

export async function fetchMe(accessToken: string): Promise<Principal> {
  const response = await fetch(`${baseUrl}/api/v1/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  const body = (await response.json()) as { principal: Principal };
  return body.principal;
}

export async function fetchInstruments(): Promise<readonly Instrument[]> {
  const response = await fetch(`${baseUrl}/api/v1/instruments`);
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  const body = (await response.json()) as { instruments: Instrument[] };
  return body.instruments;
}

export async function fetchMarketBars(instrumentId: string): Promise<readonly MarketBar[]> {
  const params = new URLSearchParams({
    instrument_id: instrumentId,
    timeframe: '5m',
    limit: '3',
  });
  const response = await fetch(`${baseUrl}/api/v1/market/bars?${params.toString()}`);
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  const body = (await response.json()) as { bars: MarketBar[] };
  return body.bars;
}

export async function fetchMarketStatus(instrumentId: string): Promise<MarketStatus> {
  const params = new URLSearchParams({ instrument_id: instrumentId, timeframe: '5m' });
  const response = await fetch(`${baseUrl}/api/v1/market/status?${params.toString()}`);
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  const body = (await response.json()) as { status: MarketStatus };
  return body.status;
}

export async function fetchIndicators(instrumentId: string): Promise<readonly IndicatorValue[]> {
  const params = new URLSearchParams({
    instrument_id: instrumentId,
    timeframe: '5m',
    as_of: '2026-07-12T04:15:00.000Z',
    ema_period: '3',
    rsi_period: '3',
    atr_period: '3',
  });
  const response = await fetch(`${baseUrl}/api/v1/indicators?${params.toString()}`);
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  const body = (await response.json()) as { values: IndicatorValue[] };
  return body.values;
}

export async function fetchRegime(instrumentId: string): Promise<RegimeClassification> {
  const params = new URLSearchParams({
    instrument_id: instrumentId,
    timeframe: '5m',
    as_of: '2026-07-12T04:15:00.000Z',
  });
  const response = await fetch(`${baseUrl}/api/v1/regimes?${params.toString()}`);
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  const body = (await response.json()) as { regime: RegimeClassification };
  return body.regime;
}

async function postJson<TResponse = unknown>(
  path: string,
  payload: Record<string, string>,
): Promise<TResponse> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  return (await response.json()) as TResponse;
}
