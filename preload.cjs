// プリロード: 画面 (レンダラー) とメインプロセスの橋渡し役。
// 画面側には Node.js の機能を渡さず、ここで決めた操作だけを window.updater として公開する。
// sandbox: true の環境で動くため、ES Modules ではなく CommonJS (require) で書く必要がある。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updater', {
  // メインプロセスからの更新状況 ({ type: 'available' | 'progress' | 'downloaded' | 'error', ... }) を受け取る
  onEvent: (callback) => ipcRenderer.on('updater:event', (_event, payload) => callback(payload)),
  download: () => ipcRenderer.invoke('updater:download'),
  install: () => ipcRenderer.invoke('updater:install'),
  getVersion: () => ipcRenderer.invoke('app:version'),
});
