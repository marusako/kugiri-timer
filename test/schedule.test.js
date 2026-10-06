import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SLOTS, makeSlot, nextSlotId, addSlot, replaceSlot, removeSlot, slotsOn, parseTimetable,
  dayPlan, scheduleStatus, scheduleProgress, scheduleBoundaries, formatScheduleTime,
} from '../src/schedule.js';

// テストの時刻はローカル時刻で作る。2026-10-05 は月曜日
const at = (h, m = 0, s = 0) => new Date(2026, 9, 5, h, m, s).getTime();
const MONDAY = '2026-10-05';
const slot = (id, weekday, start, end, title = id) => ({ id, weekday, title, start, end });
const timetable = [
  slot('tt-1', 1, '09:00', '09:50', '数学'),
  slot('tt-2', 1, '10:00', '10:50', '英語'),
  slot('tt-3', 1, '10:50', '11:40', '理科'), // 英語のすぐあと (休み時間なし)
  slot('tt-4', 2, '09:00', '09:50', '火曜の授業'),
];

test('時間割のコマを作る: 曜日は 0〜6、終わりは始まりより後。名前が空なら仮の名前', () => {
  assert.deepEqual(makeSlot({ weekday: '1', title: ' 数学 ', start: '09:00', end: '09:50' }, 'tt-1', '授業'), { slot: slot('tt-1', 1, '09:00', '09:50', '数学') });
  assert.equal(makeSlot({ weekday: 1, title: '', start: '09:00', end: '09:50' }, 'tt-1', '授業').slot.title, '授業');
  assert.deepEqual(makeSlot({ weekday: 7, title: 'x', start: '09:00', end: '09:50' }, 'tt-1', ''), { error: 'invalidWeekday' });
  assert.deepEqual(makeSlot({ weekday: 1, title: 'x', start: '9:00', end: '09:50' }, 'tt-1', ''), { error: 'invalidTime' });
  assert.deepEqual(makeSlot({ weekday: 1, title: 'x', start: '10:00', end: '09:50' }, 'tt-1', ''), { error: 'endBeforeStart' });
});

test('時間割の追加・置き換え・削除。ID は使い回さない。上限は 200 コマ', () => {
  let slots = addSlot([], slot('tt-1', 1, '09:00', '09:50'));
  slots = addSlot(slots, slot(nextSlotId(slots), 1, '10:00', '10:50'));
  assert.deepEqual(slots.map((s) => s.id), ['tt-1', 'tt-2']);
  assert.equal(nextSlotId(removeSlot(slots, 'tt-1')), 'tt-3');
  assert.equal(replaceSlot(slots, { ...slots[0], title: '国語' })[0].title, '国語');
  assert.equal(MAX_SLOTS, 200);
});

test('曜日ごとの時間割は始まる順', () => {
  const slots = [slot('tt-1', 1, '10:00', '10:50'), slot('tt-2', 1, '09:00', '09:50'), slot('tt-3', 2, '08:00', '08:50')];
  assert.deepEqual(slotsOn(slots, 1).map((s) => s.id), ['tt-2', 'tt-1']);
});

test('保存データの時間割: 正しい形のものだけ残す', () => {
  const good = slot('tt-1', 1, '09:00', '09:50', '数学');
  assert.deepEqual(parseTimetable([good, { ...good, title: '同じ ID' }, { ...good, id: 'x' }, { ...good, id: 'tt-2', weekday: 9 }, { ...good, id: 'tt-3', title: ' ' }, null]), [good]);
  assert.deepEqual(parseTimetable('x'), []);
});

test('その日の予定: その曜日の時間割と、その日のカレンダーの予定を合わせて始まる順', () => {
  const events = [{ id: 'ev-1', title: '面談', date: MONDAY, start: '09:55', end: '10:00', preset: null }, { id: 'ev-2', title: '別の日', date: '2026-10-06', start: '09:00', end: '10:00', preset: null }];
  const plan = dayPlan(timetable, events, MONDAY);
  assert.deepEqual(plan.map((p) => [p.title, p.source]), [['数学', 'timetable'], ['面談', 'event'], ['英語', 'timetable'], ['理科', 'timetable']]);
  assert.equal(plan[0].startAt, at(9));
  assert.equal(plan[0].endAt, at(9, 50));
  assert.deepEqual(dayPlan(timetable, [], 'bad'), []);
});

