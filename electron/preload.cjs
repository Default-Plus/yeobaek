const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yeobaekDesktop', {
  isDesktop: true,
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('yeobaek:get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('yeobaek:check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('yeobaek:install-update'),
  onUpdateStatus: (callback) => {
    const listener = (_event, payload) => {
      callback(payload);
    };
    ipcRenderer.on('yeobaek:update-status', listener);
    return () => {
      ipcRenderer.removeListener('yeobaek:update-status', listener);
    };
  },
});
