import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_EVENTS, MAX_TITLE_LENGTH, MAX_TRIGGER_DELAY_MS,
  toDateKey, parseDateKey, eventTime, monthDays, eventsOn, datesWithEvents, currentOrNextEvent, dueTriggers,
  makeEvent, nextEventId, addEvent, replaceEvent, removeEvent, parseEvents,
  MAX_SKIPS, occursOn, skipEventOn, isOneOffOn, clearDate, weekDates, copyDateEvents,
} from '../src/calendar.js';

// テストの時刻は、すべてローカル時刻で作る (パソコンの地域に関係なく通るように)
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const ev = (id, date, start, end, title = id) => ({ id, title, date, start, end, preset: null, repeat: 'none', until: null, skips: [] });
const rep = (id, date, repeat, extra = {}) => ({ ...ev(id, date, '09:00', '10:00'), repeat, ...extra });

test('日付の文字列: Date との相互変換。存在しない日は null', () => {
  assert.equal(toDateKey(new Date(2026, 9, 6, 23, 59)), '2026-10-06');
  assert.equal(toDateKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(parseDateKey('2026-10-06').getTime(), at(2026, 10, 6));
  assert.equal(parseDateKey('2026-02-30'), null);
  assert.equal(parseDateKey('2026/10/06'), null);
  assert.equal(parseDateKey(undefined), null);
});

test('予定の開始・終了の時刻', () => {
  const e = ev('ev-1', '2026-10-06', '14:00', '16:30');
  assert.equal(eventTime(e, 'start'), at(2026, 10, 6, 14, 0));
  assert.equal(eventTime(e, 'end'), at(2026, 10, 6, 16, 30));
});

test('月のカレンダー: 42 マスで日曜始まり。前後の月の日は inMonth: false', () => {
  const days = monthDays(2026, 9); // 2026 年 10 月 (1 日は木曜)
  assert.equal(days.length, 42);
  assert.deepEqual(days[0], { key: '2026-09-27', day: 27, inMonth: false });
  assert.deepEqual(days[4], { key: '2026-10-01', day: 1, inMonth: true });
  assert.equal(days.filter((d) => d.inMonth).length, 31);
  assert.equal(new Date(2026, 8, 27).getDay(), 0, '最初のマスは日曜');
  // 1 日が日曜の月は、最初のマスが 1 日
  assert.equal(monthDays(2026, 1)[0].key, '2026-02-01');
});

test('その日の予定は始まる順。予定のある日の一覧', () => {
  const events = [ev('ev-1', '2026-10-06', '14:00', '15:00'), ev('ev-2', '2026-10-06', '09:00', '10:00'), ev('ev-3', '2026-10-07', '09:00', '10:00')];
  assert.deepEqual(eventsOn(events, '2026-10-06').map((e) => e.id), ['ev-2', 'ev-1']);
  assert.deepEqual([...datesWithEvents(events, ['2026-10-05', '2026-10-06', '2026-10-07'])], ['2026-10-06', '2026-10-07']);
});

test('メイン画面の予定: 今やっている予定、なければ今日このあとの予定、なければ null', () => {
  const events = [ev('ev-1', '2026-10-06', '09:00', '10:00'), ev('ev-2', '2026-10-06', '14:00', '16:00'), ev('ev-3', '2026-10-07', '09:00', '10:00')];
  assert.deepEqual(currentOrNextEvent(events, at(2026, 10, 6, 9, 30)), { event: events[0], ongoing: true });
  assert.deepEqual(currentOrNextEvent(events, at(2026, 10, 6, 10, 0)), { event: events[1], ongoing: false }, '終わった瞬間は次の予定');
  assert.deepEqual(currentOrNextEvent(events, at(2026, 10, 6, 15, 0)), { event: events[1], ongoing: true });
  assert.equal(currentOrNextEvent(events, at(2026, 10, 6, 17, 0)), null, '明日の予定は出さない');
});

test('開始・終了の知らせ: 前回確かめた時刻より後〜今までに来たものを、時刻の順に', () => {
  const events = [ev('ev-1', '2026-10-06', '14:00', '14:30'), ev('ev-2', '2026-10-06', '14:30', '15:00')];
  assert.deepEqual(dueTriggers(events, at(2026, 10, 6, 13, 59), at(2026, 10, 6, 14, 0)).map((x) => [x.event.id, x.kind]), [['ev-1', 'start']]);
  assert.deepEqual(dueTriggers(events, at(2026, 10, 6, 14, 0), at(2026, 10, 6, 14, 0)), [], '同じ時刻を 2 回は知らせない');
  assert.deepEqual(
    dueTriggers(events, at(2026, 10, 6, 14, 29), at(2026, 10, 6, 14, 30)).map((x) => [x.event.id, x.kind]),
    [['ev-1', 'end'], ['ev-2', 'start']],
  );
});

test('開始・終了の知らせ: 気づくのが 5 分より遅れたもの (スリープ明けなど) は出さない', () => {
  const events = [ev('ev-1', '2026-10-06', '14:00', '18:00')];
  assert.equal(MAX_TRIGGER_DELAY_MS, 5 * 60 * 1000);
  assert.deepEqual(dueTriggers(events, at(2026, 10, 6, 13, 0), at(2026, 10, 6, 14, 5)).length, 1, 'ちょうど 5 分遅れは出す');
  assert.deepEqual(dueTriggers(events, at(2026, 10, 6, 13, 0), at(2026, 10, 6, 14, 6)), []);
});

test('予定を作る: 終わりは始まりより後。日付・時刻の形を確かめ、名前が空なら仮の名前', () => {
  const base = { title: '  数学 ', date: '2026-10-06', start: '14:00', end: '16:00', preset: 'standard' };
  assert.deepEqual(makeEvent(base, 'ev-1', '予定'), {
    event: { id: 'ev-1', title: '数学', date: '2026-10-06', start: '14:00', end: '16:00', preset: 'standard', repeat: 'none', until: null, skips: [] },
  });
  assert.equal(makeEvent({ ...base, title: '' }, 'ev-1', '予定').event.title, '予定');
  assert.equal(makeEvent({ ...base, preset: '' }, 'ev-1', '予定').event.preset, null, '「今の設定のまま」');
  assert.deepEqual(makeEvent({ ...base, end: '14:00' }, 'ev-1', ''), { error: 'endBeforeStart' });
  assert.deepEqual(makeEvent({ ...base, end: '13:00' }, 'ev-1', ''), { error: 'endBeforeStart' });
  assert.deepEqual(makeEvent({ ...base, start: '24:00' }, 'ev-1', ''), { error: 'invalidTime' });
  assert.deepEqual(makeEvent({ ...base, date: '2026-13-01' }, 'ev-1', ''), { error: 'invalidDate' });
  assert.equal(makeEvent({ ...base, title: 'あ'.repeat(60) }, 'ev-1', '').event.title.length, MAX_TITLE_LENGTH);
});

test('追加・置き換え・削除。ID は使い回さない。上限は 500 件', () => {
  let events = addEvent([], ev('ev-1', '2026-10-06', '09:00', '10:00'));
  events = addEvent(events, ev(nextEventId(events), '2026-10-06', '11:00', '12:00'));
  assert.deepEqual(events.map((e) => e.id), ['ev-1', 'ev-2']);
  assert.equal(nextEventId(removeEvent(events, 'ev-2')), 'ev-2');
  assert.equal(nextEventId(removeEvent(events, 'ev-1')), 'ev-3');
  assert.equal(replaceEvent(events, { ...events[0], title: '英語' })[0].title, '英語');
  assert.equal(MAX_EVENTS, 500);
  const full = Array.from({ length: MAX_EVENTS }, (_, i) => ev(`ev-${i + 1}`, '2026-10-06', '09:00', '10:00'));
  assert.equal(addEvent(full, ev('ev-999', '2026-10-06', '09:00', '10:00')), full);
});

test('保存データの予定: 正しい形のものだけ残す', () => {
  const good = ev('ev-1', '2026-10-06', '09:00', '10:00', '数学');
  assert.deepEqual(parseEvents([
    good,
    { ...good, title: '同じ ID' },
    { ...good, id: 'bad' },
    { ...good, id: 'ev-2', end: '08:00' },
    { ...good, id: 'ev-3', title: '   ' },
    { ...good, id: 'ev-4', date: '2026-02-30' },
    null,
  ]), [good]);
  assert.deepEqual(parseEvents('x'), []);
});

test('保存データ: くり返しのない古い版の予定は、くり返さない予定として読む', () => {
  const old = { id: 'ev-1', title: '数学', date: '2026-10-06', start: '09:00', end: '10:00', preset: null };
  assert.deepEqual(parseEvents([old]), [{ ...old, repeat: 'none', until: null, skips: [] }]);
  assert.deepEqual(parseEvents([rep('ev-2', '2026-10-06', 'monthly', { until: '2026-01-01' })]), [], '終わりの日が始まりより前のものは捨てる');
});

test('くり返す予定: 毎日・平日・毎月が、始まりの日から終わりの日まで。休みにした日は出ない', () => {
  const daily = rep('ev-1', '2026-10-06', 'daily', { until: '2026-10-10', skips: ['2026-10-08'] });
  assert.deepEqual(
    ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-10', '2026-10-11'].map((k) => occursOn(daily, k)),
    [false, true, true, false, true, false],
  );
  // 2026-10-09 は金曜、10 日は土曜、11 日は日曜、12 日は月曜
  const weekdays = rep('ev-2', '2026-10-01', 'weekdays');
  assert.deepEqual(['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2030-01-07'].map((k) => occursOn(weekdays, k)), [true, false, false, true, true], '終わりの日がなければずっと');
  const monthly = rep('ev-3', '2026-01-31', 'monthly');
  assert.deepEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'].map((k) => occursOn(monthly, k)), [true, false, true, false, true], '31 日がない月は飛ばす');
  assert.equal(occursOn(ev('ev-4', '2026-10-06', '09:00', '10:00'), '2026-10-07'), false);
});

test('くり返す予定: その日の予定・印・メイン画面・知らせは、その日の回 (date がその日) で扱う', () => {
  const events = [rep('ev-1', '2026-10-01', 'daily'), ev('ev-2', '2026-10-06', '08:00', '08:30')];
  assert.deepEqual(eventsOn(events, '2026-10-06').map((e) => [e.id, e.date]), [['ev-2', '2026-10-06'], ['ev-1', '2026-10-06']]);
  assert.equal(events[0].date, '2026-10-01', '元の予定は変えない');
  assert.deepEqual([...datesWithEvents(events, ['2026-09-30', '2026-10-01', '2026-10-20'])], ['2026-10-01', '2026-10-20']);
  assert.deepEqual(currentOrNextEvent(events, at(2026, 10, 20, 9, 30)), { event: { ...events[0], date: '2026-10-20' }, ongoing: true });
  assert.deepEqual(
    dueTriggers(events, at(2026, 10, 20, 8, 59), at(2026, 10, 20, 9, 0)).map((x) => [x.event.id, x.event.date, x.kind]),
    [['ev-1', '2026-10-20', 'start']],
  );
  assert.deepEqual(dueTriggers(events, at(2026, 10, 20, 9, 0), at(2026, 10, 20, 9, 0)), []);
  // 日付をまたいで確かめても、それぞれの日の回を 1 回ずつ出す
  const night = [{ ...rep('ev-3', '2026-10-01', 'daily'), start: '23:58', end: '23:59' }, { ...rep('ev-4', '2026-10-01', 'daily'), start: '00:00', end: '00:01' }];
  assert.deepEqual(
    dueTriggers(night, at(2026, 10, 20, 23, 57), at(2026, 10, 21, 0, 0)).map((x) => [x.event.id, x.event.date, x.kind]),
    [['ev-3', '2026-10-20', 'start'], ['ev-3', '2026-10-20', 'end'], ['ev-4', '2026-10-21', 'start']],
  );
});

test('くり返す予定を作る: 終わりの日は始まりの日より前にできない。休みの日は範囲の中だけ残す', () => {
  const base = { title: '朝勉', date: '2026-10-06', start: '07:00', end: '08:00', repeat: 'daily' };
  assert.deepEqual(makeEvent({ ...base, until: '2026-10-05' }, 'ev-1', ''), { error: 'untilBeforeDate' });
  assert.deepEqual(makeEvent({ ...base, until: '2026-02-30' }, 'ev-1', ''), { error: 'invalidDate' });
  const made = makeEvent({ ...base, until: '2026-10-31', skips: ['2026-10-10', '2026-10-01', '2026-11-01', 'x', '2026-10-10'] }, 'ev-1', '').event;
  assert.deepEqual([made.repeat, made.until, made.skips], ['daily', '2026-10-31', ['2026-10-10']]);
  assert.equal(makeEvent({ ...base, until: '' }, 'ev-1', '').event.until, null, '空なら終わりなし');
  const once = makeEvent({ ...base, repeat: 'none', until: '2026-10-31', skips: ['2026-10-10'] }, 'ev-1', '').event;
  assert.deepEqual([once.repeat, once.until, once.skips], ['none', null, []], 'くり返さない予定は終わりの日と休みを持たない');
  assert.equal(makeEvent({ ...base, repeat: 'yearly' }, 'ev-1', '').event.repeat, 'none');
  const many = Array.from({ length: MAX_SKIPS + 5 }, (_, i) => toDateKey(new Date(2026, 9, 7 + i)));
  assert.equal(makeEvent({ ...base, skips: many }, 'ev-1', '').event.skips.length, MAX_SKIPS);
});

test('この日だけ休む: くり返す予定だけ。同じ日を 2 回足さない', () => {
  const events = [rep('ev-1', '2026-10-01', 'daily'), ev('ev-2', '2026-10-06', '08:00', '08:30')];
  const skipped = skipEventOn(events, 'ev-1', '2026-10-06');
  assert.deepEqual(skipped[0].skips, ['2026-10-06']);
  assert.deepEqual(skipEventOn(skipped, 'ev-1', '2026-10-06')[0].skips, ['2026-10-06']);
  assert.equal(skipEventOn(events, 'ev-2', '2026-10-06')[1], events[1], 'くり返さない予定はそのまま');
  assert.deepEqual(eventsOn(skipped, '2026-10-06').map((e) => e.id), ['ev-2']);
  assert.deepEqual(eventsOn(skipped, '2026-10-07').map((e) => e.id), ['ev-1']);
});

test('その日をすべて消す: その日だけの予定は消し、くり返す予定はその日だけ休み。ほかの日はそのまま', () => {
  const events = [rep('ev-1', '2026-10-01', 'daily'), ev('ev-2', '2026-10-06', '08:00', '08:30'), ev('ev-3', '2026-10-07', '08:00', '08:30')];
  const cleared = clearDate(events, '2026-10-06');
  assert.deepEqual(eventsOn(cleared, '2026-10-06'), []);
  assert.deepEqual(eventsOn(cleared, '2026-10-07').map((e) => e.id), ['ev-3', 'ev-1']);
  assert.equal(isOneOffOn(events[1], '2026-10-06'), true);
  assert.equal(isOneOffOn(events[0], '2026-10-01'), false, 'くり返す予定は、その日だけの予定ではない');
});

test('同じ週 (月曜始まり) の日付', () => {
  // 2026-10-07 は水曜。週は 10/5 (月) 〜 10/11 (日)
  assert.deepEqual(weekDates('2026-10-07'), { 1: '2026-10-05', 2: '2026-10-06', 3: '2026-10-07', 4: '2026-10-08', 5: '2026-10-09', 6: '2026-10-10', 0: '2026-10-11' });
  assert.equal(weekDates('2026-10-11')[1], '2026-10-05', '日曜は、その前の月曜からの週');
  assert.equal(weekDates('2026-11-01')[6], '2026-10-31', '月をまたぐ');
});

test('その日だけの予定をほかの日にコピー: コピー先のその日だけの予定は置き換え、くり返す予定はコピーしない', () => {
  const events = [
    ev('ev-1', '2026-10-06', '09:00', '10:00', '数学'), ev('ev-2', '2026-10-06', '10:00', '11:00', '英語'),
    ev('ev-3', '2026-10-08', '13:00', '14:00'), rep('ev-4', '2026-10-01', 'daily'),
  ];
  const copied = copyDateEvents(events, '2026-10-06', ['2026-10-07', '2026-10-08', '2026-10-06']);
  const oneOff = (key) => copied.filter((e) => isOneOffOn(e, key)).map((e) => [e.id, e.title, e.start]);
  assert.deepEqual(oneOff('2026-10-07'), [['ev-5', '数学', '09:00'], ['ev-6', '英語', '10:00']]);
  assert.deepEqual(oneOff('2026-10-08'), [['ev-7', '数学', '09:00'], ['ev-8', '英語', '10:00']], 'コピー先にあった予定は置き換える');
  assert.equal(copied.filter((e) => e.repeat !== 'none').length, 1, 'くり返す予定は増えない');
  assert.equal(copied.filter((e) => e.date === '2026-10-06').length, 2, 'コピー元はそのまま');
  const full = Array.from({ length: MAX_EVENTS - 1 }, (_, i) => ev(`ev-${i + 1}`, '2026-10-06', '09:00', '10:00'));
  assert.equal(copyDateEvents(full, '2026-10-06', ['2026-10-07']), null, '上限を超えるときは何も変えない');
});
