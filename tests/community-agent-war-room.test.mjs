import test from 'node:test';
import assert from 'node:assert/strict';
import { warRoomAvailabilityDecision } from '../dist/community-agent.js';

const warRoomLink = 'https://example.test/war-room';
const signature = '- Stargazer Support Assistant';

test('war room availability says it opens after 11:15 AM ARG on weekdays before opening', () => {
  const mondayBeforeOpen = new Date('2026-07-06T13:30:00.000Z'); // 10:30 AM Argentina
  const decision = warRoomAvailabilityDecision('Is the War Room open today?', warRoomLink, mondayBeforeOpen);

  assert.equal(decision?.action, 'reply');
  assert.equal(decision?.confidence, 1);
  assert.match(decision?.reply || '', /after 11:15 AM ARG today/);
  assert.doesNotMatch(decision?.reply || '', /https:\/\/example\.test\/war-room/);
  assert.match(decision?.reply || '', new RegExp(`${signature}$`));
});

test('war room availability says it is open and includes the link after 11:15 AM ARG on weekdays', () => {
  const mondayAfterOpen = new Date('2026-07-06T14:20:00.000Z'); // 11:20 AM Argentina
  const decision = warRoomAvailabilityDecision('El war room va a estar abierto?', warRoomLink, mondayAfterOpen);

  assert.equal(decision?.action, 'reply');
  assert.match(decision?.reply || '', /open now/);
  assert.match(decision?.reply || '', /https:\/\/example\.test\/war-room/);
  assert.match(decision?.reply || '', new RegExp(`${signature}$`));
});

test('war room availability says closed on Argentina weekends', () => {
  const saturday = new Date('2026-07-04T15:00:00.000Z'); // Saturday noon Argentina
  const decision = warRoomAvailabilityDecision('Is the War Room open?', warRoomLink, saturday);

  assert.equal(decision?.action, 'reply');
  assert.match(decision?.reply || '', /weekend day in Argentina/);
  assert.match(decision?.reply || '', /Monday between 11:15 AM and 7:00 PM ARG/);
  assert.match(decision?.reply || '', new RegExp(`${signature}$`));
});

test('war room availability ignores unrelated support messages', () => {
  const decision = warRoomAvailabilityDecision('I need Cursor access', warRoomLink, new Date('2026-07-06T14:20:00.000Z'));
  assert.equal(decision, null);
});
