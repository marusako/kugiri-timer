// メインプロセス: アプリ全体を管理し、ウィンドウを作る (Node.js の機能が使える側)
import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron';
import electronUpdater from 'electron-updater';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerMediaScheme, setupMediaStore } from './media-store.js';
import { windowKeyAction } from './src/fullscreen.js';

// electron-updater は CommonJS 形式なので、ESM からは default を経由して取り出す (公式ドキュメントの方法)
const { autoUpdater } = electronUpdater;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 640,
    minWidth: 360,
    minHeight: 560,
    title: 'Pomodoro Timer',
    autoHideMenuBar: true,
    webPreferences: {
      // 画面側 (レンダラー) から Node.js の機能を使えないようにする安全な設定 (Electron の推奨値)
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 画面に公開する操作は preload.cjs で決めたものだけにする
      preload: path.join(__dirname, 'preload.cjs'),
      // ウィンドウが裏に回ってもタイマーの更新を間引かせない
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  // F11 は、画面やメニューに届く前にここで受け取る。
  // preventDefault で止めるので、Electron の標準メニューの F11 と二重に切り替わることもない
  win.webContents.on('before-input-event', (event, input) => {
    if (windowKeyAction(input) !== 'toggle') return;
    event.preventDefault();
    win.setFullScreen(!win.isFullScreen());
  });
  // F11・ボタン・Esc のどれで切り替わっても、画面のボタンの表示を合わせられるように知らせる
  win.on('enter-full-screen', () => win.webContents.send('window:fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('window:fullscreen', false));
  return win;
}

// 画面から頼まれる全画面の操作。頼んできた画面のウィンドウを相手にする
// クレジットの「GitHub」ボタンで開くページ。画面からは URL を受け取らず、ここに書いた 1 つだけを開く
// (画面側から好きな URL を開けると、悪いページを開かせる手口に使われうるため)
const REPOSITORY_URL = 'https://github.com/marusako/pomodoro-timer';

function setupAppLinks() {
  // いつも使っているブラウザーで開く (アプリの中には開かない)
  ipcMain.handle('app:open-repository', () => shell.openExternal(REPOSITORY_URL));
}

function setupWindowControls() {
  const target = (event) => BrowserWindow.fromWebContents(event.sender);
  ipcMain.handle('window:is-fullscreen', (event) => target(event)?.isFullScreen() ?? false);
  ipcMain.handle('window:toggle-fullscreen', (event) => {
    const win = target(event);
    win?.setFullScreen(!win.isFullScreen());
  });
  ipcMain.handle('window:exit-fullscreen', (event) => target(event)?.setFullScreen(false));}

// 最小化していれば元に戻し、隠れていれば表示して、前面に出す (2 つ目の起動のときと、通知を押したときに使う)
function bringToFront(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// 作業・休憩の終わりの通知。画面 (レンダラー) の Notification では、Windows で押しても click が届かないことがあったため、
// メインプロセスから出す。押されるか閉じられるまで参照を持っておく (持っていないと、途中で片付けられて click が届かない)
const shownNotifications = new Set();

function setupNotifications() {
  ipcMain.handle('notify:show', (event, { title, body }) => {
    if (!Notification.isSupported()) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    const notification = new Notification({ title: String(title), body: String(body), silent: true });
    shownNotifications.add(notification);
    const forget = () => shownNotifications.delete(notification);
    notification.on('click', () => {
      forget();
      bringToFront(win);
    });
    notification.on('close', forget);
    notification.on('failed', (_e, error) => {
      console.error('[notify] failed', error);
      forget();
    });
    notification.show();
  });
}

function sendUpdaterEvent(payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('updater:event', payload);
  }
}

// 自動アップデート: 起動時に新しい版を確認し、見つかったら画面で利用者に聞いてからダウンロードする
function setupAutoUpdate(win) {
  ipcMain.handle('app:version', () => app.getVersion());

  // 開発版 (npm start) には更新の設定ファイル (app-update.yml) がないので、確認しない
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false; // 利用者が「更新する」を押すまでダウンロードしない
  autoUpdater.autoInstallOnAppQuit = true; // ダウンロード後に再起動しなかった場合は、終了時に更新する

  autoUpdater.on('update-available', (info) => sendUpdaterEvent({ type: 'available', version: info.version }));
  autoUpdater.on('download-progress', (progress) => sendUpdaterEvent({ type: 'progress', percent: progress.percent }));
  autoUpdater.on('update-downloaded', (info) => sendUpdaterEvent({ type: 'downloaded', version: info.version }));
  autoUpdater.on('error', (error) => {
    console.error('[updater]', error);
    sendUpdaterEvent({ type: 'error', message: error?.message ?? String(error) });
  });

  ipcMain.handle('updater:download', () => autoUpdater.downloadUpdate());
  // サイレントでインストールし、終わったらアプリを起動し直す
  ipcMain.handle('updater:install', () => autoUpdater.quitAndInstall(true, true));

  // 画面の読み込みが終わってから確認する (先に確認すると、結果の通知を画面が受け取れないことがある)
  win.webContents.once('did-finish-load', () => {
    autoUpdater.checkForUpdates().catch((error) => console.error('[updater] check failed', error));
  });
}

// Windows でデスクトップ通知を出すにはアプリの識別子 (AppUserModelID) が必要。
// package.json の build.appId と同じ値にする
if (process.platform === 'win32') {
  app.setAppUserModelId('io.github.marusako.pomodoro-timer');
}

// 開発版 (npm start) は保存先を分け、インストールしたアプリの設定や記録に混ざらないようにする
if (!app.isPackaged) {
  app.setPath('userData', `${app.getPath('userData')}-dev`);
}

// 取り込んだ壁紙・BGM を読むための app-media: の登録は、アプリの準備完了より前に行う必要がある
registerMediaScheme();

// 同じ保存先を 2 つのウィンドウで同時に使うと、後から起動した側が設定や記録を読み書きできなくなる。
// そのため 2 つ目の起動は終了させ、すでに開いているウィンドウを前面に出す
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    bringToFront(BrowserWindow.getAllWindows()[0]);
  });

  app.whenReady().then(() => {
    setupMediaStore();
    setupWindowControls();
    setupAppLinks();
    setupNotifications();
    // ipcMain.handle は同じ名前で 2 回登録できないので、更新の設定は最初のウィンドウで 1 回だけ行う
    setupAutoUpdate(createWindow());
    // macOS: Dock アイコンをクリックしたとき、ウィンドウがなければ作り直す
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

// macOS 以外では、ウィンドウを全部閉じたらアプリを終了する
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
