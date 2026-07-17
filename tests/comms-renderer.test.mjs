import assert from 'node:assert/strict';
import test from 'node:test';

import { renderTemplate } from '../dist/comms/renderer.js';

test('custom comms preserve multiline message variables', () => {
  const template = {
    id: 'custom_message',
    category: 'custom',
    name: 'Custom Message',
    description: '',
    defaultTone: 'friendly',
    supportedTones: ['friendly'],
    audience: ['all_contributors'],
    variables: [
      {
        key: 'message',
        label: 'Message',
        required: true,
        placeholder: 'Write your message here.',
      },
    ],
    body: '{{message}}',
  };

  const message = [
    'Hey everyone,',
    '',
    'First paragraph.',
    '',
    'Second paragraph.',
  ].join('\r\n');

  assert.deepEqual(renderTemplate(template, { message }), {
    output: 'Hey everyone,\n\nFirst paragraph.\n\nSecond paragraph.',
    errors: [],
  });
});
