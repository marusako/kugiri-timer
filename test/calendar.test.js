import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_EVENTS, MAX_TITLE_LENGTH, MAX_TRIGGER_DELAY_MS,
  toDateKey, parseDateKey, eventTime, monthDays, eventsOn, datesWithEvents, currentOrNextEvent, dueTriggers,
  makeEvent, nextEventId, addEvent, replaceEvent, removeEvent, parseEvents,
} from '../src/calendar.js';

// テストの時刻は、すべてローカル時刻で作る (パソコンの地域に関係なく通るように)
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const ev = (id, date, start, end, title = id) => ({ id, title, date, start, end, preset: null });

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
  assert.deepEqual([...datesWithEvents(events)].sort(), ['2026-10-06', '2026-10-07']);
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
  assert.deepEqual(makeEvent(base, 'ev-1', '予定'), { event: { id: 'ev-1', title: '数学', date: '2026-10-06', start: '14:00', end: '16:00', preset: 'standard' } });
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
