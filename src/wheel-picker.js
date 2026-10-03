// iPhone のタイマーのような、スクロールして数値を選ぶ部品 (ホイールピッカー)。
// 位置と値の変換は純粋関数にしてテストし、DOM を作る部分は createWheelPicker にまとめる。

const ITEM_HEIGHT = 32; // 1 項目の高さ (px)。CSS の --item-height にも渡す
const VISIBLE_ITEMS = 5; // 見える項目の数 (奇数にして、真ん中を選択中にする)
const WHEEL_STEP_DELTA = 50; // タッチパッドの細かいスクロールを、どれだけためたら 1 つ動かすか

export function valueAtScroll(scrollTop, itemHeight, min, max) {
  const value = min + Math.round(scrollTop / itemHeight);
  return Math.min(max, Math.max(min, value));
}

export function scrollForValue(value, itemHeight, min) {
  return (value - min) * itemHeight;
}

export function createWheelPicker({ min, max, value, label, onChange }) {
  const root = document.createElement('div');
  root.className = 'wheel';
  root.tabIndex = 0;
  root.setAttribute('role', 'spinbutton');
  root.setAttribute('aria-label', label);
  root.setAttribute('aria-valuemin', String(min));
  root.setAttribute('aria-valuemax', String(max));
  root.style.setProperty('--item-height', `${ITEM_HEIGHT}px`);
  root.style.setProperty('--visible-items', String(VISIBLE_ITEMS));

  const list = document.createElement('div');
  list.className = 'wheel-list';
  const items = [];
  for (let v = min; v <= max; v += 1) {
    const item = document.createElement('div');
    item.className = 'wheel-item';
    item.textContent = String(v);
    item.addEventListener('click', () => stepTo(v));
    items.push(item);
    list.append(item);
  }
  root.append(list);

  // committed: 確定している値 (onChange で知らせた値)。target: ホイールやキー操作で向かっている値
  let committed = value;
  let target = value;
  let wheelDelta = 0;

  function clamp(v) {
    return Math.min(max, Math.max(min, v));
  }

  function scrollToValue(v, smooth) {
    target = clamp(v);
    // OS で「アニメーションを減らす」が有効なら、なめらかなスクロールを使わない
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior = smooth && !reduceMotion ? 'smooth' : 'instant';
    list.scrollTo({ top: scrollForValue(target, ITEM_HEIGHT, min), behavior });
  }

  function commit(v) {
    if (v === committed) return;
    committed = v;
    onChange(v);
  }

  // ホイールやキー、項目のクリックでは行き先が分かっているので、スクロールの完了を待たずにすぐ確定する
  // (スクロールは見た目のためだけに使う)
  function stepTo(v) {
    scrollToValue(v, true);
    commit(target);
  }

  function highlight() {
    const current = valueAtScroll(list.scrollTop, ITEM_HEIGHT, min, max);
    items.forEach((item, i) => item.classList.toggle('selected', min + i === current));
    root.setAttribute('aria-valuenow', String(current));
  }

  list.addEventListener('scroll', highlight);
  // 指やタッチパッドでドラッグしたときは行き先が分からないので、スクロールが止まったところで確定する
  list.addEventListener('scrollend', () => {
    target = valueAtScroll(list.scrollTop, ITEM_HEIGHT, min, max);
    commit(target);
  });

  // マウスのホイールは 1 目盛りで約 100px 動き、項目が飛んでしまうので、1 目盛り = 1 項目にする
  list.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      wheelDelta += event.deltaY;
      if (Math.abs(wheelDelta) < WHEEL_STEP_DELTA && event.deltaMode === 0) return;
      stepTo(target + Math.sign(wheelDelta));
      wheelDelta = 0;
    },
    { passive: false },
  );

  root.addEventListener('keydown', (event) => {
    const step = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    stepTo(target + step);
  });

  return {
    element: root,
    // 外から値を変える (onChange は呼ばない)
    setValue(v) {
      committed = clamp(v);
      scrollToValue(committed, false);
      highlight();
    },
    // 閉じていた設定欄を開いたときなど、表示されてから位置を合わせ直す
    refresh() {
      scrollToValue(committed, false);
      highlight();
    },
  };
}
