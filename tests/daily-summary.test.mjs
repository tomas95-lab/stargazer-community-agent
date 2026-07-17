import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getDailySummary } from '../dist/daily-summary.js';
import { runWithProjectContext } from '../dist/project-context.js';
import { writeDataJSON } from '../dist/data-store.js';

const projectId = 'summary-test-project';
const projectOutput = path.resolve('output/projects', projectId);

async function withLocalProject(fn) {
  const previousStore = process.env.DATA_STORE;
  process.env.DATA_STORE = 'local';
  await fs.rm(projectOutput, { recursive: true, force: true });
  try {
    return await runWithProjectContext({ projectId, source: 'default' }, fn);
  } finally {
    await fs.rm(projectOutput, { recursive: true, force: true });
    if (previousStore === undefined) delete process.env.DATA_STORE;
    else process.env.DATA_STORE = previousStore;
  }
}

test('daily summary aggregates daily automation activity from operation logs', async () => {
  await withLocalProject(async () => {
    const communityEntry = {
      id: '11111111-1111-4111-8111-111111111111',
      at: '2026-07-17T16:00:00.000Z',
      action: 'community_agent',
      status: 'success',
      message: 'Community agent run with posting enabled',
      metadata: {
        checked: 3,
        candidates: 2,
        posted: 1,
        reacted: 1,
        needsHuman: 1,
      },
    };
    const dmEntry = {
      id: '22222222-2222-4222-8222-222222222222',
      at: '2026-07-17T18:30:00.000Z',
      action: 'dm_review',
      status: 'success',
      message: 'Found 2 incoming DM(s) for 2026-07-17.',
      metadata: {
        incomingMessages: 2,
        pendingIncomingMessages: 1,
        autoReplied: 1,
        autoNeedsHuman: 1,
      },
    };
    const dailyEntry = {
      id: '33333333-3333-4333-8333-333333333333',
      at: '2026-07-17T13:00:00.000Z',
      action: 'daily_publish_job',
      status: 'success',
      message: 'Published daily thread for 2026-07-17',
      metadata: {
        date: '2026-07-17',
      },
    };
    const errorEntry = {
      id: '44444444-4444-4444-8444-444444444444',
      at: '2026-07-17T20:00:00.000Z',
      action: 'cron_request',
      status: 'error',
      message: 'Unauthorized cron request',
      metadata: {},
    };

    await writeDataJSON('output/operations-log.json', [
      errorEntry,
      dmEntry,
      communityEntry,
      dailyEntry,
    ], 'test daily summary log');
    await writeDataJSON(`output/operation-details/${communityEntry.id}.json`, {
      entry: communityEntry,
      detail: {
        type: 'community_agent',
        decisions: [
          {
            itemId: 'community:1',
            username: 'learner',
            message: 'Can someone check this?',
            action: 'human',
            confidence: 0.42,
            reason: 'Needs project-specific confirmation.',
            needsHuman: true,
          },
        ],
      },
    }, 'test community detail');
    await writeDataJSON(`output/operation-details/${dmEntry.id}.json`, {
      entry: dmEntry,
      detail: {
        type: 'dm_review',
        result: {
          threads: [
            {
              channelId: 10,
              channelTitle: 'latam.coder',
              pendingIncomingMessages: 1,
              needsReply: true,
            },
          ],
          autoReply: {
            decisions: [
              {
                channelId: 10,
                username: 'latam.coder',
                action: 'human',
                confidence: 0.25,
                reason: 'Low confidence.',
              },
            ],
          },
        },
      },
    }, 'test dm detail');

    const summary = await getDailySummary(new Date('2026-07-17T12:00:00.000Z'));

    assert.equal(summary.utcDate, '2026-07-17');
    assert.equal(summary.status, 'attention');
    assert.equal(summary.totals.runs, 4);
    assert.equal(summary.totals.errors, 1);
    assert.equal(summary.totals.dailyThreadsPublished, 1);
    assert.equal(summary.totals.communityMessagesChecked, 3);
    assert.equal(summary.totals.communityRepliesPosted, 1);
    assert.equal(summary.totals.communityReactions, 1);
    assert.equal(summary.totals.dmIncomingMessages, 2);
    assert.equal(summary.totals.dmAutoReplies, 1);
    assert.equal(summary.errors.length, 1);
    assert.equal(summary.attentionItems.some((item) => item.source === 'community' && item.username === 'learner'), true);
    assert.equal(summary.attentionItems.some((item) => item.source === 'dm' && item.username === 'latam.coder'), true);
  });
});
