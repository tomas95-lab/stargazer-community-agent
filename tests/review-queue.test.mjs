import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getReviewQueue, updateReviewQueueItemStatus } from '../dist/review-queue.js';
import { runWithProjectContext } from '../dist/project-context.js';
import { writeDataJSON } from '../dist/data-store.js';

const projectId = 'review-queue-test-project';
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

test('review queue status overlay can resolve and reopen items', async () => {
  await withLocalProject(async () => {
    const entry = {
      id: '55555555-5555-4555-8555-555555555555',
      at: '2026-07-17T16:00:00.000Z',
      action: 'community_agent',
      status: 'success',
      message: 'Community agent run with posting enabled',
      metadata: {
        checked: 1,
        candidates: 1,
        needsHuman: 1,
      },
    };

    await writeDataJSON('output/operations-log.json', [entry], 'test review queue log');
    await writeDataJSON(`output/operation-details/${entry.id}.json`, {
      entry,
      detail: {
        type: 'community_agent',
        items: [
          {
            id: 'community:100',
            chatMessageId: 100,
            createdAt: '2026-07-17T15:59:00.000Z',
            message: 'Can someone review my access?',
          },
        ],
        decisions: [
          {
            itemId: 'community:100',
            username: 'learner',
            message: 'Can someone review my access?',
            action: 'human',
            confidence: 0.32,
            reason: 'Needs human confirmation.',
            needsHuman: true,
          },
        ],
      },
    }, 'test review queue detail');

    const openQueue = await getReviewQueue(50);
    assert.equal(openQueue.items.length, 1);
    assert.equal(openQueue.items[0].status, 'open');
    assert.equal(openQueue.totals.open, 1);

    await updateReviewQueueItemStatus(openQueue.items[0].id, 'resolved');

    const hiddenQueue = await getReviewQueue(50);
    assert.equal(hiddenQueue.items.length, 0);
    assert.equal(hiddenQueue.totals.open, 0);
    assert.equal(hiddenQueue.totals.resolved, 1);

    const visibleClosedQueue = await getReviewQueue(50, { includeResolved: true });
    assert.equal(visibleClosedQueue.items.length, 1);
    assert.equal(visibleClosedQueue.items[0].status, 'resolved');

    await updateReviewQueueItemStatus(openQueue.items[0].id, 'open');

    const reopenedQueue = await getReviewQueue(50);
    assert.equal(reopenedQueue.items.length, 1);
    assert.equal(reopenedQueue.items[0].status, 'open');
  });
});
