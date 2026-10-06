import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SLOTS, makeSlot, nextSlotId, addSlot, replaceSlot, removeSlot, slotsOn, parseTimetable,
  dayPlan, scheduleStatus, scheduleProgress, scheduleBoundaries, formatScheduleTime,
  replaceDay, copyDay, generateDay, generateDateEvents, GENERATE_RANGES, GENERATE_DEFAULTS, REMINDER_MINUTES, scheduleReminders, parseGenerateOptions,
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

const ids = (slots) => slots.map((s) => s.id);

test('曜日のコピー: コピー先は、コピー元と同じ内容に置き換える。ID は新しく振る', () => {
  const copied = copyDay(timetable, 1, [3, 5]);
  assert.deepEqual(slotsOn(copied, 3).map((s) => [s.title, s.start, s.end]), slotsOn(timetable, 1).map((s) => [s.title, s.start, s.end]));
  assert.equal(slotsOn(copied, 5).length, 3);
  assert.equal(new Set(ids(copied)).size, copied.length, 'ID が重ならない');
  assert.deepEqual(slotsOn(copied, 2).map((s) => s.title), ['火曜の授業'], 'コピー先でない曜日はそのまま');
  // 火曜にコピーすると、火曜にあったコマは消えて月曜と同じになる
  assert.deepEqual(slotsOn(copyDay(timetable, 1, [2]), 2).map((s) => s.title), ['数学', '英語', '理科']);
});

test('曜日のコピー: コピー元自身や、おかしな曜日は無視する。上限を超えるなら null', () => {
  assert.deepEqual(slotsOn(copyDay(timetable, 1, [1, 9, -1]), 1).map((s) => s.id), ['tt-1', 'tt-2', 'tt-3']);
  const many = Array.from({ length: 30 }, (_, i) => slot(`tt-${i + 1}`, 1, '09:00', '09:10'));
  assert.equal(copyDay(many, 1, [0, 2, 3, 4, 5, 6]), null, '30 × 7 = 210 コマは上限 (200) を超える');
});

test('まとめて作る: 開始・1 コマの長さ・休み・コマ数から作り、その曜日のコマを置き換える', () => {
  const result = generateDay({ weekday: 1, start: '08:50', period: 50, breakMinutes: 10, count: 6 }, timetable, (n) => `${n}限`);
  const monday = slotsOn(result.slots, 1);
  assert.equal(result.created, 6);
  assert.deepEqual(monday.map((s) => [s.title, s.start, s.end]), [
    ['1限', '08:50', '09:40'], ['2限', '09:50', '10:40'], ['3限', '10:50', '11:40'],
    ['4限', '11:50', '12:40'], ['5限', '12:50', '13:40'], ['6限', '13:50', '14:40'],
  ]);
  assert.deepEqual(slotsOn(result.slots, 2).map((s) => s.title), ['火曜の授業'], 'ほかの曜日はそのまま');
  assert.equal(new Set(ids(result.slots)).size, result.slots.length);
});

test('まとめて作る: 日をまたぐ分は作らない。範囲の外や、1 コマも入らないときはエラー', () => {
  const late = generateDay({ weekday: 0, start: '22:00', period: 50, breakMinutes: 10, count: 5 }, [], (n) => `${n}`);
  assert.deepEqual(late.slots.map((s) => [s.start, s.end]), [['22:00', '22:50'], ['23:00', '23:50']]);
  assert.deepEqual(generateDay({ weekday: 0, start: '23:30', period: 50, breakMinutes: 0, count: 1 }, [], String), { error: 'noRoom' });
  assert.deepEqual(generateDay({ weekday: 0, start: '9:00', period: 50, breakMinutes: 0, count: 1 }, [], String), { error: 'invalidTime' });
  assert.deepEqual(GENERATE_RANGES, { period: [5, 180], break: [0, 60], longBreak: [0, 180], longBreakAfter: [1, 11], count: [1, 12] });
  assert.deepEqual(generateDay({ weekday: 0, start: '09:00', period: 4, breakMinutes: 0, count: 1 }, [], String), { error: 'outOfRange' });
  assert.deepEqual(generateDay({ weekday: 0, start: '09:00', period: 50, breakMinutes: 0, count: 13 }, [], String), { error: 'outOfRange' });
});

test('まとめて作る・置き換え: その曜日だけを入れ替える', () => {
  assert.deepEqual(replaceDay(timetable, 2, []).map((s) => s.id), ['tt-1', 'tt-2', 'tt-3']);
});

test('予定の前の知らせ: 始まる N 分前になった予定。0 分 (しない) なら何も出さない', () => {
  assert.deepEqual(REMINDER_MINUTES, [0, 1, 3, 5, 10]);
  const plan = dayPlan(timetable, [], MONDAY);
  assert.deepEqual(scheduleReminders(plan, at(8, 56, 59), at(8, 57), 3).map((p) => p.title), ['数学']);
  assert.deepEqual(scheduleReminders(plan, at(8, 57), at(8, 57), 3), [], '同じ時刻を 2 回は知らせない');
  assert.deepEqual(scheduleReminders(plan, at(8, 56, 59), at(8, 57), 0), []);
  assert.deepEqual(scheduleReminders(plan, at(8, 0), at(9, 3), 3), [], '5 分より遅れて気づいたものは出さない');
});

