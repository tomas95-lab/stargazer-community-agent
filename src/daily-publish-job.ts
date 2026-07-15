import * as dotenv from 'dotenv';
dotenv.config();

import { loadBotConfig } from './config';
import { CommunityBot } from './communityBot';
import { DiscourseClient } from './discourse-client';
import { renderAnnouncement, renderDailyThread } from './templates';
import { readDataText, writeDataJSON } from './data-store';
import { loadProjectLinks } from './links';
import { appendOperationLog } from './operations-log';
import { formatPostTitle, getTodayTopic, isUtcBusinessDay, todayDate } from './utils';

export interface DailyPublishJobResult {
  status: 'published' | 'skipped';
  date: string;
  url?: string;
  postChat?: boolean;
  reason?: string;
}

export interface DailyPublishJobOptions {
  now?: Date;
}

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'y'].includes((value || '').toLowerCase());
}

export function dailyPublishSkipReason(now = new Date(), force = false): { date: string; reason: 'weekend_utc'; message: string } | null {
  const date = todayDate(now);
  if (force || isUtcBusinessDay(now)) return null;
  return {
    date,
    reason: 'weekend_utc',
    message: `Daily thread for ${date} skipped because it is Saturday or Sunday in UTC.`,
  };
}

function publishedMarkerPath(date: string): string {
  return `output/published-url-${date}.txt`;
}

async function wasAlreadyPublished(date: string): Promise<boolean> {
  try {
    await readDataText(publishedMarkerPath(date));
    return true;
  } catch {
    return false;
  }
}

async function writePublishedMarker(
  date: string,
  url: string,
  source: 'daily_publish_job' | 'existing_community_topic',
): Promise<void> {
  await writeDataJSON(
    publishedMarkerPath(date),
    { url, date, publishedAt: new Date().toISOString(), source },
    `published thread for ${date}`
  );
}

async function findExistingPublishedThread(title: string): Promise<string | null> {
  const config = loadBotConfig();
  const client = new DiscourseClient({
    baseUrl: config.communityBaseUrl,
    apiKey: config.discourseApiKey,
    apiClientId: config.discourseApiClientId,
  });
  const topics = await client.readCategoryTopics(parseInt(config.communityCategoryId, 10), 30);
  const match = topics.find((topic) => topic.title.trim().toLowerCase() === title.trim().toLowerCase());
  return match ? client.topicUrl(match.slug, match.id) : null;
}

export async function runDailyPublishJob(options: DailyPublishJobOptions = {}): Promise<DailyPublishJobResult> {
  const now = options.now || new Date();
  const date = todayDate(now);
  const force = truthy(process.env.FORCE_DAILY_PUBLISH);
  const postChat = process.env.DAILY_PUBLISH_POST_CHAT !== 'false';

  const scheduleSkip = dailyPublishSkipReason(now, force);
  if (scheduleSkip) {
    console.log(scheduleSkip.message);
    await appendOperationLog({
      action: 'daily_publish_job',
      status: 'skipped',
      message: scheduleSkip.message,
      metadata: { date: scheduleSkip.date, reason: scheduleSkip.reason },
    });
    return { status: 'skipped', date: scheduleSkip.date, reason: scheduleSkip.reason };
  }

  if (!force && await wasAlreadyPublished(date)) {
    console.log(`Daily thread for ${date} already has a published URL. Skipping.`);
    await appendOperationLog({
      action: 'daily_publish_job',
      status: 'skipped',
      message: `Daily thread for ${date} was already published`,
      metadata: { date },
    });
    return { status: 'skipped', date, reason: 'already_published' };
  }

  const topic = await getTodayTopic(date);
  const links = await loadProjectLinks();
  const title = formatPostTitle(topic.date);
  const body = renderDailyThread(topic, links);

  if (!force) {
    const existingUrl = await findExistingPublishedThread(title);
    if (existingUrl) {
      await writePublishedMarker(topic.date, existingUrl, 'existing_community_topic');
      console.log(`Daily thread for ${topic.date} already exists in Community. Skipping.`);
      await appendOperationLog({
        action: 'daily_publish_job',
        status: 'skipped',
        message: `Daily thread for ${topic.date} already exists in Community`,
        metadata: { date: topic.date, url: existingUrl },
      });
      return { status: 'skipped', date: topic.date, url: existingUrl, reason: 'existing_community_topic' };
    }
  }

  const bot = new CommunityBot(loadBotConfig());

  try {
    const url = await bot.publishDailyThread(title, body, topic.tags);
    await writePublishedMarker(topic.date, url, 'daily_publish_job');

    if (postChat) {
      await bot.postAnnouncementToChat(renderAnnouncement(topic, url));
    }

    await appendOperationLog({
      action: 'daily_publish_job',
      status: 'success',
      message: `Published daily thread for ${topic.date}`,
      metadata: { date: topic.date, url, postChat },
    });
    return { status: 'published', date: topic.date, url, postChat };
  } catch (err) {
    await appendOperationLog({
      action: 'daily_publish_job',
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
      metadata: { date: topic.date },
    });
    throw err;
  }
}

if (require.main === module) {
  runDailyPublishJob().then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
}
