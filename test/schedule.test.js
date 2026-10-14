import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_KOMAS, MAX_ROUNDS, makeKoma, makeRound, nextRoundId, nextKomaId, allKomas, roundsOn, komasOnDate,
  addRound, replaceRound, removeRound, saveKoma, removeKoma, skipRoundsOn, clearRoundsOn, clearWeekday, copyRounds, parseTimetable,
  dayPlan, planTriggers, currentOrNextItem,
  generateRound, GENERATE_RANGES, GENERATE_DEFAULTS, REMINDER_MINUTES, scheduleReminders, parseGenerateOptions, upcomingNotices,
} from '../src/schedule.js';

// テストの時刻はローカル時刻で作る。2026-10-05 は月曜日
const at = (h, m = 0, s = 0) => new Date(2026, 9, 5, h, m, s).getTime();
const MONDAY = '2026-10-05';
const NEXT_MONDAY = '2026-10-12';
const koma = (id, start, end, title = id, skips = []) => ({ id, title, start, end, skips });
const weekly = (id, weekday, komas, title = id) => ({ id, title, weekday, date: null, komas });
const once = (id, date, komas, title = id) => ({ id, title, weekday: null, date, komas });
// 月曜の毎週のラウンド (英語と理科は休み時間なし) と、火曜の毎週のラウンド
const rounds = [
  weekly('rd-1', 1, [koma('tt-1', '09:00', '09:50', '数学'), koma('tt-2', '10:00', '10:50', '英語'), koma('tt-3', '10:50', '11:40', '理科')], '午前'),
  weekly('rd-2', 2, [koma('tt-4', '09:00', '09:50', '火曜の授業')]),
];
const ids = (list) => list.map((x) => x.id);

test('コマを作る: 終わりは始まりより後。名前が空なら仮の名前。休みの日は、毎週のラウンドの曜日の日だけ残す', () => {
  assert.deepEqual(makeKoma({ title: ' 数学 ', start: '09:00', end: '09:50' }, 'tt-1', '授業', 1), { koma: koma('tt-1', '09:00', '09:50', '数学') });
  assert.equal(makeKoma({ title: '', start: '09:00', end: '09:50' }, 'tt-1', '授業', 1).koma.title, '授業');
  assert.deepEqual(makeKoma({ title: 'x', start: '9:00', end: '09:50' }, 'tt-1', '', 1), { error: 'invalidTime' });
  assert.deepEqual(makeKoma({ title: 'x', start: '10:00', end: '09:50' }, 'tt-1', '', 1), { error: 'endBeforeStart' });
  // 2026-10-05 は月曜、10-06 は火曜
  assert.deepEqual(makeKoma({ title: 'x', start: '09:00', end: '09:50', skips: [NEXT_MONDAY, MONDAY, '2026-10-06', 'x', MONDAY] }, 'tt-1', '', 1).koma.skips, [MONDAY, NEXT_MONDAY]);
  assert.deepEqual(makeKoma({ title: 'x', start: '09:00', end: '09:50', skips: [MONDAY] }, 'tt-1', '', null).koma.skips, [], 'その日だけのラウンドのコマは休みを持たない');
});

test('ラウンドを作る: 毎週 (曜日 0〜6) か、その日だけ (日付) のどちらか。名前は空でもよい', () => {
  assert.deepEqual(makeRound({ title: ' 午前 ', weekday: '1', komas: [] }, 'rd-1'), { round: weekly('rd-1', 1, [], '午前') });
  assert.deepEqual(makeRound({ title: '', date: MONDAY, komas: [] }, 'rd-1'), { round: once('rd-1', MONDAY, [], '') });
  assert.deepEqual(makeRound({ title: 'x', weekday: 7, komas: [] }, 'rd-1'), { error: 'invalidWeekday' });
  assert.deepEqual(makeRound({ title: 'x', date: '2026-02-30', komas: [] }, 'rd-1'), { error: 'invalidDate' });
});

test('ID は使い回さない。コマの ID は、すべてのラウンドを通して重ならない', () => {
  assert.equal(nextRoundId(rounds), 'rd-3');
  assert.equal(nextKomaId(rounds), 'tt-5');
  assert.equal(nextKomaId(removeRound(rounds, 'rd-2')), 'tt-4');
  assert.deepEqual(ids(allKomas(rounds)), ['tt-1', 'tt-2', 'tt-3', 'tt-4']);
  assert.equal(MAX_KOMAS, 200);
  assert.equal(MAX_ROUNDS, 100);
});

