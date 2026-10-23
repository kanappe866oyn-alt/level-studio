import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationRequestCache } from '../src/core/generationRequestCache.js';
test('503 retry reuses completed reading but retries the failed draft', async () => {
  const calls = [];
  const run = createGenerationRequestCache(async ({ step }) => {
    calls.push(step);
    if (calls.length === 2) throw Object.assign(new Error('busy'), { status: 503 });
    return { values: [step] };
  });
  const signal = new AbortController().signal;
  const read = { step: 'reading', parts: ['prompt'], signal };
  const draft = { ...read, step: 'drafting' };
  (await run(read)).values.push('mutation');
  await assert.rejects(run(draft), { status: 503 });
  assert.deepEqual((await run(read)).values, ['reading']);
  await run(draft);
  assert.deepEqual(calls, ['reading', 'drafting', 'drafting']);
  await run({ ...read, parts: ['corrected prompt'] });
  assert.equal(calls.length, 4);
});
test('cancelled work is discarded and cached results respect cancellation', async () => {
  const controller = new AbortController();
  const run = createGenerationRequestCache(async () => { controller.abort(); return {}; });
  await assert.rejects(run({ step: 'reading', parts: [], signal: controller.signal }), { name: 'AbortError' });
});
