/**
 * Time-based reminder push.
 *
 * Sleeps until the instant the next reminder is actually due instead of polling
 * on a fixed interval. The old 5-minute tick made every reminder 0–5 minutes
 * late (2.5 on average) with a phase that re-randomized on every deploy, which
 * is the difference between "9:00" meaning 9:00 and meaning "sometime after 9".
 * After each run the scheduler re-queries the earliest pending remind_at and
 * arms one timer for exactly that moment, so lateness is timer precision rather
 * than tick width.
 *
 * Two things keep that schedule honest. AtomicObject.create calls
 * rearmTimeReminderJob(), so a note whose reminder lands before the currently
 * armed wake-up pulls the wake-up earlier instead of missing it. And the
 * scheduler never sleeps longer than MAX_SLEEP_MS, which is what heals the
 * schedule after a clock jump or a remind_at written out of band.
 *
 * Delivery is claim-then-send: a row is claimed (reminder_claimed_at) before
 * its push and only marked fired on success, so a failed push retries at once,
 * a crash mid-send retries when the claim lease expires, and two concurrent
 * runs can't double-push. Resolving/archiving a note before its time silently
 * cancels the reminder via the state filter. Naturally multi-user: user_id
 * rides along on each row.
 */
import { queryMany, queryOne, query } from '../db/queries';
import { sendToUser } from '../services/pushService';
import { reminderBody, REMINDER_TITLE } from '../services/reminderContent';

const MAX_SLEEP_MS = 15 * 60 * 1000; // blind-sleep ceiling; doubles as a self-heal heartbeat
const MIN_SLEEP_MS = 250;            // floor, so a timer that fires early can't spin
const WAKE_PADDING_MS = 250;         // wake just after the due instant, never just before
const CLAIM_LEASE_MS = 5 * 60 * 1000; // a claim older than this is assumed crashed
const BATCH_LIMIT = 50;              // safety valve; a run never sends more than this

/**
 * Rows the *server* still has to fire. Shared text so the claim query and the
 * wake-up scheduler can never disagree about what "pending" means — if they
 * drift, the scheduler wakes for rows the claim won't take and spins.
 *
 * reminder_local_claim_at excludes reminders a device has already scheduled as
 * a local iOS notification: it will fire them without us, and both firing would
 * mean two notifications for one reminder. The device only claims what it
 * actually scheduled and re-states the set every sync, so anything it can't
 * handle comes straight back here (see migration 021).
 */
const PENDING_PREDICATE = `
       reminder_fired_at IS NULL
       AND reminder_local_claim_at IS NULL
       AND COALESCE(state, 'open') IN ('open', 'active')
       AND object_type IN ('task', 'reminder', 'commitment')
       AND deleted_at IS NULL`;

/** Derived from the numeric constant above — never from input. */
const CLAIM_LEASE_SQL = `INTERVAL '${CLAIM_LEASE_MS / 1000} seconds'`;

interface DueReminderRow {
  id: string;
  user_id: string;
  content: string;
  title: string | null;
}

export async function processDueReminders(now: Date): Promise<void> {
  const staleClaimCutoff = new Date(now.getTime() - CLAIM_LEASE_MS);

  // The UPDATE *is* the lock. SKIP LOCKED means a concurrent run steps over
  // rows this one is claiming rather than blocking on them or duplicating them.
  const rows = await queryMany<DueReminderRow>(
    `UPDATE hub.atomic_objects SET reminder_claimed_at = $1
      WHERE id IN (
        SELECT id FROM hub.atomic_objects
         WHERE remind_at <= $1
           AND (reminder_claimed_at IS NULL OR reminder_claimed_at <= $2)
           AND ${PENDING_PREDICATE}
         ORDER BY remind_at ASC
         LIMIT ${BATCH_LIMIT}
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, user_id, content, title`,
    [now, staleClaimCutoff]
  );

  for (const row of rows) {
    const delivered = await sendToUser(row.user_id, {
      title: REMINDER_TITLE,
      body: reminderBody(row.title, row.content),
      data: { screen: 'Objects', objectId: row.id },
      // A reminder is precisely what iOS means by time-sensitive: it must break
      // through Focus and never be held back for the scheduled summary.
      interruptionLevel: 'time-sensitive',
    });
    if (delivered) {
      await query('UPDATE hub.atomic_objects SET reminder_fired_at = $1 WHERE id = $2', [now, row.id]);
    } else {
      // Release the claim so the next run retries immediately instead of
      // waiting out the whole lease.
      await query('UPDATE hub.atomic_objects SET reminder_claimed_at = NULL WHERE id = $1', [row.id]);
    }
  }
}

/**
 * Milliseconds until the next reminder needs attention, clamped to
 * [MIN_SLEEP_MS, MAX_SLEEP_MS]. A row already claimed by someone else isn't due
 * at its remind_at but at its lease expiry — counting it as due now would spin
 * the scheduler for the length of the lease after a crash.
 */
async function nextWakeDelayMs(now: Date): Promise<number> {
  const row = await queryOne<{ next_due: Date | string | null }>(
    `SELECT MIN(
              CASE WHEN reminder_claimed_at IS NULL THEN remind_at
                   ELSE GREATEST(remind_at, reminder_claimed_at + ${CLAIM_LEASE_SQL})
              END
            ) AS next_due
       FROM hub.atomic_objects
      WHERE remind_at IS NOT NULL AND ${PENDING_PREDICATE}`
  );

  if (!row?.next_due) return MAX_SLEEP_MS;
  const dueMs = new Date(row.next_due).getTime();
  if (Number.isNaN(dueMs)) return MAX_SLEEP_MS;

  const delay = dueMs - now.getTime() + WAKE_PADDING_MS;
  return Math.min(MAX_SLEEP_MS, Math.max(MIN_SLEEP_MS, delay));
}

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let started = false;
let rearmRequested = false;

function arm(delayMs: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void runAndRearm();
  }, delayMs);
}

/**
 * One sweep, then re-arm for whatever is next. Always re-arms, even after a
 * failure — a DB blip must not silently retire the scheduler for the life of
 * the process.
 */
async function runAndRearm(): Promise<void> {
  // A re-arm that lands mid-run doesn't start a second sweep — it leaves a note.
  // The run in flight usually picks the new row up anyway (it re-queries the
  // earliest due row at the end), but not if it already ran that query, so the
  // flag makes it run once more rather than leave the row to the heartbeat.
  if (running) {
    rearmRequested = true;
    return;
  }
  running = true;
  try {
    do {
      rearmRequested = false;
      await processDueReminders(new Date());
      arm(await nextWakeDelayMs(new Date()));
    } while (rearmRequested);
  } catch (err) {
    console.error('[timeReminderJob] run failed:', err);
    arm(MAX_SLEEP_MS);
  } finally {
    running = false;
  }
}

export function startTimeReminderJob(): void {
  started = true;
  console.log('[timeReminderJob] Starting — self-scheduling to each reminder’s due instant');
  // Sweep on boot: a restart must not step over a reminder that came due while
  // the process was down.
  void runAndRearm();
}

/**
 * Pull the next wake-up earlier when a freshly created reminder is due before
 * it. Fire-and-forget by design — this must never fail or slow a note save. A
 * no-op until the job is running, so tests and one-off scripts that create
 * objects never start a timer.
 */
export function rearmTimeReminderJob(): void {
  if (!started) return;
  void runAndRearm();
}
