import { Router, Request, Response } from 'express';
import { requireAdminToken } from '../auth';
import { getPlatformContext, supabasePlatformConfigured, upsertPlatformProject } from '../../src/supabase-platform';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    configured: supabasePlatformConfigured(),
    urlConfigured: Boolean(process.env.SUPABASE_URL),
    publishableKeyConfigured: Boolean(process.env.SUPABASE_PUBLISHABLE_KEY),
    secretKeyConfigured: Boolean(process.env.SUPABASE_SECRET_KEY),
  });
});

router.get('/me', requireAdminToken, async (req: Request, res: Response) => {
  try {
    if (!req.platformUser) {
      res.status(401).json({ error: 'Supabase login required.' });
      return;
    }
    res.json(await getPlatformContext(req.platformUser));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/projects', requireAdminToken, async (req: Request, res: Response) => {
  try {
    if (!req.platformUser) {
      res.status(401).json({ error: 'Supabase login required.' });
      return;
    }
    res.json(await upsertPlatformProject(req.platformUser, req.body || {}));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes('required') || message.includes('too long') || message.includes('Invalid') ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

export default router;
