// スマホ版 (Capacitor) で、タイマーの終わりの通知を予約する決まりごと (画面にも Electron にも依存しない純粋な関数)。
// スマホでは、アプリが裏にある間や画面を消している間は画面の処理が止まるので、終わる時刻の通知を OS に預けておく。
// scheduled は今予約している通知 ({ id, at: 終わる時刻 (ミリ秒), mode }。なければ null)

// 次にすること: { cancel: 取り消す通知の ID か null, schedule: 新しく予約する { at, mode } か null }。変えないときは null。
// 取り消すのは、まだ時刻が来ていない予約だけ。時刻が来て次のセッションに進んだときは、前の通知を消さずに次を予約する
// (出ている・出かけている通知を消さないように。予約は毎回別の ID にする)
export function nextTimerNotice(state, scheduled, now) {
  const pending = scheduled && scheduled.at > now ? scheduled.id : null;
  if (!state.running) return scheduled ? { cancel: pending, schedule: null } : null;
  if (scheduled && scheduled.at === state.endAt && scheduled.mode === state.mode) return null;
  return { cancel: pending, schedule: { at: state.endAt, mode: state.mode } };
}
