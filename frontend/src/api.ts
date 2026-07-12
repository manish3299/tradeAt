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
