// 外部カレンダー (Google カレンダーなどの iCal 形式の非公開 URL) の一覧・追加・外す・読み直し。
// パソコン版 (calendar-feeds.js、メインプロセス) と Android 版 (web-feeds.js、画面) の両方で使う。
// 保存・暗号化・通信のしかたは、使う側が渡す:
//   save(feeds)          一覧を保存する (URL は暗号化したもの)
//   encrypt(text) / decrypt(data)  URL の暗号化と、元に戻すこと (パソコン版は safeStorage、Android 版は Keystore)
//   canEncrypt()         暗号化が使えるか (使えなければ登録させない)
//   download(url)        .ics を読む → { text } | { error: 'notFound' | 'network' | 'tooLarge' }
//   onChange()           一覧や予定が変わったとき (画面を描き直す)
// - URL を知っている人は誰でも予定を読めるので、URL は暗号化して保存し、画面 (list) には渡さない
// - 最後に読めた予定は残し、つながらないときも使う
import { expandFeed, makeFeed, occurrenceId } from './ical-feed.js';

export const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
export const FETCH_TIMEOUT_MS = 20 * 1000;
export const MAX_FEED_BYTES = 5 * 1024 * 1024;
// 取り込む範囲: 今日の 92 日前 (集中の記録を残す 3 か月) 〜 183 日後 (約半年先まで)
const PAST_DAYS = 92;
const FUTURE_DAYS = 183;

// 応答の状態と、転送されたあとの URL から、失敗の理由を返す (問題がなければ null)
export function responseError(status, finalUrl) {
  if (status === 404) return 'notFound';
  if (status < 200 || status >= 300) return 'network';
  if (!String(finalUrl).startsWith('https://')) return 'network'; // 転送先も https だけ
  return null;
}

export function createFeedStore({ feeds: stored = [], save, encrypt, decrypt, canEncrypt, download, now = () => new Date(), onChange = () => {} }) {
  // feeds: [{ id, name, url (暗号化したもの), fetchedAt, error, events: [...] }]
  let feeds = (Array.isArray(stored) ? stored : []).filter((f) => typeof f?.id === 'string' && typeof f.url === 'string');

  // 画面に渡す形 (URL は渡さない)
  const summary = () => feeds.map(({ id, name, fetchedAt, error, events }) => ({ id, name, fetchedAt, error, count: events?.length ?? 0 }));
  const occurrences = () => feeds.flatMap((feed) => (feed.events ?? []).map((e) => ({
    ...e,
    id: occurrenceId(feed.id, e.uid, e.date, e.start),
    feedId: feed.id,
    feedName: feed.name,
  })));

  // 1 つのカレンダーを読み直す。失敗したら error を付け、前に読めた予定は残す
  async function refreshOne(feed, url) {
    if (url === undefined) {
      try {
        url = await decrypt(feed.url);
      } catch {
        feed.error = 'decrypt'; // ほかの端末から持ってきたなど、暗号を解けない
        return;
      }
    }
    const result = await download(url);
    if (result.error) {
      feed.error = result.error;
      return;
    }
    const today = now();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - PAST_DAYS).getTime();
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + FUTURE_DAYS).getTime();
    const { events, error } = expandFeed(result.text, { from, to });
    if (error) {
      feed.error = error;
      return;
    }
    feed.events = events;
    feed.fetchedAt = today.getTime();
    feed.error = null;
  }

  let refreshing = null;

  return {
    hasFeeds: () => feeds.length > 0,

    async list() {
      return { feeds: summary(), events: occurrences(), available: await canEncrypt() };
    },

    async add(input) {
      if (!(await canEncrypt())) return { error: 'noEncryption' };
      const made = makeFeed(input ?? {}, feeds, String(input?.fallbackName ?? ''));
      if (made.error) return made;
      const feed = {
        id: `feed-${now().getTime().toString(36)}`,
        name: made.feed.name,
        url: await encrypt(made.feed.url),
        fetchedAt: null,
        error: null,
        events: [],
      };
      // 登録する前に 1 回読んで、.ics として読めるかを確かめる (間違った URL を登録しないように)
      await refreshOne(feed, made.feed.url);
      if (feed.error) return { error: feed.error };
      feeds = [...feeds, feed];
      save(feeds);
      onChange();
      return { ok: true };
    },

    async remove(id) {
      feeds = feeds.filter((feed) => feed.id !== id);
      save(feeds);
      onChange();
      return true;
    },

    // 読み直している最中に呼ばれたら、同じ読み直しを待つ (二重に通信しない)
    refresh() {
      refreshing ??= Promise.all(feeds.map((feed) => refreshOne(feed))).finally(() => {
        refreshing = null;
        save(feeds);
        onChange();
      });
      return refreshing.then(() => true);
    },
  };
}