test('まとめて作る: 長い休み (昼休み) は、指定したコマ目のあとの休みだけを長くする', () => {
  const result = generateDay({ weekday: 1, ...GENERATE_DEFAULTS }, [], (n) => `${n}限`);
  assert.deepEqual(slotsOn(result.slots, 1).map((s) => [s.title, s.start, s.end]), [
    ['1限', '08:30', '09:15'], ['2限', '09:25', '10:10'], ['3限', '10:20', '11:05'], ['4限', '11:15', '12:00'],
    ['5限', '13:00', '13:45'], ['6限', '13:55', '14:40'], ['7限', '14:50', '15:35'],
  ]);
});

test('まとめて作る: 初めの値は 8:30・45 分・休み 10 分・長い休み 60 分 (4 コマ目のあと)・7 コマ', () => {
  assert.deepEqual(GENERATE_DEFAULTS, { start: '08:30', period: 45, breakMinutes: 10, longBreakMinutes: 60, longBreakAfter: 4, count: 7 });
});

test('まとめて作る: 長い休みが 0 分、またはコマ数より後の位置なら、普通の休みのまま', () => {
  const base = { weekday: 1, start: '09:00', period: 50, breakMinutes: 10, count: 3 };
  const plain = generateDay(base, [], String).slots.map((s) => s.start);
  assert.deepEqual(plain, ['09:00', '10:00', '11:00']);
  assert.deepEqual(generateDay({ ...base, longBreakMinutes: 0, longBreakAfter: 1 }, [], String).slots.map((s) => s.start), plain);
  assert.deepEqual(generateDay({ ...base, longBreakMinutes: 60, longBreakAfter: 3 }, [], String).slots.map((s) => s.start), plain, '最後のコマのあとは休みがない');
  assert.deepEqual(generateDay({ ...base, longBreakMinutes: 60, longBreakAfter: 1 }, [], String).slots.map((s) => s.start), ['09:00', '10:50', '11:50']);
  assert.deepEqual(generateDay({ ...base, longBreakMinutes: 200, longBreakAfter: 1 }, [], String), { error: 'outOfRange' });
});

test('まとめて作る: 最後に使った値を読み戻す。おかしな値・まだないときは、その項目だけ初めの値', () => {
  assert.deepEqual(parseGenerateOptions(undefined), GENERATE_DEFAULTS);
  const last = { start: '09:00', period: 50, breakMinutes: 5, longBreakMinutes: 40, longBreakAfter: 3, count: 6 };
  assert.deepEqual(parseGenerateOptions(last), last);
  assert.deepEqual(parseGenerateOptions({ ...last, start: '9:00', period: 999, count: '6' }), { ...last, start: '08:30', period: 45, count: 6 });
});

test('まとめて作る (その日だけ): その日の 1 回だけの予定を作る。その日のほかの 1 回だけの予定は置き換え、ほかの日はそのまま', () => {
  const events = [
    { id: 'ev-1', title: '面談', date: MONDAY, start: '16:00', end: '16:30', preset: 'school' },
    { id: 'ev-2', title: '別の日', date: '2026-10-12', start: '09:00', end: '10:00', preset: null },
  ];
  const result = generateDateEvents({ date: MONDAY, ...GENERATE_DEFAULTS }, events, (n) => `${n}限`);
  assert.equal(result.created, 7);
  const monday = result.events.filter((e) => e.date === MONDAY);
  assert.deepEqual(monday.map((e) => [e.title, e.start, e.end, e.preset]).slice(0, 2), [['1限', '08:30', '09:15', null], ['2限', '09:25', '10:10', null]]);
  assert.equal(monday.at(-1).end, '15:35');
  assert.equal(monday.some((e) => e.title === '面談'), false, 'その日の 1 回だけの予定は置き換わる');
  assert.ok(result.events.some((e) => e.id === 'ev-2'), 'ほかの日の予定はそのまま');
  assert.equal(new Set(result.events.map((e) => e.id)).size, result.events.length, 'ID が重ならない');
  assert.ok(monday.every((e) => !['ev-1', 'ev-2'].includes(e.id)), '消した予定の ID は使い回さない');
});

test('まとめて作る (その日だけ): 日付・値がおかしいときはエラー', () => {
  assert.deepEqual(generateDateEvents({ date: '2026-02-30', ...GENERATE_DEFAULTS }, [], String), { error: 'invalidDate' });
  assert.deepEqual(generateDateEvents({ date: MONDAY, ...GENERATE_DEFAULTS, count: 0 }, [], String), { error: 'outOfRange' });
  assert.deepEqual(generateDateEvents({ date: MONDAY, ...GENERATE_DEFAULTS, start: '23:30' }, [], String), { error: 'noRoom' });
});
