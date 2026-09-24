import test from 'node:test';
import assert from 'node:assert/strict';
import { annotateProbableReplies, fetchCommunityAgentItems, isLikelyAnswerReply } from '../dist/community-agent.js';
import { runWithProjectContext } from '../dist/project-context.js';

function item(overrides) {
  return {
    id: overrides.id,
    source: 'community',
    channelId: overrides.channelId,
    username: overrides.username || 'contributor',
    message: overrides.message,
    createdAt: overrides.createdAt,
    chatMessageId: overrides.chatMessageId,
    threadId: overrides.threadId,
    replyToChatMessageId: overrides.replyToChatMessageId,
    isStaff: overrides.isStaff,
  };
}

test('multi-channel scans use the channel index to skip channels outside the review window', async () => {
  const previousFetch = global.fetch;
  const previousInterval = process.env.DISCOURSE_REQUEST_INTERVAL_MS;
  const calls = [];
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  process.env.DISCOURSE_REQUEST_INTERVAL_MS = '0';
  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/chat/api/me/channels.json')) {
      return new Response(JSON.stringify({
        public_channels: [
          { id: 10, title: 'Active channel', last_message: { id: 100, created_at: now } },
          { id: 20, title: 'Quiet channel', last_message: { id: 200, created_at: old } },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      messages: [{ id: 100, message: 'Can someone help me?', created_at: now, user: { username: 'contributor' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const result = await runWithProjectContext({
      projectId: 'multi-channel-test',
      source: 'header',
      botConfig: {
        communityBaseUrl: 'https://community.example',
        communityCategoryId: '',
        communityCategorySlug: '',
        communityChatChannelId: '10',
        communityChatChannelIds: ['10', '20'],
        communityChatChannels: [{ id: '10', title: 'Active channel' }, { id: '20', title: 'Quiet channel' }],
        discourseApiKey: 'key',
        discourseApiClientId: 'client',
        discourseUsername: 'manager',
      },
    }, () => fetchCommunityAgentItems({ includeCommunity: true, onlyToday: true, messageCount: 50 }));

    assert.equal(calls.some((url) => url.includes('/channels/10/messages.json')), true);
    assert.equal(calls.some((url) => url.includes('/channels/20/messages.json')), false);
    assert.equal(result.items[0].channelTitle, 'Active channel');
  } finally {
    global.fetch = previousFetch;
    if (previousInterval === undefined) delete process.env.DISCOURSE_REQUEST_INTERVAL_MS;
    else process.env.DISCOURSE_REQUEST_INTERVAL_MS = previousInterval;
  }
});

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

test('direct QM answers are filtered before using an AI call', () => {
  const answers = [
    'El problema se debe a que su correo ya esta vinculado. Para solucionar este problema, debe cambiarlo.',
    'Una vez realizado el cambio, por favor, dejeme saber por DM para escalar su caso.',
    'Hello! Could you please submit a support ticket so the team can review your case?',
    'Your ticket has been resolved. Please review the latest update.',
  ];

  for (const message of answers) {
    assert.equal(isLikelyAnswerReply({ message, replyToChatMessageId: 10 }), true, message);
  }
});

test('contributor follow-up questions in a thread still reach the agent', () => {
  assert.equal(isLikelyAnswerReply({
    message: 'I submitted my ticket but I still need help with my project status. Could you help me?',
    replyToChatMessageId: 10,
  }), false);
  assert.equal(isLikelyAnswerReply({
    message: 'No puedo entrar a mi proyecto, me pueden ayudar?',
    replyToChatMessageId: 10,
  }), false);
});

test('messages from another managed channel never count as reply evidence', () => {
  const annotated = annotateProbableReplies([
    item({
      id: 'community:761050:80',
      channelId: '761050',
      username: 'learner',
      message: 'Can someone help me access the tool?',
      createdAt: '2026-08-12T14:00:00.000Z',
      chatMessageId: 80,
    }),
    item({
      id: 'community:761051:81',
      channelId: '761051',
      username: 'ops',
      message: 'Yes, please use this link.',
      createdAt: '2026-08-12T14:03:00.000Z',
      chatMessageId: 81,
      replyToChatMessageId: 80,
      isStaff: true,
    }),
  ]);

  assert.deepEqual(annotated[0].probableReplies, []);
});
