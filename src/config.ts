import * as path from 'path';
import * as dotenv from 'dotenv';

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
  };
}

export interface BotConfig {
  headless: boolean;
  slowMo: number;
  browserProfilePath: string;
  communityBaseUrl: string;
  communityNewTopicUrl: string;
  communityCategoryId: string;
  communityCategorySlug: string;
  communityChatUrl: string;
  selectors: typeof selectors;
  chatSelectors: typeof chatSelectors;
}

export const selectors = {
  titleInput: '#reply-title, textarea[placeholder*="title" i], input[placeholder*="title" i]',
  bodyInput: '.d-editor-input, textarea.ember-text-area',
  createTopicButton: 'button.btn-primary.create, button:has-text("Create Topic"), button:has-text("+ Create Topic")',
  categoryDropdown: '.category-chooser',
  categoryOption: (id: string) => `[data-value="${id}"], [data-id="${id}"]`,
  tagChooser: '.mini-tag-chooser summary, .mini-tag-chooser .select-kit-header',
  tagInput: '.mini-tag-chooser .filter-input, .mini-tag-chooser input[type="text"]',
  tagOption: (tag: string) => `.select-kit-row[data-value="${tag}"], .select-kit-row[data-name="${tag}"], .select-kit-row:has-text("${tag}")`,
};

export const chatSelectors = {
  messageInput: '.chat-composer__input, .chat-composer-input, textarea[placeholder*="Message" i], .chat-message-creator textarea',
  sendButton: 'button.chat-composer-button.-send, button[data-id="send-btn"], button.send-btn',
};

export function loadBotConfig(): BotConfig {
  return {
    headless: process.env.HEADLESS === 'true',
    slowMo: parseInt(process.env.SLOW_MO || '50', 10),
    browserProfilePath: path.resolve(process.env.BROWSER_PROFILE_PATH || '.browser-profile'),
    communityBaseUrl: process.env.COMMUNITY_BASE_URL || 'https://community.outlier.ai',
    communityNewTopicUrl: process.env.COMMUNITY_NEW_TOPIC_URL || 'https://community.outlier.ai/new-topic?category_id=15895',
    communityCategoryId: process.env.COMMUNITY_CATEGORY_ID || '15895',
    communityCategorySlug: process.env.COMMUNITY_CATEGORY_SLUG || 'stargazer-axiom',
    communityChatUrl: process.env.COMMUNITY_CHAT_URL || 'https://community.outlier.ai/chat/c/stargazer-axiom/828853',
    selectors,
    chatSelectors,
  };
}

export const PATHS = {
  root: path.resolve(__dirname, '..'),
  templates: path.resolve(__dirname, '..', 'templates'),
  data: path.resolve(__dirname, '..', 'data'),
  output: path.resolve(__dirname, '..', 'output'),
};