test('今の状態: 予定の前・予定の最中・休み時間・すべて終わった', () => {
  const plan = dayPlan(timetable, [], MONDAY);
  const before = scheduleStatus(plan, at(8, 30));
  assert.equal(before.kind, 'beforeStart');
  assert.equal(before.next.title, '数学');
  assert.equal(before.endAt, at(9));

  const period = scheduleStatus(plan, at(9, 10));
  assert.equal(period.kind, 'period');
  assert.equal(period.item.title, '数学');
  assert.equal(period.next.title, '英語');
  assert.deepEqual([period.startAt, period.endAt], [at(9), at(9, 50)]);

  const brk = scheduleStatus(plan, at(9, 55));
  assert.equal(brk.kind, 'break');
  assert.deepEqual([brk.startAt, brk.endAt], [at(9, 50), at(10)]);
  assert.equal(brk.next.title, '英語');

  // 英語の終わりと理科の始まりが同じ時刻: その瞬間は理科の最中
  assert.equal(scheduleStatus(plan, at(10, 50)).item.title, '理科');
  assert.equal(scheduleStatus(plan, at(11, 40)).kind, 'done');
  assert.equal(scheduleStatus([], at(9)).kind, 'empty');
});

test('今の状態: 予定が重なっているときは、いちばん後に始まった予定', () => {
  const events = [{ id: 'ev-1', title: '小テスト', date: MONDAY, start: '09:30', end: '09:40', preset: null }];
  const plan = dayPlan(timetable, events, MONDAY);
  assert.equal(scheduleStatus(plan, at(9, 35)).item.title, '小テスト');
  assert.equal(scheduleStatus(plan, at(9, 45)).item.title, '数学', '小テストが終わったら、数学に戻る');
});

test('残り時間と進み具合: 1 が始まったばかり、0 が終わり。予定の前は円をいっぱいのまま', () => {
  const plan = dayPlan(timetable, [], MONDAY);
  assert.deepEqual(scheduleProgress(scheduleStatus(plan, at(9, 25)), at(9, 25)), { remainingMs: 25 * 60000, ratio: 0.5 });
  assert.deepEqual(scheduleProgress(scheduleStatus(plan, at(8, 0)), at(8, 0)), { remainingMs: 60 * 60000, ratio: 1 });
  assert.equal(scheduleProgress(scheduleStatus(plan, at(12)), at(12)), null);
});

test('区切りの知らせ: 前回確かめた時刻より後〜今までのものを、時刻ごとにまとめる', () => {
  const plan = dayPlan(timetable, [], MONDAY);
  const at950 = scheduleBoundaries(plan, at(9, 49, 59), at(9, 50));
  assert.equal(at950.length, 1);
  assert.deepEqual([at950[0].starts.length, at950[0].ends.map((i) => i.title)], [0, ['数学']]);
  // 英語の終わりと理科の始まりが同じ時刻: 1 つにまとまる
  const at1050 = scheduleBoundaries(plan, at(10, 49, 59), at(10, 50));
  assert.deepEqual([at1050[0].starts.map((i) => i.title), at1050[0].ends.map((i) => i.title)], [['理科'], ['英語']]);
  assert.deepEqual(scheduleBoundaries(plan, at(10, 50), at(10, 50)), [], '同じ時刻を 2 回は知らせない');
});

test('区切りの知らせ: 気づくのが 5 分より遅れたもの (スリープ明けなど) は出さない', () => {
  const plan = dayPlan(timetable, [], MONDAY);
  assert.equal(scheduleBoundaries(plan, at(8), at(9, 5)).length, 1);
  assert.deepEqual(scheduleBoundaries(plan, at(8), at(9, 6)), []);
});

test('残り時間の表示: 1 時間未満は 分:秒、1 時間以上は 時:分:秒。秒は切り上げ', () => {
  assert.equal(formatScheduleTime(25 * 60000), '25:00');
  assert.equal(formatScheduleTime(500), '00:01');
  assert.equal(formatScheduleTime(0), '00:00');
  assert.equal(formatScheduleTime(65 * 60000), '1:05:00');
  assert.equal(formatScheduleTime(8 * 3600000), '8:00:00');
});
