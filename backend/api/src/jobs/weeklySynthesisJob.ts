/**
 * Weekly digest push. Hourly tick; for every user with notes from the last 7
 * days, fires once when their LOCAL clock hits Sunday 18:00 — local means the
 * device timezone captured at ingest (users.last_seen_timezone), falling back
 * to fixed HST for accounts that predate timezone capture. Deduped per user
 * per ISO week (computed in the user's zone) via hub.job_state keyed
 * `weekly_digest_push:<userId>`. Generates the weekly synthesis (which is what
 * the Insights screen reads), then pushes a notification linking to it; the
 * push is best-effort — a user with no push token still gets the synthesis.
 */
import { generateWeeklySynthesis } from '../services/synthesisService';
import { sendToUser } from '../services/pushService';
import { JobStateModel } from '../models/PushToken';
import { queryMany } from '../db/queries';
import { resolveOffsetMinutes } from '../utils/timezone';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly
const JOB_PREFIX = 'weekly_digest_push';
const FALLBACK_OFFSET_MINUTES = -600; // fixed HST (UTC-10, no DST) — pre-timezone accounts
const FIRE_HOUR_LOCAL = 18;           // 6pm
const SUNDAY = 0;

function offsetFor(timezone: string | null | undefined, at: Date): number {
  if (typeof timezone === 'string' && timezone.trim() !== '') {
    const resolved = resolveOffsetMinutes(timezone, at);
    if (resolved !== null) return resolved;
  }
  return FALLBACK_OFFSET_MINUTES;
}

function localParts(nowUtc: Date, offsetMinutes: number): { day: number; hour: number } {
  const shifted = new Date(nowUtc.getTime() + offsetMinutes * 60 * 1000);
  return { day: shifted.getUTCDay(), hour: shifted.getUTCHours() };
}

// ISO week key (year + week number) computed in the user's zone, for dedup.
function isoWeekKey(nowUtc: Date, offsetMinutes: number): string {
  const d = new Date(nowUtc.getTime() + offsetMinutes * 60 * 1000);
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const jan4 = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(
    ((date.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7
  );
  return `${date.getUTCFullYear()}-W${week}`;
}

export function shouldFireWeekly(
  nowUtc: Date,
  lastRunAt: Date | null,
  timezone?: string | null
): boolean {
  const offset = offsetFor(timezone, nowUtc);
  const { day, hour } = localParts(nowUtc, offset);
  if (day !== SUNDAY || hour !== FIRE_HOUR_LOCAL) return false;
  if (lastRunAt && isoWeekKey(lastRunAt, offset) === isoWeekKey(nowUtc, offset)) return false;
  return true;
}

interface DigestCandidateRow {
  id: string;
  last_seen_timezone: string | null;
}

/**
 * Users worth a digest: anyone with a live note from the last 7 days. The
 * empty-week gate is the cost control — no notes means no LLM run and no
 * "0 accomplished" push, and it naturally excludes never-recorded accounts.
 */
async function listDigestCandidates(): Promise<DigestCandidateRow[]> {
  return queryMany<DigestCandidateRow>(
    `SELECT u.id, u.last_seen_timezone
     FROM hub.users u
     WHERE EXISTS (
       SELECT 1 FROM hub.atomic_objects ao
       WHERE ao.user_id = u.id
         AND ao.deleted_at IS NULL
         AND ao.created_at > now() - interval '7 days'
     )`
  );
}

export async function runWeeklyDigestOnce(userId: string): Promise<void> {
  const synthesis = await generateWeeklySynthesis(userId); // 7-day, same-day cached
  const accomplished = synthesis.accomplishedCount ?? 0;
  const stillOpen = synthesis.openThreads?.length ?? 0;
  await sendToUser(userId, {
    title: '🧠 Your weekly brief is ready',
    body: `${accomplished} accomplished · ${stillOpen} still open`,
    data: { screen: 'Insights' },
  });
}

async function tick(): Promise<void> {
  const now = new Date();
  const candidates = await listDigestCandidates();
  for (const user of candidates) {
    const jobKey = `${JOB_PREFIX}:${user.id}`;
    try {
      const lastRun = await JobStateModel.getLastRun(jobKey);
      if (!shouldFireWeekly(now, lastRun, user.last_seen_timezone)) continue;
      console.log(
        `[weeklyDigestJob] Firing weekly digest for user ${user.id} (tz: ${user.last_seen_timezone ?? 'HST fallback'})`
      );
      await runWeeklyDigestOnce(user.id);
      await JobStateModel.setLastRun(jobKey, now); // mark only on success
    } catch (err) {
      // Per-user isolation: one failing synthesis must not starve the rest.
      console.error(`[weeklyDigestJob] run failed for user ${user.id} (will retry next tick):`, err);
    }
  }
}

export function startWeeklySynthesisJob(): void {
  console.log('[weeklyDigestJob] Starting — hourly check, fires Sunday 18:00 in each user\'s timezone');
  setInterval(() => {
    tick().catch((err) => console.error('[weeklyDigestJob] tick error:', err));
  }, CHECK_INTERVAL_MS);
}
