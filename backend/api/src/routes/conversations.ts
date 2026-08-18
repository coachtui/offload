/**
 * Conversation routes — saved Ask Offload threads.
 *
 * GET    /api/v1/conversations            — thread list
 * POST   /api/v1/conversations            — open a thread and answer its first question
 * GET    /api/v1/conversations/:id        — thread + messages (no side effects)
 * POST   /api/v1/conversations/:id/resume — diff against live state, report what changed
 * POST   /api/v1/conversations/:id/messages — a follow-up turn
 * PATCH  /api/v1/conversations/:id        — rename
 * DELETE /api/v1/conversations/:id        — delete thread and messages
 *
 * GET /:id is deliberately side-effect free and /resume is a POST: reopening a
 * thread advances a watermark and can write a report row, and that must not
 * happen on a retry, a prefetch, or a pull-to-refresh.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/middleware';
import { requireEntitlement } from '../auth/requireEntitlement';
import { ConversationModel } from '../models/Conversation';
import {
  startConversation,
  runTurn,
  resumeConversation,
} from '../services/conversationService';

const router = Router();

router.use(authenticate);

const idParam = z.string().uuid('Invalid conversation id');

const createSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  topK: z.number().int().min(1).max(20).optional().default(8),
  title: z.string().max(120).optional(),
});

const messageSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  topK: z.number().int().min(1).max(20).optional().default(8),
});

const renameSchema = z.object({
  title: z.string().min(1).max(120),
});

const resumeSchema = z.object({
  /** Skip the "too soon to be interesting" window. Pull-to-refresh sets this. */
  force: z.boolean().optional().default(false),
});

/** LLM configuration failures are a 503 with a usable message, not a generic 500. */
function respondToError(res: Response, error: unknown, label: string) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`[conversations] ${label} error:`, error);
  if (message.includes('No LLM API key')) {
    return res.status(503).json({
      error: 'Ask Offload unavailable',
      message: 'No LLM API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.',
    });
  }
  return res.status(500).json({ error: `${label} failed`, message });
}

// ─── GET / ────────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const conversations = await ConversationModel.listByUser(userId, limit);
    return res.json({ conversations, total: conversations.length });
  } catch (error) {
    return respondToError(res, error, 'List conversations');
  }
});

// ─── POST / ───────────────────────────────────────────────────────────────────

router.post('/', requireEntitlement, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const validation = createSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Validation failed', details: validation.error.errors });
  }

  try {
    const { query, topK, title } = validation.data;
    console.log(`[conversations] POST / — userId: ${userId}, queryLen: ${query.length}`);

    const result = await startConversation(userId, query, { topK, title });
    return res.status(201).json({
      conversation: result.conversation,
      messages: [result.userMessage, result.assistantMessage],
    });
  } catch (error) {
    return respondToError(res, error, 'Start conversation');
  }
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const parsedId = idParam.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ error: 'Invalid conversation id' });

  try {
    const conversation = await ConversationModel.findById(userId, parsedId.data);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const messages = await ConversationModel.listMessages(userId, parsedId.data);
    return res.json({ conversation, messages });
  } catch (error) {
    return respondToError(res, error, 'Get conversation');
  }
});

// ─── POST /:id/resume ─────────────────────────────────────────────────────────

/**
 * The standing-query payoff: re-derive what changed since this thread last
 * looked. Returns the structured delta alongside the narrated message so the
 * client can render counts without re-parsing prose.
 */
router.post('/:id/resume', requireEntitlement, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const parsedId = idParam.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ error: 'Invalid conversation id' });

  const validation = resumeSchema.safeParse(req.body ?? {});
  if (!validation.success) {
    return res.status(400).json({ error: 'Validation failed', details: validation.error.errors });
  }

  try {
    console.log(`[conversations] POST /${parsedId.data}/resume — userId: ${userId}`);
    const result = await resumeConversation(userId, parsedId.data, {
      force: validation.data.force,
    });
    if (!result) return res.status(404).json({ error: 'Conversation not found' });

    return res.json({ delta: result.delta, message: result.message });
  } catch (error) {
    return respondToError(res, error, 'Resume conversation');
  }
});

// ─── POST /:id/messages ───────────────────────────────────────────────────────

router.post('/:id/messages', requireEntitlement, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const parsedId = idParam.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ error: 'Invalid conversation id' });

  const validation = messageSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Validation failed', details: validation.error.errors });
  }

  try {
    const { query, topK } = validation.data;
    console.log(
      `[conversations] POST /${parsedId.data}/messages — userId: ${userId}, queryLen: ${query.length}`
    );

    const result = await runTurn(userId, parsedId.data, query, { topK });
    if (!result) return res.status(404).json({ error: 'Conversation not found' });

    return res.status(201).json({
      conversation: result.conversation,
      messages: [result.userMessage, result.assistantMessage],
    });
  } catch (error) {
    return respondToError(res, error, 'Send message');
  }
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────────

router.patch('/:id', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const parsedId = idParam.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ error: 'Invalid conversation id' });

  const validation = renameSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Validation failed', details: validation.error.errors });
  }

  try {
    const renamed = await ConversationModel.rename(userId, parsedId.data, validation.data.title);
    if (!renamed) return res.status(404).json({ error: 'Conversation not found' });
    return res.json({ id: parsedId.data, title: validation.data.title.trim() });
  } catch (error) {
    return respondToError(res, error, 'Rename conversation');
  }
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

router.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const parsedId = idParam.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ error: 'Invalid conversation id' });

  try {
    const removed = await ConversationModel.remove(userId, parsedId.data);
    if (!removed) return res.status(404).json({ error: 'Conversation not found' });
    return res.json({ id: parsedId.data, deleted: true });
  } catch (error) {
    return respondToError(res, error, 'Delete conversation');
  }
});

export default router;
