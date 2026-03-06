/**
 * Unit tests for Rate Limiter
 */

import { RateLimiter } from '../../utils/rateLimiter';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  afterEach(() => {
    if (limiter) {
      limiter.destroy();
    }
  });

  describe('basic rate limiting', () => {
    it('should allow requests within limit', () => {
      limiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 5,
      });

      for (let i = 0; i < 5; i++) {
        const result = limiter.check('user-1');
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }
    });

    it('should block requests exceeding limit', () => {
      limiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 3,
      });

      // Use up the limit
      for (let i = 0; i < 3; i++) {
        limiter.check('user-1');
      }

      // This should be blocked
      const result = limiter.check('user-1');
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should track different keys separately', () => {
      limiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 2,
      });

      // Exhaust limit for user-1
      limiter.check('user-1');
      limiter.check('user-1');
      const blocked = limiter.check('user-1');
      expect(blocked.allowed).toBe(false);

      // user-2 should still be allowed
      const allowed = limiter.check('user-2');
      expect(allowed.allowed).toBe(true);
    });
  });

  describe('sliding window', () => {
    it('should reset after window expires', async () => {
      limiter = new RateLimiter({
        windowMs: 100, // 100ms window for fast testing
        maxRequests: 2,
      });

      // Exhaust limit
      limiter.check('user-1');
      limiter.check('user-1');
      let result = limiter.check('user-1');
      expect(result.allowed).toBe(false);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be allowed again
      result = limiter.check('user-1');
      expect(result.allowed).toBe(true);
    });
  });

  describe('blocking duration', () => {
    it('should block for specified duration', () => {
      limiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 1,
        blockDurationMs: 5000, // 5 second block
      });

      limiter.check('user-1');
      const result = limiter.check('user-1');

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThanOrEqual(4);
      expect(result.retryAfter).toBeLessThanOrEqual(5);
    });

    it('should use window duration as default block duration', () => {
      limiter = new RateLimiter({
        windowMs: 2000,
        maxRequests: 1,
      });

      limiter.check('user-1');
      const result = limiter.check('user-1');

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeLessThanOrEqual(2);
    });
  });

  describe('reset', () => {
    it('should reset limit for specific key', () => {
      limiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 1,
      });

      limiter.check('user-1');
      let result = limiter.check('user-1');
      expect(result.allowed).toBe(false);

      // Reset
      limiter.reset('user-1');

      // Should be allowed again
      result = limiter.check('user-1');
      expect(result.allowed).toBe(true);
    });

    it('should not affect other keys when resetting', () => {
      limiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 1,
      });

      limiter.check('user-1');
      limiter.check('user-2');

      limiter.reset('user-1');

      // user-1 is reset
      expect(limiter.check('user-1').allowed).toBe(true);

      // user-2 is still limited
      expect(limiter.check('user-2').allowed).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle new keys correctly', () => {
      limiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 5,
      });

      const result = limiter.check('new-user');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('should handle zero maxRequests gracefully', () => {
      limiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 0,
      });

      const result = limiter.check('user-1');
      expect(result.allowed).toBe(false);
    });

    it('should handle rapid consecutive checks', () => {
      limiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 100,
      });

      const results: boolean[] = [];
      for (let i = 0; i < 100; i++) {
        results.push(limiter.check('user-1').allowed);
      }

      // All 100 should be allowed
      expect(results.every(r => r === true)).toBe(true);

      // 101st should be blocked
      expect(limiter.check('user-1').allowed).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should clean up old entries', async () => {
      limiter = new RateLimiter({
        windowMs: 50,
        maxRequests: 1,
      });

      // Make a request
      limiter.check('user-1');

      // Wait for cleanup (cleanup runs at 2x window)
      await new Promise(resolve => setTimeout(resolve, 150));

      // The entry should be cleaned up, allowing new requests
      const result = limiter.check('user-1');
      expect(result.allowed).toBe(true);
    });
  });
});
