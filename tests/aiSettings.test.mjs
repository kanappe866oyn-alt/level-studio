import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkAIConnection, listGenerationModels, explainAIError, shouldRetryAIError, normalizeLocalUrl, readSessionKey, saveSessionKey, SESSION_KEY } from '../src/core/aiSettings.js';

test('key storage is opt-in and deleting or opting out removes saved key', () => {
  const values = new Map();
  const storage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  saveSessionKey(storage, ' sample-key ', false);
  assert.equal(readSessionKey(storage), '');
  saveSessionKey(storage, ' sample-key ', true);
  assert.equal(readSessionKey(storage), 'sample-key');
  saveSessionKey(storage, '', true);
  assert.equal(values.has(SESSION_KEY), false);
  assert.equal(saveSessionKey(undefined, 'sample', true), false);
});

test('cloud check sends key only in header and never generates content', async () => {
  const result = await checkAIConnection({ mode: 'gemini', key: ' sample-key ', model: 'gemini-2.5-pro' }, async (url, options) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro');
    assert.equal(url.includes('sample-key'), false);
    assert.equal(options.method, 'GET');
    assert.equal(options.body, undefined);
    assert.equal(options.headers['x-goog-api-key'], 'sample-key');
    return { ok: true, json: async () => ({ supportedGenerationMethods: ['generateContent'] }) };
  });
  assert.match(result, /別途利用枠/);
});

test('missing keys and HTTP errors are distinguished without echoing credentials', async () => {
  await assert.rejects(checkAIConnection({ mode: 'gemini', key: '', model: 'model' }, () => assert.fail('should not contact server')));
  for (const status of [403, 404, 429, 503]) {
    await assert.rejects(checkAIConnection({ mode: 'gemini', key: 'sample-key', model: 'model' }, async () => ({ ok: false, status })), error => {
      assert.equal(error.status, status);
      assert.equal(explainAIError(error).includes('sample-key'), false);
      return true;
    });
  }
  assert.match(explainAIError({ status: 429 }), /利用回数/);
  assert.match(explainAIError({ status: 403 }), /利用権限/);
});

test('local check uses health endpoint without invoking generation and rejects unrelated services', async () => {
  const result = await checkAIConnection({ mode: 'local', localUrl: 'http://127.0.0.1:5000/' }, async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:5000/api/health');
    assert.equal(options.method, 'GET');
    return { ok: true, json: async () => ({ service: 'world-studio-local-ai' }) };
  });
  assert.match(result, /実際の生成時/);
  await assert.rejects(checkAIConnection({ mode: 'local', localUrl: 'http://localhost:5000' }, async () => ({ ok: true, json: async () => ({}) })));
  assert.throws(() => normalizeLocalUrl('javascript:alert(1)'));
  assert.throws(() => normalizeLocalUrl('https://user:password@example.com'));
});

test('processing TypeErrors are not misreported as connection failures', () => {
  const internal = new TypeError("Cannot read properties of null (reading 'report')");
  assert.match(explainAIError(internal), /内部の処理/);
  assert.doesNotMatch(explainAIError(internal), /ネット接続|ローカルサーバー/);
  for (const message of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Network request failed', 'Load failed']) {
    assert.match(explainAIError(new TypeError(message)), /接続できませんでした/);
  }
  assert.match(explainAIError(new Error('[GoogleGenerativeAI Error]: Error fetching from https://example.com: Failed to fetch')), /接続できませんでした/);
  assert.match(explainAIError(new SyntaxError('private response')), /応答をマップ/);
  assert.doesNotMatch(explainAIError(new TypeError('private-api-key')), /private-api-key/);
});

test('quota and permanent failures stop while a transient 503 can retry', () => {
  for (const status of [400, 401, 403, 404, 429, 500, 502, 504]) {
    assert.equal(shouldRetryAIError({ status }), false, `${status}`);
  }
  assert.equal(shouldRetryAIError({ status: 503 }), true);
  assert.equal(shouldRetryAIError({ status: '429', message: 'previous 503' }), false);
  assert.equal(shouldRetryAIError(new Error('[429 Too Many Requests]')), false);
  assert.equal(shouldRetryAIError(new Error('[503 Service Unavailable]')), true);
  assert.equal(shouldRetryAIError(new Error('429 with previous 503')), false);
  assert.equal(shouldRetryAIError(new TypeError('Failed to fetch')), false);
  assert.equal(shouldRetryAIError({ code: 'SPATIAL_VALIDATION', message: '503' }), false);
  assert.equal(shouldRetryAIError({ name: 'AbortError', message: '503' }), false);
});

test('model discovery follows bounded pages, filters media models, and sends the key only in a header', async () => {
  let calls = 0;
  const make = (id, methods = ['generateContent']) => ({ name: `models/${id}`, displayName: id, supportedGenerationMethods: methods });
  const result = await listGenerationModels({ key: ' sample-key ' }, async (url, options) => {
    assert.equal(url.includes('sample-key'), false);
    assert.equal(options.method, 'GET'); assert.equal(options.body, undefined);
    assert.equal(options.headers['x-goog-api-key'], 'sample-key');
    calls++;
    return { ok: true, json: async () => calls === 1 ? { models: [make('gemini-pro-latest'), make('gemini-image-model'), make('gemini-nano-banana'), make('gemini-transcribe'), make('gemini-computer-use'), make('gemini-embedding', ['embedContent'])], nextPageToken: 'next' }
      : { models: [make('gemini-flash-latest'), make('gemini-pro-latest')] } };
  });
  assert.deepEqual(result.map(m => m.id), ['gemini-pro-latest', 'gemini-flash-latest']);
  assert.equal(calls, 2);
  await assert.rejects(listGenerationModels({ key: 'sample-key' }, async () => ({ ok: false, status: 403 })), error => error.status === 403 && !error.message.includes('sample-key'));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(listGenerationModels({ key: 'sample-key', signal: controller.signal }, () => assert.fail('cancelled list must not start')));
});
