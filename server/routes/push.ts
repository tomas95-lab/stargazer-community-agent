import { Request, Response, Router } from 'express';
import { AuthenticatedRequest, requirePlatformUser } from '../auth';
import {
  BrowserPushSubscription,
  pushConfigured,
  pushSubscriptionCount,
  removePushSubscription,
  savePushSubscription,
  sendProjectPush,
  vapidPublicKey,
} from '../../src/push-notifications';
import { projectKeyFromRow } from '../platform-store';

const router = Router();

function context(req: Request) {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.authUser || !authReq.platformProject) throw new Error('Select a project before configuring notifications.');
  return { user: authReq.authUser, project: authReq.platformProject, projectKey: projectKeyFromRow(authReq.platformProject) };
}

router.get('/status', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const { user, projectKey } = context(req);
    res.json({ configured: pushConfigured(), publicKey: vapidPublicKey(), subscriptions: await pushSubscriptionCount(user.id, projectKey) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/subscribe', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const { user, projectKey } = context(req);
    await savePushSubscription(user.id, projectKey, req.body?.subscription as BrowserPushSubscription, req.header('user-agent') || '');
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/unsubscribe', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const { user } = context(req);
    await removePushSubscription(user.id, String(req.body?.endpoint || ''));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/test', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const { user, projectKey } = context(req);
    const result = await sendProjectPush(projectKey, {
      title: 'Community Agent notifications are ready',
      body: 'You will receive alerts for new messages, replies, and human review items.',
      url: '/settings',
      tag: `push-test:${Date.now()}`,
    }, user.id);
    res.json({ ok: result.sent > 0, ...result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
