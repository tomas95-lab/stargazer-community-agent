import { Router, Request, Response } from 'express';
import { loadTemplates, renderTemplate } from '../../src/comms/renderer';
import { requireAdminToken } from '../auth';
import { loadBotConfig } from '../../src/config';
import { DiscourseClient } from '../../src/discourse-client';
import { readDataJSON, writeDataJSON } from '../../src/data-store';
import { appendOperationLog } from '../../src/operations-log';

const router = Router();
const LINKS_FILE = 'data/links.json';

async function readLinks(): Promise<Record<string, string>> {
  try {
    return await readDataJSON<Record<string, string>>(LINKS_FILE);
  } catch {
    return {};
  }
}

router.get('/templates', (_req: Request, res: Response) => {
  const templates = loadTemplates();
  const { category } = _req.query;
  if (category && typeof category === 'string') {
    res.json(templates.filter((t) => t.category === category));
  } else {
    res.json(templates);
  }
});

router.get('/templates/:id', (req: Request, res: Response) => {
  const templates = loadTemplates();
  const template = templates.find((t) => t.id === req.params.id);
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json(template);
});

router.post('/render', (req: Request, res: Response) => {
  const { id, variables } = req.body as { id: string; variables: Record<string, string> };
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }
  const templates = loadTemplates();
  const template = templates.find((t) => t.id === id);
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  const result = renderTemplate(template, variables || {});
  if (result.errors.length > 0) {
    res.status(422).json({ errors: result.errors });
    return;
  }
  res.json({ output: result.output });
});

router.post('/send', requireAdminToken, async (req: Request, res: Response) => {
  const { message, channelId } = req.body as { message: string; channelId?: string };
  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  try {
    const config = loadBotConfig();
    const client = new DiscourseClient({
      baseUrl: config.communityBaseUrl,
      apiKey: config.discourseApiKey,
      apiClientId: config.discourseApiClientId,
    });
    const data = await client.sendChatMessage(channelId || config.communityChatChannelId, message);
    await appendOperationLog({
      action: 'send_chat_message',
      status: 'success',
      message: 'Sent chat message',
      metadata: { channelId: channelId || config.communityChatChannelId, messageLength: message.length },
    });
    res.json({ ok: true, message_id: data.message_id || data.id || 0 });
  } catch (err) {
    await appendOperationLog({
      action: 'send_chat_message',
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
      metadata: { channelId, messageLength: message.length },
    });
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/links', async (_req: Request, res: Response) => {
  try {
    res.json(await readLinks());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.put('/links', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const current = await readLinks();
    const updated = { ...current, ...req.body };
    await writeDataJSON(LINKS_FILE, updated, 'update links');
    await appendOperationLog({
      action: 'update_links',
      status: 'success',
      message: 'Updated project links',
      metadata: { keys: Object.keys(req.body || {}) },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
