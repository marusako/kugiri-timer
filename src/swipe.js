// スマホ版のスワイプの決まりごと (画面にも Capacitor にも依存しない純粋な関数)。
// - スワイプは、カレンダーの引き出しを下へ払って閉じるのに使う (再生中の画面とキューは、指について動かす。sheet-drag.js)
// - 画面の下の端から始めたスワイプは、Android の「ホームに戻る」の操作なので、アプリでは使わない
//   (前に全画面だったときは、この操作で再生バーが開いてしまった)

// これだけ動いたらスワイプ。短いものはタップとして扱う (px)
export const SWIPE_DISTANCE = 40;
// 帯の高さが分からない (0) か細い端末で、少なくとも無視する下の端の高さ (px)
export const GESTURE_MARGIN = 24;

// 指を置いた高さ startY から、離した高さ endY までの動き。'up' / 'down'、短ければ null
export function swipeDirection(startY, endY) {
  const dy = endY - startY;
  if (dy <= -SWIPE_DISTANCE) return 'up';
  if (dy >= SWIPE_DISTANCE) return 'down';
  return null;
}

// 指を置いた高さが、画面の下の端 (下の帯の高さ bottomInset。GESTURE_MARGIN より細ければ GESTURE_MARGIN) にあるか。
// 再生バーやキューのつまみは、帯の上に持ち上げてあるので (style.css の --nav-lift)、この範囲にかからない
export function inSystemGestureZone(startY, viewportHeight, bottomInset) {
  return startY > viewportHeight - Math.max(bottomInset, GESTURE_MARGIN);
}
