// プリロード: 画面 (レンダラー) とメインプロセスの橋渡し役。
// 画面側には Node.js の機能を渡さず、ここで決めた操作だけを window.updater などとして公開する。
// sandbox: true の環境で動くため、ES Modules ではなく CommonJS (require) で書く必要がある。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updater', {
  // メインプロセスからの更新状況 ({ type: 'available' | 'progress' | 'downloaded' | 'error', ... }) を受け取る
  onEvent: (callback) => ipcRenderer.on('updater:event', (_event, payload) => callback(payload)),
  download: () => ipcRenderer.invoke('updater:download'),
  install: () => ipcRenderer.invoke('updater:install'),
  getVersion: () => ipcRenderer.invoke('app:version'),
});

// 全画面表示の切り替え。onChange には、F11 やボタンで切り替わるたびに全画面かどうか (true / false) が届く
contextBridge.exposeInMainWorld('windowControls', {
  isFullScreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  toggleFullScreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  exitFullScreen: () => ipcRenderer.invoke('window:exit-fullscreen'),
  onChange: (callback) => ipcRenderer.on('window:fullscreen', (_event, fullScreen) => callback(fullScreen)),
});

// クレジットのリンク。開くページはメインプロセスが決める (ここからは URL を渡さない)
contextBridge.exposeInMainWorld('appLinks', {
  openRepository: () => ipcRenderer.invoke('app:open-repository'),
});

// 取り込んだ壁紙・BGM の管理。kind は 'wallpapers' か 'bgm' (メインプロセス側でも確認する)
contextBridge.exposeInMainWorld('media', {
  list: (kind) => ipcRenderer.invoke('media:list', kind),
  import: (kind) => ipcRenderer.invoke('media:import', kind),
  remove: (kind, file) => ipcRenderer.invoke('media:remove', kind, file),
});
