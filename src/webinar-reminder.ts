import * as dotenv from 'dotenv';
import { loadBotConfig } from './config';
import { DiscourseClient } from './discourse-client';
import { readDataJSON } from './data-store';
import { appendOperationLog } from './operations-log';

dotenv.config();

interface Webinar {
  id: string;
  type: 'webinar' | 'onboarding';
  title: string;
  date: string;
  timeUtc: string;
  timeLabel: string;
  link: string;
  invitees: string[];
}

const WINDOW_MIN = 45;
const WINDOW_MAX = 75;

async function readWebinars(): Promise<Webinar[]> {
  try {
    return await readDataJSON<Webinar[]>('data/webinars.json');
  } catch {
    return [];
  }
}

function getWebinarDateTimeUtc(webinar: Webinar): Date {
  const [hours, minutes] = webinar.timeUtc.split(':').map(Number);
  const dt = new Date(`${webinar.date}T00:00:00Z`);
  dt.setUTCHours(hours, minutes, 0, 0);
  return dt;
}

function minutesUntil(dt: Date): number {
  return (dt.getTime() - Date.now()) / 1000 / 60;
}

async function sendToChat(message: string): Promise<void> {
  const config = loadBotConfig();
  const client = new DiscourseClient({
    baseUrl: config.communityBaseUrl,
    apiKey: config.discourseApiKey,
    apiClientId: config.discourseApiClientId,
  });
  await client.sendChatMessage(config.communityChatChannelId, message);
}

function buildReminderMessage(session: Webinar, minutesLeft: number): string {
  const roundedMin = Math.round(minutesLeft);
  const inviteeSection = session.invitees.length > 0
    ? `\nThis is for:\n${session.invitees.join('\n')}\n`
    : '';

  if (session.type === 'onboarding') {
    return `🎓 **Reminder — Onboarding session: ${session.title} starts in ~${roundedMin} minutes** (${session.timeLabel})\n${inviteeSection}
Session link:\n${session.link}\n\nPlease join on time 🙏`;
  }

  return `⏰ **Reminder — ${session.title} starts in ~${roundedMin} minutes** (${session.timeLabel})\n${inviteeSection}
Zoom link:\n${session.link}\n\nPlease join on time 🙏`;
}

export async function runWebinarReminderJob(): Promise<void> {
  const webinars = await readWebinars();
  const now = new Date();

  console.log(`🕐 Checking webinars at ${now.toISOString()}`);

  const upcoming = webinars.filter((w) => {
    const dt = getWebinarDateTimeUtc(w);
    const min = minutesUntil(dt);
    return min >= WINDOW_MIN && min <= WINDOW_MAX;
  });

  if (upcoming.length === 0) {
    console.log('No webinars in the reminder window. Nothing to send.');
    await appendOperationLog({
      action: 'webinar_reminder',
      status: 'skipped',
      message: 'No sessions in reminder window',
      metadata: { checkedAt: now.toISOString() },
    });
    return;
  }

  for (const webinar of upcoming) {
    const dt = getWebinarDateTimeUtc(webinar);
    const min = minutesUntil(dt);
    const message = buildReminderMessage(webinar, min);

    console.log(`📢 Sending reminder for: ${webinar.title}`);
    await sendToChat(message);
    await appendOperationLog({
      action: 'webinar_reminder',
      status: 'success',
      message: `Sent reminder for ${webinar.title}`,
      metadata: { id: webinar.id, type: webinar.type, date: webinar.date, timeUtc: webinar.timeUtc },
    });
    console.log('✅ Reminder sent');
  }
}

if (require.main === module) {
  runWebinarReminderJob().catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
}
