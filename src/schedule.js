// ラウンド (コマをまとめた入れ物) と、その日の予定の決まりごと (画面にも Electron にも依存しない純粋な関数)。
// ラウンド: { id: 'rd-1', title: '午前', weekday: 1, date: null, komas: [コマ, ...] }
// - 毎週くり返すラウンドは weekday (0 = 日曜 〜 6 = 土曜)、その日だけのラウンドは date ('YYYY-MM-DD')。もう片方は null
// - title は空でもよい (画面では仮の名前を出す)
// コマ: { id: 'tt-1', title: '数学', start: '09:00', end: '09:50', skips: ['2026-10-12', ...] }
// - コマの ID は、すべてのラウンドを通して重ならない (集中の記録は、この ID で数える)
// - skips は「この日だけ休み」にした日 (毎週のラウンドの曜日の日だけ)
// - その日の予定 (dayPlan) は、その日のラウンドのコマと、カレンダーの予定 (calendar.js。くり返す予定はその日の回) を合わせたもの。
//   開始・終了の知らせ (planTriggers)・メイン画面の予定の 1 行 (currentOrNextItem)・予定の前の知らせ・集中の記録は、これを使う
import { parseDateKey, toDateKey, eventsOn, dateKeysBetween, weekDates, MAX_SKIPS, MAX_TRIGGER_DELAY_MS } from './calendar.js';

export const MAX_KOMAS = 200; // すべてのラウンドのコマの合計
export const MAX_ROUNDS = 100;
const MAX_TITLE_LENGTH = 40; // ラウンドとコマの名前

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const KOMA_ID = /^tt-(\d+)$/;
const ROUND_ID = /^rd-(\d+)$/;

function minutesOf(time) {
  const match = TIME.exec(String(time));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function cleanTitle(title) {
  return Array.from(String(title ?? '').trim()).slice(0, MAX_TITLE_LENGTH).join('');
}

// 'HH:MM' をその日の時刻 (ミリ秒) にする
function timeOn(dateKey, time) {
  const day = parseDateKey(dateKey);
  const [h, m] = time.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).getTime();
}

const byStart = (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end);

// 画面の入力からコマを作る。正しくなければ { error: 'invalidTime' | 'endBeforeStart' }。
// weekday は、入れるラウンドの曜日 (その日だけのラウンドなら null)。skips は、その曜日の正しい日だけ残す
export function makeKoma({ title, start, end, skips = [] }, id, fallbackTitle, weekday) {
  const startMinutes = minutesOf(start);
  const endMinutes = minutesOf(end);
  if (startMinutes === null || endMinutes === null) return { error: 'invalidTime' };
  if (endMinutes <= startMinutes) return { error: 'endBeforeStart' };
  const skipKeys = weekday !== null && Array.isArray(skips)
    ? [...new Set(skips.filter((key) => parseDateKey(key)?.getDay() === weekday))].sort().slice(-MAX_SKIPS)
    : [];
  return { koma: { id, title: cleanTitle(title) || cleanTitle(fallbackTitle), start, end, skips: skipKeys } };
}

// ラウンドを作る。weekday (毎週) か date (その日だけ) のどちらか。正しくなければ { error: 'invalidWeekday' | 'invalidDate' }
export function makeRound({ title, weekday = null, date = null, komas = [] }, id) {
  const base = { id, title: cleanTitle(title) };
  if (date !== null) {
    if (!parseDateKey(date)) return { error: 'invalidDate' };
    return { round: { ...base, weekday: null, date, komas } };
  }
  const day = Number(weekday);
  if (weekday === null || !Number.isInteger(day) || day < 0 || day > 6) return { error: 'invalidWeekday' };
  return { round: { ...base, weekday: day, date: null, komas } };
}

const idNumber = (pattern, id) => Number(pattern.exec(id)?.[1] ?? 0);

export function nextRoundId(rounds) {
  return `rd-${Math.max(0, ...rounds.map((r) => idNumber(ROUND_ID, r.id))) + 1}`;
}

export function allKomas(rounds) {
  return rounds.flatMap((round) => round.komas);
}

