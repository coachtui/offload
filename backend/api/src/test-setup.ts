/**
 * Global Jest setup — runs before any module is imported (jest `setupFiles`).
 * Ensures env vars that modules read at import time are present.
 */
import { config } from 'dotenv';
import path from 'path';

// Untracked, developer-local. Absent on CI and on a fresh clone, which is fine —
// every var it supplies has a placeholder fallback below.
config({ path: path.resolve(__dirname, '../../../.env.local') });

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';
// transcriptionService builds its OpenAI client at module scope, so every suite
// that transitively imports it dies at import time when this is unset. No test
// makes a live call, so a placeholder is sufficient — never require a real key
// to run the suite.
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key-not-used';
