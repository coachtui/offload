/**
 * Global Jest setup — runs before any module is imported (jest `setupFiles`).
 * Ensures env vars that modules read at import time are present.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';
