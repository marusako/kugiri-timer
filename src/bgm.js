// BGM を流すかどうかの判断 (画面にも音声 API にも依存しない純粋関数)

// 作業中でタイマーが動いているときだけ流す。休憩中・一時停止中は止める。
// userPaused は再生バーの ⏸ で止めているか (止めている間は、作業中でも流さない)
export function shouldPlayBgm(state, bgmId, userPaused = false) {
  return bgmId !== 'none' && !userPaused && state.mode === 'work' && state.running;
}
