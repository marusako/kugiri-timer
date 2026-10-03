// レンダラープロセス: 画面の表示とボタン操作を担当する (ブラウザと同じ環境)
import { createState, durationMs, start, pause, reset, tick, skip, formatTime } from './timer.js';
import { parseSettings } from './settings.js';
import { addCompletion, todayCount } from './stats.js';

const MODE_LABEL = { work: '作業', shortBreak: '短い休憩', longBreak: '長い休憩' };
const CIRCUMFERENCE = 2 * Math.PI * 90;

const $ = (id) => document.getElementById(id);
const els = {
  time: $('time'),
  label: $('label'),
  progress: $('progress'),
  toggle: $('toggle'),
  reset: $('reset'),
  skip: $('skip'),
  today: $('today'),
  cycle: $('cycle'),
  interval: $('interval'),
  form: $('settings-form'),
  volumeValue: $('volume-value'),
  preview: $('preview'),
};

// --- 保存 (localStorage: ブラウザ内にデータを文字列で保存する仕組み) ---
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback; // 壊れたデータが入っていても起動できるようにする
  }
}
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// 古い形式や壊れた値が保存されていても、parseSettings が既定値で補って範囲内に収める
let settings = parseSettings(load('settings', {}));
let stats = load('stats', null);
let state = createState(settings);

// --- 終了時の音 (Web Audio API で音を合成するので音声ファイルが不要) ---
function playChime(volume) {
  if (volume <= 0) return; // 0 は消音
  const peak = 0.3 * (volume / 100);
  const ctx = new AudioContext();
  [0, 0.25, 0.5].forEach((offset, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = i === 2 ? 1046.5 : 784; // ソ, ソ, ド
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
    gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + offset);
    osc.stop(ctx.currentTime + offset + 0.45);
  });
  setTimeout(() => ctx.close(), 1500);
}

function notify(finishedMode) {
  const next = MODE_LABEL[state.mode];
  let body;
  if (state.running) {
    body = `${next}を自動で開始しました。`;
  } else if (finishedMode === 'work') {
    body = `お疲れさまです! 次は${next}です。`;
  } else {
    body = '休憩終了。次の作業を始めましょう。';
  }
  new Notification(`${MODE_LABEL[finishedMode]}が終わりました`, { body, silent: true });
}

// --- 画面の更新 ---
function render() {
  const time = formatTime(state.remainingMs);
  els.time.textContent = time;
  els.label.textContent = MODE_LABEL[state.mode];
  els.toggle.textContent = state.running ? '一時停止' : 'スタート';
  document.body.dataset.mode = state.mode;
  document.title = `${time} - ${MODE_LABEL[state.mode]}`;

  for (const tab of document.querySelectorAll('[data-mode-tab]')) {
    tab.classList.toggle('active', tab.dataset.modeTab === state.mode);
  }

  // 実行中に設定を短く変えると 1 を超えうるので 0〜1 に収める
  const ratio = Math.min(1, Math.max(0, state.remainingMs / durationMs(state.mode, settings)));
  els.progress.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - ratio));

  els.today.textContent = String(todayCount(stats, new Date()));
  els.cycle.textContent = String(state.completedWork % settings.longBreakInterval);
  els.interval.textContent = String(settings.longBreakInterval);
}

function update() {
  const result = tick(state, Date.now(), settings);
  state = result.state;
  if (result.finished) {
    if (result.finishedMode === 'work') {
      stats = addCompletion(stats, new Date());
      save('stats', stats);
    }
    playChime(settings.volume);
    notify(result.finishedMode);
  }
  render();
}

// --- 操作 ---
els.toggle.addEventListener('click', () => {
  state = state.running ? pause(state, Date.now()) : start(state, Date.now());
  render();
});
els.reset.addEventListener('click', () => {
  state = reset(state, settings);
  render();
});
els.skip.addEventListener('click', () => {
  state = skip(state, settings);
  render();
});

// キーボード: Space で開始/停止 (入力欄にいるときは除く)
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
    e.preventDefault();
    els.toggle.click();
  }
});

// --- 設定フォーム ---
function fillForm() {
  for (const [key, value] of Object.entries(settings)) {
    const input = els.form.elements[key];
    if (input.type === 'checkbox') input.checked = value;
    else input.value = value;
  }
  showVolume();
}

function showVolume() {
  const volume = Number(els.form.elements.volume.value);
  els.volumeValue.textContent = volume === 0 ? '消音' : String(volume);
}

els.form.elements.volume.addEventListener('input', showVolume);
// 試聴は保存前のスライダーの値で鳴らす
els.preview.addEventListener('click', () => playChime(Number(els.form.elements.volume.value)));

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  settings = parseSettings(Object.fromEntries(new FormData(els.form)));
  save('settings', settings);
  fillForm(); // 範囲外の値を補正した結果をフォームにも反映する
  // 実行中でなければ、新しい時間を今のモードにすぐ反映する
  if (!state.running) state = reset(state, settings);
  render();
});

// 表示更新は 0.25 秒ごと。残り時間は終了予定時刻から計算するので、間隔がズレても誤差は出ない
setInterval(update, 250);
fillForm();
render();
