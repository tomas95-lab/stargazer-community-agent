import test from 'node:test';
import assert from 'node:assert/strict';
import {
  directMessagePeers,
  filterTodayDmMessages,
  filterTodayIncomingDmMessages,
  getUtcDayWindow,
} from '../dist/dm-review-job.js';

function message(id, username, createdAt, text = 'hello') {
  return {
    id,
    message: text,
    user: { username },
    created_at: createdAt,
  };
}

const ownUsername = 'manager.user';

test('DM review uses a rolling 24-hour window by default', () => {
  const window = getUtcDayWindow(new Date('2026-07-06T18:30:00.000Z'));

  assert.equal(window.utcDate, '2026-07-06');
  assert.equal(window.lookbackHours, 24);
  assert.equal(window.startUtc, '2026-07-05T18:30:00.000Z');
  assert.equal(window.endUtc, '2026-07-06T18:30:00.000Z');
});

test('DM review keeps only incoming messages from the rolling window', () => {
  const window = getUtcDayWindow(new Date('2026-07-06T18:30:00.000Z'));
  const filtered = filterTodayIncomingDmMessages(
    [
      message(1, 'latam.coder1232', '2026-07-05T17:51:31.000Z', 'yesterday reference'),
      message(2, 'latam.coder1232', '2026-07-05T19:01:00.000Z', 'incoming within 24 hours'),
      message(3, ownUsername, '2026-07-06T12:00:00.000Z', 'own response'),
      message(4, 'latam.coder1232', '2026-07-07T08:00:00.000Z', 'next PST day'),
    ],
    ownUsername,
    window
  );

  assert.deepEqual(
    filtered.map((item) => item.id),
    [2]
  );
});

test('DM review supports a custom 30-hour lookback', () => {
  const window = getUtcDayWindow(new Date('2026-07-06T18:30:00.000Z'), 30);
  const filtered = filterTodayDmMessages(
    [
      message(1, 'latam.coder1232', '2026-07-05T11:51:31.000Z', 'outside 30 hours'),
      message(5, 'latam.coder1232', '2026-07-05T13:00:00.000Z', 'inside 30 hours'),
      message(2, 'latam.coder1232', '2026-07-06T15:51:00.000Z', 'first today message'),
      message(3, 'latam.coder1232', '2026-07-06T18:16:35.000Z', 'second today message'),
      message(4, ownUsername, '2026-07-06T18:20:00.000Z', 'manager response'),
    ],
    window
  );

  assert.deepEqual(
    filtered.map((item) => item.id),
    [5, 2, 3, 4]
  );
  assert.equal(window.lookbackHours, 30);
});

test('DM review extracts peers from direct-message channel payloads', () => {
  const peers = directMessagePeers({
    id: 123,
    title: 'latam.coder1232',
    users: [{ username: 'latam.coder1232', name: 'Junior' }],
    chatable: {
      direct_message_users: [{ username: 'latam.coder1232', name: 'Junior duplicate' }],
    },
  });

  assert.deepEqual(peers, [{ username: 'latam.coder1232', name: 'Junior duplicate' }]);
});
