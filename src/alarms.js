// アラーム (セッション終了の音) の楽譜。音の鳴らし方は sound.js が受け持ち、ここは「どの音を・いつ・どう鳴らすか」のデータだけを持つ。
// 1 つの音 (note) は次の形:
//   at: 鳴らし始める時刻 (秒)  freq: 周波数 (Hz)  wave: 波形
//   attack: 最大の大きさになるまでの時間 (秒)  duration: 鳴り終わるまでの時間 (秒)
//   gain: 最大の大きさ (0〜1。重なった音を足しても 1 を超えないようにする)

export const ALARM_SOUNDS = Object.freeze(['chime', 'bell', 'digital', 'marimba']);
export const DEFAULT_ALARM = 'chime';

// 鐘の音は、基本の高さに「整数倍からずれた高さ」の音を重ねると金属らしく聞こえる。高い音ほど早く消える
function bellStrike(at, freq) {
  return [
    { at, freq, wave: 'sine', attack: 0.005, duration: 1.8, gain: 0.5 },
    { at, freq: freq * 2, wave: 'sine', attack: 0.005, duration: 0.9, gain: 0.22 },
    { at, freq: freq * 2.76, wave: 'sine', attack: 0.005, duration: 0.6, gain: 0.12 },
    { at, freq: freq * 5.4, wave: 'sine', attack: 0.005, duration: 0.4, gain: 0.06 },
  ];
}

// マリンバは、たたいた瞬間だけ 4 倍の高さの音が混ざり、すぐ消えて丸い音が残る
function marimbaNote(at, freq) {
  return [
    { at, freq, wave: 'sine', attack: 0.005, duration: 0.6, gain: 0.6 },
    { at, freq: freq * 4, wave: 'sine', attack: 0.005, duration: 0.12, gain: 0.15 },
  ];
}

// キッチンタイマーのような短い電子音。矩形波 (square) は角ばった波形で、よく通るが耳に強いので小さめにする
function beep(at) {
  return { at, freq: 1568, wave: 'square', attack: 0.005, duration: 0.09, gain: 0.35 };
}

const SCORES = {
  // ソ, ソ, ド (以前の版からのチャイム)
  chime: [0, 0.25, 0.5].map((at, i) => ({
    at, freq: i === 2 ? 1046.5 : 784, wave: 'sine', attack: 0.02, duration: 0.4, gain: 1,
  })),
  // ミ → ド の 2 回、余韻を残して鳴らす
  bell: [...bellStrike(0, 659.25), ...bellStrike(0.6, 523.25)],
  // ピピピッ を 2 回
  digital: [0, 0.1, 0.2, 0.5, 0.6, 0.7].map(beep),
  // ド → ミ → ソ と上がる
  marimba: [...marimbaNote(0, 523.25), ...marimbaNote(0.15, 659.25), ...marimbaNote(0.3, 783.99)],
};

// 知らない名前のときは、以前の版と同じチャイムにする
export function alarmNotes(id) {
  return SCORES[Object.hasOwn(SCORES, id) ? id : DEFAULT_ALARM];
}