export function nextKomaId(rounds) {
  return `tt-${Math.max(0, ...allKomas(rounds).map((k) => idNumber(KOMA_ID, k.id))) + 1}`;
}

// 次の ID から順に count 個のコマの ID を作る
function komaIds(rounds, count) {
  const first = idNumber(KOMA_ID, nextKomaId(rounds));
  return Array.from({ length: count }, (_, i) => `tt-${first + i}`);
}

const withinLimits = (rounds) => rounds.length <= MAX_ROUNDS && allKomas(rounds).length <= MAX_KOMAS;

// 上限 (ラウンド 100・コマ 200) を超えるときは null
export function addRound(rounds, round) {
  const next = [...rounds, round];
  return withinLimits(next) ? next : null;
}

export function replaceRound(rounds, round) {
  return rounds.map((r) => (r.id === round.id ? round : r));
}

export function removeRound(rounds, id) {
  return rounds.filter((round) => round.id !== id);
}

// ラウンドにコマを足す (同じ ID があれば直す)。上限を超えるときは null
export function saveKoma(rounds, roundId, koma) {
  const next = rounds.map((round) => {
    if (round.id !== roundId) return round;
    const exists = round.komas.some((k) => k.id === koma.id);
    return { ...round, komas: exists ? round.komas.map((k) => (k.id === koma.id ? koma : k)) : [...round.komas, koma] };
  });
  return withinLimits(next) ? next : null;
}

// コマを消す。コマがなくなったラウンドは消す
export function removeKoma(rounds, roundId, komaId) {
  return rounds
    .map((round) => (round.id === roundId ? { ...round, komas: round.komas.filter((k) => k.id !== komaId) } : round))
    .filter((round) => round.komas.length > 0);
}

// その日にあるラウンドか (毎週はその曜日、その日だけはその日付)
function occursOn(round, dateKey) {
  return round.date !== null ? round.date === dateKey : parseDateKey(dateKey)?.getDay() === round.weekday;
}

// その日のラウンド (休みにしたコマを除き、コマは始まる順。コマのないラウンドは出さない)。最初のコマが始まる順
export function roundsOn(rounds, dateKey) {
  if (!parseDateKey(dateKey)) return [];
  return rounds
    .filter((round) => occursOn(round, dateKey))
    .map((round) => ({ ...round, komas: round.komas.filter((k) => !k.skips.includes(dateKey)).sort(byStart) }))
    .filter((round) => round.komas.length > 0)
    .sort((a, b) => byStart(a.komas[0], b.komas[0]));
}

// その日のコマ (どのラウンドのものかを roundId・roundTitle で持つ)
export function komasOnDate(rounds, dateKey) {
  return roundsOn(rounds, dateKey).flatMap((round) => round.komas.map((k) => ({ ...k, roundId: round.id, roundTitle: round.title })));
}

// 毎週のラウンドの、その日だけを休みにする (ほかの週は残る)。
// roundId を省くとその日のすべてのラウンド、komaId を省くとラウンドのすべてのコマ
export function skipRoundsOn(rounds, dateKey, roundId = null, komaId = null) {
  const date = parseDateKey(dateKey);
  if (!date) return rounds;
  return rounds.map((round) => {
    if (round.weekday !== date.getDay() || (roundId !== null && round.id !== roundId)) return round;
    const komas = round.komas.map((k) => {
      if ((komaId !== null && k.id !== komaId) || k.skips.includes(dateKey)) return k;
      return { ...k, skips: [...k.skips, dateKey].sort().slice(-MAX_SKIPS) };
    });
    return komas.every((k, i) => k === round.komas[i]) ? round : { ...round, komas };
  });
}

// この日をすべて消す: その日だけのラウンドは消し、毎週のラウンドはその日だけ休む
export function clearRoundsOn(rounds, dateKey) {
  return skipRoundsOn(rounds.filter((round) => round.date !== dateKey), dateKey);
}

// この曜日をすべて消す: その曜日の毎週のラウンドを、すべての週から消す
export function clearWeekday(rounds, weekday) {
  return rounds.filter((round) => round.weekday !== weekday);
}

