// レンダラープロセス: 画面の表示とボタン操作を担当する (ブラウザと同じ環境)
import { DEFAULT_SETTINGS, createState, durationMs, start, pause, reset, tick, skip, formatTime } from './timer.js';
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

let settings = { ...DEFAULT_SETTINGS, ...load('settings', {}) };
let stats = load('stats', null);
let state = createState(settings);

// --- 終了時の音 (Web Audio API で音を合成するので音声ファイルが不要) ---
function playChime() {
  const ctx = new AudioContext();
  [0, 0.25, 0.5].forEach((offset, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = i === 2 ? 1046.5 : 784; // ソ, ソ, ド
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + offset);
    osc.stop(ctx.currentTime + offset + 0.45);
  });
  setTimeout(() => ctx.close(), 1500);
}

function notify(finishedMode) {
  const body = finishedMode === 'work'
    ? `お疲れさまです! 次は${MODE_LABEL[state.mode]}です。`
    : '休憩終了。次の作業を始めましょう。';
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
    playChime();
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
for (const [key, value] of Object.entries(settings)) {
  els.form.elements[key].value = value;
}
els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(els.form));
  settings = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Number(v)]));
  save('settings', settings);
  // 実行中でなければ、新しい時間を今のモードにすぐ反映する
  if (!state.running) state = reset(state, settings);
  render();
});

// 表示更新は 0.25 秒ごと。残り時間は終了予定時刻から計算するので、間隔がズレても誤差は出ない
setInterval(update, 250);
render();
