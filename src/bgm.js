// BGM を流すかどうかの判断 (画面にも音声 API にも依存しない純粋関数)
//
// - 取り込んだ曲 (音楽): 再生バーの ▶ / ⏸ で決める (music)。タイマーの作業・休憩では変えない
// - ノイズ: いつでも ▶ / ⏸ で動かせるうえに、作業が始まったら流し、休憩が始まったら止める (noise.on)。
//   作業中にタイマーを止めた (一時停止・リセット) ときも止め、同じ作業を再開したら続きから流す

export const INITIAL_PLAYBACK = Object.freeze({
  music: false, // 取り込んだ曲を流しているか
  noise: Object.freeze({ on: false, resume: false }), // resume: 作業中にタイマーを止めたとき鳴っていたか (再開したら流す)
});

export function shouldPlayBgm(bgmId, playback) {
  const [kind] = bgmId.split(':');
  if (kind === 'import') return playback.music;
  if (kind === 'noise') return playback.noise.on;
  return false;
}

const isFocusRunning = (state) => state.mode === 'work' && state.running;

// タイマーの状態が prev から next に変わったときの、ノイズの状態。
// fullMs は作業 1 回分の長さ (始めたばかりの作業か、途中からの再開かを見分ける)
export function nextNoise(noise, prev, next, fullMs) {
  // 休憩が始まったら止める
  if (next.mode !== 'work' && prev.mode !== next.mode) return { on: false, resume: false };
  if (isFocusRunning(next) && !isFocusRunning(prev)) {
    // 休憩から作業に切り替わった・まだ始めていない作業を始めた → 作業の始まりなので流す
    const focusStarts = prev.mode !== 'work' || prev.remainingMs >= fullMs;
    return { on: focusStarts || noise.resume, resume: false };
  }
  // 作業中にタイマーを止めた → 止めて、鳴っていたかを覚えておく
  if (isFocusRunning(prev) && !isFocusRunning(next) && next.mode === 'work') {
    return { on: false, resume: noise.on };
  }
  return noise;
}

// 再生バーの ▶ / ⏸ (いつでも切り替えられる)。手で決めたので、再開したときの予定は消す
export function toggleNoise(noise) {
  return { on: !noise.on, resume: false };
}
