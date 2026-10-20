import { app, BrowserWindow, dialog, Menu, net, protocol, session, shell } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_URL, CONTENT_POLICY, isAppURL, resolveBundleFile, safeExternalURL } from './bundlePaths.mjs';

protocol.registerSchemesAsPrivileged([{ scheme: 'levelstudio', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

export async function startDesktop({ bundleRoot = path.join(app.getAppPath(), 'dist'), userData, show = true, downloadDirectory } = {}) {
  app.setName('LevelStudio');
  if (userData) app.setPath('userData', userData);
  await app.whenReady();
  protocol.handle('levelstudio', async request => {
    const file = await resolveBundleFile(bundleRoot, request.url, request.method);
    if (!file) return new Response('Not found', { status: 404 });
    const response = await net.fetch(pathToFileURL(file).href);
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', CONTENT_POLICY);
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers });
  });
  const ses = session.defaultSession;
  const permitted = (contents, permission) => !!contents && isAppURL(contents.getURL()) && ['pointerLock', 'fullscreen'].includes(permission);
  ses.setPermissionRequestHandler((contents, permission, callback) => callback(permitted(contents, permission)));
  ses.setPermissionCheckHandler((contents, permission) => permitted(contents, permission));
  ses.on('will-download', (_event, item) => {
    if (downloadDirectory) item.setSavePath(path.join(downloadDirectory, path.basename(item.getFilename())));
    else item.setSaveDialogOptions({ title: 'ステージを書き出す', defaultPath: path.join(app.getPath('documents'), path.basename(item.getFilename())) });
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'ファイル', submenu: [{ role: 'quit', label: '終了' }] },
    { label: '編集', submenu: [{ role: 'undo', label: '元に戻す' }, { role: 'redo', label: 'やり直す' }, { type: 'separator' }, { role: 'cut', label: '切り取り' }, { role: 'copy', label: 'コピー' }, { role: 'paste', label: '貼り付け' }, { role: 'selectAll', label: 'すべて選択' }] },
    { label: '表示', submenu: [{ role: 'resetZoom', label: '標準の表示倍率' }, { role: 'zoomIn', label: '拡大' }, { role: 'zoomOut', label: '縮小' }, { role: 'togglefullscreen', label: '全画面表示' }] },
  ]));
  const createWindow = async () => {
    const win = new BrowserWindow({ width: 1440, height: 940, minWidth: 1024, minHeight: 720, show, backgroundColor: '#171f2b', title: 'LEVEL STUDIO デスクトップ',
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false } });
    win.webContents.on('page-title-updated', event => { event.preventDefault(); win.setTitle('LEVEL STUDIO デスクトップ'); });
    win.webContents.on('will-navigate', (event, url) => { if (!isAppURL(url)) event.preventDefault(); });
    win.webContents.on('will-redirect', (event, url) => { if (!isAppURL(url)) event.preventDefault(); });
    win.webContents.setWindowOpenHandler(({ url }) => { const safe = safeExternalURL(url); if (safe) void shell.openExternal(safe); return { action: 'deny' }; });
    await win.loadURL(APP_URL);
    return win;
  };
  const win = await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow().catch(error => dialog.showErrorBox('起動できませんでした', error.message)); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  return win;
}
