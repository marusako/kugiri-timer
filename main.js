// メインプロセス: アプリ全体を管理し、ウィンドウを作る (Node.js の機能が使える側)
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
      // ウィンドウが裏に回ってもタイマーの更新を間引かせない
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

// Windows でデスクトップ通知を出すにはアプリの識別子 (AppUserModelID) が必要
if (process.platform === 'win32') {
  app.setAppUserModelId('com.example.pomodoro-timer');
}

// 開発版 (npm start) は保存先を分け、インストールしたアプリの設定や記録に混ざらないようにする
if (!app.isPackaged) {
  app.setPath('userData', `${app.getPath('userData')}-dev`);
}

// 同じ保存先を 2 つのウィンドウで同時に使うと、後から起動した側が設定や記録を読み書きできなくなる。
// そのため 2 つ目の起動は終了させ、すでに開いているウィンドウを前面に出す
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    createWindow();
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
