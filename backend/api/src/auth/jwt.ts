/**
 * JWT authentication utilities
 */

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

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

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as string | number,
  });
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

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN as string | number,
  });
}

/**
 * Verify token
 */
export function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired');
    }
    throw new Error('Token verification failed');
  }
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