test('ラウンドの追加・置き換え・削除。コマが上限 (200) を超えるなら null', () => {
  const added = addRound(rounds, once('rd-3', MONDAY, [koma('tt-5', '13:00', '13:45')]));
  assert.deepEqual(ids(added), ['rd-1', 'rd-2', 'rd-3']);
  assert.equal(replaceRound(added, { ...added[2], title: '午後' })[2].title, '午後');
  assert.deepEqual(ids(removeRound(added, 'rd-1')), ['rd-2', 'rd-3']);
  const many = Array.from({ length: 200 }, (_, i) => koma(`tt-${i + 1}`, '09:00', '09:10'));
  assert.equal(addRound([weekly('rd-1', 1, many)], once('rd-2', MONDAY, [koma('tt-201', '10:00', '10:10')])), null);
});

test('コマを足す・直す・消す。最後のコマを消すと、ラウンドも消える', () => {
  const added = saveKoma(rounds, 'rd-2', koma('tt-5', '10:00', '10:50', '足したコマ'));
  assert.deepEqual(ids(added[1].komas), ['tt-4', 'tt-5']);
  const edited = saveKoma(added, 'rd-2', koma('tt-5', '11:00', '11:50', '直したコマ'));
  assert.deepEqual(edited[1].komas.map((k) => k.title), ['火曜の授業', '直したコマ']);
  assert.deepEqual(ids(removeKoma(edited, 'rd-2', 'tt-5')[1].komas), ['tt-4']);
  assert.deepEqual(ids(removeKoma(rounds, 'rd-2', 'tt-4')), ['rd-1']);
  const full = [weekly('rd-1', 1, Array.from({ length: 200 }, (_, i) => koma(`tt-${i + 1}`, '09:00', '09:10')))];
  assert.equal(saveKoma(full, 'rd-1', koma('tt-201', '10:00', '10:10')), null, '上限を超えるなら null');
  assert.equal(saveKoma(full, 'rd-1', koma('tt-1', '10:00', '10:10'))[0].komas[0].start, '10:00', '直すのは上限でもできる');
});

test('その日のラウンド: 毎週は曜日、その日だけは日付で。休みにしたコマを除き、コマは始まる順。コマのないラウンドは出さない', () => {
  const list = [...rounds, once('rd-3', MONDAY, [koma('tt-6', '14:00', '14:45'), koma('tt-5', '13:00', '13:45')])];
  assert.deepEqual(roundsOn(list, MONDAY).map((r) => [r.id, ids(r.komas)]), [['rd-1', ['tt-1', 'tt-2', 'tt-3']], ['rd-3', ['tt-5', 'tt-6']]]);
  assert.deepEqual(ids(roundsOn(list, NEXT_MONDAY)), ['rd-1'], 'その日だけのラウンドは、ほかの週に出ない');
  assert.deepEqual(komasOnDate(list, MONDAY).map((k) => [k.id, k.roundId, k.roundTitle]).slice(0, 2), [['tt-1', 'rd-1', '午前'], ['tt-2', 'rd-1', '午前']]);
  assert.deepEqual(roundsOn(list, 'bad'), []);
});

test('この日だけ休む: 毎週のラウンドのコマに休みの日を足す (ラウンドを指定、コマも指定できる)。ほかの週は残る', () => {
  const one = skipRoundsOn(rounds, MONDAY, 'rd-1', 'tt-2');
  assert.deepEqual(ids(roundsOn(one, MONDAY)[0].komas), ['tt-1', 'tt-3']);
  assert.deepEqual(ids(roundsOn(one, NEXT_MONDAY)[0].komas), ['tt-1', 'tt-2', 'tt-3']);
  const whole = skipRoundsOn(rounds, MONDAY, 'rd-1');
  assert.deepEqual(roundsOn(whole, MONDAY), [], 'すべてのコマが休みなら、その日はラウンドも出ない');
  assert.equal(whole[1], rounds[1], 'ほかのラウンドはそのまま');
  assert.equal(skipRoundsOn(whole, MONDAY, 'rd-1')[0].komas[0].skips.length, 1, '同じ日を 2 回足さない');
});

