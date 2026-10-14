import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/settings.js';
import { createState, start, pause } from '../src/timer.js';
import { TIMER_NOTICE_COUNT, timerNoticePlan, reconcileNotices } from '../src/mobile-notice.js';

const MIN = 60 * 1000;
const s = DEFAULT_SETTINGS;

test('タイマーの通知の計画: 動いている間は、先の回まで、終わる時刻・終わるモード・次に始まるモードを並べる', () => {
  assert.equal(TIMER_NOTICE_COUNT, 8);
  assert.deepEqual(timerNoticePlan(start(createState(s), 0), s, 3).map(({ at, mode, next }) => [at, mode, next]), [
    [25 * MIN, 'work', 'shortBreak'],
    [30 * MIN, 'shortBreak', 'work'],
    [55 * MIN, 'work', 'shortBreak'],
  ]);
});

test('タイマーの通知の計画: 4 回目の作業のあとは長い休憩。止まっていれば何も予約しない', () => {
  const plan = timerNoticePlan({ ...start(createState(s), 0), completedWork: 3 }, s, 2);
  assert.deepEqual(plan.map((n) => n.next), ['longBreak', 'work']);
  assert.deepEqual(timerNoticePlan(pause(start(createState(s), 0), MIN), s, 8), []);
});

const n = (id, at, key = 'k') => ({ id, at, key });
const w = (at, key = 'k') => ({ at, key });

test('予約をそろえる: 同じなら何もしない (画面の更新のたびに預け直さない)', () => {
  assert.equal(reconcileNotices([n(1, 5000), n(2, 9000)], [w(5000), w(9000)], 1000), null);
  assert.equal(reconcileNotices([], [], 1000), null);
});

test('予約をそろえる: 要らなくなった予約は取り消し、足りない予約は足す。そのままの予約は残す', () => {
  assert.deepEqual(reconcileNotices([n(1, 5000), n(2, 9000)], [w(9000), w(12000)], 1000), {
    cancel: [1], keep: [n(2, 9000)], add: [w(12000)],
  });
  assert.deepEqual(reconcileNotices([n(1, 5000)], [w(5000, 'other')], 1000), {
    cancel: [1], keep: [], add: [w(5000, 'other')],
  }, '時刻が同じでも、中身 (key) が違えば預け直す');
});

test('予約をそろえる: 時刻が来た予約は取り消さずに忘れる (出ている・出かけている通知を消さないように)。過ぎた時刻は予約しない', () => {
  assert.deepEqual(reconcileNotices([n(1, 5000), n(2, 9000)], [w(9000)], 6000), { cancel: [], keep: [n(2, 9000)], add: [] });
  assert.deepEqual(reconcileNotices([n(1, 5000)], [w(4000), w(5000)], 6000), { cancel: [], keep: [], add: [] });
  assert.deepEqual(reconcileNotices([n(1, 5000)], [], 3000), { cancel: [1], keep: [], add: [] }, '止めたら、時刻が来ていない予約を取り消す');
});
