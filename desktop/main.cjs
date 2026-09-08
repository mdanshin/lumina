const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.setName('Crystal Front');
app.setPath('userData', path.join(app.getPath('appData'), 'Lumina', 'Crystal Front'));

const savePath = () => path.join(app.getPath('userData'), 'crystal-front-save.json');

function readSave() {
  try {
    const value = JSON.parse(fs.readFileSync(savePath(), 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function writeSave(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > 1024 * 1024) return;
  fs.mkdirSync(path.dirname(savePath()), { recursive: true });
  const temporary = `${savePath()}.tmp`;
  fs.writeFileSync(temporary, json, 'utf8');
  fs.renameSync(temporary, savePath());
}

ipcMain.on('save:load', event => { event.returnValue = readSave(); });
ipcMain.on('save:write', (_event, value) => {
  try { writeSave(value); } catch (error) { console.error('Could not save game:', error); }
});
ipcMain.on('window:quit', () => app.quit());

function createWindow() {
  const window = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    title: 'Кристальный фронт',
    backgroundColor: '#07151b',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.removeMenu();
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    }
    if (input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r')) {
      event.preventDefault();
    }
  });
  window.once('ready-to-show', () => window.show());
  window.loadFile(path.join(__dirname, '..', 'battle.html'), { query: { desktop: 'steam' } });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
