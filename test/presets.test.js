import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PRESETS, MAX_CUSTOM_PRESETS, MAX_NAME_LENGTH,
  parseCustomPresets, findMatchingPreset, addCustomPreset, removeCustomPreset, nextCustomNumber,
} from '../src/presets.js';
import { DEFAULT_SETTINGS, RANGES } from '../src/settings.js';

const values = (work, short, long, interval) => ({
  workMinutes: work, shortBreakMinutes: short, longBreakMinutes: long, longBreakInterval: interval,
});

test('デフォルトのプリセットは 定番 25/5/15・4回、長め 50/10/30・2回 の順', () => {
  assert.deepEqual(DEFAULT_PRESETS.map((p) => p.id), ['standard', 'long']);
  assert.deepEqual(DEFAULT_PRESETS.map((p) => p.values), [values(25, 5, 15, 4), values(50, 10, 30, 2)]);
});

test('「定番」は設定の初期値と同じ (初めて使う人は「定番」が選ばれた状態になる)', () => {
  const standard = DEFAULT_PRESETS.find((p) => p.id === 'standard');
  for (const [key, value] of Object.entries(standard.values)) assert.equal(DEFAULT_SETTINGS[key], value, key);
});

test('今の値と 4 つとも同じプリセットを探す。どれとも合わなければ null', () => {
  const custom = [{ id: 'custom-1', name: 'A', values: values(30, 5, 20, 3) }];
  assert.equal(findMatchingPreset(custom, values(25, 5, 15, 4)), 'standard');
  assert.equal(findMatchingPreset(custom, values(30, 5, 20, 3)), 'custom-1');
  assert.equal(findMatchingPreset(custom, values(25, 5, 15, 3)), null);
});

test('カスタムを足す: 名前の前後の空白を除き、番号付きの ID を付ける。元の一覧は書き換えない', () => {
  const before = [];
  const after = addCustomPreset(before, '  朝の勉強  ', values(30, 5, 20, 3), 'カスタム 1');
  assert.deepEqual(after, [{ id: 'custom-1', name: '朝の勉強', values: values(30, 5, 20, 3) }]);
  assert.equal(before.length, 0);
  const more = addCustomPreset(after, 'B', values(40, 5, 20, 3), 'カスタム 2');
  assert.equal(more[1].id, 'custom-2');
});

test('カスタムを足す: 名前が空なら代わりの名前を使い、長すぎる名前は切り詰める', () => {
  assert.equal(addCustomPreset([], '   ', values(30, 5, 20, 3), 'カスタム 1')[0].name, 'カスタム 1');
  const long = 'あ'.repeat(MAX_NAME_LENGTH + 5);
  assert.equal(addCustomPreset([], long, values(30, 5, 20, 3), 'x')[0].name.length, MAX_NAME_LENGTH);
});

test('カスタムは 10 個まで。それ以上は足さずに同じ一覧を返す', () => {
  assert.equal(MAX_CUSTOM_PRESETS, 10);
  let list = [];
  for (let i = 0; i < 12; i += 1) list = addCustomPreset(list, `P${i}`, values(20 + i, 5, 15, 4), 'x');
  assert.equal(list.length, 10);
});

test('次の番号は、使っている番号の最大 + 1 (消した番号は使い回さない)', () => {
  assert.equal(nextCustomNumber([]), 1);
  assert.equal(nextCustomNumber([{ id: 'custom-1' }, { id: 'custom-4' }]), 5);
});

test('カスタムを消す (元の一覧は書き換えない)。デフォルトの ID を渡しても何も消さない', () => {
  const list = [{ id: 'custom-1', name: 'A', values: values(30, 5, 20, 3) }, { id: 'custom-2', name: 'B', values: values(40, 5, 20, 3) }];
  assert.deepEqual(removeCustomPreset(list, 'custom-1').map((p) => p.id), ['custom-2']);
  assert.equal(list.length, 2);
  assert.equal(removeCustomPreset(list, 'standard').length, 2);
});

test('保存データの読み込み: 正しいものだけ残し、値は範囲に収める。おかしなデータは捨てる', () => {
  const raw = [
    { id: 'custom-1', name: 'A', values: values(30, 5, 20, 3) },
    { id: 'custom-2', name: 'B', values: values(999, 0, 20, 3) }, // 範囲外は範囲内に直す
    { id: '../evil', name: 'C', values: values(30, 5, 20, 3) }, // ID の形がおかしい
    { id: 'custom-3', name: 42, values: values(30, 5, 20, 3) }, // 名前が文字でない
    { id: 'custom-1', name: 'dup', values: values(30, 5, 20, 3) }, // ID が重複
    'garbage',
  ];
  const parsed = parseCustomPresets(raw, RANGES);
  assert.deepEqual(parsed.map((p) => p.id), ['custom-1', 'custom-2']);
  assert.deepEqual(parsed[1].values, values(120, 1, 20, 3));
  assert.deepEqual(parseCustomPresets('nope', RANGES), []);
  assert.deepEqual(parseCustomPresets(undefined, RANGES), []);
});
