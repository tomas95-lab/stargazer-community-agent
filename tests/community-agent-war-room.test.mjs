import test from 'node:test';
import assert from 'node:assert/strict';
import { humanReviewAcknowledgment, warRoomAvailabilityDecision } from '../dist/community-agent.js';

const warRoomLink = 'https://example.test/war-room';

test('war room availability is not answered by a static schedule rule', () => {
  const decision = warRoomAvailabilityDecision('Is the War Room open today?', warRoomLink, new Date('2026-07-06T14:20:00.000Z'));
  assert.equal(decision, null);
});

test('war room availability ignores unrelated support messages', () => {
  const decision = warRoomAvailabilityDecision('I need Cursor access', warRoomLink, new Date('2026-07-06T14:20:00.000Z'));
  assert.equal(decision, null);
});

test('human review acknowledgment is safe and does not invent a resolution', () => {
  const reply = humanReviewAcknowledgment();
  assert.match(reply, /human review/i);
  assert.match(reply, /confirming/i);
  assert.doesNotMatch(reply, /approved|resolved|eligible/i);
});
