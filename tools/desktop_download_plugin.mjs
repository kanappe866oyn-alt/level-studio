import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import release from '../src/data/desktopRelease.json' with { type: 'json' };

// Local verification only. Public builds point directly to a published Release
// asset. The archive is never copied into dist or a later desktop bundle.
export function desktopDownloadPlugin() {
  const route = `/downloads/${release.fileName}`;
  const file = path.resolve('releases', release.version, release.fileName);
  const install = server => { server.middlewares.use((request, response, next) => {
    if (request.url?.split('?')[0] !== route) return next();
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
    let info;
    try { info = statSync(file); } catch { response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('配布ファイルを準備しています。'); return; }
    response.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': info.size,
      'Content-Disposition': `attachment; filename="${release.fileName}"`, 'X-Content-Type-Options': 'nosniff' });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', () => response.destroy()).pipe(response);
  }); };
  return { name: 'local-desktop-download', configureServer: install, configurePreviewServer: install };
}
