// 外部カレンダー (Google カレンダーなどの iCal 形式の非公開 URL) の取り込み (パソコン版のメインプロセス側)。
// 一覧・追加・外す・読み直しの決まりは src/feed-store.js (Android 版と共通)。ここでは、保存・暗号化・通信のしかたを渡す:
// - URL は safeStorage (Windows の暗号化の仕組み) で暗号化する。保存先は data.json とは別の feeds.json。
//   書き出し (バックアップ) には入れない (ほかの PC では暗号を解けないため)
// - 通信はここで行う (画面は CSP で外との通信を禁止したまま)。https の URL だけ。時間と大きさに上限を付ける
// - 読み直すのは、起動したとき・30 分ごと・画面の「今すぐ更新」
import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { createFeedStore, responseError, FETCH_TIMEOUT_MS, MAX_FEED_BYTES, REFRESH_INTERVAL_MS } from './src/feed-store.js';

async function download(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    const error = responseError(response.status, response.url);
    if (error) return { error };
    const length = Number(response.headers.get('content-length'));
    if (length > MAX_FEED_BYTES) return { error: 'tooLarge' };
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_FEED_BYTES) return { error: 'tooLarge' };
    return { text: buffer.toString('utf8') };
  } catch {
    return { error: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

export function setupCalendarFeeds() {
  const file = path.join(app.getPath('userData'), 'feeds.json');
  let stored = [];
  try {
    stored = JSON.parse(fs.readFileSync(file, 'utf8'))?.feeds ?? [];
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[feeds] read failed', error);
  }

  const store = createFeedStore({
    feeds: stored,
    save(feeds) {
      try {
        fs.writeFileSync(`${file}.tmp`, `${JSON.stringify({ version: 1, feeds }, null, 2)}\n`);
        fs.renameSync(`${file}.tmp`, file);
      } catch (error) {
        console.error('[feeds] write failed', error);
      }
    },
    encrypt: async (text) => safeStorage.encryptString(text).toString('base64'),
    decrypt: async (data) => safeStorage.decryptString(Buffer.from(data, 'base64')),
    canEncrypt: async () => safeStorage.isEncryptionAvailable(),
    download,
    onChange() {
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send('feeds:changed');
    },
  });

  ipcMain.handle('feeds:list', () => store.list());
  ipcMain.handle('feeds:add', (_event, input) => store.add(input));
  ipcMain.handle('feeds:remove', (_event, id) => store.remove(id));
  ipcMain.handle('feeds:refresh', () => store.refresh());

  // 起動したときと、30 分ごとに読み直す
  if (store.hasFeeds()) store.refresh();
  setInterval(() => {
    if (store.hasFeeds()) store.refresh();
  }, REFRESH_INTERVAL_MS);
}
