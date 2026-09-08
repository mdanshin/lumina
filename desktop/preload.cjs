const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('luminaDesktop', Object.freeze({
  isSteam: true,
  loadSave: () => ipcRenderer.sendSync('save:load'),
  save: value => ipcRenderer.send('save:write', value),
  quit: () => ipcRenderer.send('window:quit')
}));
