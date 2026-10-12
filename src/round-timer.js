// ラウンドのタイマー (画面にも Electron にも依存しない純粋な関数)。
// ラウンドの最初のコマが始まってから最後のコマが終わるまで、時計に合わせて自動で進む。
// コマの間は作業 (そのコマの終わりまで)、コマとコマの間は休憩 (次のコマの始まりまで)
import { toDateKey } from './calendar.js';
import { dayPlan } from './schedule.js';

// その日のコマを、ラウンドごとにまとめる (コマは始まる順。ラウンドは最初のコマが始まる順)
function roundGroups(rounds, dateKey) {
  const groups = new Map();
  for (const item of dayPlan(rounds, [], dateKey)) {
    if (!groups.has(item.roundId)) groups.set(item.roundId, []);
    groups.get(item.roundId).push(item);
  }
  return [...groups.entries()];
}

// now のラウンドの様子。ラウンドの外なら null。
// { round, phase: 'work' | 'break', koma (作業中のコマ。休憩中は次のコマ), startAt, endAt (今の作業・休憩の始まりと終わり),
//   index (koma が何コマ目か。0 から), count (その日のラウンドのコマの数) }。
// ラウンドが重なっているときは、先に始まったほう
export function roundStatus(rounds, now) {
  for (const [roundId, komas] of roundGroups(rounds, toDateKey(new Date(now)))) {
    const lastEnd = Math.max(...komas.map((k) => k.endAt));
    if (now < komas[0].startAt || now >= lastEnd) continue;
    const round = rounds.find((r) => r.id === roundId);
    const base = { round, count: komas.length };
    const working = komas.find((k) => k.startAt <= now && now < k.endAt);
    if (working) return { ...base, phase: 'work', koma: working, startAt: working.startAt, endAt: working.endAt, index: komas.indexOf(working) };
    const next = komas.find((k) => k.startAt > now);
    const previousEnd = Math.max(...komas.filter((k) => k.endAt <= now).map((k) => k.endAt));
    return { ...base, phase: 'break', koma: next, startAt: previousEnd, endAt: next.startAt, index: komas.indexOf(next) };
  }
  return null;
}

// 様子の見分け (ラウンド・作業か休憩か・コマが同じなら同じ)。切り替わりを見つけるのに使う
export function statusKey(status) {
  return status ? `${status.round.id}/${status.phase}/${status.koma.id}` : null;
}

// 前に見た様子が作業で、そのコマの終わりの時刻を過ぎたか (コマを最後まで終えたか)
export function komaFinished(previous, now) {
  return previous?.phase === 'work' && now >= previous.endAt;
}

// from〜to のうち、ラウンドのコマ (作業) と重なる時間 (ミリ秒)。コマが重なっていても 1 回だけ数える
export function roundFocusMs(rounds, from, to) {
  if (to <= from) return 0;
  const keys = [...new Set([toDateKey(new Date(from)), toDateKey(new Date(to))])];
  const spans = keys
    .flatMap((key) => dayPlan(rounds, [], key))
    .map((k) => [Math.max(from, k.startAt), Math.min(to, k.endAt)])
    .filter(([s, e]) => s < e)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let coveredUntil = from;
  for (const [s, e] of spans) {
    const begin = Math.max(s, coveredUntil);
    if (e > begin) total += e - begin;
    coveredUntil = Math.max(coveredUntil, e);
  }
  return total;
}
