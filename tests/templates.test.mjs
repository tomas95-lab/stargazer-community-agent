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
  assert.doesNotMatch(output, /Qwen|F2P|P2P|Sonnet 4\.6/);
});

test('full Markdown content is rendered without template additions', () => {
  const content = '# Welcome to Money Heist\n\nCustom project instructions.\n\n## Start here\n\n[Viewer](https://example.test/viewer)';
  const output = renderDailyThread({ ...topic, content }, {
    guidelines: 'https://example.test/should-not-be-added',
  });

  assert.equal(output, content);
  assert.doesNotMatch(output, /Daily .* thread is up|Qwen|F2P|FINAL CHECK/);
});

test('renderAnnouncement includes daily thread URL and neutral topic summary', () => {
  const output = renderAnnouncement(topic, 'https://community.example/t/thread/123');

  assert.match(output, /https:\/\/community\.example\/t\/thread\/123/);
  assert.match(output, /Rubric Quality/);
  assert.match(output, /Observable beats vague/);
  assert.doesNotMatch(output, /Cursor|validation\/eval|Qwen/);
});

test('renderAnnouncement uses the topic-specific chat announcement and placeholders', () => {
  const output = renderAnnouncement({
    ...topic,
    title: 'Welcome to Money Heist',
    topic: 'Onboarding',
    chatAnnouncement: 'Review [**{{title}}**]({{dailyThreadUrl}}) for {{topic}} in {{projectName}}.',
  }, 'https://community.example/t/money-heist/456');

  assert.equal(
    output,
    'Review [**Welcome to Money Heist**](https://community.example/t/money-heist/456) for Onboarding in Stargazer Axiom.',
  );
  assert.doesNotMatch(output, /Quick rule|project questions/);
});
