const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  'https://brain-dump-production-895b.up.railway.app';

async function apiFetch<T>(
  path: string,
  options?: RequestInit & { token?: string }
): Promise<T> {
  const { token, headers: extraHeaders, ...rest } = options ?? {};

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extraHeaders as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? body.message ?? `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

// ─── Auth endpoints ────────────────────────────────────────────────────────

export interface AuthResponse {
  user: { id: string; email: string; name?: string };
  accessToken: string;
  refreshToken: string;
}

export function apiLogin(email: string, password: string): Promise<AuthResponse> {
  return apiFetch('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function apiRegister(data: {
  email: string;
  password: string;
  name?: string;
}): Promise<AuthResponse> {
  return apiFetch('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function apiGetMe(token: string): Promise<{ id: string; email: string; name?: string }> {
  return apiFetch('/api/v1/auth/me', { token });
}
