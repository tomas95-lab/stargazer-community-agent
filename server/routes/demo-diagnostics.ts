import { Router } from 'express';
import { getRequestUser } from '../auth';
import { getProjectContext } from '../../src/project-context';
import { demoDiagnosticPreview, demoDiagnosticProfiles } from '../../src/demo-diagnostics';

export function createDemoDiagnosticsRouter(resolveUser = getRequestUser) {
  const router = Router();
  router.use(async (req, res, next) => {
    try {
      const user = await resolveUser(req);
      if (!user) { res.status(401).json({ error: 'Authentication required.' }); return; }
      if (!user.isDemo || !getProjectContext().demoMode) { res.status(403).json({ error: 'Demo workspace required.' }); return; }
      res.setHeader('Cache-Control', 'no-store');
      next();
    } catch { res.status(401).json({ error: 'Authentication required.' }); }
  });
  router.get('/', (_req, res) => { res.json({ simulated: true, profiles: demoDiagnosticProfiles() }); });
  router.post('/preview', (req, res) => {
    const { username, message } = req.body || {};
    if (typeof username !== 'string' || typeof message !== 'string' || !message.trim() || message.length > 3000) {
      res.status(400).json({ error: 'Choose a demo contributor and enter a message under 3,000 characters.' }); return;
    }
    try { res.json(demoDiagnosticPreview(username, message.trim())); }
    catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Demo preview failed.' }); }
  });
  router.use((_req, res) => { res.status(404).json({ error: 'Demo endpoint not found.' }); });
  return router;
}
export default createDemoDiagnosticsRouter();
