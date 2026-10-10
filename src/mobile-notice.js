// スマホ版 (Capacitor) で、タイマーの終わりの通知を予約する決まりごと (画面にも Electron にも依存しない純粋な関数)。
// スマホでは、アプリが裏にある間や画面を消している間は画面の処理が止まるので、終わる時刻の通知を OS に預けておく。
// scheduled は今予約している通知 ({ at: 終わる時刻 (ミリ秒), mode }。なければ null)

// 次にすること: { kind: 'schedule', at, mode } (予約・予約し直し) / { kind: 'cancel' } (取り消し) / null (変えない)
export function nextTimerNotice(state, scheduled) {
  if (!state.running) return scheduled ? { kind: 'cancel' } : null;
  if (scheduled && scheduled.at === state.endAt && scheduled.mode === state.mode) return null;
  return { kind: 'schedule', at: state.endAt, mode: state.mode };
}
