import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FEEDS, MAX_FEED_NAME_LENGTH, expandFeed, makeFeed, occurrenceId } from '../src/ical-feed.js';
import { toDateKey } from '../src/calendar.js';

// テストは PC のタイムゾーンに関係なく通るように、期待値もローカル時刻に直して比べる
const pad = (n) => String(n).padStart(2, '0');
const local = (ms) => {
  const d = new Date(ms);
  return { date: toDateKey(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};
const ics = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...events.flat(), 'END:VCALENDAR'].join('\r\n');
const vevent = (lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];
// 取り込む範囲: 2026-10-01 〜 2026-11-01 (ローカル時刻)
const range = { from: new Date(2026, 9, 1).getTime(), to: new Date(2026, 10, 1).getTime() };

test('1 回だけの予定 (UTC の時刻): ローカル時刻の日付・開始・終了にする', () => {
  const text = ics(vevent(['UID:a@test', 'SUMMARY:数学', 'DTSTART:20261012T050000Z', 'DTEND:20261012T060000Z']));
  const { events, error } = expandFeed(text, range);
  assert.equal(error, undefined);
  const start = local(Date.UTC(2026, 9, 12, 5));
  const end = local(Date.UTC(2026, 9, 12, 6));
  assert.deepEqual(events, [{ uid: 'a@test', title: '数学', date: start.date, start: start.time, end: end.time, allDay: false }]);
});

test('タイムゾーン付き (TZID) の時刻も、ローカル時刻に直す', () => {
  const tokyo = ['BEGIN:VTIMEZONE', 'TZID:Asia/Tokyo', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900', 'TZNAME:JST', 'END:STANDARD', 'END:VTIMEZONE'];
  const text = ics(tokyo, vevent(['UID:b@test', 'SUMMARY:英語', 'DTSTART;TZID=Asia/Tokyo:20261012T140000', 'DTEND;TZID=Asia/Tokyo:20261012T153000']));
  const [event] = expandFeed(text, range).events;
  const start = local(Date.UTC(2026, 9, 12, 5)); // 東京の 14:00 は UTC の 05:00
  const end = local(Date.UTC(2026, 9, 12, 6, 30));
  assert.deepEqual([event.date, event.start, event.end], [start.date, start.time, end.time]);
});

test('くり返す予定 (RRULE): 範囲の中の回だけ。休みの日 (EXDATE) は除き、1 回だけ変えた回 (RECURRENCE-ID) はその内容にする', () => {
  // ローカル時刻 (タイムゾーンなし) の毎週月曜 9:00〜9:50。2026-10-05 は月曜日
  const text = ics(
    vevent(['UID:c@test', 'SUMMARY:国語', 'DTSTART:20260928T090000', 'DTEND:20260928T095000', 'RRULE:FREQ=WEEKLY;COUNT=6', 'EXDATE:20261012T090000']),
    vevent(['UID:c@test', 'SUMMARY:国語 (教室変更)', 'RECURRENCE-ID:20261019T090000', 'DTSTART:20261019T100000', 'DTEND:20261019T105000']),
  );
  const events = expandFeed(text, range).events;
  assert.deepEqual(events.map((e) => [e.date, e.start, e.end, e.title]), [
    ['2026-10-05', '09:00', '09:50', '国語'],
    ['2026-10-19', '10:00', '10:50', '国語 (教室変更)'],
    ['2026-10-26', '09:00', '09:50', '国語'],
  ], '9/28 は範囲の前、10/12 は休み、11/2 は範囲の後');
});

test('終日の予定は allDay にして、時刻を持たない。何日かにわたるときは、その日ごとに出す', () => {
  const text = ics(vevent(['UID:d@test', 'SUMMARY:文化祭', 'DTSTART;VALUE=DATE:20261017', 'DTEND;VALUE=DATE:20261019']));
  assert.deepEqual(expandFeed(text, range).events, [
    { uid: 'd@test', title: '文化祭', date: '2026-10-17', start: null, end: null, allDay: true },
    { uid: 'd@test', title: '文化祭', date: '2026-10-18', start: null, end: null, allDay: true },
  ]);
});

test('日付をまたぐ予定は、始まった日の 23:59 まで。終わりのない予定は始まりと同じ時刻なので出さない', () => {
  const text = ics(
    vevent(['UID:e@test', 'SUMMARY:夜の勉強', 'DTSTART:20261012T230000', 'DTEND:20261013T010000']),
    vevent(['UID:f@test', 'SUMMARY:締め切り', 'DTSTART:20261012T170000']),
  );
  assert.deepEqual(expandFeed(text, range).events.map((e) => [e.title, e.date, e.start, e.end]), [['夜の勉強', '2026-10-12', '23:00', '23:59']]);
});

test('取り消された予定 (STATUS:CANCELLED) は出さない。名前がなければ空の名前のまま返す (画面で仮の名前を付ける)', () => {
  const text = ics(
    vevent(['UID:g@test', 'SUMMARY:中止', 'STATUS:CANCELLED', 'DTSTART:20261012T090000', 'DTEND:20261012T100000']),
    vevent(['UID:h@test', 'DTSTART:20261013T090000', 'DTEND:20261013T100000']),
  );
  assert.deepEqual(expandFeed(text, range).events.map((e) => [e.uid, e.title]), [['h@test', '']]);
});

test('.ics でないもの・壊れたものは error を返す', () => {
  assert.deepEqual(expandFeed('<html>not found</html>', range), { events: [], error: 'invalid' });
  assert.deepEqual(expandFeed('', range), { events: [], error: 'invalid' });
  assert.equal(expandFeed(ics(), range).error, undefined, '予定が 1 つもないカレンダーは正しい');
});

test('予定の ID: カレンダー・UID・その回の日時が同じなら同じ ID (読み直しても集中の記録が続く)。ev-・tt- とは重ならない', () => {
  const id = occurrenceId('feed-1', 'c@test', '2026-10-05', '09:00');
  assert.match(id, /^ex-[0-9a-z]+$/);
  assert.equal(occurrenceId('feed-1', 'c@test', '2026-10-05', '09:00'), id);
  assert.notEqual(occurrenceId('feed-1', 'c@test', '2026-10-12', '09:00'), id);
  assert.notEqual(occurrenceId('feed-2', 'c@test', '2026-10-05', '09:00'), id);
});

test('カレンダーの登録: https の URL だけ。名前は 20 文字まで、空なら仮の名前。5 つまで', () => {
  assert.equal(MAX_FEEDS, 5);
  assert.equal(MAX_FEED_NAME_LENGTH, 20);
  assert.deepEqual(makeFeed({ name: ' 学校 ', url: ' https://calendar.google.com/calendar/ical/x/private-y/basic.ics ' }, [], '仮'), {
    feed: { name: '学校', url: 'https://calendar.google.com/calendar/ical/x/private-y/basic.ics' },
  });
  assert.equal(makeFeed({ name: '', url: 'https://example.com/a.ics' }, [], '仮').feed.name, '仮');
  assert.equal(makeFeed({ name: 'あ'.repeat(30), url: 'https://example.com/a.ics' }, [], '').feed.name.length, 20);
  assert.deepEqual(makeFeed({ name: 'x', url: 'http://example.com/a.ics' }, [], ''), { error: 'invalidUrl' }, 'http は暗号化されないので受け付けない');
  assert.deepEqual(makeFeed({ name: 'x', url: 'webcal://example.com/a.ics' }, [], ''), { feed: { name: 'x', url: 'https://example.com/a.ics' } }, 'webcal:// は https:// に直す');
  assert.deepEqual(makeFeed({ name: 'x', url: 'not a url' }, [], ''), { error: 'invalidUrl' });
  assert.deepEqual(makeFeed({ name: 'x', url: 'https://example.com/a.ics' }, Array(5).fill({}), ''), { error: 'tooMany' });
});
