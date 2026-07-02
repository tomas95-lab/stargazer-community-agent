import { Router, Request, Response } from 'express';
import { renderDailyThread, renderAnnouncement } from '../../src/templates';
import { formatPostTitle } from '../../src/utils';
import { loadBotConfig } from '../../src/config';
import { CommunityBot } from '../../src/communityBot';
import { readJSON, writeJSON } from '../../src/github-storage';
import { DailyThreadConfig } from '../../src/config';

const router = Router();

router.post('/:date', async (req: Request, res: Response) => {
  try {
    const { data: topics } = await readJSON<DailyThreadConfig[]>('data/topics.json');
    const topic = topics.find((t) => t.date === req.params.date);
    if (!topic) {
      res.status(404).json({ error: 'Topic not found' });
      return;
    }

    const postChat = req.body.postChat !== false;
    const botConfig = loadBotConfig();
    const postTitle = formatPostTitle(topic.date);
    const threadContent = renderDailyThread(topic);

    const bot = new CommunityBot(botConfig);
    const publishedUrl = await bot.publishDailyThread(postTitle, threadContent, topic.tags);

    await writeJSON(
      `output/published-url-${topic.date}.txt`,
      { url: publishedUrl, date: topic.date, publishedAt: new Date().toISOString() },
      `published thread for ${topic.date}`
    );

    if (postChat) {
      const announcementText = renderAnnouncement(topic, publishedUrl);
      await bot.postAnnouncementToChat(announcementText);
    }

    res.json({ ok: true, url: publishedUrl });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
