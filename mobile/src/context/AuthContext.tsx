import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { LoginRequest, RegisterRequest, AuthResponse } from '../types';
import { apiService } from '../services/api';

interface AuthState {
  user: AuthResponse['user'] | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

  async function checkAuthStatus() {
    try {
      const token = await apiService.getStoredToken();
      if (token) {
        apiService.setToken(token);
        setState({
          user: null, // Could fetch user profile here
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } catch (error) {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  }

  async function login(credentials: LoginRequest) {
    const response = await apiService.login(credentials);
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
    setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
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
