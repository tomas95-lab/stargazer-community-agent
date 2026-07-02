import { Router, Request, Response } from 'express';
import { loadTemplates, renderTemplate } from '../../src/comms/renderer';
import { readJSON, writeJSON } from '../../src/github-storage';

const router = Router();
const LINKS_FILE = 'data/links.json';

async function readLinks(): Promise<Record<string, string>> {
  try {
    const { data } = await readJSON<Record<string, string>>(LINKS_FILE);
    return data;
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

router.post('/send', async (req: Request, res: Response) => {
  const { message, channelId } = req.body as { message: string; channelId?: string };
  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const apiKey = process.env.DISCOURSE_API_KEY;
  const clientId = process.env.DISCOURSE_API_CLIENT_ID || 'daily-thread-bot';
  const baseUrl = process.env.COMMUNITY_BASE_URL || 'https://community.outlier.ai';
  const channel = channelId || process.env.COMMUNITY_CHAT_CHANNEL_ID || '828853';

  if (!apiKey) {
    res.status(500).json({ error: 'DISCOURSE_API_KEY not configured' });
    return;
  }

  try {
    const r = await fetch(`${baseUrl}/chat/${channel}.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Api-Key': apiKey,
        'User-Api-Client-Id': clientId,
      },
      body: JSON.stringify({ message }),
    });

    if (!r.ok) {
      const body = await r.text();
      res.status(r.status).json({ error: `Discourse error ${r.status}: ${body.slice(0, 200)}` });
      return;
    }

    const data = await r.json() as { message_id: number };
    res.json({ ok: true, message_id: data.message_id });
  } catch (err) {
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

router.put('/links', async (req: Request, res: Response) => {
  try {
    const current = await readLinks();
    const updated = { ...current, ...req.body };
    await writeJSON(LINKS_FILE, updated, 'update links');
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
