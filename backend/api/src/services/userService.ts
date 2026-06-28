/**
 * User service - business logic for user operations
 */

import { User } from '../models/User';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../auth/jwt';
import { z } from 'zod';

// Validation schemas
export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export interface RegisterInput {
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
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
    },
    accessToken,
    refreshToken,
  };
}

/**
 * Exchange a valid refresh token for a fresh access token (and a rotated
 * refresh token). Throws on wrong token type, expiry, or a deleted user.
 */
export async function refreshSession(refreshToken: string): Promise<AuthResponse> {
  const payload = verifyRefreshToken(refreshToken);

  // Ensure the user still exists (handles deleted accounts)
  const user = await User.findById(payload.userId);
  if (!user) {
    throw new Error('User not found');
  }

  const accessToken = generateAccessToken(user.id, user.email);
  const rotatedRefreshToken = generateRefreshToken(user.id, user.email);

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    accessToken,
    refreshToken: rotatedRefreshToken,
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
    },
    accessToken,
    refreshToken,
  };
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
