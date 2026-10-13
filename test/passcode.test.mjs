import test from 'node:test';
import assert from 'node:assert/strict';
import { isUnlocked, passcodeEnabled, safeEqual, safeNext, unlockToken } from '../lib/passcode.js';

const env = { APP_PASSCODE: 'correct-horse', APP_SECRET: 's'.repeat(64) };

test('APP_PASSCODE 未設定なら保護しない', async () => {
  assert.equal(passcodeEnabled({}), false);
  assert.equal(await isUnlocked(undefined, {}), true);
});

test('署名済みクッキーだけを通す', async () => {
  const token = await unlockToken(env);
  assert.equal(await isUnlocked(token, env), true);
  assert.equal(await isUnlocked(undefined, env), false);
  assert.equal(await isUnlocked('correct-horse', env), false);
  assert.equal(await isUnlocked(token, { ...env, APP_SECRET: 't'.repeat(64) }), false);
  assert.equal(await isUnlocked(token, { ...env, APP_PASSCODE: 'changed' }), false);
});

test('safeEqual と safeNext', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', undefined), false);
  assert.equal(safeNext('/physics/module/x?y=1'), '/physics/module/x?y=1');
  assert.equal(safeNext('//evil.example'), '/physics');
  assert.equal(safeNext('https://evil.example'), '/physics');
  assert.equal(safeNext('/\\evil.example'), '/physics');
});
