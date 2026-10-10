// 予定ごとの集中の記録 (画面にも Electron にも依存しない純粋な関数)。
// 形: { 'YYYY-MM-DD': { 'ev-1': { ms: 1500000, count: 1 }, 'tt-3': { ... } }, ... }
// - タイマーモードで作業 (Focus) を数えている間、その時刻にやっている予定 (カレンダーの予定と毎週のコマ。
//   くり返す予定はその日の回) に、数えた時間 (ms) を足す。重なっている予定には、どれにも足す
// - 作業を最後まで終えたら、その時刻にやっている予定の回数 (count) を 1 増やす
// - 残すのは、今日から 3 か月前の日まで。それより古い日は忘れる
import { parseDateKey, toDateKey } from './calendar.js';
import { dayPlan } from './schedule.js';

export const KEEP_MONTHS = 3;
// 1 回に足す時間の上限。スリープ明けなどで、前に数えてから長く空いたときに、まとめて足さないようにする
export const MAX_STEP_MS = 2000;

const ITEM_ID = /^(ev|tt)-\d+$/;

// その時刻にやっている予定の ID (カレンダーの予定と毎週のコマ)
export function ongoingItems(slots, events, now) {
  const key = toDateKey(new Date(now));
  return dayPlan(slots, events, key).filter((item) => item.startAt <= now && now < item.endAt).map((item) => item.id);
}

// lastAt から now までに、作業 (Focus) として数えた時間。作業中でタイマーが動いているときだけ数え、
// 終わりの時刻 (endAt) より先は数えない (画面の更新が遅れて、終わってから気づいたときに足しすぎないように)
export function focusStepMs(state, lastAt, now) {
  if (!state.running || state.mode !== 'work') return 0;
  return Math.max(0, Math.min(now, state.endAt) - lastAt);
}

function addTo(log, dateKey, ids, ms, count) {
  if (ids.length === 0 || (ms <= 0 && count <= 0)) return log;
  const day = { ...log[dateKey] };
  for (const id of ids) {
    const prev = day[id] ?? { ms: 0, count: 0 };
    day[id] = { ms: prev.ms + Math.max(0, ms), count: prev.count + count };
  }
  return { ...log, [dateKey]: day };
}

// 作業を数えた時間を足す (MAX_STEP_MS より長い分は足さない)
export function addFocusTime(log, dateKey, ids, ms) {
  return addTo(log, dateKey, ids, Math.min(ms, MAX_STEP_MS), 0);
}

// 作業を最後まで終えた回数を 1 増やす
export function addFocusCount(log, dateKey, ids) {
  return addTo(log, dateKey, ids, 0, 1);
}

// その日の、その予定の記録 (なければ null)
export function focusOf(log, dateKey, id) {
  return log[dateKey]?.[id] ?? null;
}

// その日の予定の記録の合計 (ids を渡すと、その予定だけを数える。重なっている予定は、それぞれに数える)
export function dayFocus(log, dateKey, ids = null) {
  const total = { ms: 0, count: 0 };
  for (const [id, entry] of Object.entries(log[dateKey] ?? {})) {
    if (ids && !ids.includes(id)) continue;
    total.ms += entry.ms;
    total.count += entry.count;
  }
  return total;
}

// 消した予定・コマの記録を忘れる (ID は使い回すことがあるので、新しい予定に古い記録が付かないように)
export function forgetMissing(log, existingIds) {
  const keep = new Set(existingIds);
  let changed = false;
  const result = {};
  for (const [key, day] of Object.entries(log)) {
    const entries = Object.entries(day).filter(([id]) => keep.has(id));
    if (entries.length !== Object.keys(day).length) changed = true;
    if (entries.length > 0) result[key] = Object.fromEntries(entries);
  }
  return changed ? result : log;
}

// 今日から KEEP_MONTHS か月前の日 ('YYYY-MM-DD')。この日より前の記録は忘れる
export function oldestKeptDate(now) {
  const today = new Date(now);
  return toDateKey(new Date(today.getFullYear(), today.getMonth() - KEEP_MONTHS, today.getDate()));
}

// 保存データから読んだ記録を確かめる。正しい形のものだけ残し、古い日は忘れる
export function parseFocusLog(raw, now) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const oldest = oldestKeptDate(now);
  const result = {};
  for (const [key, day] of Object.entries(raw)) {
    if (!parseDateKey(key) || key < oldest || !day || typeof day !== 'object') continue;
    const entries = Object.entries(day).filter(([id, entry]) =>
      ITEM_ID.test(id) && entry && Number.isFinite(entry.ms) && entry.ms >= 0 && Number.isInteger(entry.count) && entry.count >= 0);
    if (entries.length > 0) result[key] = Object.fromEntries(entries.map(([id, { ms, count }]) => [id, { ms, count }]));
  }
  return result;
}

// 表示用の分 (切り捨て)
export const focusMinutes = (ms) => Math.floor(ms / 60000);
