/**
 * Correction feedback — the user telling us the parser got something wrong.
 *
 * Moved here from the ml-service, which appended these to a JSONL file at
 * CORRECTIONS_LOG_PATH (default /tmp, ephemeral on Railway) behind only a
 * shared service key, with the acting user taken from the request body. This
 * service already has the objects, per-user auth, and a durable database, so
 * the user is the authenticated caller and ownership is enforced in the write.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/middleware';
import { ObjectCorrectionModel } from '../models/ObjectCorrection';

const router = Router();
router.use(authenticate);

// Spelled out as a literal tuple rather than derived from CORRECTION_FIELDS:
// casting a readonly array into z.enum widens the whole schema's inferred
// output to all-optional, which then silently fails to satisfy
// RecordCorrectionInput. Keep this list in sync with CorrectionField and the
// CHECK constraint in migration 022 — the model test pins the same set.
const correctionSchema = z.object({
  objectId: z.string().uuid(),
  field: z.enum(['type', 'domain', 'cleaned_text', 'title', 'tags', 'actionability', 'other']),
  originalValue: z.string().max(4000).nullish(),
  correctedValue: z.string().min(1).max(4000),
  note: z.string().max(2000).nullish(),
});

// POST /api/v1/corrections — record (or replace) a correction for one field
router.post('/', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED' });

  const parsed = correctionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'INVALID_BODY', message: parsed.error.message });
  }

  const { objectId, field, originalValue, correctedValue, note } = parsed.data;

  try {
    const correction = await ObjectCorrectionModel.record({
      userId: req.user.id,
      objectId,
      field,
      originalValue,
      correctedValue,
      note,
    });

    // Null means the object doesn't exist OR isn't theirs — same answer for
    // both, so this can't be used to probe which object ids exist.
    if (!correction) return res.status(404).json({ error: 'OBJECT_NOT_FOUND' });

    return res.status(201).json({ correction });
  } catch (error) {
    console.error('[corrections] Failed to record correction:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// GET /api/v1/corrections — the caller's corrections, newest first
router.get('/', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED' });

  const limit = Math.min(Number(req.query.limit) || 100, 500);

  try {
    const corrections = await ObjectCorrectionModel.listByUser(req.user.id, limit);
    return res.json({ corrections });
  } catch (error) {
    console.error('[corrections] Failed to list corrections:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// GET /api/v1/corrections/summary — counts per field: what the parser gets wrong
router.get('/summary', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED' });

  try {
    const byField = await ObjectCorrectionModel.summaryByUser(req.user.id);
    const total = byField.reduce((sum, f) => sum + f.count, 0);
    return res.json({ total, byField });
  } catch (error) {
    console.error('[corrections] Failed to summarize corrections:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
