/**
 * Authentication routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  register,
  refreshSession,
  getUserById,
  loginWithLockout,
  InvalidCredentialsError,
  LoginLockoutError,
} from '../services/userService';
import { authenticate } from '../auth/middleware';
import { RateLimiter } from '../utils/rateLimiter';
import { z } from 'zod';

const router = Router();

// Per-IP flood guard across all auth endpoints (separate from the per-email
// login lockout below). Generous enough that real use never trips it.
const ipAuthLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 30,
  blockDurationMs: 15 * 60 * 1000,
});

function ipRateLimit(req: Request, res: Response, next: NextFunction): void {
  const outcome = ipAuthLimiter.check(req.ip || 'unknown');
  if (!outcome.allowed) {
    res.setHeader('Retry-After', String(outcome.retryAfter ?? 900));
    res.status(429).json({
      error: 'RATE_LIMITED',
      message: 'Too many requests. Please try again later.',
    });
    return;
  }
  next();
}

/**
 * POST /api/v1/auth/register
 * Register a new user
 */
router.post('/register', ipRateLimit, async (req: Request, res: Response) => {
  try {
    const result = await register(req.body);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: error.errors,
      });
      return;
    }

    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        res.status(409).json({
          error: 'CONFLICT',
          message: error.message,
        });
        return;
      }
    }

    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Registration failed',
    });
  }
});

/**
 * POST /api/v1/auth/login
 * Login user
 */
router.post('/login', ipRateLimit, async (req: Request, res: Response) => {
  try {
    const result = await loginWithLockout(req.body);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: error.errors,
      });
      return;
    }

    if (error instanceof LoginLockoutError) {
      const mins = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
      res.setHeader('Retry-After', String(error.retryAfterSeconds));
      res.status(429).json({
        error: 'RATE_LIMITED',
        message: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
      });
      return;
    }

    if (error instanceof InvalidCredentialsError) {
      const n = error.attemptsRemaining;
      const message =
        n > 0
          ? `Invalid email or password. ${n} attempt${n === 1 ? '' : 's'} remaining.`
          : 'Invalid email or password. No attempts remaining — try again later.';
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message,
        attemptsRemaining: n,
      });
      return;
    }

    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Login failed',
    });
  }
});

/**
 * POST /api/v1/auth/refresh
 * Exchange a refresh token for a fresh access token (+ a new refresh token;
 * stateless — the previous one stays valid until its own expiry).
 */
router.post('/refresh', ipRateLimit, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken || typeof refreshToken !== 'string') {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'refreshToken is required',
      });
      return;
    }

    const result = await refreshSession(refreshToken);
    res.json(result);
  } catch (error) {
    // Log the specific cause server-side, but return a generic message so we
    // don't leak token state or account existence ("User not found") to an
    // unauthenticated caller. Any token problem → 401.
    console.warn(
      '[Auth] POST /refresh failed:',
      error instanceof Error ? error.message : error
    );
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Could not refresh session',
    });
  }
});

/**
 * GET /api/v1/auth/me
 * Get current user
 */
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
      return;
    }

    const user = await getUserById(req.user.id);
    res.json({ user });
  } catch (error) {
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to get user',
    });
  }
});

export default router;
