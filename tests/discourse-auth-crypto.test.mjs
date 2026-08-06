import test from 'node:test';
import assert from 'node:assert/strict';
import { constants, generateKeyPairSync, publicEncrypt } from 'node:crypto';
import { decryptDiscoursePayload } from '../dist/discourse-auth-crypto.js';

function keyPair() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

function encryptedPayload(publicKey, padding) {
  return publicEncrypt(
    { key: publicKey, padding },
    Buffer.from(JSON.stringify({ key: 'user-api-key', nonce: 'nonce-123', api: 4 })),
  ).toString('base64');
}

test('Discourse authorization payload decrypts with OAEP padding', () => {
  const { publicKey, privateKey } = keyPair();
  const result = decryptDiscoursePayload(
    encryptedPayload(publicKey, constants.RSA_PKCS1_OAEP_PADDING),
    privateKey,
  );
  assert.equal(result.key, 'user-api-key');
  assert.equal(result.nonce, 'nonce-123');
});

test('legacy Discourse authorization payload decrypts with PKCS1 padding', () => {
  const { publicKey, privateKey } = keyPair();
  const result = decryptDiscoursePayload(
    `payload=${encodeURIComponent(encryptedPayload(publicKey, constants.RSA_PKCS1_PADDING))}`,
    privateKey,
  );
  assert.equal(result.key, 'user-api-key');
  assert.equal(result.nonce, 'nonce-123');
});
