// 時間割モードの決まりごと (画面にも Electron にも依存しない純粋な関数)。
// 時間割の 1 コマ: { id: 'tt-1', weekday: 1, title: '数学', start: '09:00', end: '09:50' }
// - weekday は 0 (日曜) 〜 6 (土曜)。毎週くり返す
// - その日の予定 (dayPlan) は、その曜日の時間割と、カレンダーの 1 回だけの予定 (calendar.js) を合わせたもの
// - メイン画面は時計どおりに動く: 予定の最中は終わりまで、予定と予定の間は「休み時間」として次の予定までを数える
import { parseDateKey, eventsOn, MAX_TRIGGER_DELAY_MS } from './calendar.js';

export const MAX_SLOTS = 200;
export const MAX_SLOT_TITLE_LENGTH = 40;

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const SLOT_ID = /^tt-(\d+)$/;

function minutesOf(time) {
  const match = TIME.exec(String(time));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function cleanTitle(title) {
  return Array.from(String(title ?? '').trim()).slice(0, MAX_SLOT_TITLE_LENGTH).join('');
}

// 'HH:MM' をその日の時刻 (ミリ秒) にする
function timeOn(dateKey, time) {
  const day = parseDateKey(dateKey);
  const [h, m] = time.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).getTime();
}

// 画面の入力から時間割のコマを作る。正しくなければ { error: 'invalidWeekday' | 'invalidTime' | 'endBeforeStart' }
export function makeSlot({ weekday, title, start, end }, id, fallbackTitle) {
  const day = Number(weekday);
  if (!Number.isInteger(day) || day < 0 || day > 6) return { error: 'invalidWeekday' };
  const startMinutes = minutesOf(start);
  const endMinutes = minutesOf(end);
  if (startMinutes === null || endMinutes === null) return { error: 'invalidTime' };
  if (endMinutes <= startMinutes) return { error: 'endBeforeStart' };
  return { slot: { id, weekday: day, title: cleanTitle(title) || cleanTitle(fallbackTitle), start, end } };
}

export function nextSlotId(slots) {
  const numbers = slots.map((slot) => Number(SLOT_ID.exec(slot.id)?.[1] ?? 0));
  return `tt-${Math.max(0, ...numbers) + 1}`;
}

export function addSlot(slots, slot) {
  return slots.length >= MAX_SLOTS ? slots : [...slots, slot];
}

export function replaceSlot(slots, slot) {
  return slots.map((s) => (s.id === slot.id ? slot : s));
}

export function removeSlot(slots, id) {
  return slots.filter((slot) => slot.id !== id);
}

