import { Router, Request, Response } from 'express';
import { getAutomationHealth } from '../../src/automation-health';
import { requireAdminToken } from '../auth';

const router = Router();

router.get('/health', requireAdminToken, async (_req: Request, res: Response) => {
  try {
    res.json(await getAutomationHealth());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