test('この日をすべて消す: その日だけのラウンドは消し、毎週のラウンドはその日だけ休む', () => {
  const list = [...rounds, once('rd-3', MONDAY, [koma('tt-5', '13:00', '13:45')]), once('rd-4', NEXT_MONDAY, [koma('tt-6', '13:00', '13:45')])];
  const cleared = clearRoundsOn(list, MONDAY);
  assert.deepEqual(roundsOn(cleared, MONDAY), []);
  assert.deepEqual(ids(cleared), ['rd-1', 'rd-2', 'rd-4']);
  assert.deepEqual(ids(roundsOn(cleared, NEXT_MONDAY)), ['rd-1', 'rd-4']);
});

test('この曜日をすべて消す: その曜日の毎週のラウンドを、すべての週から消す (その日だけのラウンドは残す)', () => {
  const list = [...rounds, once('rd-3', MONDAY, [koma('tt-5', '13:00', '13:45')])];
  assert.deepEqual(ids(clearWeekday(list, 1)), ['rd-2', 'rd-3']);
});

test('ほかの曜日にコピー: 毎週のラウンドは毎週のその曜日へ、その日だけのラウンドは同じ週のその曜日の日へ。コピー先は置き換える', () => {
  const list = [...rounds, once('rd-3', MONDAY, [koma('tt-5', '13:00', '13:45', '補習')]), once('rd-4', '2026-10-07', [koma('tt-6', '08:00', '08:45')])];
  const copied = copyRounds(list, MONDAY, [2, 3, 1, 9]);
  // 火曜の毎週のラウンドは、月曜と同じ中身に置き換わる。水曜 (10-07) のその日だけのラウンドも置き換わる
  assert.deepEqual(roundsOn(copied, '2026-10-06').map((r) => [r.title, r.komas.map((k) => k.title)]), [['午前', ['数学', '英語', '理科']], ['rd-3', ['補習']]]);
  assert.deepEqual(roundsOn(copied, '2026-10-07').map((r) => r.title), ['午前', 'rd-3']);
  assert.deepEqual(roundsOn(copied, '2026-10-14').map((r) => r.title), ['午前'], 'その日だけのラウンドは、ほかの週に出ない');
  assert.equal(new Set(ids(copied)).size, copied.length, 'ラウンドの ID が重ならない');
  assert.equal(new Set(ids(allKomas(copied))).size, allKomas(copied).length, 'コマの ID が重ならない');
  assert.deepEqual(roundsOn(copied, MONDAY).map((r) => r.id), ['rd-1', 'rd-3'], 'コピー元の曜日 (と、おかしな曜日) は無視する');
  // ほかの曜日にコピーしたコマは、休みの日を持っていかない
  assert.deepEqual(copyRounds(skipRoundsOn(rounds, NEXT_MONDAY, 'rd-1'), MONDAY, [3]).at(-1).komas.map((k) => k.skips), [[], [], []]);
  const many = [weekly('rd-1', 1, Array.from({ length: 30 }, (_, i) => koma(`tt-${i + 1}`, '09:00', '09:10')))];
  assert.equal(copyRounds(many, MONDAY, [0, 2, 3, 4, 5, 6]), null, '30 × 7 = 210 コマは上限 (200) を超える');
});

test('保存データ: 正しい形のラウンドとコマだけ残す。コマのないラウンドは捨てる', () => {
  const good = weekly('rd-1', 1, [koma('tt-1', '09:00', '09:50', '数学')], '午前');
  assert.deepEqual(parseTimetable([good, { ...good, title: '同じ ID' }, { ...good, id: 'x' }, { ...good, id: 'rd-2', weekday: 9 }, { ...good, id: 'rd-3', komas: [] }, null]), [good]);
  assert.deepEqual(parseTimetable('x'), []);
  // 名前の空のコマ・ID の重なるコマ (ほかのラウンドと重なるものも)・時刻のおかしいコマは捨てる
  const bad = [koma('tt-1', '10:00', '10:50', '重なる'), koma('tt-2', '10:00', '10:50', ' '), koma('tt-3', '11:00', '10:00', 'x'), koma('tt-4', '11:00', '11:50', '残る')];
  assert.deepEqual(ids(parseTimetable([good, once('rd-2', MONDAY, bad)])[1].komas), ['tt-4']);
});

