import { Router, Request, Response } from 'express';

const router = Router();

const SAFE_KEYS = [
  'COMMUNITY_BASE_URL',
  'COMMUNITY_CATEGORY_ID',
  'COMMUNITY_CATEGORY_SLUG',
  'COMMUNITY_CHAT_CHANNEL_ID',
  'DISCOURSE_API_CLIENT_ID',
  'DISCOURSE_USERNAME',
];

router.get('/', (_req: Request, res: Response) => {
  const env: Record<string, string> = {};
  for (const key of SAFE_KEYS) {
    if (process.env[key]) env[key] = process.env[key]!;
  }
  res.json(env);
});

router.put('/', (_req: Request, res: Response) => {
  res.json({ ok: true, message: 'Config is managed via Vercel environment variables.' });
});

export default router;
