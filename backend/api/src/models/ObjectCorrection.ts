/**
 * ObjectCorrection model — hub.object_corrections (migration 022).
 *
 * A user's correction of something the parser got wrong. Ownership is enforced
 * in the write itself rather than by a prior SELECT: the INSERT's source query
 * only yields a row when the object belongs to the caller, so a correction
 * naming someone else's object id writes nothing instead of racing a check.
 */
import { query, queryMany, queryOne } from '../db/queries';

export type CorrectionField =
  | 'type'
  | 'domain'
  | 'cleaned_text'
  | 'title'
  | 'tags'
  | 'actionability'
  | 'other';

export const CORRECTION_FIELDS: readonly CorrectionField[] = [
  'type',
  'domain',
  'cleaned_text',
  'title',
  'tags',
  'actionability',
  'other',
] as const;

export interface ObjectCorrection {
  id: string;
  objectId: string;
  field: CorrectionField;
  originalValue: string | null;
  correctedValue: string;
  note: string | null;
  createdAt: Date;
}

export interface RecordCorrectionInput {
  userId: string;
  objectId: string;
  field: CorrectionField;
  originalValue?: string | null;
  correctedValue: string;
  note?: string | null;
}

export class ObjectCorrectionModel {
  /**
   * Record a correction. Returns null when the object does not exist or is not
   * the caller's — the same answer for both, so this can't be used to probe
   * which object ids exist.
   *
   * Re-correcting the same field overwrites: that is the user changing their
   * mind, not a second data point.
   */
  static async record(input: RecordCorrectionInput): Promise<ObjectCorrection | null> {
    return queryOne<ObjectCorrection>(
      `INSERT INTO hub.object_corrections
         (user_id, object_id, field, original_value, corrected_value, note)
       SELECT $1, o.id, $3, $4, $5, $6
         FROM hub.atomic_objects o
        WHERE o.id = $2 AND o.user_id = $1
       ON CONFLICT (object_id, field) DO UPDATE
         SET original_value  = EXCLUDED.original_value,
             corrected_value = EXCLUDED.corrected_value,
             note            = EXCLUDED.note,
             created_at      = NOW()
       RETURNING id,
                 object_id       AS "objectId",
                 field,
                 original_value  AS "originalValue",
                 corrected_value AS "correctedValue",
                 note,
                 created_at      AS "createdAt"`,
      [
        input.userId,
        input.objectId,
        input.field,
        input.originalValue ?? null,
        input.correctedValue,
        input.note ?? null,
      ]
    );
  }

  /** A user's corrections, newest first. */
  static async listByUser(userId: string, limit = 100): Promise<ObjectCorrection[]> {
    return queryMany<ObjectCorrection>(
      `SELECT id,
              object_id       AS "objectId",
              field,
              original_value  AS "originalValue",
              corrected_value AS "correctedValue",
              note,
              created_at      AS "createdAt"
         FROM hub.object_corrections
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [userId, limit]
    );
  }

  /** Correction counts per field — the shape of what the parser gets wrong. */
  static async summaryByUser(
    userId: string
  ): Promise<Array<{ field: CorrectionField; count: number }>> {
    const rows = await queryMany<{ field: CorrectionField; count: string }>(
      `SELECT field, COUNT(*) AS count
         FROM hub.object_corrections
        WHERE user_id = $1
        GROUP BY field
        ORDER BY COUNT(*) DESC`,
      [userId]
    );
    return rows.map((r) => ({ field: r.field, count: Number(r.count) }));
  }

  /** Remove a correction. Scoped to the caller so it can't delete another user's. */
  static async remove(userId: string, objectId: string, field: CorrectionField): Promise<boolean> {
    const result = await query(
      `DELETE FROM hub.object_corrections
        WHERE user_id = $1 AND object_id = $2 AND field = $3`,
      [userId, objectId, field]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
