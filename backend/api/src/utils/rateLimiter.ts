/**
 * Rate Limiter for WebSocket connections
 * Implements a sliding window rate limiting algorithm
 */

export interface RateLimitConfig {
  windowMs: number;        // Time window in milliseconds
  maxRequests: number;     // Maximum requests per window
  blockDurationMs?: number; // How long to block after limit exceeded
}

interface RateLimitEntry {
  timestamps: number[];
  blockedUntil?: number;
}

export class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private config: Required<RateLimitConfig>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: RateLimitConfig) {
    this.config = {
      windowMs: config.windowMs,
      maxRequests: config.maxRequests,
      blockDurationMs: config.blockDurationMs || config.windowMs,
    };

    // Clean up old entries periodically
    this.cleanupInterval = setInterval(() => this.cleanup(), this.config.windowMs * 2);
  }

  /**
   * Check if a request is allowed and record it
   * @param key - Unique identifier (e.g., userId, IP address)
   * @returns Object with allowed status and retry-after if blocked
   */
  check(key: string): { allowed: boolean; retryAfter?: number; remaining?: number } {
    const now = Date.now();
    let entry = this.limits.get(key);

    if (!entry) {
      entry = { timestamps: [] };
      this.limits.set(key, entry);
    }

    // Check if blocked
    if (entry.blockedUntil && now < entry.blockedUntil) {
      return {
        allowed: false,
        retryAfter: Math.ceil((entry.blockedUntil - now) / 1000),
      };
    }

    // Clear block if expired
    if (entry.blockedUntil && now >= entry.blockedUntil) {
      entry.blockedUntil = undefined;
      entry.timestamps = [];
    }

    // Remove timestamps outside the window
    const windowStart = now - this.config.windowMs;
    entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);

    // Check if limit exceeded
    if (entry.timestamps.length >= this.config.maxRequests) {
      entry.blockedUntil = now + this.config.blockDurationMs;
      return {
        allowed: false,
        retryAfter: Math.ceil(this.config.blockDurationMs / 1000),
      };
    }

    // Record this request
    entry.timestamps.push(now);

    return {
      allowed: true,
      remaining: this.config.maxRequests - entry.timestamps.length,
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  reset(key: string): void {
    this.limits.delete(key);
  }

  /**
   * Clean up old entries to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const keysToDelete: string[] = [];

    this.limits.forEach((entry, key) => {
      // Remove entries with no recent activity and not blocked
      if (
        (!entry.blockedUntil || entry.blockedUntil < now) &&
        entry.timestamps.every(ts => ts < windowStart)
      ) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.limits.delete(key));
  }

  /**
   * Stop the cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Default rate limiters for different purposes
export const connectionLimiter = new RateLimiter({
  windowMs: 60 * 1000,     // 1 minute window
  maxRequests: 10,          // 10 connections per minute
  blockDurationMs: 5 * 60 * 1000, // Block for 5 minutes if exceeded
});

export const messageLimiter = new RateLimiter({
  windowMs: 1000,          // 1 second window
  maxRequests: 50,         // 50 messages per second (audio chunks)
  blockDurationMs: 10 * 1000, // Block for 10 seconds if exceeded
});

export const sessionLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour window
  maxRequests: 20,          // 20 sessions per hour
  blockDurationMs: 30 * 60 * 1000, // Block for 30 minutes if exceeded
});
