import { Router, Request, Response } from 'express';
import { renderDailyThread, renderAnnouncement } from '../../src/templates';
import { formatPostTitle } from '../../src/utils';
import { loadBotConfig } from '../../src/config';
import { CommunityBot } from '../../src/communityBot';
import { DailyThreadConfig } from '../../src/config';
import { requireAdminToken } from '../auth';
import { readDataJSON, writeDataJSON } from '../../src/data-store';
import { loadProjectLinks } from '../../src/links';
import { appendOperationLog } from '../../src/operations-log';

const router = Router();

router.post('/:date', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const topics = await readDataJSON<DailyThreadConfig[]>('data/topics.json');
    const topic = topics.find((t) => t.date === req.params.date);
    if (!topic) {
      res.status(404).json({ error: 'Topic not found' });
      return;
    }

    const postChat = req.body.postChat !== false;
    const botConfig = loadBotConfig();
    const postTitle = formatPostTitle(topic.date);
    const links = await loadProjectLinks();
    const threadContent = renderDailyThread(topic, links);

    const bot = new CommunityBot(botConfig);
    const publishedUrl = await bot.publishDailyThread(postTitle, threadContent, topic.tags);

    await writeDataJSON(
      `output/published-url-${topic.date}.txt`,
      { url: publishedUrl, date: topic.date, publishedAt: new Date().toISOString() },
      `published thread for ${topic.date}`
    );

    if (postChat) {
      const announcementText = renderAnnouncement(topic, publishedUrl);
      await bot.postAnnouncementToChat(announcementText);
    }

    await appendOperationLog({
      action: 'publish_daily_thread',
      status: 'success',
      message: `Published daily thread for ${topic.date}`,
      metadata: { date: topic.date, url: publishedUrl, postChat },
    });

    res.json({ ok: true, url: publishedUrl });
  } catch (err) {
    await appendOperationLog({
      action: 'publish_daily_thread',
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
      metadata: { date: req.params.date },
    });
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
