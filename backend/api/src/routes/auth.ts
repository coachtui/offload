/**
 * Authentication routes
 */

import { Router, Request, Response } from 'express';
import { register, login, refreshSession, getUserById } from '../services/userService';
import { authenticate } from '../auth/middleware';
import { z } from 'zod';

const router = Router();

/**
 * POST /api/v1/auth/register
 * Register a new user
 */
router.post('/register', async (req: Request, res: Response) => {
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
router.post('/login', async (req: Request, res: Response) => {
  try {
    const result = await login(req.body);
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

    if (error instanceof Error) {
      if (
        error.message.includes('Invalid email') ||
        error.message.includes('Invalid password')
      ) {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: error.message,
        });
        return;
      }
    }

    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Login failed',
    });
  }
});

/**
 * POST /api/v1/auth/refresh
 * Exchange a refresh token for a fresh access token (+ rotated refresh token).
 */
router.post('/refresh', async (req: Request, res: Response) => {
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
    // Any token problem (expired, wrong type, malformed, deleted user) → 401
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: error instanceof Error ? error.message : 'Could not refresh session',
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
