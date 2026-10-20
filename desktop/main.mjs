import { app, BrowserWindow, dialog } from 'electron';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { startDesktop } from './application.mjs';

app.setName('LevelStudio');
const userData = path.join(app.getPath('appData'), 'LevelStudio');
mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    for (const win of BrowserWindow.getAllWindows()) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  startDesktop().catch(error => { dialog.showErrorBox('LEVEL STUDIOを起動できませんでした', error.message); app.quit(); });
}