test('保存データ: 古い版の時間割 (曜日ごとのコマの一覧) は、曜日ごとに 1 つの毎週のラウンドにまとめる。コマの ID と休みの日は残す', () => {
  const old = [
    { id: 'tt-1', weekday: 1, title: '数学', start: '09:00', end: '09:50', skips: [MONDAY] },
    { id: 'tt-3', weekday: 2, title: '火曜', start: '09:00', end: '09:50' }, // 休みの日のない、もっと古い版
    { id: 'tt-2', weekday: 1, title: '英語', start: '10:00', end: '10:50', skips: [] },
  ];
  assert.deepEqual(parseTimetable(old), [
    weekly('rd-1', 1, [koma('tt-1', '09:00', '09:50', '数学', [MONDAY]), koma('tt-2', '10:00', '10:50', '英語')], ''),
    weekly('rd-2', 2, [koma('tt-3', '09:00', '09:50', '火曜')], ''),
  ]);
});

test('その日の予定: その日のラウンドのコマと、その日のカレンダーの予定を合わせて始まる順', () => {
  const events = [{ id: 'ev-1', title: '面談', date: MONDAY, start: '09:55', end: '10:00', preset: 'long' }, { id: 'ev-2', title: '別の日', date: '2026-10-06', start: '09:00', end: '10:00', preset: null }];
  const plan = dayPlan(rounds, events, MONDAY);
  assert.deepEqual(plan.map((p) => [p.title, p.source, p.preset]), [['数学', 'koma', null], ['面談', 'event', 'long'], ['英語', 'koma', null], ['理科', 'koma', null]]);
  assert.equal(plan[0].roundId, 'rd-1');
  assert.equal(plan[1].roundId, null);
  assert.equal(plan[0].startAt, at(9));
  assert.equal(plan[0].endAt, at(9, 50));
  assert.deepEqual(dayPlan(rounds, [], 'bad'), []);
});

// カレンダーの予定 (くり返す予定を含む)
const ev = (id, date, start, end, extra = {}) => ({ id, title: id, date, start, end, preset: null, repeat: 'none', until: null, skips: [], ...extra });
const atDay = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();

test('開始・終了の知らせ: コマとカレンダーの予定を、前回確かめた時刻より後〜今までのものから、時刻の順に', () => {
  const events = [ev('ev-1', MONDAY, '09:50', '10:00')];
  assert.deepEqual(planTriggers(rounds, events, at(8, 59), at(9)).map((x) => [x.item.id, x.kind]), [['tt-1', 'start']]);
  assert.deepEqual(planTriggers(rounds, events, at(9), at(9)), [], '同じ時刻を 2 回は知らせない');
  // 同じ時刻に終わりと始まりがあるときは、終わりを先に
  assert.deepEqual(planTriggers(rounds, events, at(9, 49), at(9, 50)).map((x) => [x.item.id, x.kind]), [['tt-1', 'end'], ['ev-1', 'start']]);
  assert.deepEqual(planTriggers(rounds, [], at(10, 49), at(10, 50)).map((x) => [x.item.id, x.kind]), [['tt-2', 'end'], ['tt-3', 'start']]);
});

test('開始・終了の知らせ: 気づくのが 5 分より遅れたもの (スリープ明けなど) は出さない', () => {
  assert.equal(planTriggers(rounds, [], at(8), at(9, 5)).length, 1, 'ちょうど 5 分遅れは出す');
  assert.deepEqual(planTriggers(rounds, [], at(8), at(9, 6)), []);
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
  assert.deepEqual(currentOrNextItem(rounds, events, at(9, 30)), { item: dayPlan(rounds, events, MONDAY)[0], ongoing: true });
  assert.equal(currentOrNextItem(rounds, events, at(9, 50)).item.id, 'tt-2', '終わった瞬間は次の予定');
  assert.equal(currentOrNextItem(rounds, events, at(9, 50)).ongoing, false);
  assert.equal(currentOrNextItem(rounds, events, at(11, 45)).item.id, 'ev-1');
  assert.equal(currentOrNextItem(rounds, events, at(14)), null, '明日の予定は出さない');
});

