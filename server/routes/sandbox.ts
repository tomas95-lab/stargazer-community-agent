import { Router, Request, Response } from 'express';
import { evaluateSupportMessage, warRoomAvailabilityDecision, warRoomIsOpenDay } from '../../src/community-agent';
import { loadProjectLinks } from '../../src/links';
import { appendOperationLog } from '../../src/operations-log';
import { requireAdminToken } from '../auth';

const router = Router();

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseNow(value: unknown): Date {
  const raw = text(value);
  if (!raw) return new Date();
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : new Date();
}

router.post('/evaluate', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const message = text(req.body?.message);
    if (!message) {
      res.status(400).json({ error: 'Message is required.' });
      return;
    }

    const username = text(req.body?.username) || 'sandbox.user';
    const channel = text(req.body?.channel) || 'community';
    const extraContext = text(req.body?.context);
    const now = parseNow(req.body?.nowIso);
    const { warRoom: warRoomLink } = await loadProjectLinks();
    const context = [
      `Sandbox evaluation only. Do not post.`,
      `Channel: ${channel}`,
      `Evaluation time: ${now.toISOString()}`,
      extraContext ? `Extra context:\n${extraContext}` : '',
    ].filter(Boolean).join('\n\n');

    const deterministicDecision = warRoomAvailabilityDecision(message, warRoomLink, now);
    const decision = deterministicDecision ||
      await evaluateSupportMessage(username, message, context, warRoomLink, warRoomIsOpenDay(now));

    const result = {
      mode: 'sandbox',
      generatedAt: new Date().toISOString(),
      deterministic: Boolean(deterministicDecision),
      input: {
        username,
        channel,
        message,
        nowIso: now.toISOString(),
        context: extraContext,
      },
      decision,
    };

    await appendOperationLog({
      action: 'sandbox_evaluation',
      status: decision.action === 'reply' ? 'success' : 'skipped',
      message: `Sandbox evaluated ${channel} message from ${username}.`,
      metadata: {
        action: decision.action,
        confidence: decision.confidence,
        deterministic: Boolean(deterministicDecision),
      },
    }, {
      type: 'sandbox_evaluation',
      result,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
