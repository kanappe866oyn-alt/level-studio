import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desktopDownload } from '../src/core/desktopDistribution.js';
import release from '../src/data/desktopRelease.json' with { type: 'json' };
import { desktopDownloadPlugin } from '../tools/desktop_download_plugin.mjs';

test('unpublished public sites have no invented download; local preview serves only the known archive', () => {
  const releaseInfo = { ...release, url: '' };
  assert.equal(desktopDownload({ hostname: 'level-studio.netlify.app', releaseInfo }).available, false);
  assert.equal(desktopDownload({ hostname: 'level-studio.netlify.app', releaseInfo }).url, '');
  assert.equal(desktopDownload({ hostname: '127.0.0.1', releaseInfo }).url, `/downloads/${release.fileName}`);
  assert.equal(desktopDownload({ hostname: 'localhost.example.com', releaseInfo }).available, false);
});

test('local download middleware registers without returning Connect as a Vite post-hook and does not expose arbitrary paths', () => {
  for (const hook of ['configureServer', 'configurePreviewServer']) {
    let handler;
    const plugin = desktopDownloadPlugin();
    assert.equal(plugin[hook]({ middlewares: { use(fn) { handler = fn; return () => { throw new Error('Connect is not a post-hook'); }; } } }), undefined);
    let next = false;
    handler({ method: 'GET', url: '/downloads/../../.env' }, {}, () => { next = true; });
    assert.equal(next, true);
    let status, ended = false;
    handler({ method: 'POST', url: `/downloads/${release.fileName}` }, { writeHead(code) { status = code; }, end() { ended = true; } }, () => assert.fail());
    assert.equal(status, 405); assert.equal(ended, true);
  }
});

test('published ZIP URL is shared across hosts and invalid or credential-bearing URLs stay unavailable', () => {
  const url = 'https://github.com/example/level-studio/releases/download/v0.1.33/LevelStudio.zip';
  assert.equal(desktopDownload({ url, hostname: 'app.netlify.app' }).url, url);
  for (const bad of ['javascript:alert(1)', 'file:///C:/app.zip', 'http://example.com/app.zip', 'https://user:secret@example.com/app.zip', 'https://example.com/app.exe', 'broken']) {
    assert.equal(desktopDownload({ url: bad, hostname: 'app.netlify.app' }).available, false);
  }
});
