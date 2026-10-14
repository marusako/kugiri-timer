import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/settings.js';
import { createState, start, pause } from '../src/timer.js';
import { timerSegments, idleTimer } from '../src/lock-screen.js';

const MIN = 60 * 1000;
const s = DEFAULT_SETTINGS;
// 2026-10-05 は月曜日。時刻はローカル時刻で作る
const at = (h, m = 0) => new Date(2026, 9, 5, h, m).getTime();
const koma = (id, start, end) => ({ id, title: id, start, end, skips: [] });
const rounds = [{ id: 'rd-1', title: '午前', weekday: 1, date: null, komas: [koma('数学', '09:00', '09:50'), koma('英語', '10:00', '10:50')] }];

// ロック画面のタイマーは、区切り (いつまで何をするか) の並びを Android に渡しておき、時刻が来たら Android が次に切り替える
test('通常のタイマー: 動いている間は、今のセッションと、そのあとのセッションを、終わる時刻の順に並べる', () => {
  const working = start(createState(s), 0);
  assert.deepEqual(timerSegments(working, s, [], 10 * MIN, 3), [
    { mode: 'work', endAt: 25 * MIN },
    { mode: 'shortBreak', endAt: 30 * MIN },
    { mode: 'work', endAt: 55 * MIN },
  ]);
});

test('通常のタイマー: 止まっていれば出さない', () => {
  assert.deepEqual(timerSegments(createState(s), s, [], 0, 8), []);
  assert.deepEqual(timerSegments(pause(start(createState(s), 0), MIN), s, [], 2 * MIN, 8), []);
});

test('ラウンドの間: ラウンドの作業・休憩を、ラウンドの終わりまで並べる (通常のタイマーより先に)', () => {
  const working = start(createState(s), at(9, 10));
  const list = timerSegments(working, s, rounds, at(9, 20), 8);
  assert.deepEqual(list.map((x) => [x.phase, x.koma.id, x.endAt, x.round.id]), [
    ['work', '数学', at(9, 50), 'rd-1'],
    ['break', '英語', at(10), 'rd-1'],
    ['work', '英語', at(10, 50), 'rd-1'],
  ]);
  assert.equal(timerSegments(createState(s), s, rounds, at(10, 30), 8).length, 1, '止まっていても、ラウンドの間は出す');
  assert.equal(timerSegments(createState(s), s, rounds, at(9, 20), 2).length, 2, 'count 個まで');
});

// 止まっているときも、ロック画面の曲名の下に、タイマーの状態を出す (「作業 · 25:00」「作業 · 12:34 · 一時停止」)
test('止まっているタイマー: モードと残り時間。途中で止めたものだけ「一時停止」。動いていれば null', () => {
  assert.deepEqual(idleTimer(createState(s), s), { mode: 'work', remainingMs: 25 * MIN, paused: false });
  assert.deepEqual(idleTimer(pause(start(createState(s), 0), 5 * MIN), s), { mode: 'work', remainingMs: 20 * MIN, paused: true });
  assert.equal(idleTimer(start(createState(s), 0), s), null);
});
