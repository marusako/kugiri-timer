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
  onChange: (callback) => ipcRenderer.on('window:fullscreen', (_event, fullScreen) => callback(fullScreen)),});

// 作業・休憩の終わりの通知。メインプロセスが出し、押されたらウィンドウを前に出す
contextBridge.exposeInMainWorld('notifier', {
  show: (title, body) => ipcRenderer.invoke('notify:show', { title, body }),
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

// 設定・予定・時間割・記録の保存 (保存フォルダーの data.json)。
// loadAll は起動時に 1 回だけ、同期で全部を読む (読み終わるまで画面の準備を進めない)
contextBridge.exposeInMainWorld('dataStore', {
  loadAll: () => ipcRenderer.sendSync('store:load-all'),
  set: (key, value) => ipcRenderer.send('store:set', key, value),
  exportData: () => ipcRenderer.invoke('store:export'),
  importData: () => ipcRenderer.invoke('store:import'),
  replace: (data) => ipcRenderer.invoke('store:replace', data),
});
