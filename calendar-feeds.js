// 外部カレンダー (Google カレンダーなどの iCal 形式の非公開 URL) の取り込み (メインプロセス側)。
// - URL を知っている人は誰でも予定を読めるので、URL は safeStorage (Windows の暗号化の仕組み) で暗号化して保存する。
//   保存先は data.json とは別の feeds.json。書き出し (バックアップ) には入れない (ほかの PC では暗号を解けないため)
// - 通信はここで行う (画面は CSP で外との通信を禁止したまま)。https の URL だけ。時間と大きさに上限を付ける
// - 読み直すのは、起動したとき・30 分ごと・画面の「今すぐ更新」。最後に読めた予定は feeds.json に残し、つながらないときも使う
// - 画面には、取り込んだ回 (src/ical-feed.js の形に、ID とカレンダーの名前を足したもの) と、各カレンダーの状態を渡す
import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { expandFeed, makeFeed, occurrenceId } from './src/ical-feed.js';

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20 * 1000;
const MAX_FEED_BYTES = 5 * 1024 * 1024;
// 取り込む範囲: 今日の 92 日前 (集中の記録を残す 3 か月) 〜 183 日後 (約半年先まで)
const PAST_DAYS = 92;
const FUTURE_DAYS = 183;

export function setupCalendarFeeds() {
  const file = path.join(app.getPath('userData'), 'feeds.json');
  // feeds: [{ id, name, url (暗号化して base64), fetchedAt, error, events: [...] }]
  let feeds = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(parsed?.feeds)) feeds = parsed.feeds.filter((f) => typeof f?.id === 'string' && typeof f.url === 'string');
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[feeds] read failed', error);
  }

  function write() {
    try {
      fs.writeFileSync(`${file}.tmp`, `${JSON.stringify({ version: 1, feeds }, null, 2)}\n`);
      fs.renameSync(`${file}.tmp`, file);
    } catch (error) {
      console.error('[feeds] write failed', error);
    }
  }

  // 画面に渡す形 (URL は渡さない)
  const summary = () => feeds.map(({ id, name, fetchedAt, error, events }) => ({ id, name, fetchedAt, error, count: events?.length ?? 0 }));
  const occurrences = () => feeds.flatMap((feed) => (feed.events ?? []).map((e) => ({
    ...e,
    id: occurrenceId(feed.id, e.uid, e.date, e.start),
    feedId: feed.id,
    feedName: feed.name,
  })));
  function notify() {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('feeds:changed');
  }

  async function download(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!response.ok) return { error: response.status === 404 ? 'notFound' : 'network' };
      if (!response.url.startsWith('https://')) return { error: 'network' }; // 転送先も https だけ
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

  // 1 つのカレンダーを読み直す。失敗したら error を付け、前に読めた予定は残す
  async function refreshOne(feed) {
    let url;
    try {
      url = safeStorage.decryptString(Buffer.from(feed.url, 'base64'));
    } catch {
      feed.error = 'decrypt'; // ほかの PC から持ってきたなど、暗号を解けない
      return;
    }
    const result = await download(url);
    if (result.error) {
      feed.error = result.error;
      return;
    }
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - PAST_DAYS).getTime();
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + FUTURE_DAYS).getTime();
    const { events, error } = expandFeed(result.text, { from, to });
    if (error) {
      feed.error = error;
      return;
    }
    feed.events = events;
    feed.fetchedAt = Date.now();
    feed.error = null;
  }

  let refreshing = null;
  function refreshAll() {
    // 読み直している最中に呼ばれたら、同じ読み直しを待つ (二重に通信しない)
    refreshing ??= Promise.all(feeds.map(refreshOne)).finally(() => {
      refreshing = null;
      write();
      notify();
    });
    return refreshing;
  }

  ipcMain.handle('feeds:list', () => ({ feeds: summary(), events: occurrences(), available: safeStorage.isEncryptionAvailable() }));

  ipcMain.handle('feeds:add', async (_event, input) => {
    if (!safeStorage.isEncryptionAvailable()) return { error: 'noEncryption' };
    const made = makeFeed(input ?? {}, feeds, String(input?.fallbackName ?? ''));
    if (made.error) return made;
    const feed = {
      id: `feed-${Date.now().toString(36)}`,
      name: made.feed.name,
      url: safeStorage.encryptString(made.feed.url).toString('base64'),
      fetchedAt: null,
      error: null,
      events: [],
    };
    // 登録する前に 1 回読んで、.ics として読めるかを確かめる (間違った URL を登録しないように)
    await refreshOne(feed);
    if (feed.error) return { error: feed.error };
    feeds = [...feeds, feed];
    write();
    notify();
    return { ok: true };
  });

  ipcMain.handle('feeds:remove', (_event, id) => {
    feeds = feeds.filter((feed) => feed.id !== id);
    write();
    notify();
    return true;
  });

  ipcMain.handle('feeds:refresh', async () => {
    await refreshAll();
    return true;
  });

  // 起動したときと、30 分ごとに読み直す
  if (feeds.length > 0) refreshAll();
  setInterval(() => {
    if (feeds.length > 0) refreshAll();
  }, REFRESH_INTERVAL_MS);
}
