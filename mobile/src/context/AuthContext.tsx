import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { LoginRequest, RegisterRequest, AuthResponse } from '../types';
import { apiService, AuthError } from '../services/api';
import { registerPushTokenWithBackend } from '../services/pushRegistration';
import { geofenceMonitoringService } from '../services/geofenceMonitoringService';
import { resetPermissionOnboarding } from '../services/permissionService';
import { releaseAll, syncTimeRemindersWithOS } from '../services/timeReminderSync';

interface AuthState {
  user: AuthResponse['user'] | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
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
      // The app-active sync already ran (and was throttled) before there was a
      // session, so without this the device owns nothing until the throttle
      // lapses — every reminder would go out as a push for the first 5 minutes.
      void syncTimeRemindersWithOS('signed-in');
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
      // Rehydrate the user (incl. display name) so the greeting survives restart.
      let user: AuthState['user'] = null;
      try {
        const me = await apiService.getMe();
        user = me.user;
      } catch (err) {
        console.warn('[AuthContext] getMe on restore failed (non-fatal):', err);
      }
      setState({ user, isAuthenticated: true, isLoading: false });
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
      // Same teardown as an explicit logout — a forced sign-out must not leave
      // the previous account's regions registered with the OS either.
      geofenceMonitoringService
        .teardownForSignOut()
        .catch(e => console.warn('[AuthContext] geofence teardown failed:', e))
        // Dated reminders sit in the OS the same way regions do. Never throws;
        // the hand-back POST will fail on an already-dead token, which is fine —
        // the next sign-in re-syncs, and cancelling locally is the urgent half.
        .then(() => releaseAll('forced-sign-out'))
        .then(() => resetPermissionOnboarding())
        .catch(e => console.warn('[AuthContext] permission reset failed:', e))
        .then(() => apiService.clearToken())
        .then(() => {
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
    // Tear down geofences BEFORE dropping the token: OS region registrations
    // outlive the session, so without this the next account inherits them.
    await geofenceMonitoringService.teardownForSignOut();
    // Locally scheduled reminders outlive the session too, and this runs while
    // the token is still valid so the server takes them back cleanly.
    await releaseAll('sign-out');
    // Clear the "already onboarded" flags too — they're device-local, so without
    // this the next account to sign in on this phone silently skips the ladder.
    await resetPermissionOnboarding();
    await apiService.logout();
    setState({ user: null, isAuthenticated: false, isLoading: false });
  }

  /**
   * Delete the account on the server, then tear the device down exactly as a
   * sign-out would.
   *
   * The server call goes first: if it fails (wrong password, no network) the
   * session must survive untouched so the user can retry. Once it succeeds the
   * teardown is unconditional — the account no longer exists, so leaving this
   * phone's regions registered or its onboarding flags set would strand state
   * belonging to nobody.
   */
  async function deleteAccount(password: string) {
    await apiService.deleteAccount(password);

    await geofenceMonitoringService
      .teardownForSignOut()
      .catch(e => console.warn('[AuthContext] geofence teardown after delete failed:', e));
    await resetPermissionOnboarding().catch(e =>
      console.warn('[AuthContext] permission reset after delete failed:', e)
    );
    await apiService.clearToken();
    setState({ user: null, isAuthenticated: false, isLoading: false });
  }

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        deleteAccount,
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
