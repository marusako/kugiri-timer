// Android 版の外部カレンダー。パソコン版の window.calendarFeeds (preload.cjs → calendar-feeds.js) と同じ形の操作を用意する:
//   list()・add(input)・remove(id)・refresh()・onChange(callback)
// 一覧・追加・外す・読み直しの決まりは feed-store.js (パソコン版と共通)。ここでは、保存・暗号化・通信のしかたを渡す:
// - URL は、自前の部品 UrlVault (mobile/UrlVault.java) が Android の Keystore の鍵で暗号化する。
//   鍵は端末の外に出せないので、ほかの端末では暗号を解けない (パソコン版の safeStorage と同じ考え方)
// - 一覧は localStorage の kugiriFeeds にしまう。書き出しの項目 (data-file.js の DATA_KEYS) ではないので、書き出しには入らない
// - 通信は Capacitor の CapacitorHttp (Android の側で通信する)。画面の fetch では、カレンダーのサーバーが
//   ほかのサイトからの読み取りを許していない (CORS) ため読めない。画面の CSP もそのまま (外との通信は api.github.com だけ)
// - 読み直すのは、開いたとき・30 分ごと (アプリが動いている間)・「今すぐ更新」
import { createFeedStore, responseError, FETCH_TIMEOUT_MS, MAX_FEED_BYTES, REFRESH_INTERVAL_MS } from './feed-store.js';

const STORAGE_KEY = 'kugiriFeeds';

export function createWebFeeds({ plugins, storage }) {
  const { UrlVault, CapacitorHttp } = plugins;
  const listeners = [];

  let stored = [];
  try {
    stored = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    // 壊れていたら、何も登録されていないものとして扱う
  }

  async function download(url) {
    try {
      const response = await CapacitorHttp.get({ url, responseType: 'text', connectTimeout: FETCH_TIMEOUT_MS, readTimeout: FETCH_TIMEOUT_MS });
      const error = responseError(response.status, response.url ?? url);
      if (error) return { error };
      const text = typeof response.data === 'string' ? response.data : '';
      if (text.length > MAX_FEED_BYTES) return { error: 'tooLarge' };
      return { text };
    } catch {
      return { error: 'network' };
    }
  }

  const store = createFeedStore({
    feeds: stored,
    save: (feeds) => storage.setItem(STORAGE_KEY, JSON.stringify(feeds)),
    encrypt: async (text) => (await UrlVault.encrypt({ text })).data,
    decrypt: async (data) => (await UrlVault.decrypt({ data })).text,
    canEncrypt: async () => Boolean(UrlVault && CapacitorHttp),
    download,
    onChange: () => listeners.forEach((callback) => callback()),
  });

  if (store.hasFeeds()) store.refresh();
  setInterval(() => {
    if (store.hasFeeds()) store.refresh();
  }, REFRESH_INTERVAL_MS);

  return {
    list: () => store.list(),
    add: (input) => store.add(input),
    remove: (id) => store.remove(id),
    refresh: () => store.refresh(),
    onChange: (callback) => listeners.push(callback),
  };
}
