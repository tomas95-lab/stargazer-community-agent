import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  createScheduledMessage,
  listScheduledMessages,
  processDueScheduledMessages,
  scheduledDateTimeToUtc,
} from '../dist/scheduled-messages.js';
import { runWithProjectContext } from '../dist/project-context.js';

const projectId = 'scheduled-message-test';
const projectData = path.resolve('data/projects', projectId);
const projectOutput = path.resolve('output/projects', projectId);

async function withLocalProject(fn) {
  const previousBackend = process.env.STORAGE_BACKEND;
  const previousStore = process.env.DATA_STORE;
  const previousApiKey = process.env.DISCOURSE_API_KEY;
  const previousChannel = process.env.COMMUNITY_CHAT_CHANNEL_ID;
  process.env.STORAGE_BACKEND = 'local';
  process.env.DATA_STORE = 'local';
  process.env.DISCOURSE_API_KEY = 'test-key';
  process.env.COMMUNITY_CHAT_CHANNEL_ID = '42';
  await fs.rm(projectData, { recursive: true, force: true });
  await fs.rm(projectOutput, { recursive: true, force: true });
  try {
    return await runWithProjectContext({ projectId, source: 'default' }, fn);
  } finally {
    await fs.rm(projectData, { recursive: true, force: true });
    await fs.rm(projectOutput, { recursive: true, force: true });
    if (previousBackend === undefined) delete process.env.STORAGE_BACKEND;
    else process.env.STORAGE_BACKEND = previousBackend;
    if (previousStore === undefined) delete process.env.DATA_STORE;
    else process.env.DATA_STORE = previousStore;
    if (previousApiKey === undefined) delete process.env.DISCOURSE_API_KEY;
    else process.env.DISCOURSE_API_KEY = previousApiKey;
    if (previousChannel === undefined) delete process.env.COMMUNITY_CHAT_CHANNEL_ID;
    else process.env.COMMUNITY_CHAT_CHANNEL_ID = previousChannel;
  }
}

test('scheduledDateTimeToUtc converts PST/Pacific date and time to UTC', () => {
  assert.equal(
    scheduledDateTimeToUtc('2026-07-17', '09:30').toISOString(),
    '2026-07-17T16:30:00.000Z',
  );
});

test('processDueScheduledMessages sends pending messages that are due', async () => {
  await withLocalProject(async () => {
    const previousFetch = global.fetch;
    const calls = [];
    global.fetch = async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({ id: 1234 }),
      };
    };

    try {
      const scheduled = await createScheduledMessage({
        message: 'Scheduled hello',
        scheduledDate: '2026-07-17',
        scheduledTime: '09:30',
      });

      assert.equal(scheduled.status, 'pending');
      assert.equal((await listScheduledMessages()).length, 1);

      const result = await processDueScheduledMessages(new Date('2026-07-17T16:31:00.000Z'));

      assert.equal(result.sent, 1);
      assert.equal(result.failed, 0);
      assert.equal(calls[0].url, 'https://community.outlier.ai/chat/42.json');
      assert.deepEqual(JSON.parse(calls[0].init.body), { message: 'Scheduled hello' });
      assert.equal(result.messages[0].status, 'sent');
      assert.equal(result.messages[0].messageId, 1234);
    } finally {
      global.fetch = previousFetch;
    }
  });
});
