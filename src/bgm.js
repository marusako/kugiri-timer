// BGM を流すかどうかの判断 (画面にも音声 API にも依存しない純粋関数)

// 作業中でタイマーが動いているときだけ流す。休憩中・一時停止中は止める
export function shouldPlayBgm(state, bgmId) {
  return bgmId !== 'none' && state.mode === 'work' && state.running;
}
