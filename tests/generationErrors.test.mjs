import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readGenerationJSON, generationValidationError } from '../src/core/generationErrors.js';
import { explainAIError } from '../src/core/aiSettings.js';

test('provider completion metadata distinguishes truncated, blocked, empty and malformed output', () => {
  for (const [reason, content, code] of [
    ['MAX_TOKENS', '{}', 'AI_OUTPUT_LIMIT'],
    ['SAFETY', '{}', 'AI_RESPONSE_BLOCKED'],
    ['OTHER', '{}', 'AI_RESPONSE_INCOMPLETE'],
    ['STOP', '', 'AI_RESPONSE_INCOMPLETE'],
    ['STOP', 'private response data', 'AI_RESPONSE_FORMAT'],
  ]) {
    assert.throws(() => readGenerationJSON({ candidates: [{ finishReason: reason }], text: () => content }), error => {
      assert.equal(error.code, code);
      assert.ok(!error.message.includes('private response data'));
      return true;
    });
  }
  assert.throws(() => readGenerationJSON({ promptFeedback: { blockReason: 'SAFETY' } }), { code: 'AI_RESPONSE_BLOCKED' });
  assert.deepEqual(readGenerationJSON({ candidates: [{ finishReason: 'STOP' }], text: () => '{"objects":[]}' }), { objects: [] });
});

test('validation reasons and drafting deadlines never tell the user to shorten an already short prompt', () => {
  const error = generationValidationError('groundはちょうど1個にしてください。');
  assert.equal(error.natureStep, 'drafting');
  assert.match(explainAIError(error), /ground/);
  for (const step of ['drafting', 'reviewing']) {
    const message = explainAIError({ code: 'AI_STEP_TIMEOUT', step });
    assert.match(message, /時間制限/);
    assert.ok(!message.includes('指示を短く'));
  }
});