// from の日のラウンドを、to の曜日 (いくつでも) にコピーする。毎週のラウンドは毎週のその曜日へ、
// その日だけのラウンドは同じ週 (月曜始まり) のその曜日の日へ。コピー先の同じ種類のラウンドは置き換える。
// 休みの日は持っていかない。上限を超えるときは、何も変えずに null
export function copyRounds(rounds, from, to) {
  const date = parseDateKey(from);
  if (!date) return null;
  const fromWeekday = date.getDay();
  const dates = weekDates(from);
  const targets = [...new Set(to)].filter((weekday) => weekday !== fromWeekday && Number.isInteger(weekday) && weekday >= 0 && weekday <= 6);
  const weeklySource = rounds.filter((round) => round.weekday === fromWeekday);
  const onceSource = rounds.filter((round) => round.date === from);
  const targetDates = targets.map((weekday) => dates[weekday]);
  const kept = rounds.filter((round) => (round.weekday !== null
    ? !(weeklySource.length > 0 && targets.includes(round.weekday))
    : !(onceSource.length > 0 && targetDates.includes(round.date))));
  const copies = targets.flatMap((weekday) => [
    ...weeklySource.map((round) => ({ ...round, weekday })),
    ...onceSource.map((round) => ({ ...round, date: dates[weekday] })),
  ]);
  const komaCount = allKomas(copies).length;
  if (kept.length + copies.length > MAX_ROUNDS || allKomas(kept).length + komaCount > MAX_KOMAS) return null;
  const firstRound = idNumber(ROUND_ID, nextRoundId(rounds));
  const newKomaIds = komaIds(rounds, komaCount);
  return [...kept, ...copies.map((round, i) => ({
    ...round,
    id: `rd-${firstRound + i}`,
    komas: round.komas.map((k) => ({ ...k, id: newKomaIds.shift(), skips: [] })),
  }))];
}

// 保存データから読んだラウンドを確かめる。正しい形のものだけ残す。
// 古い版の時間割 (曜日ごとのコマの一覧) は、曜日ごとに 1 つの毎週のラウンド (名前なし) にまとめる
export function parseTimetable(raw) {
  if (!Array.isArray(raw)) return [];
  const items = raw.filter((item) => item && typeof item === 'object');
  const oldSlots = items.filter((item) => !Array.isArray(item.komas));
  const source = [
    ...items.filter((item) => Array.isArray(item.komas)),
    ...[0, 1, 2, 3, 4, 5, 6]
      .map((weekday) => ({ title: '', weekday, date: null, komas: oldSlots.filter((slot) => slot.weekday === weekday) }))
      .filter((round) => round.komas.length > 0),
  ];
  const result = [];
  const seenKomas = new Set();
  for (const item of source) {
    if (result.length >= MAX_ROUNDS) break;
    // 古い版から移したラウンドには、ID を順に振る
    const id = 'id' in item ? item.id : nextRoundId(result);
    if (typeof id !== 'string' || !ROUND_ID.test(id) || result.some((r) => r.id === id)) continue;
    const made = makeRound({ title: item.title, weekday: item.weekday ?? null, date: item.date ?? null }, id);
    if (made.error) continue;
    const komas = [];
    for (const k of item.komas) {
      if (seenKomas.size >= MAX_KOMAS) break;
      if (!k || typeof k !== 'object' || typeof k.id !== 'string' || !KOMA_ID.test(k.id) || seenKomas.has(k.id)) continue;
      const madeKoma = makeKoma(k, k.id, '', made.round.weekday);
      if (madeKoma.error || !madeKoma.koma.title) continue;
      seenKomas.add(k.id);
      komas.push(madeKoma.koma);
    }
    if (komas.length > 0) result.push({ ...made.round, komas });
  }
  return result;
}

