// スマホ版のスワイプの決まりごと (画面にも Capacitor にも依存しない純粋な関数)。
// - 上へのスワイプで、再生中の画面やキューを開く。下へのスワイプで閉じる
// - 画面の下の端から始めたスワイプは、Android の「ホームに戻る」の操作なので、アプリでは使わない
//   (前に全画面だったときは、この操作で再生バーが開いてしまった)

// これだけ動いたらスワイプ。短いものはタップとして扱う (px)
export const SWIPE_DISTANCE = 40;
// 下の帯の上に足す、無視する余白 (px)。帯の高さが分からない端末でも、端の操作を拾わないように
export const GESTURE_MARGIN = 24;

// 指を置いた高さ startY から、離した高さ endY までの動き。'up' / 'down'、短ければ null
export function swipeDirection(startY, endY) {
  const dy = endY - startY;
  if (dy <= -SWIPE_DISTANCE) return 'up';
  if (dy >= SWIPE_DISTANCE) return 'down';
  return null;
}

// 指を置いた高さが、画面の下の端 (下の帯の高さ bottomInset + 余白) にあるか
export function inSystemGestureZone(startY, viewportHeight, bottomInset) {
  return startY > viewportHeight - bottomInset - GESTURE_MARGIN;
}
