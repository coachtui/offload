/**
 * Time-based reminder push. Every 5 minutes, fires a push for each atomic
 * object whose remind_at has arrived and hasn't fired yet. Per-row
 * reminder_fired_at gives idempotency (set only on push success, so a failed
 * push retries next tick). Resolving/archiving a note before its time
 * silently cancels the reminder via the state filter. Naturally multi-user:
 * user_id rides along on each row.
 */
import { queryMany, query } from '../db/queries';
import { sendToUser } from '../services/pushService';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const BATCH_LIMIT = 50; // safety valve; a tick never sends more than this

interface DueReminderRow {
  id: string;
  user_id: string;
  content: string;
  title: string | null;
}

export async function processDueReminders(now: Date): Promise<void> {
  const rows = await queryMany<DueReminderRow>(
    `SELECT id, user_id, content, title
     FROM hub.atomic_objects
     WHERE remind_at <= $1
       AND reminder_fired_at IS NULL
       AND COALESCE(state, 'open') IN ('open', 'active')
       AND object_type IN ('task', 'reminder', 'commitment')
       AND deleted_at IS NULL
     ORDER BY remind_at ASC
     LIMIT ${BATCH_LIMIT}`,
    [now]
  );

  for (const row of rows) {
    const body = (row.title || row.content).split('\n')[0].slice(0, 178);
    const delivered = await sendToUser(row.user_id, {
      title: '⏰ Reminder',
      body,
      data: { screen: 'Objects', objectId: row.id },
    });
    if (delivered) {
      await query('UPDATE hub.atomic_objects SET reminder_fired_at = $1 WHERE id = $2', [now, row.id]);
    }
  }
}

export function startTimeReminderJob(): void {
  console.log('[timeReminderJob] Starting — 5-min tick for due time reminders');
  setInterval(() => {
    processDueReminders(new Date()).catch((err) =>
      console.error('[timeReminderJob] tick error:', err)
    );
  }, CHECK_INTERVAL_MS);
}
