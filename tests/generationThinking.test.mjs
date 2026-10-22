import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generationThinking } from '../src/core/generationThinking.js';
test('Flash budgets use the correct model generation and leave other models unchanged', () => {
  assert.deepEqual(generationThinking('gemini-2.5-flash'), { thinkingConfig: { thinkingBudget: 1024 } });
  assert.deepEqual(generationThinking('gemini-flash-latest'), { thinkingConfig: { thinkingLevel: 'low' } });
  assert.deepEqual(generationThinking('gemini-3.8-flash'), { thinkingConfig: { thinkingLevel: 'low' } });
  for (const model of ['gemini-pro-latest', 'gemini-2.5-pro', 'custom', 'gemini-3.1-flash-lite', 'gemini-3.1-flash-image']) assert.deepEqual(generationThinking(model), {});
});
