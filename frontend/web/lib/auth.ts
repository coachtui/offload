const TOKEN_KEY = 'offload_token';
const COOKIE_NAME = 'offload_token';

/** Persist JWT in both localStorage (client reads) and cookie (middleware reads). */
export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);
  document.cookie = `${COOKIE_NAME}=${token}; path=/; expires=${expires.toUTCString()}; SameSite=Strict`;
}

/** Read JWT from localStorage. Returns null if not set or not in browser. */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

/** Remove JWT from localStorage and clear the cookie. */
export function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = `${COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict`;
}
