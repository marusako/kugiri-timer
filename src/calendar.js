// アプリ内カレンダーの決まりごと (画面にも Electron にも依存しない純粋な関数)。
// 予定の形: { id: 'ev-1', title: '数学', date: '2026-10-06', start: '14:00', end: '16:00', preset: 'standard' | null,
//            repeat: 'none' | 'daily' | 'weekdays' | 'monthly', until: '2026-12-31' | null, skips: ['2026-10-08', ...] }
// - 日付と時刻は、パソコンの地域の時刻 (ローカル時刻) で扱う
// - 日をまたぐ予定は作れない (end は start より後)
// - preset はタイマーのプリセットの ID (presets.js)。null は「今の設定のまま」
// - くり返す予定は、date (始まりの日) から until (終わりの日。null なら終わりなし) まで。
//   daily は毎日、weekdays は月〜金、monthly は毎月 date と同じ日 (その日がない月 (31 日など) は飛ばす)。
//   skips は「この日だけ休み」にした日。毎週のくり返しは時間割 (schedule.js) で扱う

export const MAX_EVENTS = 500;
export const MAX_TITLE_LENGTH = 40;
export const REPEATS = Object.freeze(['none', 'daily', 'weekdays', 'monthly']);
// 「この日だけ休み」にできる日の数 (1 つの予定ごと。多すぎたら古い日から忘れる)
export const MAX_SKIPS = 200;
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

// 予定がその日にあるか (くり返す予定は、くり返しの決まり・終わりの日・休みにした日で決める)
export function occursOn(event, key) {
  const repeat = event.repeat ?? 'none';
  if (repeat === 'none') return event.date === key;
  // 'YYYY-MM-DD' は文字列のまま比べても日付の順になる
  if (key < event.date || (event.until && key > event.until) || event.skips?.includes(key)) return false;
  const date = parseDateKey(key);
  if (!date) return false;
  if (repeat === 'daily') return true;
  if (repeat === 'weekdays') return date.getDay() >= 1 && date.getDay() <= 5;
  return repeat === 'monthly' && key.slice(8) === event.date.slice(8);
}

// その日の予定 (始まる順。同じ時刻なら終わる順)。くり返す予定は、date をその日にしたもの (その日の 1 回分) を返す
// (元の予定は id で探す)
export function eventsOn(events, key) {
  return events
    .filter((event) => occursOn(event, key))
    .map((event) => (event.date === key ? event : { ...event, date: key }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

// keys (カレンダーに並べた日) のうち、予定のある日 (カレンダーの印に使う)
export function datesWithEvents(events, keys) {
  return new Set(keys.filter((key) => events.some((event) => occursOn(event, key))));
}

// from〜to (ミリ秒) にかかる日 ('YYYY-MM-DD') を順に
function dateKeysBetween(from, to) {
  const keys = [];
  const last = toDateKey(new Date(to));
  const first = new Date(from);
  for (let d = new Date(first.getFullYear(), first.getMonth(), first.getDate()); ; d.setDate(d.getDate() + 1)) {
    const key = toDateKey(d);
    keys.push(key);
    if (key >= last) return keys;
  }
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
// to - maxDelay より前のもの (気づくのが遅すぎたもの) は出さない。くり返す予定は、その日の 1 回分を event にする
export function dueTriggers(events, from, to, maxDelay = MAX_TRIGGER_DELAY_MS) {
  const result = [];
  if (to <= from) return result;
  // 調べるのは、知らせを出せる時間 (to - maxDelay 〜 to) にかかる日だけ
  const occurrences = dateKeysBetween(Math.max(from, to - maxDelay), to).flatMap((key) => eventsOn(events, key));
  for (const event of occurrences) {
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
//       'untilBeforeDate' (くり返しの終わりの日が、始まりの日より前)
// until は、空ならくり返しの終わりなし。くり返さない予定では until と skips を使わない。
// skips は、くり返しの範囲 (date〜until) にある正しい日だけ残す
export function makeEvent({ title, date, start, end, preset = null, repeat = 'none', until = null, skips = [] }, id, fallbackTitle) {
  if (!parseDateKey(date)) return { error: 'invalidDate' };
  const startMinutes = minutesOf(start);
  const endMinutes = minutesOf(end);
  if (startMinutes === null || endMinutes === null) return { error: 'invalidTime' };
  if (endMinutes <= startMinutes) return { error: 'endBeforeStart' };
  const repeating = REPEATS.includes(repeat) && repeat !== 'none';
  let untilKey = null;
  if (repeating && until) {
    if (!parseDateKey(until)) return { error: 'invalidDate' };
    if (until < date) return { error: 'untilBeforeDate' };
    untilKey = until;
  }
  const skipKeys = repeating && Array.isArray(skips)
    ? [...new Set(skips.filter((key) => parseDateKey(key) && key >= date && (!untilKey || key <= untilKey)))].sort().slice(-MAX_SKIPS)
    : [];
  return {
    event: {
      id,
      title: cleanTitle(title) || cleanTitle(fallbackTitle),
      date,
      start,
      end,
      preset: typeof preset === 'string' && preset ? preset : null,
      repeat: repeating ? repeat : 'none',
      until: untilKey,
      skips: skipKeys,
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

// くり返す予定の、その日だけを休みにする (くり返さない予定は、そのまま)
export function skipEventOn(events, id, key) {
  return events.map((event) => {
    if (event.id !== id || event.repeat === 'none' || event.skips.includes(key)) return event;
    return { ...event, skips: [...event.skips, key].sort().slice(-MAX_SKIPS) };
  });
}

// その日だけの予定 (くり返さない予定で、その日のもの) か
export function isOneOffOn(event, key) {
  return (event.repeat ?? 'none') === 'none' && event.date === key;
}

// その日の予定をすべて消す: その日だけの予定は消し、くり返す予定はその日だけ休みにする
export function clearDate(events, key) {
  const remaining = events.filter((event) => !isOneOffOn(event, key));
  const repeating = remaining.filter((event) => event.repeat !== 'none' && occursOn(event, key)).map((event) => event.id);
  return repeating.reduce((result, id) => skipEventOn(result, id, key), remaining);
}

// その日を含む週 (月曜始まり。時間割表と同じ) の、曜日 (0 = 日曜) → 日付
export function weekDates(key) {
  const date = parseDateKey(key);
  const monday = date.getDate() - ((date.getDay() + 6) % 7);
  const result = {};
  for (let i = 0; i < 7; i++) {
    const day = new Date(date.getFullYear(), date.getMonth(), monday + i);
    result[day.getDay()] = toDateKey(day);
  }
  return result;
}

// from の日のその日だけの予定を、to の日 (いくつでも) にコピーする。コピー先の日のその日だけの予定は、置き換える。
// くり返す予定はコピーしない (もう毎回ある)。上限 (MAX_EVENTS) を超えるときは、何も変えずに null
export function copyDateEvents(events, from, to) {
  const source = events.filter((event) => isOneOffOn(event, from));
  const targets = [...new Set(to)].filter((key) => key !== from && parseDateKey(key));
  let result = events.filter((event) => !targets.some((key) => isOneOffOn(event, key)));
  if (result.length + source.length * targets.length > MAX_EVENTS) return null;
  let next = Number(nextEventId(events).slice(3));
  for (const key of targets) {
    result = [...result, ...source.map((event) => ({ ...event, id: `ev-${next++}`, date: key }))];
  }
  return result;
}

// 保存データ (localStorage) から読んだ予定を確かめる。正しい形のものだけ残す
// (くり返しのない古い版の予定は、くり返さない予定として読む)
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
