/**
 * Weekly digest push. Hourly tick; fires once at Sunday 18:00 HST (UTC-10),
 * deduped per ISO week via hub.job_state. Generates the weekly synthesis, then
 * pushes a notification linking to the Insights screen.
 */
import { generateWeeklySynthesis } from '../services/synthesisService';
import { sendToUser } from '../services/pushService';
import { JobStateModel } from '../models/PushToken';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly
const JOB_NAME = 'weekly_digest_push';
const HST_OFFSET_HOURS = -10; // HST has no DST
const FIRE_HOUR_HST = 18;     // 6pm
const SUNDAY = 0;

// Single-user app: the sole account. Kept as a constant so the loop is trivial;
// generalize to "for each user with a push token" when multi-user lands.
const TARGET_USER_ID = process.env.WEEKLY_DIGEST_USER_ID ?? '16207862-4d0b-4e10-8d51-6f2fcdafe9cc';

function hstParts(nowUtc: Date): { day: number; hour: number } {
  const shifted = new Date(nowUtc.getTime() + HST_OFFSET_HOURS * 60 * 60 * 1000);
  return { day: shifted.getUTCDay(), hour: shifted.getUTCHours() };
}

// ISO week key (year + week number) computed in HST, for dedup.
function isoWeekKey(nowUtc: Date): string {
  const d = new Date(nowUtc.getTime() + HST_OFFSET_HOURS * 60 * 60 * 1000);
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const jan4 = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(
    ((date.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7
  );
  return `${date.getUTCFullYear()}-W${week}`;
}

export function shouldFireWeekly(nowUtc: Date, lastRunAt: Date | null): boolean {
  const { day, hour } = hstParts(nowUtc);
  if (day !== SUNDAY || hour !== FIRE_HOUR_HST) return false;
  if (lastRunAt && isoWeekKey(lastRunAt) === isoWeekKey(nowUtc)) return false;
  return true;
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
  const lastRun = await JobStateModel.getLastRun(JOB_NAME);
  if (!shouldFireWeekly(now, lastRun)) return;
  console.log('[weeklyDigestJob] Firing weekly digest push');
  try {
    await runWeeklyDigestOnce(TARGET_USER_ID);
    await JobStateModel.setLastRun(JOB_NAME, now); // mark only on success
  } catch (err) {
    console.error('[weeklyDigestJob] run failed (will retry next tick):', err);
  }
}

export function startWeeklySynthesisJob(): void {
  console.log('[weeklyDigestJob] Starting — hourly check, fires Sunday 18:00 HST');
  setInterval(() => {
    tick().catch((err) => console.error('[weeklyDigestJob] tick error:', err));
  }, CHECK_INTERVAL_MS);
}
