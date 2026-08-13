/**
 * ReminderLifecycleEvent model — hub.reminder_lifecycle_events (migration 010).
 *
 * The table and the diagnostics endpoint that reads it
 * (GET /api/v1/diagnostics/reminders) shipped in migration 010, but nothing
 * ever wrote a row: logLifecycle was console.log only, so the endpoint has
 * been faithfully querying an empty table while the actual trail scrolled off
 * Railway's log retention. This model is the missing writer.
 *
 * record() never throws and is fire-and-forget at call sites: diagnostics are
 * a lens on the pipeline, and a lens must never break the thing it watches.
 */

import { query } from '../db/queries';

export class ReminderLifecycleEventModel {
  static async record(
    eventType: string,
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO hub.reminder_lifecycle_events
           (user_id, object_id, place_id, geofence_id, event_type, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          details.userId ?? null,
          details.objectId ?? null,
          details.placeId ?? null,
          details.geofenceId ?? null,
          eventType,
          JSON.stringify(details),
        ]
      );
    } catch (error) {
      console.warn(`[ReminderLifecycle] Failed to persist ${eventType}:`, error);
    }
  }
}
