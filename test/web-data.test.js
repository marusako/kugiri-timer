import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWebData } from '../src/web-data.js';
import { parseDataFile } from '../src/data-file.js';

// localStorage と同じ操作 (getItem・setItem・removeItem) ができる入れ物
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    keys: () => [...map.keys()].sort(),
  };
}

const NOW = new Date(2026, 9, 11, 12, 0, 0);

test('書き出し: localStorage のデータを、パソコン版と同じ形のファイルにして渡す', async () => {
  const storage = memoryStorage({
    settings: JSON.stringify({ focusMinutes: 30 }),
    events: JSON.stringify([{ id: 'a' }]),
    other: '"知らない項目"',
  });
  let shared = null;
  const webData = createWebData({ storage, share: async (text, name) => { shared = { text, name }; return true; }, now: () => NOW });
  assert.deepEqual(await webData.exportData(), { saved: true });
  assert.equal(shared.name, 'focusr-backup-2026-10-11.json');
  assert.deepEqual(parseDataFile(shared.text), { settings: { focusMinutes: 30 }, events: [{ id: 'a' }] });
});

test('書き出し: 壊れた値は飛ばす。共有をやめたら saved: false', async () => {
  const storage = memoryStorage({ settings: '{壊れた', events: JSON.stringify([{ id: 'ev-1' }]) });
  let text = '';
  const webData = createWebData({ storage, share: async (t) => { text = t; return false; }, now: () => NOW });
  assert.deepEqual(await webData.exportData(), { saved: false });
  assert.deepEqual(parseDataFile(text), { events: [{ id: 'ev-1' }] });
});

test('読み込み: 選んだファイルが正しい形ならデータを、違えば error、選ばなければ canceled を返す', async () => {
  const file = (text) => ({ size: text.length, text: async () => text });
  const good = `${JSON.stringify({ app: 'focusr', version: 1, savedAt: NOW.toISOString(), data: { events: [{ id: 'ev-2' }] } })}\n`;
  const read = (picked) => createWebData({ storage: memoryStorage(), pickFile: async () => picked }).importData();
  assert.deepEqual(await read(file(good)), { data: { events: [{ id: 'ev-2' }] } });
  assert.deepEqual(await read(file('{"app":"other"}')), { error: 'invalid' });
  assert.deepEqual(await read(null), { canceled: true });
  assert.deepEqual(await read({ size: 100 * 1024 * 1024, text: async () => good }), { error: 'invalid' }, '大きすぎるファイルは読まない');
  assert.deepEqual(await read({ size: 10, text: async () => { throw new Error('読めない'); } }), { error: 'invalid' });
});

test('入れ替え: 読み込んだ項目で置きかえ、ファイルにない項目は消す (パソコン版と同じ)。知らない項目には触らない', async () => {
  const storage = memoryStorage({ settings: '{}', events: '[]', other: '"そのまま"' });
  const webData = createWebData({ storage });
  assert.equal(await webData.replace({ settings: { focusMinutes: 50 }, focusLog: {} }), true);
  assert.deepEqual(storage.keys(), ['focusLog', 'other', 'settings']);
  assert.deepEqual(JSON.parse(storage.getItem('settings')), { focusMinutes: 50 });
  assert.equal(storage.getItem('other'), '"そのまま"');
});

test('入れ替え: 知っている項目が 1 つもなければ何もしない', async () => {
  const storage = memoryStorage({ events: '[]' });
  assert.equal(await createWebData({ storage }).replace({ unknown: 1 }), false);
  assert.equal(storage.getItem('events'), '[]');
});
