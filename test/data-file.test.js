import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA_KEYS, FILE_VERSION, MAX_VALUE_LENGTH, isStorableValue, pickData, serializeData, parseDataFile, backupFileName } from '../src/data-file.js';

test('保存する項目は、設定・予定・時間割・集中の記録。以前の版の今日の回数 (stats) は読まない', () => {
  assert.deepEqual(DATA_KEYS, ['settings', 'events', 'timetable', 'focusLog']);
  assert.equal(isStorableValue('stats', { count: 1 }), false);
});

test('保存できる値: 知っている項目で、JSON にできて、大きすぎないもの', () => {
  assert.equal(isStorableValue('settings', { language: 'ja' }), true);
  assert.equal(isStorableValue('timetable', null), true, 'null も保存できる');
  assert.equal(isStorableValue('other', {}), false);
  assert.equal(isStorableValue('settings', undefined), false);
  const loop = {};
  loop.self = loop;
  assert.equal(isStorableValue('settings', loop), false);
  assert.equal(isStorableValue('events', 'x'.repeat(MAX_VALUE_LENGTH)), false);
});

test('ファイルに書いて読むと、知っている項目だけが戻る', () => {
  const data = { settings: { language: 'ja' }, events: [{ id: 'ev-1' }], timetable: null, other: 1 };
  const text = serializeData(data, new Date('2026-10-10T03:00:00Z'));
  const file = JSON.parse(text);
  assert.equal(file.app, 'kugiri-timer');
  assert.equal(file.version, FILE_VERSION);
  assert.equal(file.savedAt, '2026-10-10T03:00:00.000Z');
  assert.deepEqual(parseDataFile(text), { settings: { language: 'ja' }, events: [{ id: 'ev-1' }], timetable: null });
  assert.match(text, /\n {2}"data"/, '人が読めるように字下げする');
  assert.deepEqual(pickData(null), {});
  assert.deepEqual(pickData([1]), {});
});

test('読めないファイル: JSON でない・ほかのアプリのもの・新しい版のもの・中身がないもの', () => {
  const ok = serializeData({ settings: {} });
  assert.notEqual(parseDataFile(`﻿${ok}`), null, 'メモ帳で保存したときの BOM は無視する');
  assert.equal(parseDataFile('not json'), null);
  assert.equal(parseDataFile(JSON.stringify({ app: 'other', version: 1, data: { settings: {} } })), null);
  assert.equal(parseDataFile(JSON.stringify({ app: 'kugiri-timer', version: FILE_VERSION + 1, data: { settings: {} } })), null);
  assert.equal(parseDataFile(JSON.stringify({ app: 'kugiri-timer', version: 1, data: { other: 1 } })), null);
  assert.equal(parseDataFile(JSON.stringify({ app: 'kugiri-timer', version: 1 })), null);
  assert.equal(parseDataFile('null'), null);
});

test('書き出すファイルの名前は、その日の日付入り', () => {
  assert.equal(backupFileName(new Date(2026, 9, 10, 23, 59)), 'kugiri-timer-backup-2026-10-10.json');
});