// その日の予定: その日のラウンドのコマと、カレンダーの予定 (くり返す予定はその日の回) を合わせ、始まる順に並べる。
// 各予定は { id, title, date, start, end, startAt, endAt, preset, source: 'koma' | 'event', roundId }。
// preset はカレンダーの予定のタイマーのプリセット (コマは選べないので null = 今の設定のまま)。roundId はコマのラウンド (予定は null)
export function dayPlan(rounds, events, dateKey) {
  const date = parseDateKey(dateKey);
  if (!date) return [];
  const items = [
    ...komasOnDate(rounds, dateKey).map((k) => ({ ...k, preset: null, source: 'koma' })),
    ...eventsOn(events, dateKey).map((event) => ({ ...event, roundId: null, source: 'event' })),
  ].map((item) => ({
    id: item.id,
    title: item.title,
    date: dateKey,
    start: item.start,
    end: item.end,
    startAt: timeOn(dateKey, item.start),
    endAt: timeOn(dateKey, item.end),
    preset: item.preset ?? null,
    source: item.source,
    roundId: item.roundId,
  }));
  return items.sort((a, b) => a.startAt - b.startAt || a.endAt - b.endAt);
}

// from より後〜to までに来た、予定 (コマとカレンダーの予定) の開始・終了の知らせ ({ item, kind: 'start' | 'end' })。
// 時刻の順で、同じ時刻なら終わりを先に出す (続けて次の予定が始まるとき「〇〇が終わりました」→「〇〇が始まりました」の順になるように)。
// to - maxDelay より前のもの (スリープ明けなど、気づくのが遅すぎたもの) は出さない
export function planTriggers(rounds, events, from, to, maxDelay = MAX_TRIGGER_DELAY_MS) {
  if (to <= from) return [];
  const result = [];
  // 調べるのは、知らせを出せる時間 (to - maxDelay 〜 to) にかかる日だけ
  for (const key of dateKeysBetween(Math.max(from, to - maxDelay), to)) {
    for (const item of dayPlan(rounds, events, key)) {
      for (const [kind, at] of [['start', item.startAt], ['end', item.endAt]]) {
        if (at > from && at <= to && at >= to - maxDelay) result.push({ item, kind, at });
      }
    }
  }
  const order = { end: 0, start: 1 };
  return result.sort((a, b) => a.at - b.at || order[a.kind] - order[b.kind]).map(({ item, kind }) => ({ item, kind }));
}

// メイン画面に出す今日の予定: 今やっている予定があればそれ (ongoing: true。重なっていれば先に始まったもの)、
// なければ今日このあと始まる予定。なければ null
export function currentOrNextItem(rounds, events, now) {
  const today = dayPlan(rounds, events, toDateKey(new Date(now)));
  const ongoing = today.find((item) => item.startAt <= now && now < item.endAt);
  if (ongoing) return { item: ongoing, ongoing: true };
  const next = today.find((item) => item.startAt > now);
  return next ? { item: next, ongoing: false } : null;
}

export const GENERATE_RANGES = Object.freeze({ period: [5, 180], break: [0, 60], longBreak: [0, 180], longBreakAfter: [1, 11], count: [1, 12] });

// 「まとめて作る」の初めの値 (8:30 から 45 分・休み 10 分・4 コマ目のあとに 60 分の長い休み・7 コマ)
export const GENERATE_DEFAULTS = Object.freeze({ start: '08:30', period: 45, breakMinutes: 10, longBreakMinutes: 60, longBreakAfter: 4, count: 7 });

