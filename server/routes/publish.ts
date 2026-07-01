import { Router, Request, Response } from 'express';
import { loadTopics, formatPostTitle, saveFile } from '../../src/utils';
import { renderDailyThread, renderAnnouncement } from '../../src/templates';
import { loadBotConfig } from '../../src/config';
import { CommunityBot } from '../../src/communityBot';

const router = Router();

let activeBot: CommunityBot | null = null;

router.post('/:date', async (req: Request, res: Response) => {
  const topics = loadTopics();
  const topic = topics.find((t) => t.date === req.params.date);
  if (!topic) {
    res.status(404).json({ error: 'Topic not found' });
    return;
  }

  const postChat = req.body.postChat !== false;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (type: string, data: unknown) => {
    res.write(`data: ${JSON.stringify({ type, ...( typeof data === 'string' ? { message: data } : data) })}\n\n`);
  };

  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args: unknown[]) => {
    const msg = args.map(String).join(' ');
    send('log', msg);
    origLog(...args);
  };
  console.error = (...args: unknown[]) => {
    const msg = args.map(String).join(' ');
    send('error', msg);
    origErr(...args);
  };

  try {
    const botConfig = loadBotConfig();
    const postTitle = formatPostTitle(topic.date);
    const threadContent = renderDailyThread(topic);

    saveFile(`daily-thread-${topic.date}.md`, threadContent);
    send('log', `Thread saved for ${topic.date}`);

    const bot = new CommunityBot(botConfig);
    activeBot = bot;

    await bot.launch();
    send('log', 'Browser launched');

    const publishedUrl = await bot.publishDailyThread(postTitle, threadContent, topic.tags);
    send('published', { url: publishedUrl });

    saveFile(`published-url-${topic.date}.txt`, publishedUrl);

    if (postChat) {
      const announcementText = renderAnnouncement(topic, publishedUrl);
      await bot.postAnnouncementToChat(announcementText);
      send('log', 'Announcement posted to chat');
    }

    send('done', { url: publishedUrl });
  } catch (err) {
    send('error', err instanceof Error ? err.message : String(err));
  } finally {
    console.log = origLog;
    console.error = origErr;
    if (activeBot) {
      await activeBot.close();
      activeBot = null;
    }
    res.end();
  }
});

export default router;
