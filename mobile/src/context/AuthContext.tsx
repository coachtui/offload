import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { LoginRequest, RegisterRequest, AuthResponse } from '../types';
import { apiService, AuthError } from '../services/api';
import { registerPushTokenWithBackend } from '../services/pushRegistration';

interface AuthState {
  user: AuthResponse['user'] | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  handleAuthError: (error: unknown) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Decode a JWT payload without verifying the signature.
 * Used only to check expiry client-side — not for security decisions.
 */
function decodeJwtExpiry(token: string): number | null {
  try {
    const [, payloadB64] = token.split('.');
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json);
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const exp = decodeJwtExpiry(token);
  if (!exp) return false; // can't determine — let the server decide
  return Date.now() / 1000 > exp;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    checkAuthStatus();
  }, []);

  useEffect(() => {
    if (state.isAuthenticated) {
      void registerPushTokenWithBackend();
    }
  }, [state.isAuthenticated]);

  async function checkAuthStatus() {
    try {
      await apiService.init();

      const token = await apiService.getStoredToken();
      console.log('[AuthContext] startup — token present:', !!token);

      if (!token) {
        setState({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      if (isTokenExpired(token)) {
        console.warn('[AuthContext] stored token is expired — clearing');
        await apiService.clearToken();
        setState({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      console.log('[AuthContext] token looks valid — marking authenticated');
      setState({ user: null, isAuthenticated: true, isLoading: false });
    } catch (error) {
      console.error('[AuthContext] checkAuthStatus failed:', error);
      setState({ user: null, isAuthenticated: false, isLoading: false });
    }
  }

  /**
   * Call this anywhere an AuthError is thrown (e.g. from useSessions, useDeepgramTranscription).
   * Forces the app back to the login screen and clears the stale token.
   */
  const handleAuthError = useCallback((error: unknown) => {
    if (error instanceof AuthError) {
      console.warn('[AuthContext] AuthError received — forcing logout:', error.message);
      apiService.clearToken().then(() => {
        setState({ user: null, isAuthenticated: false, isLoading: false });
      });
    }
  }, []);

  async function login(credentials: LoginRequest) {
    const response = await apiService.login(credentials);
    console.log('[AuthContext] login success');
    setState({
      user: response.user,
      isAuthenticated: true,
      isLoading: false,
    });
  }

  async function register(data: RegisterRequest) {
    const response = await apiService.register(data);
    setState({
      user: response.user,
      isAuthenticated: true,
      isLoading: false,
    });
  }

  async function logout() {
    await apiService.logout();
    setState({ user: null, isAuthenticated: false, isLoading: false });
  }

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        handleAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
