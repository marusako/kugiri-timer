// スマホ版 (Capacitor) で、通知を OS に預ける決まりごと (画面にも Electron にも依存しない純粋な関数)。
// スマホでは、アプリが裏にある間や画面を消している間は画面の処理が止まるので、先の通知をまとめて OS に預けておく。
import { catchUp } from './timer.js';

// タイマーの終わりの通知を、何回先まで預けるか。開き直したときに追いつく回数 (catchUp の limit) も同じにする
export const TIMER_NOTICE_COUNT = 8;

// 動いているタイマーの、先の count 回分の終わり: [{ at: 終わる時刻, mode: 終わるモード, next: 次に始まるモード }]。止まっていれば []
export function timerNoticePlan(state, settings, count) {
  if (!state.running) return [];
  // 「今」を無限の先にして、count 回分だけ進める
  return catchUp(state, Infinity, settings, count).map(({ at, finishedMode, state: next }) => (
    { at, mode: finishedMode, next: next.mode }
  ));
}

// 預けた通知 scheduled ([{ id, at, key }]) を、預けたい通知 wanted ([{ at, key, ... }]) にそろえる。key は通知の中身の見分け。
// { cancel: 取り消す ID, keep: そのまま残す予約, add: 新しく預ける wanted の項目 }。変えることがなければ null。
// 時刻が来た予約は、取り消さずに忘れる (出ている・出かけている通知を消さないように)。過ぎた時刻は預けない
export function reconcileNotices(scheduled, wanted, now) {
  const same = (a, b) => a.at === b.at && a.key === b.key;
  const pending = scheduled.filter((n) => n.at > now);
  const future = wanted.filter((w) => w.at > now);
  const keep = pending.filter((n) => future.some((w) => same(n, w)));
  const cancel = pending.filter((n) => !keep.includes(n)).map((n) => n.id);
  const add = future.filter((w) => !pending.some((n) => same(n, w)));
  if (cancel.length === 0 && add.length === 0 && keep.length === scheduled.length) return null;
  return { cancel, keep, add };
}
