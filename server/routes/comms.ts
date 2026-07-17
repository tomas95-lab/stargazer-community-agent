import { Router, Request, Response } from 'express';
import { renderTemplate } from '../../src/comms/renderer';
import {
  createProjectCommsTemplate,
  deleteProjectCommsTemplate,
  loadProjectCommsTemplates,
  updateProjectCommsTemplate,
} from '../../src/comms/template-store';
import { requireAdminToken } from '../auth';
import { loadBotConfig } from '../../src/config';
import { DiscourseClient } from '../../src/discourse-client';
import { readDataJSON, writeDataJSON } from '../../src/data-store';
import { appendOperationLog } from '../../src/operations-log';
import {
  cancelScheduledMessage,
  createScheduledMessage,
  deleteScheduledMessage,
  listScheduledMessages,
  processDueScheduledMessages,
} from '../../src/scheduled-messages';

const router = Router();
const LINKS_FILE = 'data/links.json';

function routeParam(value: unknown): string {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

async function readLinks(): Promise<Record<string, string>> {
  try {
    return await readDataJSON<Record<string, string>>(LINKS_FILE);
  } catch {
    return {};
  }
}

router.get('/templates', async (_req: Request, res: Response) => {
  try {
    const templates = await loadProjectCommsTemplates();
    const { category } = _req.query;
    if (category && typeof category === 'string') {
      res.json(templates.filter((t) => t.category === category));
    } else {
      res.json(templates);
    }
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const templates = await loadProjectCommsTemplates();
    const template = templates.find((t) => t.id === req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/templates', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const template = await createProjectCommsTemplate(req.body);
    await appendOperationLog({
      action: 'create_comms_template',
      status: 'success',
      message: `Created comms template ${template.name}`,
      metadata: { id: template.id, category: template.category },
    });
    res.status(201).json(template);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.put('/templates/:id', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const templateId = routeParam(req.params.id);
    const template = await updateProjectCommsTemplate(templateId, req.body);
    await appendOperationLog({
      action: 'update_comms_template',
      status: 'success',
      message: `Updated comms template ${template.name}`,
      metadata: { id: template.id, category: template.category },
    });
    res.json(template);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(message === 'Template not found.' ? 404 : 400).json({ error: message });
  }
});

router.delete('/templates/:id', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const templateId = routeParam(req.params.id);
    await deleteProjectCommsTemplate(templateId);
    await appendOperationLog({
      action: 'delete_comms_template',
      status: 'success',
      message: `Deleted comms template ${templateId}`,
      metadata: { id: templateId },
    });
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(message === 'Template not found.' ? 404 : 400).json({ error: message });
  }
});

router.post('/render', async (req: Request, res: Response) => {
  const { id, variables } = req.body as { id: string; variables: Record<string, string> };
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }
  try {
    const templates = await loadProjectCommsTemplates();
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
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
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

router.get('/scheduled', requireAdminToken, async (_req: Request, res: Response) => {
  try {
    res.json({ messages: await listScheduledMessages() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/scheduled', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const message = await createScheduledMessage(req.body || {});
    res.status(201).json({ message });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/scheduled/run', requireAdminToken, async (_req: Request, res: Response) => {
  try {
    res.json(await processDueScheduledMessages());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/scheduled/:id/cancel', requireAdminToken, async (req: Request, res: Response) => {
  try {
    res.json({ message: await cancelScheduledMessage(routeParam(req.params.id)) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(message.includes('not found') ? 404 : 400).json({ error: message });
  }
});

router.delete('/scheduled/:id', requireAdminToken, async (req: Request, res: Response) => {
  try {
    await deleteScheduledMessage(routeParam(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(message.includes('not found') ? 404 : 400).json({ error: message });
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
