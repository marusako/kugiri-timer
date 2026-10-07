import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KEEP_MONTHS, MAX_STEP_MS, ongoingItems, addFocusTime, addFocusCount, focusOf, dayFocus, forgetMissing, oldestKeptDate, parseFocusLog, focusMinutes,
} from '../src/focus-log.js';

// テストの時刻はローカル時刻で作る。2026-10-05 は月曜日
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();
const ev = (id, date, start, end, extra = {}) => ({ id, title: id, date, start, end, preset: null, repeat: 'none', until: null, skips: [], ...extra });
const slot = (id, weekday, start, end) => ({ id, weekday, title: id, start, end, skips: [] });

test('今やっている予定: カレンダーの予定 (くり返す予定はその日の回) と毎週のコマ。重なっていればすべて', () => {
  const events = [ev('ev-1', '2026-10-05', '09:00', '10:00'), ev('ev-2', '2026-10-01', '09:30', '09:45', { repeat: 'daily' })];
  const slots = [slot('tt-1', 1, '08:30', '09:15'), slot('tt-2', 2, '09:00', '10:00')];
  assert.deepEqual(ongoingItems(slots, events, at(5, 9, 0)).sort(), ['ev-1', 'tt-1']);
  assert.deepEqual(ongoingItems(slots, events, at(5, 9, 35)).sort(), ['ev-1', 'ev-2']);
  assert.deepEqual(ongoingItems(slots, events, at(5, 10, 0)), [], '終わりの時刻ちょうどは含まない');
  assert.deepEqual(ongoingItems(slots, events, at(6, 9, 40)).sort(), ['ev-2', 'tt-2']);
});

test('時間と回数を足す。1 回に足す時間には上限がある (スリープ明けなどでまとめて足さない)', () => {
  let log = addFocusTime({}, '2026-10-05', ['ev-1', 'tt-1'], 250);
  log = addFocusTime(log, '2026-10-05', ['ev-1'], 60 * 60 * 1000);
  assert.deepEqual(focusOf(log, '2026-10-05', 'ev-1'), { ms: 250 + MAX_STEP_MS, count: 0 });
  log = addFocusCount(log, '2026-10-05', ['ev-1', 'tt-1']);
  assert.deepEqual(focusOf(log, '2026-10-05', 'tt-1'), { ms: 250, count: 1 });
  assert.equal(focusOf(log, '2026-10-06', 'ev-1'), null);
  assert.equal(addFocusTime(log, '2026-10-05', [], 250), log, '予定がなければ何も変えない');
  assert.equal(addFocusTime(log, '2026-10-05', ['ev-1'], -5), log);
});

test('その日の合計 (ids を渡すと、その予定だけ)', () => {
  let log = addFocusTime({}, '2026-10-05', ['ev-1'], 2000);
  log = addFocusTime(log, '2026-10-05', ['tt-1'], 1000);
  log = addFocusCount(log, '2026-10-05', ['ev-1', 'tt-1']);
  assert.deepEqual(dayFocus(log, '2026-10-05'), { ms: 3000, count: 2 });
  assert.deepEqual(dayFocus(log, '2026-10-05', ['tt-1']), { ms: 1000, count: 1 });
  assert.deepEqual(dayFocus(log, '2026-10-06'), { ms: 0, count: 0 });
  assert.equal(focusMinutes(59999), 0);
  assert.equal(focusMinutes(25 * 60000 + 59000), 25);
});

test('消した予定の記録は忘れる。何も消えなければ同じものを返す', () => {
  let log = addFocusTime({}, '2026-10-05', ['ev-1', 'tt-1'], 1000);
  log = addFocusTime(log, '2026-10-06', ['ev-1'], 1000);
  assert.equal(forgetMissing(log, ['ev-1', 'tt-1']), log);
  assert.deepEqual(forgetMissing(log, ['tt-1']), { '2026-10-05': { 'tt-1': { ms: 1000, count: 0 } } });
});

test('保存データ: 正しい形のものだけ残し、3 か月より古い日は忘れる', () => {
  assert.equal(KEEP_MONTHS, 3);
  const now = at(7, 12);
  assert.equal(oldestKeptDate(now), '2026-07-07');
  const raw = {
    '2026-07-06': { 'ev-1': { ms: 1000, count: 1 } },
    '2026-07-07': { 'ev-1': { ms: 1000, count: 1 }, bad: { ms: 1, count: 1 }, 'tt-2': { ms: -1, count: 0 }, 'tt-3': { ms: 5, count: 1.5 } },
    '2026-02-30': { 'ev-1': { ms: 1, count: 0 } },
    '2026-10-07': { 'tt-1': { ms: 500, count: 0, extra: 'x' } },
    '2026-10-06': { bad: { ms: 1, count: 0 } },
  };
  assert.deepEqual(parseFocusLog(raw, now), { '2026-07-07': { 'ev-1': { ms: 1000, count: 1 } }, '2026-10-07': { 'tt-1': { ms: 500, count: 0 } } });
  assert.deepEqual(parseFocusLog(null, now), {});
  assert.deepEqual(parseFocusLog([], now), {});
});
