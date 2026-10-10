// 外部カレンダー (iCal 形式の .ics) を、アプリの予定の形に直す (画面にも Electron にも依存しない関数)。
// メインプロセス (calendar-feeds.js) だけで使う。.ics の読み取りには ical.js (Mozilla。MPL-2.0) を使う
// - くり返す予定 (RRULE)・休みの日 (EXDATE)・1 回だけ変えた回 (RECURRENCE-ID)・タイムゾーン (VTIMEZONE) は ical.js が扱う
// - 予定の形: { uid, title, date: 'YYYY-MM-DD', start: 'HH:MM', end: 'HH:MM', allDay: false }。時刻はパソコンの地域の時刻
// - 終日の予定は、その日ごとに { date, start: null, end: null, allDay: true } にする
// - このアプリの予定は日をまたげないので、日付をまたぐ予定は始まった日の 23:59 までにする
import ICAL from 'ical.js';
import { toDateKey } from './calendar.js';

export const MAX_FEEDS = 5;
export const MAX_FEED_NAME_LENGTH = 20;
// 1 つのカレンダーから取り込む回の上限 (くり返しの終わりがない予定などで、大きくなりすぎないように)
export const MAX_OCCURRENCES = 3000;
// くり返しを数える回数の上限 (範囲より前の回もここに入る)
const MAX_ITERATIONS = 20000;

const pad = (n) => String(n).padStart(2, '0');
const timeOf = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const dateKeyOf = (time) => `${time.year}-${pad(time.month)}-${pad(time.day)}`; // 終日の日付 (タイムゾーンに関係なく、書かれた日のまま)

function cancelled(component) {
  return String(component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED';
}

// 1 つの回を、アプリの予定の形にする (範囲の外・時間のない回は空の配列)
function toItems({ item, startDate, endDate }, { from, to }) {
  const uid = String(item.uid ?? '');
  const title = String(item.summary ?? '').trim();
  if (startDate.isDate) {
    // 終日: 始まりの日から終わりの日の前の日まで (終わりがなければ 1 日)
    const days = [];
    const day = startDate.clone();
    const last = endDate && endDate.compare(startDate) > 0 ? endDate : null;
    for (let i = 0; i < 366; i++) {
      const at = new Date(day.year, day.month - 1, day.day).getTime();
      if (at >= from && at < to) days.push({ uid, title, date: dateKeyOf(day), start: null, end: null, allDay: true });
      day.adjust(1, 0, 0, 0);
      if (!last || day.compare(last) >= 0) break;
    }
    return days;
  }
  const start = startDate.toJSDate();
  if (start.getTime() < from || start.getTime() >= to) return [];
  const end = endDate ? endDate.toJSDate() : start;
  const date = toDateKey(start);
  // 日付をまたぐなら、始まった日の 23:59 まで
  const endTime = toDateKey(end) === date ? timeOf(end) : '23:59';
  const startTime = timeOf(start);
  if (endTime <= startTime) return [];
  return [{ uid, title, date, start: startTime, end: endTime, allDay: false }];
}

// .ics の文字から、from〜to (ミリ秒) に始まる回を取り出す。読めなければ { events: [], error: 'invalid' }
export function expandFeed(text, { from, to }) {
  let root;
  try {
    root = new ICAL.Component(ICAL.parse(String(text)));
  } catch {
    return { events: [], error: 'invalid' };
  }
  if (root.name !== 'vcalendar') return { events: [], error: 'invalid' };

  try {
    for (const zone of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(zone);

    // 1 回だけ変えた回 (RECURRENCE-ID) は、同じ UID のくり返す予定に結び付ける
    const masters = [];
    const exceptions = [];
    for (const component of root.getAllSubcomponents('vevent')) {
      const event = new ICAL.Event(component);
      if (!event.startDate) continue;
      (event.isRecurrenceException() ? exceptions : masters).push(event);
    }
    for (const exception of exceptions) {
      const master = masters.find((m) => m.uid === exception.uid && m.isRecurring());
      if (master) master.relateException(exception);
      else masters.push(exception); // 結び付け先がなければ、1 回だけの予定として扱う
    }

    const events = [];
    for (const master of masters) {
      if (!master.isRecurring()) {
        if (!cancelled(master.component)) events.push(...toItems({ item: master, startDate: master.startDate, endDate: master.endDate }, { from, to }));
      } else {
        const iterator = master.iterator();
        for (let i = 0, next = iterator.next(); next && i < MAX_ITERATIONS; i++, next = iterator.next()) {
          if (next.toJSDate().getTime() >= to) break;
          const details = master.getOccurrenceDetails(next);
          if (cancelled(details.item.component)) continue;
          events.push(...toItems(details, { from, to }));
        }
      }
      if (events.length >= MAX_OCCURRENCES) break;
    }
    events.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? '').localeCompare(b.start ?? '') || a.title.localeCompare(b.title));
    return { events: events.slice(0, MAX_OCCURRENCES) };
  } catch {
    return { events: [], error: 'invalid' };
  }
}

// 取り込んだ回の ID。カレンダー・UID・その回の日時が同じなら同じ ID になる (読み直しても、集中の記録が続くように)
export function occurrenceId(feedId, uid, date, start) {
  // FNV-1a (32 ビット) の 2 回分を、つないで 36 進数にする
  const text = `${feedId}\n${uid}\n${date}T${start ?? 'allday'}`;
  const hash = (seed) => {
    let h = seed;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
  };
  return `ex-${hash(0x811c9dc5)}${hash(0x050c5d1f)}`;
}

// カレンダーの登録の入力を確かめる。正しくなければ { error: 'invalidUrl' | 'tooMany' }
export function makeFeed({ name, url }, feeds, fallbackName) {
  if (feeds.length >= MAX_FEEDS) return { error: 'tooMany' };
  let text = String(url ?? '').trim();
  if (/^webcal:\/\//i.test(text)) text = `https://${text.slice('webcal://'.length)}`;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return { error: 'invalidUrl' };
  }
  if (parsed.protocol !== 'https:') return { error: 'invalidUrl' };
  const cleanName = Array.from(String(name ?? '').trim()).slice(0, MAX_FEED_NAME_LENGTH).join('') || fallbackName;
  return { feed: { name: cleanName, url: parsed.href } };
}
