export type ApiHealth = Readonly<{
  state: 'ready' | 'degraded' | 'unreachable';
  checkedAt?: string;
}>;

export async function fetchApiHealth(signal?: AbortSignal): Promise<ApiHealth> {
  const configuredUrl: unknown = import.meta.env['VITE_API_URL'];
  const baseUrl = typeof configuredUrl === 'string' ? configuredUrl : 'http://127.0.0.1:3000';
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
