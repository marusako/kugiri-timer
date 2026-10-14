// スマホ版で、下から出る板 (再生中の画面・キュー) を指について動かす決まりごと (画面にも Capacitor にも依存しない純粋な関数)。
// dy は指を置いた所からの動き (下へ +)、size は閉じてから開くまでの道のり (px)

// これより動いたら、指で動かしているとみなす (px)。短いものはタップとして扱う
export const DRAG_START = 8;
// これより速く払ったら、動いた距離が短くても払った向きに開け閉めする (px/ms)
export const FLING_SPEED = 0.5;
// 速く払わなかったときは、道のりのこの割合だけ動かしたら開け閉めする
const SETTLE_RATIO = 1 / 3;
// 離したときの速さは、最後のこの時間の動きから求める (ms)
const VELOCITY_WINDOW = 100;

// 動かしている間の開き具合 (0 = 閉じている 〜 1 = 開いている)
export function dragProgress(wasOpen, dy, size) {
  return Math.min(1, Math.max(0, (wasOpen ? 1 : 0) - dy / size));
}

// 離したとき、開いた状態にするか。velocity は離したときの速さ (px/ms。下へ +)
export function settleOpen(wasOpen, dy, velocity, size) {
  if (velocity <= -FLING_SPEED) return true;
  if (velocity >= FLING_SPEED) return false;
  const threshold = size * SETTLE_RATIO;
  return wasOpen ? dy < threshold : -dy >= threshold;
}

// 指の動きの記録 samples ([{ y, t }]。古い順) から、離した時刻 now の速さ (px/ms。下へ +)。止めてから離したら 0
export function releaseVelocity(samples, now) {
  const recent = samples.filter((s) => now - s.t <= VELOCITY_WINDOW);
  if (recent.length < 2) return 0;
  const first = recent[0];
  const last = recent[recent.length - 1];
  return last.t === first.t ? 0 : (last.y - first.y) / (last.t - first.t);
}
