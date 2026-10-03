// 音の再生 (画面側)。アラーム・SE は Web Audio API でその場で音を作り、
// BGM はノイズ (noise.js で生成) か、取り込んだ音声ファイルをループ再生する。
import { generateNoise } from './noise.js';

const NOISE_SECONDS = 10; // ノイズはこの長さを作ってループする
const FADE_SECONDS = 0.4; // BGM の出だしと止めるときに、急に鳴る・切れるのを防ぐ

let audioContext = null;

// AudioContext は 1 つを使い回す (鳴らすたびに作ると、端末の音声の資源を消費し続ける)
function context() {
  audioContext ??= new AudioContext();
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

function level(volume, max) {
  return max * (Math.min(100, Math.max(0, volume)) / 100);
}

// セッション終了のチャイム (ソ, ソ, ド)
export function playAlarm(volume) {
  if (volume <= 0) return;
  const ctx = context();
  const peak = level(volume, 0.3);
  [0, 0.25, 0.5].forEach((offset, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const at = ctx.currentTime + offset;
    osc.frequency.value = i === 2 ? 1046.5 : 784;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.45);
  });
}

// ボタンを押したときの「ポンッ」という丸くやわらかい音。
// 正弦波 (角のない音) の音程を短い時間ですっと下げ、出だしを一瞬だけゆるやかにして「プツッ」という雑音を防ぐ
export function playClick(volume) {
  if (volume <= 0) return;
  const ctx = context();
  const at = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(660, at);
  osc.frequency.exponentialRampToValueAtTime(330, at + 0.08);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level(volume, 0.35), at + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.13);
}

// BGM の再生。source は 'none' / 'noise:<種類>' / 'import:<保存名>'。
// resolveUrl は取り込んだファイルの保存名から読み込み用の URL を作る関数。
// createAudio は再生の部品 (Audio) を作る関数で、テストでは偽物に差し替える。
// 取り込んだ曲は、止めても部品と再生位置を残し、再開したら続きから再生する (手放すのは曲を変えたときだけ)
export class BgmPlayer {
  #resolveUrl;
  #createAudio;
  #source = 'none';
  #volume = 0;
  #playing = false;
  #noiseBuffers = new Map();
  #noiseNode = null;
  #gain = null;
  #element = null;
  #previewTimer = null;

  constructor(resolveUrl, { createAudio = (url) => new Audio(url) } = {}) {
    this.#resolveUrl = resolveUrl;
    this.#createAudio = createAudio;
  }

  setVolume(volume) {
    this.#volume = volume;
    if (this.#gain) this.#gain.gain.setTargetAtTime(level(volume, 0.5), context().currentTime, 0.05);
    if (this.#element) this.#element.volume = level(volume, 1);
  }

  setSource(source) {
    if (source === this.#source) return;
    const wasPlaying = this.#playing;
    this.#stop(false);
    this.#releaseFile();
    this.#source = source;
    if (wasPlaying) this.#start();
  }

  // shouldPlay が変わったときだけ再生・停止する (毎回呼ばれても問題ない)
  sync(shouldPlay) {
    if (this.#previewTimer) return; // 試聴中はタイマーの状態で止めない
    if (shouldPlay && !this.#playing) this.#start();
    if (!shouldPlay && this.#playing) this.#stop(true);
  }

  // 設定画面の「Test」用。数秒だけ鳴らして止める
  preview(milliseconds = 3000) {
    clearTimeout(this.#previewTimer);
    if (!this.#playing) this.#start();
    this.#previewTimer = setTimeout(() => {
      this.#previewTimer = null;
      this.#stop(true);
    }, milliseconds);
  }

  #start() {
    const [kind, value] = this.#source.split(':');
    if (kind === 'noise') this.#startNoise(value);
    else if (kind === 'import') this.#startFile(value);
    else return;
    this.#playing = true;
  }

  #startNoise(type) {
    const ctx = context();
    if (!this.#noiseBuffers.has(type)) {
      const samples = generateNoise(type, ctx.sampleRate * NOISE_SECONDS);
      const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.copyToChannel(samples, 0);
      this.#noiseBuffers.set(type, buffer);
    }
    this.#noiseNode = ctx.createBufferSource();
    this.#noiseNode.buffer = this.#noiseBuffers.get(type);
    this.#noiseNode.loop = true;
    this.#gain = ctx.createGain();
    this.#gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.#gain.gain.linearRampToValueAtTime(level(this.#volume, 0.5), ctx.currentTime + FADE_SECONDS);
    this.#noiseNode.connect(this.#gain).connect(ctx.destination);
    this.#noiseNode.start();
  }

  #startFile(storedName) {
    // 一時停止していた部品が残っていれば、それを使って止めた位置から続ける
    if (!this.#element) {
      this.#element = this.#createAudio(this.#resolveUrl(storedName));
      this.#element.loop = true;
    }
    this.#element.volume = level(this.#volume, 1);
    this.#element.play().catch((error) => console.error('[bgm] play failed', error));
  }

  // 曲を変えたときに、前の曲の部品と読み込み中のファイルを手放す
  #releaseFile() {
    if (!this.#element) return;
    this.#element.pause();
    this.#element.removeAttribute('src');
    this.#element.load();
    this.#element = null;
  }

  #stop(fade) {
    clearTimeout(this.#previewTimer);
    this.#previewTimer = null;
    if (this.#noiseNode) {
      const node = this.#noiseNode;
      const ctx = context();
      const end = ctx.currentTime + (fade ? FADE_SECONDS : 0.01);
      this.#gain.gain.cancelScheduledValues(ctx.currentTime);
      this.#gain.gain.setValueAtTime(this.#gain.gain.value, ctx.currentTime);
      this.#gain.gain.linearRampToValueAtTime(0.0001, end);
      node.stop(end + 0.05);
      this.#noiseNode = null;
      this.#gain = null;
    }
    // 取り込んだ曲は一時停止だけにして、再生位置を残す
    if (this.#element) this.#element.pause();
    this.#playing = false;
  }
}