test('まとめて作る: 開始・1 コマの長さ・休み・コマ数から、新しいラウンドを 1 つ作る (ほかのラウンドはそのまま)', () => {
  const result = generateRound({ title: '月曜', weekday: 1, start: '08:50', period: 50, breakMinutes: 10, count: 6 }, rounds, (n) => `${n}限`);
  assert.equal(result.round.id, 'rd-3');
  assert.equal(result.round.title, '月曜');
  assert.equal(result.round.weekday, 1);
  assert.deepEqual(result.round.komas.map((k) => [k.id, k.title, k.start, k.end]), [
    ['tt-5', '1限', '08:50', '09:40'], ['tt-6', '2限', '09:50', '10:40'], ['tt-7', '3限', '10:50', '11:40'],
    ['tt-8', '4限', '11:50', '12:40'], ['tt-9', '5限', '12:50', '13:40'], ['tt-10', '6限', '13:50', '14:40'],
  ]);
  assert.deepEqual(ids(result.rounds), ['rd-1', 'rd-2', 'rd-3']);
  const day = generateRound({ title: '', date: MONDAY, ...GENERATE_DEFAULTS }, [], (n) => `${n}限`);
  assert.deepEqual([day.round.date, day.round.weekday, day.round.komas.length], [MONDAY, null, 7]);
});

test('まとめて作る: 日をまたぐ分は作らない。範囲の外や、1 コマも入らないとき・日付がおかしいときはエラー', () => {
  const late = generateRound({ weekday: 0, start: '22:00', period: 50, breakMinutes: 10, count: 5 }, [], String);
  assert.deepEqual(late.round.komas.map((k) => [k.start, k.end]), [['22:00', '22:50'], ['23:00', '23:50']]);
  assert.deepEqual(generateRound({ weekday: 0, start: '23:30', period: 50, breakMinutes: 0, count: 1 }, [], String), { error: 'noRoom' });
  assert.deepEqual(generateRound({ weekday: 0, start: '9:00', period: 50, breakMinutes: 0, count: 1 }, [], String), { error: 'invalidTime' });
  assert.deepEqual(GENERATE_RANGES, { period: [5, 180], break: [0, 60], longBreak: [0, 180], longBreakAfter: [1, 11], count: [1, 12] });
  assert.deepEqual(generateRound({ weekday: 0, start: '09:00', period: 4, breakMinutes: 0, count: 1 }, [], String), { error: 'outOfRange' });
  assert.deepEqual(generateRound({ weekday: 0, start: '09:00', period: 50, breakMinutes: 0, count: 13 }, [], String), { error: 'outOfRange' });
  assert.deepEqual(generateRound({ date: '2026-02-30', ...GENERATE_DEFAULTS }, [], String), { error: 'invalidDate' });
  const full = [weekly('rd-1', 1, Array.from({ length: 199 }, (_, i) => koma(`tt-${i + 1}`, '09:00', '09:10')))];
  assert.deepEqual(generateRound({ weekday: 2, ...GENERATE_DEFAULTS }, full, String), { error: 'full' });
});

test('まとめて作る: 長い休み (昼休み) は、指定したコマ目のあとの休みだけを長くする', () => {
  const result = generateRound({ weekday: 1, ...GENERATE_DEFAULTS }, [], (n) => `${n}限`);
  assert.deepEqual(result.round.komas.map((k) => [k.title, k.start, k.end]), [
    ['1限', '08:30', '09:15'], ['2限', '09:25', '10:10'], ['3限', '10:20', '11:05'], ['4限', '11:15', '12:00'],
    ['5限', '13:00', '13:45'], ['6限', '13:55', '14:40'], ['7限', '14:50', '15:35'],
  ]);
});

test('まとめて作る: 初めの値は 8:30・45 分・休み 10 分・長い休み 60 分 (4 コマ目のあと)・7 コマ', () => {
  assert.deepEqual(GENERATE_DEFAULTS, { start: '08:30', period: 45, breakMinutes: 10, longBreakMinutes: 60, longBreakAfter: 4, count: 7 });
});

