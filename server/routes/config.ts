import { Router, Request, Response } from 'express';
import { requireAdminToken } from '../auth';
import { dataStoreSummary } from '../../src/data-store';
import { isPlatformConfigured } from '../platform-store';
import { DEFAULT_GEMINI_MODEL, platformGeminiConfigured } from '../../src/ai-runtime';

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
    STORAGE_BACKEND_REQUESTED: store.requested,
    STORAGE_BACKEND_ACTIVE: store.active,
    STORAGE_FALLBACK: process.env.STORAGE_FALLBACK || process.env.DATA_STORE_FALLBACK || '',
    AI_PROVIDER: 'gemini',
    GEMINI_CONNECTION_MODE: platformGeminiConfigured() ? 'platform_managed' : 'per_qm_fallback',
    PLATFORM_GEMINI_CONFIGURED: String(platformGeminiConfigured()),
    GEMINI_MODEL: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    CRON_CONFIGURED: String(Boolean(process.env.CRON_SECRET)),
    AGENT_AUTO_POST: String(process.env.AGENT_AUTO_POST === 'true'),
    DM_AUTO_REPLY: String(process.env.DM_AUTO_REPLY === 'true'),
    DM_AUTO_REPLY_MAX: process.env.DM_AUTO_REPLY_MAX || '3',
    AGENT_THREAD_SCAN_LIMIT: process.env.AGENT_THREAD_SCAN_LIMIT || '6',
    AGENT_THREAD_MESSAGE_COUNT: process.env.AGENT_THREAD_MESSAGE_COUNT || '30',
    AI_DAILY_TOKEN_LIMIT: process.env.AI_DAILY_TOKEN_LIMIT || '',
    AI_DAILY_CALL_LIMIT: process.env.AI_DAILY_CALL_LIMIT || '',
    AI_PROJECT_DAILY_TOKEN_LIMIT: process.env.AI_PROJECT_DAILY_TOKEN_LIMIT || '200000',
    AI_PROJECT_DAILY_CALL_LIMIT: process.env.AI_PROJECT_DAILY_CALL_LIMIT || '200',
    PLATFORM_AI_DAILY_TOKEN_LIMIT: process.env.PLATFORM_AI_DAILY_TOKEN_LIMIT || '500000',
    PLATFORM_AI_DAILY_CALL_LIMIT: process.env.PLATFORM_AI_DAILY_CALL_LIMIT || '500',
    AI_GUARDRAILS_ENFORCE: String(process.env.AI_GUARDRAILS_ENFORCE === 'true'),
    PLATFORM_CONFIGURED: String(isPlatformConfigured()),
    PLATFORM_ENCRYPTION_CONFIGURED: String(Boolean(process.env.PLATFORM_ENCRYPTION_KEY || process.env.SUPABASE_JWT_SECRET)),
  });
});

router.put('/', requireAdminToken, (_req: Request, res: Response) => {
  res.json({ ok: true, message: 'Config is managed via Vercel environment variables.' });
});

export default router;
