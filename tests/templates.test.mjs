import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAnnouncement, renderDailyThread } from '../dist/templates.js';

const topic = {
  date: '2026-07-03',
  title: 'A useful daily topic',
  topic: 'Rubric Quality',
  reminderTitle: 'Keep criteria observable',
  reminderBody: 'Criteria should be concrete.',
  goodExample: 'The UI displays Saved after submit.',
  badExample: 'The form works correctly.',
  quickRule: 'Observable beats vague.',
  tags: ['daily_project_announcements'],
  webinar: {
    enabled: false,
    mandatory: false,
    timeLabel: '',
    link: '',
  },
};

test('renderDailyThread uses editable project links', () => {
  const output = renderDailyThread(topic, {
    guidelines: 'https://example.test/guidelines',
    templatesZip: 'https://example.test/templates.zip',
    warRoom: 'https://example.test/war-room',
    validationScript: 'https://example.test/validation.zip',
    stargazerEval: 'https://example.test/eval.zip',
    commonErrorsDocument: 'https://example.test/errors',
  });

  assert.match(output, /A useful daily topic/);
  assert.match(output, /https:\/\/example\.test\/guidelines/);
  assert.match(output, /https:\/\/example\.test\/war-room/);
  assert.doesNotMatch(output, /\{\{guidelinesLink\}\}/);
});

test('renderAnnouncement includes daily thread URL and reminder', () => {
  const output = renderAnnouncement(topic, 'https://community.example/t/thread/123');

  assert.match(output, /https:\/\/community\.example\/t\/thread\/123/);
  assert.match(output, /Keep criteria observable/);
  assert.match(output, /Observable beats vague/);
});
