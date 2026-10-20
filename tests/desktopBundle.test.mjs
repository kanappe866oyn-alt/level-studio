import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { APP_URL, CONTENT_POLICY, isAppURL, resolveBundleFile, safeExternalURL } from '../desktop/bundlePaths.mjs';

test('desktop protocol serves only bundled assets and rejects hidden, escaped and malformed files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'level-studio-bundle-'));
  await mkdir(path.join(root, 'assets')); await writeFile(path.join(root, 'index.html'), '<h1>Stage</h1>'); await writeFile(path.join(root, 'assets', 'worker.js'), 'self.onmessage=()=>{}');
  assert.equal(await resolveBundleFile(root, APP_URL), path.join(root, 'index.html'));
  assert.equal(await resolveBundleFile(root, APP_URL + 'assets/worker.js?cache=1'), path.join(root, 'assets', 'worker.js'));
  assert.equal(await resolveBundleFile(root, APP_URL, 'HEAD'), path.join(root, 'index.html'));
  for (const url of ['https://bundle/index.html', 'levelstudio://outside/index.html', APP_URL + '.env', APP_URL + '%2e%2e%5csecret.json', APP_URL + 'assets%2f..%2f..%2fsecret.json', APP_URL + 'C:%5csecret.json', APP_URL + '%00.js', APP_URL + 'missing.js', APP_URL + '%invalid']) assert.equal(await resolveBundleFile(root, url), null, url);
  assert.equal(await resolveBundleFile(root, APP_URL, 'POST'), null);
});

test('desktop navigation and external links never accept arbitrary file or executable protocols', () => {
  assert.ok(isAppURL(APP_URL)); assert.equal(isAppURL('levelstudio://other/'), false);
  for (const value of ['file:///C:/secret', 'javascript:alert(1)', 'https://bundle/', 'levelstudio://user@bundle/']) assert.equal(isAppURL(value), false);
  assert.equal(safeExternalURL('https://aistudio.google.com/apikey'), 'https://aistudio.google.com/apikey');
  for (const value of ['file:///C:/secret', 'javascript:alert(1)', 'shell:AppsFolder', 'https://user:pass@example.com', 'https://example.com:4433']) assert.equal(safeExternalURL(value), null);
  assert.match(CONTENT_POLICY, /script-src 'self';/); assert.match(CONTENT_POLICY, /object-src 'none'/);
});
