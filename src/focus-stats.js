// 記録の画面の、週・月の集計 (画面にも Electron にも依存しない純粋な関数)。
// - 週は月曜始まりの 7 日、月は 1 日〜末日。期間は「その中の 1 日」(anchor。'YYYY-MM-DD') で表す
// - 合計は、集中の記録 (focus-log.js) のその日の合計 (TOTAL_ID) から数える。
//   予定ごとの記録を足すと、重なった予定を二重に数えるため。その日の合計がない日 (前の版の記録) は 0
import { parseDateKey, toDateKey } from './calendar.js';
import { TOTAL_ID, focusOf } from './focus-log.js';

// その期間の日 ('YYYY-MM-DD') を順に
export function periodDays(kind, anchor) {
  const date = parseDateKey(anchor);
  if (kind === 'week') {
    const monday = date.getDate() - ((date.getDay() + 6) % 7); // 日曜 (0) は 6 日前の月曜から
    return Array.from({ length: 7 }, (_, i) => toDateKey(new Date(date.getFullYear(), date.getMonth(), monday + i)));
  }
  const length = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Array.from({ length }, (_, i) => toDateKey(new Date(date.getFullYear(), date.getMonth(), i + 1)));
}

// step 個前 (負) ・後 (正) の期間の anchor。月は 1 日にそろえる (31 日から前の月に移ると、その日がないことがあるため)
export function shiftAnchor(kind, anchor, step) {
  const date = parseDateKey(anchor);
  if (kind === 'week') return toDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7 * step));
  return toDateKey(new Date(date.getFullYear(), date.getMonth() + step, 1));
}

// 棒グラフの縦軸の目盛りの間隔の候補 (分)。切りのいい値だけ
const AXIS_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 240, 360, 480];
const AXIS_MAX_LINES = 4; // 0 を含めた目盛りの線の数の上限 (多いとグラフがうるさくなる)

// 縦軸の目盛り (分)。0 から、線が上限に収まるいちばん細かい間隔で、いちばん長い日 (maxMs) 以上の値まで。
// 記録がない期間は、0〜60 分の枠だけ見せる
export function axisTicks(maxMs) {
  const maxMinutes = maxMs / 60000;
  if (maxMinutes <= 0) return [0, 30, 60];
  const step = AXIS_STEPS.find((s) => Math.ceil(maxMinutes / s) < AXIS_MAX_LINES) ?? AXIS_STEPS.at(-1);
  const count = Math.ceil(maxMinutes / step);
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

// 期間の合計と、日ごとの値
export function periodFocus(log, days) {
  const result = { ms: 0, count: 0, days: [] };
  for (const key of days) {
    const entry = focusOf(log, key, TOTAL_ID) ?? { ms: 0, count: 0 };
    result.ms += entry.ms;
    result.count += entry.count;
    result.days.push({ key, ms: entry.ms, count: entry.count });
  }
  return result;
}
