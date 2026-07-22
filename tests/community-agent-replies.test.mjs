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
    threadId: overrides.threadId,
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
          message: 'Good morning, the War Room will be open at 07:15 PST',
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

test('annotateProbableReplies does not mark announcement thread roots as answered', () => {
  const annotated = annotateProbableReplies([
    {
      ...item({
        id: 'community:40',
        username: 'qm',
        message: '---------------------------------------------------------------- Hi Team! These CBs have hil_sandbox assigned! List in thread',
        createdAt: '2026-07-17T14:45:41.000Z',
        chatMessageId: 40,
      }),
      probableReplies: [
        {
          id: 'community:41',
          username: 'qm',
          message: 'latam.coder758@remotasks.com+outlier',
          createdAt: '2026-07-17T14:45:56.000Z',
          chatMessageId: 41,
          match: 'direct_reply',
        },
      ],
    },
  ]);

  assert.deepEqual(annotated[0].probableReplies, []);
});

test('annotateProbableReplies does not treat a staff message in another thread as an answer', () => {
  const annotated = annotateProbableReplies([
    item({
      id: 'community:50',
      username: 'learner',
      message: 'What should I do after completing onboarding?',
      createdAt: '2026-07-22T14:00:00.000Z',
      chatMessageId: 50,
      threadId: 50,
    }),
    item({
      id: 'community:51',
      username: 'qm',
      message: 'You can join the optional session using this link.',
      createdAt: '2026-07-22T14:05:00.000Z',
      chatMessageId: 51,
      threadId: 51,
      isStaff: true,
    }),
  ]);

  assert.deepEqual(annotated[0].probableReplies, []);
});
