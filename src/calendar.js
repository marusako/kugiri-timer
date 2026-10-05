// アプリ内カレンダーの決まりごと (画面にも Electron にも依存しない純粋な関数)。
// 予定の形: { id: 'ev-1', title: '数学', date: '2026-10-06', start: '14:00', end: '16:00', preset: 'standard' | null }
// - 日付と時刻は、パソコンの地域の時刻 (ローカル時刻) で扱う
// - 最初の版は 1 回だけの予定で、日をまたぐ予定は作れない (end は start より後)
// - preset はタイマーのプリセットの ID (presets.js)。null は「今の設定のまま」

export const MAX_EVENTS = 500;
export const MAX_TITLE_LENGTH = 40;
// 開始・終了の知らせが、この時間より遅れて気づいたものは出さない (スリープ明けに、昔の予定の通知がまとめて出ないように)
export const MAX_TRIGGER_DELAY_MS = 5 * 60 * 1000;

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const EVENT_ID = /^ev-(\d+)$/;

const pad = (n) => String(n).padStart(2, '0');

// Date → 'YYYY-MM-DD' (ローカル時刻の日付)
export function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// 'YYYY-MM-DD' → その日の 0:00 の Date。形がおかしい・存在しない日 (2月30日など) は null
export function parseDateKey(key) {
  const match = DATE_KEY.exec(String(key));
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

function minutesOf(time) {
  const match = TIME.exec(String(time));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

// 予定の開始・終了の時刻 (ミリ秒)。which は 'start' か 'end'
export function eventTime(event, which) {
  const day = parseDateKey(event.date);
  const [h, m] = event[which].split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).getTime();
}

// 月のカレンダーのマス (6 週 × 7 日 = 42 マス、日曜始まり)。month は 0〜11。
// 前後の月の日も入れ、inMonth で見分ける
export function monthDays(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { key: toDateKey(date), day: date.getDate(), inMonth: date.getMonth() === month };
  });
}

// その日の予定 (始まる順。同じ時刻なら終わる順)
export function eventsOn(events, key) {
  return events
    .filter((event) => event.date === key)
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

// 予定のある日の一覧 (カレンダーの印に使う)
export function datesWithEvents(events) {
  return new Set(events.map((event) => event.date));
}

// メイン画面に出す今日の予定: 今やっている予定があればそれ (ongoing: true)、なければ今日このあと始まる予定。なければ null
export function currentOrNextEvent(events, now) {
  const today = eventsOn(events, toDateKey(new Date(now)));
  const ongoing = today.find((event) => eventTime(event, 'start') <= now && now < eventTime(event, 'end'));
  if (ongoing) return { event: ongoing, ongoing: true };
  const next = today.find((event) => eventTime(event, 'start') > now);
  return next ? { event: next, ongoing: false } : null;
}

// from より後〜to までに来た、開始・終了の知らせ ({ event, kind: 'start' | 'end' }、時刻の順)。
// to - maxDelay より前のもの (気づくのが遅すぎたもの) は出さない
export function dueTriggers(events, from, to, maxDelay = MAX_TRIGGER_DELAY_MS) {
  const result = [];
  for (const event of events) {
    for (const kind of ['start', 'end']) {
      const at = eventTime(event, kind);
      if (at > from && at <= to && at >= to - maxDelay) result.push({ event, kind, at });
    }
  }
  return result.sort((a, b) => a.at - b.at).map(({ event, kind }) => ({ event, kind }));
}

function cleanTitle(title) {
  return Array.from(String(title ?? '').trim()).slice(0, MAX_TITLE_LENGTH).join('');
}

// 画面の入力から予定を作る。正しくなければ { error: '理由' }。
// 理由: 'invalidDate' (日付がおかしい) / 'invalidTime' (時刻がおかしい) / 'endBeforeStart' (終わりが始まりより前か同じ)
export function makeEvent({ title, date, start, end, preset = null }, id, fallbackTitle) {
  if (!parseDateKey(date)) return { error: 'invalidDate' };
  const startMinutes = minutesOf(start);
  const endMinutes = minutesOf(end);
  if (startMinutes === null || endMinutes === null) return { error: 'invalidTime' };
  if (endMinutes <= startMinutes) return { error: 'endBeforeStart' };
  return {
    event: {
      id,
      title: cleanTitle(title) || cleanTitle(fallbackTitle),
      date,
      start,
      end,
      preset: typeof preset === 'string' && preset ? preset : null,
    },
  };
}

// 次の予定の ID。消した番号は使い回さない
export function nextEventId(events) {
  const numbers = events.map((event) => Number(EVENT_ID.exec(event.id)?.[1] ?? 0));
  return `ev-${Math.max(0, ...numbers) + 1}`;
}

// 追加 (上限に達していたら同じ一覧を返す)・置き換え・削除
export function addEvent(events, event) {
  return events.length >= MAX_EVENTS ? events : [...events, event];
}

export function replaceEvent(events, event) {
  return events.map((e) => (e.id === event.id ? event : e));
}

export function removeEvent(events, id) {
  return events.filter((event) => event.id !== id);
}

// 保存データ (localStorage) から読んだ予定を確かめる。正しい形のものだけ残す
export function parseEvents(raw) {
  if (!Array.isArray(raw)) return [];
  const result = [];
  for (const item of raw) {
    if (result.length >= MAX_EVENTS) break;
    if (!item || typeof item !== 'object') continue;
    if (typeof item.id !== 'string' || !EVENT_ID.test(item.id) || result.some((e) => e.id === item.id)) continue;
    const made = makeEvent(item, item.id, '');
    if (made.error || !made.event.title) continue;
    result.push(made.event);
  }
  return result;
}
