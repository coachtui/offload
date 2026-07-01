/**
 * User service - business logic for user operations
 */

import { User } from '../models/User';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../auth/jwt';
import { RateLimiter } from '../utils/rateLimiter';
import { z } from 'zod';

// Validation schemas
export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().trim().max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  accessToken: string;
  refreshToken: string;
}

/**
 * Register a new user
 */
export async function register(input: RegisterInput): Promise<AuthResponse> {
  // Validate input
  registerSchema.parse(input);

  // Check if user already exists
  const existingUser = await User.findByEmail(input.email);
  if (existingUser) {
    throw new Error('User with this email already exists');
  }

  // Create user
  const user = await User.create(input);

  // Generate tokens
  const accessToken = generateAccessToken(user.id, user.email);
  const refreshToken = generateRefreshToken(user.id, user.email);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    accessToken,
    refreshToken,
  };
}

/**
 * Exchange a valid refresh token for a fresh access token plus a new refresh
 * token (sliding session). Throws on wrong token type, expiry, or a deleted
 * user.
 *
 * NOTE: this is NOT rotation with revocation. Tokens are stateless JWTs with no
 * server-side store, so the previous refresh token stays valid until its own
 * expiry. True rotation (invalidate-on-use + reuse detection) would require a
 * persisted refresh-token table — see SECURITY notes before going multi-user.
 */
export async function refreshSession(refreshToken: string): Promise<AuthResponse> {
  const payload = verifyRefreshToken(refreshToken);

  // Ensure the user still exists (handles deleted accounts)
  const user = await User.findById(payload.userId);
  if (!user) {
    throw new Error('User not found');
  }

  const accessToken = generateAccessToken(user.id, user.email);
  const newRefreshToken = generateRefreshToken(user.id, user.email);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    accessToken,
    refreshToken: newRefreshToken,
  };
}

/**
 * Login user
 */
export async function login(input: LoginInput): Promise<AuthResponse> {
  // Validate input
  loginSchema.parse(input);

  // Find user
  const user = await User.findByEmail(input.email);
  if (!user) {
    throw new Error('Invalid email or password');
  }

  // Verify password
  const isValid = await user.verifyPassword(input.password);
  if (!isValid) {
    throw new Error('Invalid email or password');
  }

  // Generate tokens
  const accessToken = generateAccessToken(user.id, user.email);
  const refreshToken = generateRefreshToken(user.id, user.email);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    accessToken,
    refreshToken,
  };
}

// ─── Login attempt limiting (brute-force protection) ─────────────────────────

export const MAX_LOGIN_ATTEMPTS = 5;

/**
 * Tracks failed logins per email (not IP — behind a proxy all clients can share
 * one IP, and per-email is what "attempts left for this account" should mean).
 * A wrong password counts against the window; a success clears it.
 */
export const loginAttemptLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15-minute window
  maxRequests: MAX_LOGIN_ATTEMPTS,
  blockDurationMs: 15 * 60 * 1000, // locked out for 15 minutes once exhausted
});

/** Wrong email/password — carries how many tries remain before lockout. */
export class InvalidCredentialsError extends Error {
  constructor(public attemptsRemaining: number) {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

/** Too many failed attempts — carries seconds until the caller may retry. */
export class LoginLockoutError extends Error {
  constructor(public retryAfterSeconds: number) {
    super('Too many failed login attempts');
    this.name = 'LoginLockoutError';
  }
}

function loginKey(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * login() wrapped with brute-force protection. On bad credentials it records a
 * failure and throws InvalidCredentialsError (with attemptsRemaining); once the
 * window is exhausted it throws LoginLockoutError. A success clears the counter.
 * Validation and other errors pass through untouched (not counted).
 */
export async function loginWithLockout(input: LoginInput): Promise<AuthResponse> {
  const key = loginKey(input.email);

  try {
    const result = await login(input);
    loginAttemptLimiter.reset(key); // clean slate on success
    return result;
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid email or password') {
      const outcome = loginAttemptLimiter.check(key);
      if (!outcome.allowed) {
        throw new LoginLockoutError(outcome.retryAfter ?? 0);
      }
      throw new InvalidCredentialsError(outcome.remaining ?? 0);
    }
    throw error;
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  return user.toJSON();
}
