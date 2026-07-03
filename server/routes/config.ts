import { Router, Request, Response } from 'express';
import { isAdminAuthConfigured, requireAdminToken } from '../auth';
import { dataStoreSummary } from '../../src/data-store';

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
  const store = dataStoreSummary();
  res.json({
    ...env,
    ADMIN_AUTH_CONFIGURED: String(isAdminAuthConfigured()),
    DATA_STORE_REQUESTED: store.requested,
    DATA_STORE_ACTIVE: store.active,
    ANTHROPIC_CONFIGURED: String(Boolean(process.env.ANTHROPIC_API_KEY)),
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
    CRON_CONFIGURED: String(Boolean(process.env.CRON_SECRET)),
    AGENT_AUTO_POST: String(process.env.AGENT_AUTO_POST === 'true'),
  });
});

router.put('/', requireAdminToken, (_req: Request, res: Response) => {
  res.json({ ok: true, message: 'Config is managed via Vercel environment variables.' });
});

export default router;
