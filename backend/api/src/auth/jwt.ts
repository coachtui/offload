/**
 * JWT authentication utilities
 */

import jwt, { SignOptions } from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    'JWT_SECRET environment variable is not set. ' +
    'Set it in Railway environment variables (Settings → Variables) or in backend/api/.env for local dev.'
  );
}

// Access token long-lived so backgrounded geofence triggers rarely hit an
// expired token; refresh token (used by POST /auth/refresh) outlives it.
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '90d';

export interface JWTPayload {
  userId: string;
  email: string;
  type: 'access' | 'refresh';
}

/**
 * Generate access token
 */
export function generateAccessToken(userId: string, email: string): string {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    userId,
    email,
    type: 'access',
  };

  return jwt.sign(payload, JWT_SECRET as string, {
    expiresIn: JWT_EXPIRES_IN,
  } as SignOptions);
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(userId: string, email: string): string {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    userId,
    email,
    type: 'refresh',
  };

  return jwt.sign(payload, JWT_SECRET as string, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  } as SignOptions);
}

/**
 * Verify token
 */
export function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET as string) as JWTPayload;
    return decoded;
  } catch (error) {
    // TokenExpiredError extends JsonWebTokenError — check the subclass first
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    throw new Error('Token verification failed');
  }
}

/**
 * Verify a refresh token specifically. Rejects access tokens (wrong type),
 * expired tokens, and malformed tokens with distinct messages.
 */
export function verifyRefreshToken(token: string): JWTPayload {
  const payload = verifyToken(token);
  if (payload.type !== 'refresh') {
    throw new Error('Invalid token type');
  }
  return payload;
}

/**
 * Decode token without verification (for debugging)
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch {
    return null;
  }
}
