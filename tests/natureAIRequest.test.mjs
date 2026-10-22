import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestNatureJSON } from '../src/core/natureAIRequest.js';
import { explainAIError } from '../src/core/aiSettings.js';

test('complete JSON is used, receipt is reported once, and malformed responses fail', async () => {
  const statuses = [];
  const model = { generateContent: async (parts, { signal }) => {
    assert.deepEqual(parts, ['reading prompt']); assert.equal(signal.aborted, false);
    return { response: { text: () => '{"waterEnabled":true}' } };
  } };
  const result = await requestNatureJSON({ model, parts: ['reading prompt'], signal: new AbortController().signal, step: 'reading', onProgress: s => statuses.push(s) });
  assert.deepEqual(result, { waterEnabled: true }); assert.equal(statuses.length, 1); assert.ok(statuses[0].includes('受信'));
  model.generateContent = async () => ({ response: { text: () => 'incomplete' } });
  await assert.rejects(requestNatureJSON({ model, parts: [], signal: new AbortController().signal, step: 'planning' }), error => error.code === 'AI_RESPONSE_FORMAT' && error.natureStep === 'planning');
});

test('stage deadline and user cancellation abort the request without accepting late output', async () => {
  let requestSignal;
  const model = { generateContent: (_parts, options) => { requestSignal = options.signal; return new Promise(() => {}); } };
  await assert.rejects(requestNatureJSON({ model, parts: [], signal: new AbortController().signal, step: 'reading', timeoutMs: 10 }), error => {
    assert.equal(error.code, 'AI_STEP_TIMEOUT'); assert.equal(requestSignal.aborted, true);
    assert.ok(explainAIError(error).includes('読み取り')); return true;
  });
  const controller = new AbortController();
  const pending = requestNatureJSON({ model, parts: [], signal: controller.signal, step: 'planning' });
  await Promise.resolve(); controller.abort(new Error('cancelled'));
  await assert.rejects(pending, /cancelled/); assert.equal(requestSignal.aborted, true);
});

test('cancellation after receipt discards the response and pre-cancelled work never starts', async () => {
  const controller = new AbortController();
  const model = { generateContent: async () => ({ response: { text: () => '{"complete":true}' } }) };
  const pending = requestNatureJSON({ model, parts: [], signal: controller.signal, step: 'reading', onProgress: () => controller.abort(new Error('cancelled after receipt')) });
  await assert.rejects(pending, /cancelled after receipt/);
  const aborted = new AbortController(); aborted.abort(new Error('already cancelled'));
  let requests = 0;
  await assert.rejects(requestNatureJSON({ model: { generateContent: () => { requests++; } }, parts: [], signal: aborted.signal, step: 'planning' }), /already cancelled/);
  assert.equal(requests, 0);
});
