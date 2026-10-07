import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSupportMessage } from '../dist/community-agent.js';
import { runWithProjectContext } from '../dist/project-context.js';

function evaluate(context, message) {
  return runWithProjectContext(context, () => (
    evaluateSupportMessage('contributor', message, '', '', false, '123')
  ));
}

test('approved project answers bypass Gemini', async () => {
  const decision = await evaluate({
    projectId: 'token-routing-faq',
    source: 'header',
    projectMemoryFacts: [{
      id: 'guideline-location',
      title: 'Guideline location',
      body: 'Open the Guidelines tab in the project workspace.',
      directAnswer: true,
      matchPhrases: ['where are the guidelines'],
    }],
  }, 'Where are the guidelines?');

  assert.equal(decision.action, 'reply');
  assert.equal(decision.confidence, 1);
  assert.equal(decision.reply, 'Open the Guidelines tab in the project workspace.');
  assert.match(decision.reason, /approved project answer/i);
});

test('simple acknowledgments use a reaction without Gemini', async () => {
  const decision = await evaluate({
    projectId: 'token-routing-reaction',
    source: 'header',
  }, 'Thanks!');

  assert.equal(decision.action, 'react');
  assert.equal(decision.reply, '');
  assert.ok(decision.reaction);
  assert.match(decision.reason, /does not need an AI call/i);
});

test('questions without relevant evidence go to human review without Gemini', async () => {
  const decision = await evaluate({
    projectId: 'token-routing-human',
    source: 'header',
    projectGuidelines: '## Rubric rules\nEach rubric criterion must be atomic and measurable.',
    projectMemoryFacts: [{
      id: 'rubric-rules',
      title: 'Rubric rules',
      body: 'Each rubric criterion must be atomic and measurable.',
    }],
  }, 'How can I appeal an account suspension?');

  assert.equal(decision.action, 'human');
  assert.equal(decision.confidence, 1);
  assert.match(decision.reason, /no relevant guideline excerpt/i);
});
