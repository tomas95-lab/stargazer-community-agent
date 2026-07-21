import { Router, Request, Response } from 'express';
import { requireAdminToken } from '../auth';
import { activeDataStore } from '../../src/data-store';

const router = Router();

router.post('/', requireAdminToken, (_req: Request, res: Response) => {
  const store = activeDataStore();
  res.json({
    ok: true,
    message: store === 'supabase'
      ? 'Changes are saved automatically in Supabase.'
      : store === 'github'
        ? 'Changes are saved immediately in the legacy GitHub store.'
        : 'Changes are saved in the local development workspace.',
  });
});

export default router;