test('まとめて作る: 長い休みが 0 分、またはコマ数より後の位置なら、普通の休みのまま', () => {
  const base = { weekday: 1, start: '09:00', period: 50, breakMinutes: 10, count: 3 };
  const starts = (input) => generateRound(input, [], String).round.komas.map((k) => k.start);
  const plain = starts(base);
  assert.deepEqual(plain, ['09:00', '10:00', '11:00']);
  assert.deepEqual(starts({ ...base, longBreakMinutes: 0, longBreakAfter: 1 }), plain);
  assert.deepEqual(starts({ ...base, longBreakMinutes: 60, longBreakAfter: 3 }), plain, '最後のコマのあとは休みがない');
  assert.deepEqual(starts({ ...base, longBreakMinutes: 60, longBreakAfter: 1 }), ['09:00', '10:50', '11:50']);
  assert.deepEqual(generateRound({ ...base, longBreakMinutes: 200, longBreakAfter: 1 }, [], String), { error: 'outOfRange' });
});

test('まとめて作る: 最後に使った値を読み戻す。おかしな値・まだないときは、その項目だけ初めの値', () => {
  assert.deepEqual(parseGenerateOptions(undefined), GENERATE_DEFAULTS);
  const last = { start: '09:00', period: 50, breakMinutes: 5, longBreakMinutes: 40, longBreakAfter: 3, count: 6 };
  assert.deepEqual(parseGenerateOptions(last), last);
  assert.deepEqual(parseGenerateOptions({ ...last, start: '9:00', period: 999, count: '6' }), { ...last, start: '08:30', period: 45, count: 6 });
});

test('予定の前の知らせ: 始まる N 分前になった予定。0 分 (しない) なら何も出さない', () => {
  assert.deepEqual(REMINDER_MINUTES, [0, 1, 3, 5, 10]);
  const plan = dayPlan(rounds, [], MONDAY);
  assert.deepEqual(scheduleReminders(plan, at(8, 56, 59), at(8, 57), 3).map((p) => p.title), ['数学']);
  assert.deepEqual(scheduleReminders(plan, at(8, 57), at(8, 57), 3), [], '同じ時刻を 2 回は知らせない');
  assert.deepEqual(scheduleReminders(plan, at(8, 56, 59), at(8, 57), 0), []);
  assert.deepEqual(scheduleReminders(plan, at(8, 0), at(9, 3), 3), [], '5 分より遅れて気づいたものは出さない');
});

// スマホ版は、画面を消している間も知らせが届くように、先の知らせを OS に預けておく
test('先の知らせ: from より後〜to までの、始まり・終わり・N 分前の知らせを、時刻の順に', () => {
  const events = [ev('ev-1', MONDAY, '09:50', '10:00')];
  const list = upcomingNotices(rounds, events, at(8, 56), at(10, 0), 3);
  // 同じ時刻なら、終わり → 始まりの順 (planTriggers と同じ)
  assert.deepEqual(list.map((x) => [x.item.id, x.kind, x.at]), [
    ['tt-1', 'reminder', at(8, 57)],
    ['tt-1', 'start', at(9)],
    ['ev-1', 'reminder', at(9, 47)],
    ['tt-1', 'end', at(9, 50)],
    ['ev-1', 'start', at(9, 50)],
    ['tt-2', 'reminder', at(9, 57)],
    ['ev-1', 'end', at(10)],
    ['tt-2', 'start', at(10)],
  ]);
});

test('先の知らせ: 前の知らせを出さない設定 (0 分) なら、始まりと終わりだけ。from ちょうどのものは入れない', () => {
  const list = upcomingNotices(rounds, [], at(9), at(10, 0), 0);
  assert.deepEqual(list.map((x) => [x.item.id, x.kind]), [['tt-1', 'end'], ['tt-2', 'start']]);
});

test('先の知らせ: 日付をまたいでも、それぞれの日の回を入れる', () => {
  const daily = ev('ev-3', '2026-10-01', '00:10', '00:20', { repeat: 'daily' });
  const list = upcomingNotices([], [daily], atDay(20, 23), atDay(21, 23), 0);
  assert.deepEqual(list.map((x) => [x.item.date, x.kind]), [['2026-10-21', 'start'], ['2026-10-21', 'end']]);
});
