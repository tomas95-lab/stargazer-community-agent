import assert from 'node:assert/strict';
import test from 'node:test';
import { pushPayloadForOperation } from '../dist/push-notifications.js';

test('community push is emitted only when a message needs attention or the bot acted', () => {
  const empty = pushPayloadForOperation({ id: 'a', at: new Date().toISOString(), action: 'community_agent', status: 'success', message: '', metadata: { candidates: 0, posted: 0, needsHuman: 0 } });
  assert.equal(empty, null);

  const review = pushPayloadForOperation({ id: 'b', at: new Date().toISOString(), action: 'community_agent', status: 'success', message: '', metadata: { candidates: 2, posted: 0, needsHuman: 1 } });
  assert.equal(review.title, 'Community review needed');
  assert.equal(review.url, '/review');
});

test('DM push includes new, replied, and human-review counts', () => {
  const payload = pushPayloadForOperation({ id: 'c', at: new Date().toISOString(), action: 'dm_review', status: 'success', message: '', metadata: { newIncomingMessages: 3, autoReplied: 1, autoNeedsHuman: 1 } });
  assert.equal(payload.title, 'DM reply posted');
  assert.match(payload.body, /3 new messages/);
  assert.match(payload.body, /1 need human review/);
});