// その曜日の時間割 (始まる順)
export function slotsOn(slots, weekday) {
  return slots
    .filter((slot) => slot.weekday === weekday)
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

// 保存データから読んだ時間割を確かめる。正しい形のものだけ残す
export function parseTimetable(raw) {
  if (!Array.isArray(raw)) return [];
  const result = [];
  for (const item of raw) {
    if (result.length >= MAX_SLOTS) break;
    if (!item || typeof item !== 'object') continue;
    if (typeof item.id !== 'string' || !SLOT_ID.test(item.id) || result.some((s) => s.id === item.id)) continue;
    const made = makeSlot(item, item.id, '');
    if (made.error || !made.slot.title) continue;
    result.push(made.slot);
  }
  return result;
}

// その日の予定: 時間割 (毎週) とカレンダーの予定 (1 回だけ) を合わせ、始まる順に並べる。
// 各予定は { title, start, end, startAt, endAt, source: 'timetable' | 'event', id }
export function dayPlan(slots, events, dateKey) {
  const date = parseDateKey(dateKey);
  if (!date) return [];
  const items = [
    ...slotsOn(slots, date.getDay()).map((slot) => ({ ...slot, source: 'timetable' })),
    ...eventsOn(events, dateKey).map((event) => ({ ...event, source: 'event' })),
  ].map((item) => ({
    id: item.id,
    title: item.title,
    start: item.start,
    end: item.end,
    source: item.source,
    startAt: timeOn(dateKey, item.start),
    endAt: timeOn(dateKey, item.end),
  }));
  return items.sort((a, b) => a.startAt - b.startAt || a.endAt - b.endAt);
}

// 今の状態。kind:
// - 'period'      予定の最中 (item: 今の予定。重なっているときは、いちばん後に始まった予定)。startAt〜endAt
// - 'break'       予定と予定の間の休み時間。前の予定の終わり (startAt) 〜 次の予定の始まり (endAt)
// - 'beforeStart' 今日の最初の予定の前。endAt は最初の予定の始まり (startAt は null)
// - 'done'        今日の予定がすべて終わった
// - 'empty'       今日の予定がない
// next は次に始まる予定 (なければ null)
export function scheduleStatus(plan, now) {
  if (plan.length === 0) return { kind: 'empty', item: null, next: null, startAt: null, endAt: null };
  const next = plan.find((item) => item.startAt > now) ?? null;
  const current = plan.filter((item) => item.startAt <= now && now < item.endAt).at(-1);
  if (current) return { kind: 'period', item: current, next, startAt: current.startAt, endAt: current.endAt };
  if (!next) return { kind: 'done', item: null, next: null, startAt: null, endAt: null };
  const ended = plan.filter((item) => item.endAt <= now);
  if (ended.length === 0) return { kind: 'beforeStart', item: null, next, startAt: null, endAt: next.startAt };
  return { kind: 'break', item: null, next, startAt: Math.max(...ended.map((item) => item.endAt)), endAt: next.startAt };
}

// 今の区切りの残り時間と、進み具合 (0〜1。1 が始まったばかり)。数えるものがなければ null
export function scheduleProgress(status, now) {
  if (status.endAt === null) return null;
  const remainingMs = Math.max(0, status.endAt - now);
  const ratio = status.startAt === null ? 1 : Math.min(1, Math.max(0, remainingMs / (status.endAt - status.startAt)));
  return { remainingMs, ratio };
}

// from より後〜to までに来た区切り (予定の始まり・終わり) を、時刻ごとにまとめる。
// 同じ時刻に終わりと始まりがある (続けて次の予定がある) ときは、始まりとして知らせる。
// to - maxDelay より前のもの (気づくのが遅すぎたもの) は出さない
// 結果: [{ at, starts: [予定...], ends: [予定...] }] (時刻の順)
export function scheduleBoundaries(plan, from, to, maxDelay = MAX_TRIGGER_DELAY_MS) {
  const byTime = new Map();
  const add = (at, key, item) => {
    if (at <= from || at > to || at < to - maxDelay) return;
    if (!byTime.has(at)) byTime.set(at, { at, starts: [], ends: [] });
    byTime.get(at)[key].push(item);
  };
  for (const item of plan) {
    add(item.startAt, 'starts', item);
    add(item.endAt, 'ends', item);
  }
  return [...byTime.values()].sort((a, b) => a.at - b.at);
}

// 残り時間の表示。1 時間以上は 時:分:秒 (例: 1:05:00)、それ以外は 分:秒
export function formatScheduleTime(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${String(m).padStart(2, '0')}:${s}`;
}


// ある曜日のコマを、別のコマの一覧に置き換える (まとめて作る・コピーで使う)
export function replaceDay(slots, weekday, daySlots) {
  return [...slots.filter((slot) => slot.weekday !== weekday), ...daySlots];
}

// 次の ID から順に count 個の ID を作る
function slotIds(slots, count) {
  const first = Number(nextSlotId(slots).slice(3));
  return Array.from({ length: count }, (_, i) => `tt-${first + i}`);
}

// from の曜日のコマを、to の曜日 (いくつでも) にコピーする。コピー先の曜日は、コピー元と同じ内容に置き換える。
// 上限 (MAX_SLOTS) を超えるときは、何も変えずに null
export function copyDay(slots, from, to) {
  const source = slotsOn(slots, from);
  const targets = [...new Set(to)].filter((weekday) => weekday !== from && Number.isInteger(weekday) && weekday >= 0 && weekday <= 6);
  let result = slots.filter((slot) => !targets.includes(slot.weekday));
  if (result.length + source.length * targets.length > MAX_SLOTS) return null;
  const ids = slotIds(slots, source.length * targets.length);
  for (const weekday of targets) {
    result = [...result, ...source.map((slot) => ({ ...slot, id: ids.shift(), weekday }))];
  }
  return result;
}

export const GENERATE_RANGES = Object.freeze({ period: [5, 180], break: [0, 60], count: [1, 12] });

const pad2 = (n) => String(n).padStart(2, '0');
const toTime = (minutes) => `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;

// 「開始時刻・1 コマの長さ・休み・コマ数」から、その曜日のコマをまとめて作る。名前は nameFor(1 から始まる番号) で付ける。
// 日をまたぐコマは作らない (入りきる分だけ)。正しくなければ { error: 'invalidTime' | 'outOfRange' | 'noRoom' }
export function generateDay({ weekday, start, period, breakMinutes, count }, existing, nameFor) {
  const startMinutes = minutesOf(start);
  if (startMinutes === null) return { error: 'invalidTime' };
  const values = { period: Number(period), break: Number(breakMinutes), count: Number(count) };
  for (const [key, [min, max]] of Object.entries(GENERATE_RANGES)) {
    if (!Number.isInteger(values[key]) || values[key] < min || values[key] > max) return { error: 'outOfRange' };
  }
  const times = [];
  for (let i = 0, at = startMinutes; i < values.count; i += 1, at += values.period + values.break) {
    if (at + values.period > 24 * 60 - 1) break; // 23:59 までに終わる分だけ
    times.push([at, at + values.period]);
  }
  if (times.length === 0) return { error: 'noRoom' };
  const others = existing.filter((slot) => slot.weekday !== weekday);
  if (others.length + times.length > MAX_SLOTS) return { error: 'outOfRange' };
  const ids = slotIds(existing, times.length);
  const daySlots = times.map(([s, e], i) => ({ id: ids[i], weekday, title: cleanTitle(nameFor(i + 1)), start: toTime(s), end: toTime(e) }));
  return { slots: replaceDay(existing, weekday, daySlots), created: daySlots.length };
}

// 予定の前に知らせる時間 (分)。0 は知らせない
export const REMINDER_MINUTES = Object.freeze([0, 1, 3, 5, 10]);

// from より後〜to までに「始まる minutes 分前」になった予定 (始まる順)。気づくのが遅すぎたものは出さない
export function scheduleReminders(plan, from, to, minutes, maxDelay = MAX_TRIGGER_DELAY_MS) {
  if (!minutes) return [];
  const before = minutes * 60 * 1000;
  return plan.filter((item) => {
    const at = item.startAt - before;
    return at > from && at <= to && at >= to - maxDelay;
  });
}
