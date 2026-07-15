import test from 'node:test';
import assert from 'node:assert/strict';
import { annotateProbableReplies } from '../dist/community-agent.js';

function item(overrides) {
  return {
    id: overrides.id,
    source: 'community',
    username: overrides.username || 'contributor',
    message: overrides.message,
    createdAt: overrides.createdAt,
    chatMessageId: overrides.chatMessageId,
    replyToChatMessageId: overrides.replyToChatMessageId,
    isStaff: overrides.isStaff,
  };
}

test('annotateProbableReplies links direct chat replies to the original question', () => {
  const annotated = annotateProbableReplies([
    item({
      id: 'community:1',
      username: 'learner',
      message: 'Can I get Cursor access?',
      createdAt: '2026-07-06T14:00:00.000Z',
      chatMessageId: 1,
    }),
    item({
      id: 'community:2',
      username: 'qm',
      message: 'Please join the War Room and we will check your access.',
      createdAt: '2026-07-06T14:03:00.000Z',
      chatMessageId: 2,
      replyToChatMessageId: 1,
    }),
  ]);

  assert.equal(annotated[0].probableReplies?.length, 1);
  assert.equal(annotated[0].probableReplies?.[0].match, 'direct_reply');
  assert.equal(annotated[0].probableReplies?.[0].username, 'qm');
});

test('annotateProbableReplies detects nearby answer-like followups from another user', () => {
  const annotated = annotateProbableReplies([
    item({
      id: 'community:10',
      username: 'learner',
      message: 'Is the War Room open?',
      createdAt: '2026-07-06T14:00:00.000Z',
      chatMessageId: 10,
    }),
    item({
      id: 'community:11',
      username: 'ops',
      message: 'Yes, it is open now. Here is the link.',
      createdAt: '2026-07-06T14:04:00.000Z',
      chatMessageId: 11,
    }),
  ]);

  assert.equal(annotated[0].probableReplies?.[0].match, 'nearby_followup');
});

test('annotateProbableReplies ignores same-user followups and old messages', () => {
  const annotated = annotateProbableReplies([
    item({
      id: 'community:20',
      username: 'learner',
      message: 'I have an access problem, can someone help?',
      createdAt: '2026-07-06T14:00:00.000Z',
      chatMessageId: 20,
    }),
    item({
      id: 'community:21',
      username: 'learner',
      message: 'Please I still need access.',
      createdAt: '2026-07-06T14:05:00.000Z',
      chatMessageId: 21,
    }),
    item({
      id: 'community:22',
      username: 'ops',
      message: 'Yes, please join the War Room.',
      createdAt: '2026-07-06T15:10:00.000Z',
      chatMessageId: 22,
    }),
  ]);

  assert.deepEqual(annotated[0].probableReplies, []);
});

test('annotateProbableReplies preserves replies discovered from Discourse thread preview', () => {
  const annotated = annotateProbableReplies([
    {
      ...item({
        id: 'community:30',
        username: 'learner',
        message: 'Will the War Room open today?',
        createdAt: '2026-07-06T14:00:00.000Z',
        chatMessageId: 30,
      }),
      probableReplies: [
        {
          id: 'community:31',
          username: 'ops',
          message: 'Good morning, the War Room will be open at 14:15 UTC',
          createdAt: '2026-07-06T14:05:00.000Z',
          chatMessageId: 31,
          match: 'direct_reply',
        },
      ],
    },
  ]);

  assert.equal(annotated[0].probableReplies?.length, 1);
  assert.equal(annotated[0].probableReplies?.[0].id, 'community:31');
});
