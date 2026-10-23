import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPairedStageDesigner } from '../src/core/pairedStageDesign.js';
test('first brief and draft share one call, repairs receive updated constraints', async () => {
  let designs = 0, repairs = 0;
  const paired = createPairedStageDesigner({ basePrompt: 'geometry rules', requestDesign: async prompt => {
    assert.ok(prompt.includes('geometry rules')); designs++;
    return { brief: { number: designs }, stage: { objects: [designs] } };
  }, requestRepair: async prompt => { assert.equal(prompt, 'repair with original constraints'); repairs++; return { objects: [99] }; } });
  assert.deepEqual(await paired.requestBrief('user intent'), { number: 1 });
  assert.deepEqual(await paired.requestDraft('validated contract'), { objects: [1] });
  assert.equal(designs, 1); assert.equal(repairs, 0);
  assert.deepEqual(await paired.requestDraft('repair with original constraints'), { objects: [99] });
  await paired.requestBrief('corrected reading');
  await paired.requestBrief('another corrected reading');
  assert.deepEqual(await paired.requestDraft('validated contract'), { objects: [3] });
});
test('failed design never reuses a previous pending draft', async () => {
  let fail = false;
  const paired = createPairedStageDesigner({ basePrompt: '', requestDesign: async () => {
    if (fail) throw new Error('503'); return { brief: {}, stage: { stale: true } };
  }, requestRepair: async () => ({ repaired: true }) });
  await paired.requestBrief('first'); fail = true;
  await assert.rejects(paired.requestBrief('next'));
  assert.deepEqual(await paired.requestDraft('repair'), { repaired: true });
});
