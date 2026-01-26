/**
 * Authentication middleware
 */

import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from './jwt';
import { User } from '../models/User';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

// Export AuthRequest type for use in route handlers
export type AuthRequest = Request & {
  user: {
    id: string;
    email: string;
  };
};

/**
 * Middleware to authenticate requests using JWT
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      const payload = verifyToken(token);

      if (payload.type !== 'access') {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Invalid token type',
        });
        return;
      }

      // Verify user still exists
      const user = await User.findById(payload.userId);
      if (!user) {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'User not found',
        });
        return;
      }

      // Attach user to request
      req.user = {
        id: user.id,
        email: user.email,
      };

      next();
    } catch (error) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: error instanceof Error ? error.message : 'Invalid token',
      });
      return;
    }
  } catch (error) {
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Authentication error',
    });
    return;
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
export async function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const payload = verifyToken(token);
        if (payload.type === 'access') {
          const user = await User.findById(payload.userId);
          if (user) {
            req.user = {
              id: user.id,
              email: user.email,
            };
          }
        }
      } catch {
        // Ignore token errors for optional auth
      }
    }

    next();
  } catch (error) {
    next();
  }
}
