// 効果音 (ボタンの操作音) の楽譜。音の形は alarms.js と同じで、次の 2 つを足せる:
//   freqEnd: 鳴っている間に移る周波数 (Hz)  glide: freqEnd まで何秒かけて移るか
// ボタンを続けて押しても濁らないよう、どれも 0.3 秒より短く、すぐ消える音にする

export const SE_SOUNDS = Object.freeze(['pop', 'click', 'wood', 'soft']);
export const DEFAULT_SE = 'pop';

const SCORES = {
  // ポンッ (以前の版からの音)。角のない正弦波の高さをすっと下げる
  pop: [{ at: 0, freq: 660, freqEnd: 330, glide: 0.08, wave: 'sine', attack: 0.005, duration: 0.12, gain: 1 }],
  // カチッ。高めの角ばった音 (矩形波) と、少し低い三角波をごく短く重ねて、スイッチのような硬さを出す
  click: [
    { at: 0, freq: 1800, wave: 'square', attack: 0.001, duration: 0.025, gain: 0.35 },
    { at: 0, freq: 900, wave: 'triangle', attack: 0.001, duration: 0.04, gain: 0.4 },
  ],
  // コッ (ウッドブロック)。少しだけ下がる音に、木らしい高い響きを一瞬だけ混ぜる
  wood: [
    { at: 0, freq: 950, freqEnd: 820, glide: 0.03, wave: 'sine', attack: 0.002, duration: 0.09, gain: 0.65 },
    { at: 0, freq: 2560, wave: 'sine', attack: 0.002, duration: 0.035, gain: 0.3 },
  ],
  // トン。低く短い音で、いちばん控えめ
  soft: [{ at: 0, freq: 220, freqEnd: 170, glide: 0.1, wave: 'sine', attack: 0.012, duration: 0.16, gain: 1 }],
};

// 知らない名前のときは、以前の版と同じ Pop にする
export function seNotes(id) {
  return SCORES[Object.hasOwn(SCORES, id) ? id : DEFAULT_SE];
}
