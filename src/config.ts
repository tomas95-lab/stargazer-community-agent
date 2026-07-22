import * as path from 'path';
import * as dotenv from 'dotenv';
import { getProjectContext } from './project-context';

dotenv.config();

export interface DailyThreadConfig {
  date: string;
  title: string;
  topic: string;
  reminderTitle: string;
  reminderBody: string;
  goodExample: string;
  badExample: string;
  quickRule: string;
  tags?: string[];
  webinar?: {
    enabled: boolean;
    mandatory: boolean;
    timeLabel: string;
    link: string;
    invitees?: string[];
  };
}

export interface BotConfig {
  communityBaseUrl: string;
  communityCategoryId: string;
  communityCategorySlug: string;
  communityChatChannelId: string;
  discourseApiKey: string;
  discourseApiClientId: string;
  discourseUsername: string;
}

export function loadBotConfig(): BotConfig {
  const context = getProjectContext();
  const runtimeConfig = context.botConfig;
  if (runtimeConfig && (runtimeConfig.discourseApiKey || context.demoMode)) {
    return runtimeConfig;
  }

  const key = process.env.DISCOURSE_API_KEY;
  if (!key) throw new Error('DISCOURSE_API_KEY not set in .env');

  return {
    communityBaseUrl: process.env.COMMUNITY_BASE_URL || 'https://community.outlier.ai',
    communityCategoryId: process.env.COMMUNITY_CATEGORY_ID || '',
    communityCategorySlug: process.env.COMMUNITY_CATEGORY_SLUG || 'testing-project',
    communityChatChannelId: process.env.COMMUNITY_CHAT_CHANNEL_ID || '',
    discourseApiKey: key,
    discourseApiClientId: process.env.DISCOURSE_API_CLIENT_ID || 'daily-thread-bot',
    discourseUsername: process.env.DISCOURSE_USERNAME || '',
  };
}

export const PATHS = {
  root: path.resolve(__dirname, '..'),
  templates: path.resolve(__dirname, '..', 'templates'),
  data: path.resolve(__dirname, '..', 'data'),
  output: path.resolve(__dirname, '..', 'output'),
};
