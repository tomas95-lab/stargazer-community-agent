import { Router, Request, Response } from 'express';
import { execSync } from 'child_process';
import * as path from 'path';
import { requireAdminToken } from '../auth';
import { activeDataStore } from '../../src/data-store';

const router = Router();
const ROOT = path.resolve(__dirname, '../..');

router.post('/', requireAdminToken, (_req: Request, res: Response) => {
  try {
    if (activeDataStore() === 'github') {
      res.json({ ok: true, message: 'GitHub data store writes immediately. Nothing to sync.' });
      return;
    }

    execSync('git add data/', { cwd: ROOT, stdio: 'pipe' });

    const statusOut = execSync('git status --porcelain data/', { cwd: ROOT }).toString().trim();
    if (!statusOut) {
      res.json({ ok: true, message: 'Nothing to sync — already up to date.' });
      return;
    }

    execSync('git commit -m "sync: update data files from UI"', { cwd: ROOT, stdio: 'pipe' });
    execSync('git push', { cwd: ROOT, stdio: 'pipe' });

    res.json({ ok: true, message: 'Data synced to GitHub.' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
