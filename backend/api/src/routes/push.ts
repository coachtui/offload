import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/middleware';
import { PushTokenModel } from '../models/PushToken';
import { sendToUser } from '../services/pushService';

const router = Router();
router.use(authenticate);

const registerSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android']).optional(),
});

// POST /api/v1/push/register — store this device's Expo push token
router.post('/register', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED' });
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'INVALID_BODY', message: parsed.error.message });
  await PushTokenModel.upsert(req.user.id, parsed.data.token, parsed.data.platform ?? 'ios');
  res.json({ ok: true });
});

// POST /api/v1/push/test — dev helper: send a test push to the caller's devices
router.post('/test', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED' });
  await sendToUser(req.user.id, {
    title: '🔔 Offload test push',
    body: 'If you can see this, push delivery works.',
    data: { screen: 'Insights' },
  });
  res.json({ ok: true });
});

export default router;
