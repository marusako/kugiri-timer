import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SLOTS, makeSlot, nextSlotId, addSlot, replaceSlot, removeSlot, slotsOn, parseTimetable,
  dayPlan, planTriggers, currentOrNextItem,
  replaceDay, copyDay, generateDay, generateDateEvents, slotsOnDate, skipSlotsOn, GENERATE_RANGES, GENERATE_DEFAULTS, REMINDER_MINUTES, scheduleReminders, parseGenerateOptions,
} from '../src/schedule.js';

// テストの時刻はローカル時刻で作る。2026-10-05 は月曜日
const at = (h, m = 0, s = 0) => new Date(2026, 9, 5, h, m, s).getTime();
const MONDAY = '2026-10-05';
const slot = (id, weekday, start, end, title = id) => ({ id, weekday, title, start, end, skips: [] });
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
  // 休みの日のない古い版のコマも読める。休みの日は、そのコマの曜日の日だけ残す (2026-10-05 は月曜、10-06 は火曜)
  const old = { id: 'tt-1', weekday: 1, title: '数学', start: '09:00', end: '09:50' };
  assert.deepEqual(parseTimetable([old]), [{ ...old, skips: [] }]);
  assert.deepEqual(parseTimetable([{ ...old, skips: ['2026-10-12', MONDAY, '2026-10-06', 'x', MONDAY] }])[0].skips, [MONDAY, '2026-10-12']);
});

test('時間割のこの日だけ休む: その日の曜日のコマだけ (id を省くとすべて)。ほかの週は残る', () => {
  const nextMonday = '2026-10-12';
  const one = skipSlotsOn(timetable, MONDAY, 'tt-2');
  assert.deepEqual(slotsOnDate(one, MONDAY).map((s) => s.id), ['tt-1', 'tt-3']);
  assert.deepEqual(slotsOnDate(one, nextMonday).map((s) => s.id), ['tt-1', 'tt-2', 'tt-3']);
  const all = skipSlotsOn(timetable, MONDAY);
  assert.deepEqual(slotsOnDate(all, MONDAY), []);
  assert.equal(all[3], timetable[3], 'ほかの曜日のコマはそのまま');
  assert.equal(skipSlotsOn(all, MONDAY)[0].skips.length, 1, '同じ日を 2 回足さない');
  assert.deepEqual(dayPlan(all, [], MONDAY), []);
  assert.equal(dayPlan(all, [], nextMonday).length, 3);
  // ほかの曜日にコピーしたコマは、休みの日を持っていかない
  assert.deepEqual(copyDay(all, 1, [3]).filter((s) => s.weekday === 3).map((s) => s.skips), [[], [], []]);
});

test('その日の予定: その曜日の時間割と、その日のカレンダーの予定を合わせて始まる順', () => {
  const events = [{ id: 'ev-1', title: '面談', date: MONDAY, start: '09:55', end: '10:00', preset: null }, { id: 'ev-2', title: '別の日', date: '2026-10-06', start: '09:00', end: '10:00', preset: null }];
  const plan = dayPlan(timetable, events, MONDAY);
  assert.deepEqual(plan.map((p) => [p.title, p.source]), [['数学', 'timetable'], ['面談', 'event'], ['英語', 'timetable'], ['理科', 'timetable']]);
  assert.equal(plan[0].startAt, at(9));
  assert.equal(plan[0].endAt, at(9, 50));
  assert.deepEqual(dayPlan(timetable, [], 'bad'), []);
});

const ids = (slots) => slots.map((s) => s.id);

// カレンダーの予定 (くり返す予定を含む)
const ev =(id, date, start, end, extra = {}) => ({ id, title: id, date, start, end, preset: null, repeat: 'none', until: null, skips: [], ...extra });
const atDay = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();

test('その日の予定は、カレンダーの予定のプリセットも持つ (毎週のコマは null)', () => {
  const plan = dayPlan(timetable, [ev('ev-1', MONDAY, '09:55', '10:00', { preset: 'long' })], MONDAY);
  assert.deepEqual(plan.map((p) => [p.id, p.preset]), [['tt-1', null], ['ev-1', 'long'], ['tt-2', null], ['tt-3', null]]);
});

