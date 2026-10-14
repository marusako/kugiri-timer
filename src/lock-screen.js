// スマホ版で、ロック画面に出すタイマーの区切り (画面にも Capacitor にも依存しない純粋な関数)。
// 画面を消している間は画面の処理が止まるので、区切り (いつまで何をするか) の並びを先に Android に渡しておき、
// 終わる時刻が来たら Android が次の区切りに切り替える (mobile/LockScreen.java)
import { roundStatus } from './round-timer.js';
import { timerNoticePlan } from './mobile-notice.js';
import { durationMs } from './timer.js';

// 今から count 個までの区切り。
// - ラウンドの間は、ラウンドの作業・休憩 ({ round, phase, koma, endAt }。カードと同じく、通常のタイマーより先に見せる)
// - そうでなく通常のタイマーが動いていれば、今とそのあとのセッション ({ mode, endAt })
// - どちらでもなければ []
export function timerSegments(state, settings, rounds, now, count) {
  const segments = [];
  for (let status = roundStatus(rounds, now); status && segments.length < count; status = roundStatus(rounds, status.endAt)) {
    segments.push({ round: status.round, phase: status.phase, koma: status.koma, endAt: status.endAt });
  }
  if (segments.length > 0 || !state.running) return segments;
  // 終わりの通知の計画 (mobile-notice.js) と同じ並び。それぞれのセッションが、終わる時刻まで続く
  return timerNoticePlan(state, settings, count).map((end) => ({ mode: end.mode, endAt: end.at }));
}

// 止まっている通常のタイマーの様子 ({ mode, remainingMs, paused: 途中で止めたか })。動いていれば null。
// 区切りがないときに、ロック画面の曲名の下に出す
export function idleTimer(state, settings) {
  if (state.running) return null;
  return { mode: state.mode, remainingMs: state.remainingMs, paused: state.remainingMs < durationMs(state.mode, settings) };
}
