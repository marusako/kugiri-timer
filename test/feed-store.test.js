import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFeedStore, responseError, MAX_FEED_BYTES } from '../src/feed-store.js';

const ics = (...lines) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...lines, 'END:VCALENDAR'].join('\r\n');
// 今日の 10:00〜11:00 (ローカル時刻) の予定 1 つ
const pad = (n) => String(n).padStart(2, '0');
const NOW = new Date(2026, 9, 11, 9, 0);
const stamp = `${NOW.getFullYear()}${pad(NOW.getMonth() + 1)}${pad(NOW.getDate())}`;
const ONE_EVENT = ics('BEGIN:VEVENT', 'UID:a@test', 'SUMMARY:数学', `DTSTART:${stamp}T100000`, `DTEND:${stamp}T110000`, 'END:VEVENT');
const URL_A = 'https://calendar.example.com/a/basic.ics';

// 暗号化の代わり: 元に戻せる形で文字を変える (保存したものに URL がそのまま入っていないことを確かめられる)
const fakeVault = {
  encrypt: async (text) => `enc:${[...text].reverse().join('')}`,
  decrypt: async (data) => {
    if (!data.startsWith('enc:')) throw new Error('解けない');
    return [...data.slice(4)].reverse().join('');
  },
};

function setup({ feeds = [], pages = { [URL_A]: { text: ONE_EVENT } }, canEncrypt = true } = {}) {
  const saved = [];
  const fetched = [];
  let changes = 0;
  const store = createFeedStore({
    feeds,
    save: (list) => saved.push(structuredClone(list)),
    ...fakeVault,
    canEncrypt: async () => canEncrypt,
    download: async (url) => {
      fetched.push(url);
      return pages[url] ?? { error: 'notFound' };
    },
    now: () => NOW,
    onChange: () => { changes += 1; },
  });
  return { store, saved, fetched, changes: () => changes };
}

test('追加: 1 回読めたら登録し、URL は暗号化して保存する。画面には URL を渡さない', async () => {
  const { store, saved, changes } = setup();
  assert.deepEqual(await store.add({ name: '学校', url: URL_A }), { ok: true });
  const [feed] = saved.at(-1);
  assert.equal(feed.name, '学校');
  assert.notEqual(feed.url, URL_A);
  assert.ok(!JSON.stringify(saved).includes(URL_A), '保存したものに URL がそのまま入らない');
  assert.equal(changes(), 1);

  const listed = await store.list();
  assert.equal(listed.available, true);
  assert.deepEqual(listed.feeds.map(({ name, count, error }) => ({ name, count, error })), [{ name: '学校', count: 1, error: null }]);
  assert.ok(!JSON.stringify(listed).includes(URL_A), '画面に URL を渡さない');
  const [event] = listed.events;
  assert.deepEqual([event.title, event.start, event.end, event.feedName], ['数学', '10:00', '11:00', '学校']);
  assert.match(event.id, /^ex-/);
});

test('追加: 読めない URL・暗号化が使えないときは登録しない', async () => {
  const bad = setup();
  assert.deepEqual(await bad.store.add({ name: '', url: 'https://calendar.example.com/missing.ics' }), { error: 'notFound' });
  assert.deepEqual(bad.saved, []);

  const noVault = setup({ canEncrypt: false });
  assert.deepEqual(await noVault.store.add({ name: '', url: URL_A }), { error: 'noEncryption' });
  assert.deepEqual(noVault.fetched, []);
  assert.equal((await noVault.store.list()).available, false);
});

test('追加: http の URL などは、makeFeed の決まりで断る (通信しない)', async () => {
  const { store, fetched } = setup();
  const result = await store.add({ name: '', url: 'http://calendar.example.com/a.ics' });
  assert.ok(result.error);
  assert.deepEqual(fetched, []);
});

test('読み直し: 失敗したら理由を付け、前に読めた予定は残す。暗号を解けないものは decrypt', async () => {
  const pages = { [URL_A]: { text: ONE_EVENT } };
  const { store, saved } = setup({ pages });
  await store.add({ name: 'A', url: URL_A });
  pages[URL_A] = { error: 'network' };
  await store.refresh();
  const [feed] = (await store.list()).feeds;
  assert.equal(feed.error, 'network');
  assert.equal(feed.count, 1, '前に読めた予定は残す');

  const moved = setup({ feeds: [{ ...saved.at(-1)[0], url: '別の端末で暗号化したもの' }] });
  await moved.store.refresh();
  assert.equal((await moved.store.list()).feeds[0].error, 'decrypt');
  assert.deepEqual(moved.fetched, []);
});

test('読み直しの最中に呼ばれたら、同じ読み直しを待つ (二重に通信しない)', async () => {
  const { store, fetched } = setup();
  await store.add({ name: 'A', url: URL_A });
  fetched.length = 0;
  await Promise.all([store.refresh(), store.refresh()]);
  assert.equal(fetched.length, 1);
});

test('外す: 一覧から消して保存する', async () => {
  const { store, saved } = setup();
  await store.add({ name: 'A', url: URL_A });
  const [{ id }] = (await store.list()).feeds;
  await store.remove(id);
  assert.deepEqual(saved.at(-1), []);
  assert.equal(store.hasFeeds(), false);
});

test('保存されていたものは、形の正しいものだけ使う', async () => {
  const { store } = setup({ feeds: [null, { id: 1 }, { id: 'feed-a', name: 'A', url: 'enc:x', events: [] }] });
  assert.deepEqual((await store.list()).feeds.map((f) => f.id), ['feed-a']);
});

test('応答の確かめ方: 404 は notFound、ほかの失敗と https でない転送先は network', () => {
  assert.equal(responseError(200, URL_A), null);
  assert.equal(responseError(404, URL_A), 'notFound');
  assert.equal(responseError(500, URL_A), 'network');
  assert.equal(responseError(200, 'http://calendar.example.com/a.ics'), 'network');
  assert.equal(MAX_FEED_BYTES, 5 * 1024 * 1024);
});
