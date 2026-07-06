import test from 'node:test';
import assert from 'node:assert/strict';
import {
  directMessagePeers,
  filterTodayIncomingDmMessages,
  getArgentinaDayWindow,
} from '../dist/dm-review-job.js';

function message(id, username, createdAt, text = 'hello') {
  return {
    id,
    message: text,
    user: { username },
    created_at: createdAt,
  };
}

test('DM review window follows the current Argentina day', () => {
  const window = getArgentinaDayWindow(new Date('2026-07-06T18:30:00.000Z'));

  assert.equal(window.argentinaDate, '2026-07-06');
  assert.equal(window.startUtc, '2026-07-06T03:00:00.000Z');
  assert.equal(window.endUtc, '2026-07-07T03:00:00.000Z');
});

test('DM review keeps only incoming messages from today in Argentina', () => {
  const window = getArgentinaDayWindow(new Date('2026-07-06T18:30:00.000Z'));
  const filtered = filterTodayIncomingDmMessages(
    [
      message(1, 'latam.coder1232', '2026-07-05T17:51:31.000Z', 'yesterday reference'),
      message(2, 'latam.coder1232', '2026-07-06T03:01:00.000Z', 'today incoming'),
      message(3, 'tomas.ruiz_OBIC', '2026-07-06T12:00:00.000Z', 'own response'),
      message(4, 'latam.coder1232', '2026-07-07T03:00:00.000Z', 'next Argentina day'),
    ],
    'tomas.ruiz_OBIC',
    window
  );

  assert.deepEqual(
    filtered.map((item) => item.id),
    [2]
  );
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
