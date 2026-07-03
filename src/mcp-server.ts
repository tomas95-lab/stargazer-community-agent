import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadBotConfig } from './config';
import { CommunityBot } from './communityBot';
import { renderDailyThread, renderAnnouncement } from './templates';
import { formatPostTitle, todayDate } from './utils';

const BASE_URL = process.env.COMMUNITY_BASE_URL || 'https://community.outlier.ai';
const API_KEY = process.env.DISCOURSE_API_KEY || '';
const CLIENT_ID = process.env.DISCOURSE_API_CLIENT_ID || 'daily-thread-bot';
const CHANNEL_ID = process.env.COMMUNITY_CHAT_CHANNEL_ID || '828853';

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'User-Api-Key': API_KEY,
    'User-Api-Client-Id': CLIENT_ID,
  };
}

const server = new McpServer({
  name: 'stargazer-community-bot',
  version: '1.0.0',
});

server.tool(
  'publish_daily_thread',
  'Publish today\'s daily thread to the Stargazer Axiom community. Reads topic data and posts it.',
  {
    date: z.string().optional().describe('Date in YYYY-MM-DD format. Defaults to today.'),
    post_chat: z.boolean().optional().describe('Also post announcement to chat channel. Defaults to true.'),
  },
  async ({ date, post_chat }) => {
    const targetDate = date || todayDate();
    const postChat = post_chat !== false;

    const response = await fetch(`https://raw.githubusercontent.com/${process.env.GITHUB_OWNER || 'tomasruiz653'}/${process.env.GITHUB_REPO || 'community_bot'}/main/data/topics.json`);
    const topics = await response.json() as Array<{ date: string; [key: string]: unknown }>;
    const topic = topics.find((t) => t.date === targetDate) || { ...topics[0], date: targetDate };

    if (!topic) return { content: [{ type: 'text', text: 'No topics found.' }] };

    const botConfig = loadBotConfig();
    const bot = new CommunityBot(botConfig);
    const title = formatPostTitle(targetDate);
    const typedTopic = topic as unknown as Parameters<typeof renderDailyThread>[0];
    const body = renderDailyThread(typedTopic);

    const url = await bot.publishDailyThread(title, body, (topic as { tags?: string[] }).tags);

    if (postChat) {
      const announcement = renderAnnouncement(typedTopic, url);
      await bot.postAnnouncementToChat(announcement);
    }

    return { content: [{ type: 'text', text: `✅ Published: ${url}` }] };
  }
);

server.tool(
  'send_chat_message',
  'Send a message to the Stargazer Axiom community chat channel.',
  {
    message: z.string().describe('The message to send to the chat channel.'),
  },
  async ({ message }) => {
    const res = await fetch(`${BASE_URL}/chat/${CHANNEL_ID}.json`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ message }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { content: [{ type: 'text', text: `❌ Error ${res.status}: ${err.slice(0, 200)}` }] };
    }
    return { content: [{ type: 'text', text: '✅ Message sent to chat.' }] };
  }
);

server.tool(
  'read_chat_messages',
  'Read recent messages from the Stargazer Axiom community chat channel.',
  {
    count: z.number().optional().describe('Number of recent messages to fetch. Defaults to 20.'),
  },
  async ({ count }) => {
    const limit = count || 20;
    const res = await fetch(`${BASE_URL}/chat/${CHANNEL_ID}/messages.json?page_size=${limit}`, {
      headers: headers(),
    });
    if (!res.ok) {
      return { content: [{ type: 'text', text: `❌ Error ${res.status}` }] };
    }
    const data = await res.json() as { chat_messages?: Array<{ message: string; user: { username: string }; created_at: string }> };
    const msgs = data.chat_messages || [];
    const text = msgs.map((m) => `[${m.user?.username}] ${m.message}`).join('\n');
    return { content: [{ type: 'text', text: text || 'No messages found.' }] };
  }
);

server.tool(
  'read_community_posts',
  'Read recent posts/topics from the Stargazer Axiom community forum.',
  {
    category_id: z.number().optional().describe('Category ID to filter. Defaults to Stargazer Axiom category.'),
    count: z.number().optional().describe('Number of topics to fetch. Defaults to 10.'),
  },
  async ({ category_id, count }) => {
    const catId = category_id || parseInt(process.env.COMMUNITY_CATEGORY_ID || '15895');
    const limit = count || 10;
    const res = await fetch(`${BASE_URL}/c/${catId}.json?page=0`, {
      headers: headers(),
    });
    if (!res.ok) {
      return { content: [{ type: 'text', text: `❌ Error ${res.status}` }] };
    }
    const data = await res.json() as { topic_list?: { topics?: Array<{ title: string; posts_count: number; last_posted_at: string; slug: string; id: number }> } };
    const topics = (data.topic_list?.topics || []).slice(0, limit);
    const text = topics.map((t) => `- [${t.title}](${BASE_URL}/t/${t.slug}/${t.id}) (${t.posts_count} replies)`).join('\n');
    return { content: [{ type: 'text', text: text || 'No topics found.' }] };
  }
);

server.tool(
  'reply_to_topic',
  'Reply to a specific topic in the Stargazer Axiom community forum.',
  {
    topic_id: z.number().describe('The topic ID to reply to.'),
    message: z.string().describe('The reply message content (supports markdown).'),
  },
  async ({ topic_id, message }) => {
    const res = await fetch(`${BASE_URL}/posts.json`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ topic_id, raw: message }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { content: [{ type: 'text', text: `❌ Error ${res.status}: ${err.slice(0, 200)}` }] };
    }
    const data = await res.json() as { id: number };
    return { content: [{ type: 'text', text: `✅ Reply posted (post ID: ${data.id})` }] };
  }
);

server.tool(
  'read_topic_posts',
  'Read all posts/replies inside a specific topic.',
  {
    topic_id: z.number().describe('The topic ID to read.'),
  },
  async ({ topic_id }) => {
    const res = await fetch(`${BASE_URL}/t/${topic_id}.json`, {
      headers: headers(),
    });
    if (!res.ok) {
      return { content: [{ type: 'text', text: `❌ Error ${res.status}` }] };
    }
    const data = await res.json() as { title?: string; post_stream?: { posts?: Array<{ username: string; cooked: string; created_at: string }> } };
    const posts = data.post_stream?.posts || [];
    const text = `# ${data.title}\n\n` + posts.map((p) => `**${p.username}** (${p.created_at.split('T')[0]}):\n${p.cooked.replace(/<[^>]+>/g, '').trim()}`).join('\n\n---\n\n');
    return { content: [{ type: 'text', text: text }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
