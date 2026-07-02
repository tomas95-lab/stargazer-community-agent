import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

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

const WEBINARS_PATH = path.resolve(__dirname, '../data/webinars.json');
const WINDOW_MIN = 45;
const WINDOW_MAX = 75;

function readWebinars(): Webinar[] {
  if (!fs.existsSync(WEBINARS_PATH)) return [];
  return JSON.parse(fs.readFileSync(WEBINARS_PATH, 'utf-8'));
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
  const apiKey = process.env.DISCOURSE_API_KEY;
  const clientId = process.env.DISCOURSE_API_CLIENT_ID || 'daily-thread-bot';
  const baseUrl = process.env.COMMUNITY_BASE_URL || 'https://community.outlier.ai';
  const channelId = process.env.COMMUNITY_CHAT_CHANNEL_ID || '828853';

  if (!apiKey) throw new Error('DISCOURSE_API_KEY not set');

  const res = await fetch(`${baseUrl}/chat/${channelId}.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Api-Key': apiKey,
      'User-Api-Client-Id': clientId,
    },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Discourse error ${res.status}: ${body.slice(0, 200)}`);
  }
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

async function main(): Promise<void> {
  const webinars = readWebinars();
  const now = new Date();

  console.log(`🕐 Checking webinars at ${now.toISOString()}`);

  const upcoming = webinars.filter((w) => {
    const dt = getWebinarDateTimeUtc(w);
    const min = minutesUntil(dt);
    return min >= WINDOW_MIN && min <= WINDOW_MAX;
  });

  if (upcoming.length === 0) {
    console.log('No webinars in the reminder window. Nothing to send.');
    return;
  }

  for (const webinar of upcoming) {
    const dt = getWebinarDateTimeUtc(webinar);
    const min = minutesUntil(dt);
    const message = buildReminderMessage(webinar, min);

    console.log(`📢 Sending reminder for: ${webinar.title}`);
    await sendToChat(message);
    console.log('✅ Reminder sent');
  }
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
