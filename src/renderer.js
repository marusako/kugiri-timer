// レンダラープロセス: 画面の表示とボタン操作を担当する (ブラウザと同じ環境)
import { createState, durationMs, start, pause, reset, tick, skip, applySettings, formatTime } from './timer.js';
import { RANGES, parseSettings } from './settings.js';
import { addCompletion, todayCount } from './stats.js';
import { INITIAL_UPDATE_STATE, nextUpdateState, isBannerVisible } from './update-status.js';
import { createWheelPicker } from './wheel-picker.js';

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
  settings: $('settings'),
  volume: $('volume'),
  volumeValue: $('volume-value'),
  preview: $('preview'),
  appVersion: $('app-version'),
  updateBanner: $('update-banner'),
  updateText: $('update-text'),
  updateProgress: $('update-progress'),
  updateAction: $('update-action'),
  updateLater: $('update-later'),
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

// 終わると次のモードが自動で始まっているので、何が始まったかを知らせる
function notify(finishedMode) {
  const started = `${MODE_LABEL[state.mode]}を開始しました。`;
  const body = finishedMode === 'work' ? `お疲れさまです! ${started}` : started;
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
  state = skip(state, settings, Date.now());
  render();
});

// キーボード: Space で開始/停止 (入力欄にいるときは除く)
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
    e.preventDefault();
    els.toggle.click();
  }
});

// --- 設定 (変更はすぐに反映・保存する) ---
function updateSettings(patch) {
  const next = parseSettings({ ...settings, ...patch });
  // 始めたセッションの進み具合は消さず、まだ始めていないセッションだけ新しい時間にする
  state = applySettings(state, settings, next);
  settings = next;
  save('settings', settings);
  applyTheme();
  render();
}

function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
}

const wheels = [...document.querySelectorAll('[data-setting]')].map((column) => {
  const key = column.dataset.setting;
  const [min, max] = RANGES[key];
  const picker = createWheelPicker({
    min,
    max,
    value: settings[key],
    label: column.dataset.label,
    onChange: (value) => updateSettings({ [key]: value }),
  });
  // タイトルと単位の間にホイールを入れる
  column.insertBefore(picker.element, column.querySelector('.wheel-unit'));
  picker.setValue(settings[key]);
  return picker;
});
// 閉じた設定欄の中は描画されておらず、スクロール位置を合わせられないので、開いたときに合わせ直す
els.settings.addEventListener('toggle', () => {
  if (els.settings.open) wheels.forEach((picker) => picker.refresh());
});

function showVolume() {
  els.volumeValue.textContent = settings.volume === 0 ? '消音' : String(settings.volume);
}
els.volume.value = String(settings.volume);
els.volume.addEventListener('input', () => {
  updateSettings({ volume: els.volume.value });
  showVolume();
});
els.preview.addEventListener('click', () => playChime(settings.volume));
showVolume();

for (const radio of document.querySelectorAll('input[name="theme"]')) {
  radio.checked = radio.value === settings.theme;
  radio.addEventListener('change', () => updateSettings({ theme: radio.value }));
}
applyTheme();

// --- 自動アップデートの案内 ---
// window.updater は preload.cjs が用意する。ブラウザで直接開いたときなどは存在しないので、何もしない
const UPDATE_VIEW = {
  available: { text: (u) => `新しいバージョン ${u.version} があります`, action: '更新する', later: true },
  downloading: { text: (u) => `ダウンロード中… ${u.percent}%`, action: null, later: false },
  downloaded: { text: () => '更新の準備ができました', action: '再起動して更新', later: true },
  error: { text: () => '更新のダウンロードに失敗しました', action: '再試行', later: true },
};

let updateState = INITIAL_UPDATE_STATE;

function dispatchUpdate(event) {
  updateState = nextUpdateState(updateState, event);
  renderUpdate();
}

function renderUpdate() {
  const visible = isBannerVisible(updateState);
  els.updateBanner.hidden = !visible;
  if (!visible) return;
  const view = UPDATE_VIEW[updateState.phase];
  els.updateText.textContent = view.text(updateState);
  els.updateProgress.hidden = updateState.phase !== 'downloading';
  els.updateProgress.value = updateState.percent;
  els.updateAction.hidden = !view.action;
  els.updateAction.textContent = view.action ?? '';
  els.updateLater.hidden = !view.later;
}

if (window.updater) {
  window.updater.onEvent(dispatchUpdate);
  window.updater.getVersion().then((version) => {
    els.appVersion.textContent = `バージョン ${version}`;
    els.appVersion.hidden = false;
  });

  els.updateAction.addEventListener('click', () => {
    if (updateState.phase === 'downloaded') {
      // 再起動するとタイマーが止まるので、動いているときは確認する
      if (state.running && !confirm('再起動するとタイマーが止まります。今すぐ更新しますか?')) return;
      window.updater.install();
      return;
    }
    dispatchUpdate({ type: 'download-start' });
    // 失敗はメインプロセスからの error イベントでも届くが、念のためここでも受け取る
    window.updater.download().catch((error) => dispatchUpdate({ type: 'error', message: String(error) }));
  });
  els.updateLater.addEventListener('click', () => dispatchUpdate({ type: 'dismiss' }));
}

// 表示更新は 0.25 秒ごと。残り時間は終了予定時刻から計算するので、間隔がズレても誤差は出ない
setInterval(update, 250);
render();