const pad2 = (n) => String(n).padStart(2, '0');
const toTime = (minutes) => `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;

// まとめて作るときの、各コマの [始まり, 終わり] (0:00 からの分)。正しくなければ { error }
function generateTimes({ start, period, breakMinutes, longBreakMinutes = 0, longBreakAfter = 1, count }) {
  const startMinutes = minutesOf(start);
  if (startMinutes === null) return { error: 'invalidTime' };
  const values = {
    period: Number(period),
    break: Number(breakMinutes),
    longBreak: Number(longBreakMinutes),
    longBreakAfter: Number(longBreakAfter),
    count: Number(count),
  };
  for (const [key, [min, max]] of Object.entries(GENERATE_RANGES)) {
    if (!Number.isInteger(values[key]) || values[key] < min || values[key] > max) return { error: 'outOfRange' };
  }
  const times = [];
  let at = startMinutes;
  for (let i = 1; i <= values.count; i += 1) {
    if (at + values.period > 24 * 60 - 1) break; // 23:59 までに終わる分だけ
    times.push([at, at + values.period]);
    const isLong = values.longBreak > 0 && i === values.longBreakAfter;
    at += values.period + (isLong ? values.longBreak : values.break);
  }
  return times.length === 0 ? { error: 'noRoom' } : { times };
}

// 「名前・毎週の曜日かその日の日付・開始時刻・1 コマの長さ・休み・長い休み (昼休みなど) とその位置・コマ数」から、
// 新しいラウンドを 1 つ作る (ほかのラウンドはそのまま)。長い休みは longBreakAfter コマ目のあとの休みを、longBreakMinutes 分にする
// (0 分なら普通の休みのまま)。コマの名前は nameFor(1 から始まる番号) で付ける。日をまたぐコマは作らない (入りきる分だけ)。
// 正しくなければ { error: 'invalidTime' | 'outOfRange' | 'noRoom' | 'invalidWeekday' | 'invalidDate' | 'full' }
export function generateRound(input, rounds, nameFor) {
  const { times, error } = generateTimes(input);
  if (error) return { error };
  const made = makeRound({ title: input.title, weekday: input.weekday ?? null, date: input.date ?? null }, nextRoundId(rounds));
  if (made.error) return { error: made.error };
  const ids = komaIds(rounds, times.length);
  const komas = times.map(([s, e], i) => ({ id: ids[i], title: cleanTitle(nameFor(i + 1)), start: toTime(s), end: toTime(e), skips: [] }));
  const round = { ...made.round, komas };
  const next = addRound(rounds, round);
  return next ? { rounds: next, round } : { error: 'full' };
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

// from より後〜to までに来る知らせ (始まり・終わり・始まる minutes 分前) を、先にまとめて
// (スマホ版は、画面を消している間も届くように、これを OS に預ける)。[{ item, kind: 'start' | 'end' | 'reminder', at }]。
// 時刻の順で、同じ時刻なら終わり → 始まり → 前の知らせ (planTriggers と同じ)
export function upcomingNotices(rounds, events, from, to, minutes) {
  if (to <= from) return [];
  const before = minutes * 60 * 1000;
  const result = [];
  // 前の知らせは、始まりより前に来るので、to の minutes 分あとに始まる予定まで見る
  for (const key of dateKeysBetween(from, to + before)) {
    for (const item of dayPlan(rounds, events, key)) {
      const times = [['end', item.endAt], ['start', item.startAt]];
      if (minutes) times.push(['reminder', item.startAt - before]);
      for (const [kind, at] of times) {
        if (at > from && at <= to) result.push({ item, kind, at });
      }
    }
  }
  const order = { end: 0, start: 1, reminder: 2 };
  return result.sort((a, b) => a.at - b.at || order[a.kind] - order[b.kind]);
}

// 「まとめて作る」で最後に使った値を、保存データから読み戻す (次に開いたときの初めの値にする)。
// おかしな値や、まだ一度も作っていないときは、その項目を GENERATE_DEFAULTS にする
export function parseGenerateOptions(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const inRange = (value, [min, max], fallback) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
  };
  return {
    start: minutesOf(input.start) === null ? GENERATE_DEFAULTS.start : input.start,
    period: inRange(input.period, GENERATE_RANGES.period, GENERATE_DEFAULTS.period),
    breakMinutes: inRange(input.breakMinutes, GENERATE_RANGES.break, GENERATE_DEFAULTS.breakMinutes),
    longBreakMinutes: inRange(input.longBreakMinutes, GENERATE_RANGES.longBreak, GENERATE_DEFAULTS.longBreakMinutes),
    longBreakAfter: inRange(input.longBreakAfter, GENERATE_RANGES.longBreakAfter, GENERATE_DEFAULTS.longBreakAfter),
    count: inRange(input.count, GENERATE_RANGES.count, GENERATE_DEFAULTS.count),
  };
}