test('開始・終了の知らせ: 毎週のコマとカレンダーの予定を、前回確かめた時刻より後〜今までのものから、時刻の順に', () => {
  const events = [ev('ev-1', MONDAY, '09:50', '10:00')];
  assert.deepEqual(planTriggers(timetable, events, at(8, 59), at(9)).map((x) => [x.item.id, x.kind]), [['tt-1', 'start']]);
  assert.deepEqual(planTriggers(timetable, events, at(9), at(9)), [], '同じ時刻を 2 回は知らせない');
  // 同じ時刻に終わりと始まりがあるときは、終わりを先に
  assert.deepEqual(planTriggers(timetable, events, at(9, 49), at(9, 50)).map((x) => [x.item.id, x.kind]), [['tt-1', 'end'], ['ev-1', 'start']]);
  assert.deepEqual(planTriggers(timetable, events, at(9, 59), at(10)).map((x) => [x.item.id, x.kind]), [['ev-1', 'end'], ['tt-2', 'start']]);
  // 英語の終わりと理科の始まりが同じ時刻: どちらも出す (終わり → 始まりの順)
  assert.deepEqual(planTriggers(timetable, [], at(10, 49), at(10, 50)).map((x) => [x.item.id, x.kind]), [['tt-2', 'end'], ['tt-3', 'start']]);
});

test('開始・終了の知らせ: 気づくのが 5 分より遅れたもの (スリープ明けなど) は出さない', () => {
  assert.equal(planTriggers(timetable, [], at(8), at(9, 5)).length, 1, 'ちょうど 5 分遅れは出す');
  assert.deepEqual(planTriggers(timetable, [], at(8), at(9, 6)), []);
});

test('開始・終了の知らせ: くり返す予定はその日の回 (date がその日)。日付をまたいでも、それぞれの日の回を 1 回ずつ', () => {
  const daily = (id, start, end) => ev(id, '2026-10-01', start, end, { repeat: 'daily' });
  const night = [daily('ev-3', '23:58', '23:59'), daily('ev-4', '00:00', '00:01')];
  assert.deepEqual(
    planTriggers([], night, atDay(20, 23, 57), atDay(21, 0)).map((x) => [x.item.id, x.item.date, x.kind]),
    [['ev-3', '2026-10-20', 'start'], ['ev-3', '2026-10-20', 'end'], ['ev-4', '2026-10-21', 'start']],
  );
});

test('メイン画面の予定: 今やっている予定 (コマか予定)、なければ今日このあとの予定、なければ null', () => {
  const events = [ev('ev-1', MONDAY, '13:00', '14:00')];
  assert.deepEqual(currentOrNextItem(timetable, events, at(9, 30)), { item: dayPlan(timetable, events, MONDAY)[0], ongoing: true });
  assert.equal(currentOrNextItem(timetable, events, at(9, 50)).item.id, 'tt-2', '終わった瞬間は次の予定');
  assert.equal(currentOrNextItem(timetable, events, at(9, 50)).ongoing, false);
  assert.equal(currentOrNextItem(timetable, events, at(11, 45)).item.id, 'ev-1');
  assert.equal(currentOrNextItem(timetable, events, at(14)), null, '明日の予定は出さない');
  // 重なっているときは、先に始まった予定 (並べた順の最初)
  assert.equal(currentOrNextItem(timetable, [ev('ev-2', MONDAY, '09:30', '09:40')], at(9, 35)).item.id, 'tt-1');
});

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

test('まとめて作る (その日だけ): くり返す予定は置き換えない。作った予定は added で返す', () => {
  const daily = { id: 'ev-1', title: '朝勉', date: '2026-10-01', start: '07:00', end: '08:00', preset: null, repeat: 'daily', until: null, skips: [] };
  const result = generateDateEvents({ date: MONDAY, ...GENERATE_DEFAULTS }, [daily], (n) => `${n}限`);
  assert.ok(result.events.includes(daily));
  assert.deepEqual(result.added.map((e) => [e.id, e.repeat]).slice(0, 2), [['ev-2', 'none'], ['ev-3', 'none']]);
  assert.equal(result.added.length, result.created);
  // その日の予定 (dayPlan) には、くり返す予定のその日の回も入る
  assert.deepEqual(dayPlan([], result.events, MONDAY).slice(0, 2).map((item) => [item.title, item.start]), [['朝勉', '07:00'], ['1限', '08:30']]);
});

test('まとめて作る (その日だけ): 日付・値がおかしいときはエラー', () => {
  assert.deepEqual(generateDateEvents({ date: '2026-02-30', ...GENERATE_DEFAULTS }, [], String), { error: 'invalidDate' });
  assert.deepEqual(generateDateEvents({ date: MONDAY, ...GENERATE_DEFAULTS, count: 0 }, [], String), { error: 'outOfRange' });
  assert.deepEqual(generateDateEvents({ date: MONDAY, ...GENERATE_DEFAULTS, start: '23:30' }, [], String), { error: 'noRoom' });
});
