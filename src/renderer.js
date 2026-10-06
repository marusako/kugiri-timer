// レンダラープロセス: 画面の表示とボタン操作を担当する (ブラウザと同じ環境)
import { createState, durationMs, start, pause, reset, tick, skip, applySettings, formatTime, prepareFocus } from './timer.js';
import {
  toDateKey, parseDateKey, monthDays, eventsOn, datesWithEvents, currentOrNextEvent, dueTriggers,
  makeEvent, nextEventId, addEvent, replaceEvent, removeEvent, parseEvents, MAX_EVENTS,
} from './calendar.js';
import {
  MAX_SLOTS, makeSlot, nextSlotId, addSlot, replaceSlot, removeSlot, slotsOn, parseTimetable,
  dayPlan, scheduleStatus, scheduleProgress, scheduleBoundaries, formatScheduleTime,
  copyDay, generateDay, replaceDay, REMINDER_MINUTES, scheduleReminders,
} from './schedule.js';
import { RANGES, parseSettings, effectiveVolume, resetSoundSettings } from './settings.js';
import { addCompletion, todayCount } from './stats.js';
import { INITIAL_UPDATE_STATE, nextUpdateState, isBannerVisible } from './update-status.js';
import { createWheelPicker } from './wheel-picker.js';
import { WALLPAPER_PRESETS } from './wallpapers.js';
import { mediaUrl } from './media-rules.js';
import { NOISE_TYPES } from './noise.js';
import { ALARM_SOUNDS } from './alarms.js';
import { SE_SOUNDS } from './se-sounds.js';
import { TIMER_FONTS, timerFont } from './fonts.js';
import { DEFAULT_PRESETS, MAX_CUSTOM_PRESETS, findMatchingPreset, addCustomPreset, removeCustomPreset, nextCustomNumber } from './presets.js';
import { escapeAction, backAction } from './fullscreen.js';
import { INITIAL_PLAYBACK, shouldPlayBgm, nextNoise, toggleNoise } from './bgm.js';
import {
  orderTracks, moveTrack, dropIndex, playQueue, nextInQueue, prevInQueue, prevAction, nextRepeatMode, formatTrackTime,
  ALL_TRACKS, MAX_PLAYLISTS, nextPlaylistNumber, addPlaylist, renamePlaylist, removePlaylist, setPlaylistTracks,
  toggleTrack, removeTrackEverywhere, playlistTracks,
} from './playlist.js';
import { BgmPlayer, playAlarm, playClick } from './sound.js';
import { LANGUAGES, translate, detectLanguage } from './i18n.js';

const CIRCUMFERENCE = 2 * Math.PI * 90;

const $ = (id) => document.getElementById(id);
const els = {
  wallpaper: $('wallpaper'),
  time: $('time'),
  label: $('label'),
  progress: $('progress'),
  toggle: $('toggle'),
  reset: $('reset'),
  skip: $('skip'),
  today: $('today'),
  cycle: $('cycle'),
  interval: $('interval'),
  openSettings: $('open-settings'),
  closeSettings: $('close-settings'),
  fullScreen: $('toggle-fullscreen'),
  cardOpacity: $('card-opacity'),
  cardOpacityOutput: document.querySelector('output[for="card-opacity"]'),
  cardOpacityHint: $('card-opacity-hint'),
  settings: $('settings'),
  alarmList: $('alarm-list'),
  seList: $('se-list'),
  bgmList: $('bgm-list'),
  wallpaperGrid: $('wallpaper-grid'),
  fontGrid: $('font-grid'),
  appVersion: $('app-version'),
  updateBanner: $('update-banner'),
  updateText: $('update-text'),
  updateProgress: $('update-progress'),
  updateAction: $('update-action'),
  updateLater: $('update-later'),
  language: $('language'),
  stats: $('stats'),
  showStats: $('show-stats'),
  nextEvent: $('next-event'),
  scheduleNext: $('schedule-next'),
  clock: $('clock'),
  calendar: $('calendar'),
  openCalendar: $('open-calendar'),
};
// 左上のモードの切り替え (タイマー / 時間割)
const appModeButtons = [...document.querySelectorAll('.app-mode [data-app-mode]')];

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
// 言語がまだ決まっていなければ (初回起動・以前の版から更新した直後)、Windows の言語から決めて保存する
if (settings.language === null) {
  settings = { ...settings, language: detectLanguage(navigator.language) };
  save('settings', settings);
}

// 画面の文字は、すべて翻訳表 (i18n.js) から選んでいる言語で取り出す
const t = (key, params) => translate(settings.language, key, params);
let stats = load('stats', null);
// カレンダーの予定 (calendar.js)。設定とは別に保存する
let events = parseEvents(load('events', []));
// 時間割 (schedule.js)。曜日ごとに毎週くり返すコマ
let timetable = parseTimetable(load('timetable', []));
let state = createState(settings);

// 取り込んだ壁紙・BGM の一覧 ({ file: 保存名, name: 元のファイル名 })。window.media がない環境では空のまま
const media = { wallpapers: [], bgm: [] };
const bgm = new BgmPlayer((storedName) => mediaUrl('bgm', storedName), { onEnded: playNextTrack });

// --- BGM の再生 (bgm.js の決まりごと) ---
// 曲は ▶ / ⏸ で決め (playback.music)、ノイズは作業の始まり・休憩の始まり・▶ / ⏸ で決める (playback.noise)。
// アプリを閉じると忘れ、起動したときはどちらも止まっている
let playback = INITIAL_PLAYBACK;
// ノイズを作業・休憩の切り替わりに合わせるため、前回の表示のときのタイマーの状態を覚えておく
let lastTimerState = state;
// シャッフルで決めた再生順。曲の増減やシャッフル・プレイリストの切り替えがあるまで同じ順を使う (毎回変えると「前へ」で戻れないため)
let shuffledQueue = null;

// 再生バー (メイン画面の下) の部品
const player = {
  root: $('player'),
  seek: $('player-seek'),
  prev: $('player-prev'),
  toggle: $('player-toggle'),
  next: $('player-next'),
  title: $('player-title'),
  time: $('player-time'),
  repeat: $('player-repeat'),
  shuffle: $('player-shuffle'),
  openVolume: $('player-open-volume'),
  openList: $('player-open-list'),
  volumePopup: $('player-volume-popup'),
  volume: $('player-volume'),
  volumeOutput: $('player-volume-output'),
  listPopup: $('player-list-popup'),
  list: $('playlist'),
  listHint: $('playlist-hint'),
};
// 開いている小窓 ('list' / 'volume' / null)
let openPopup = null;
// 再生位置のつまみをつかんでいる間は、0.25 秒ごとの表示更新でつまみを動かさない
let seekDragging = false;

function currentTrack() {
  const [kind, file] = settings.bgm.split(':');
  return kind === 'import' ? file : null;
}

// 選んでいるプレイリストの曲 (シャッフルしていても、一覧にはこの順で出す)
function playlistOrder() {
  return playlistTracks(media.bgm.map((entry) => entry.file), settings.bgmOrder, settings.bgmPlaylists, settings.bgmPlaylist);
}

// 選んでいるカスタムのプレイリスト (「全曲」なら null)
function customPlaylist() {
  return settings.bgmPlaylists.find((p) => p.id === settings.bgmPlaylist) ?? null;
}

// 再生バーの ▶ / ⏸ で、今選んでいるもの (曲かノイズ) を流す・止める
function setPlaying(playing) {
  if (currentTrack() !== null) playback = { ...playback, music: playing };
  else if (playback.noise.on !== playing) playback = { ...playback, noise: toggleNoise(playback.noise) };
  render();
}

function isBgmPlaying() {
  return shouldPlayBgm(settings.bgm, playback);
}

function bgmQueue() {
  const order = playlistOrder();
  if (!settings.bgmShuffle) {
    shuffledQueue = null;
    return order;
  }
  const sameTracks = shuffledQueue?.length === order.length && order.every((file) => shuffledQueue.includes(file));
  if (!sameTracks) shuffledQueue = playQueue(order, true, currentTrack());
  return shuffledQueue;
}

// 取り込んだ曲が最後まで終わったとき
function playNextTrack() {
  const current = currentTrack();
  if (!current) return;
  const next = nextInQueue(bgmQueue(), current, settings.bgmRepeat, { auto: true });
  if (next === current) {
    bgm.restart();
  } else if (next === null) {
    // リピート「オフ」で最後の曲が終わったら止める (▶ を押すまで流さない)
    setPlaying(false);
  } else {
    updateSettings({ bgm: `import:${next}` });
  }
}

// 終わると次のモードが自動で始まっているので、何が始まったかを知らせる
function notify(finishedMode) {
  const started = t('notifyStarted', { mode: t(`modeText.${state.mode}`) });
  const body = finishedMode === 'work' ? t('notifyWorkDone', { started }) : started;
  showNotification(t('notifyTitle', { mode: t(`modeText.${finishedMode}`) }), body);
}

// アプリではメインプロセスが出し、押されたらアプリを前に出す (最小化していれば元に戻す)。
// Electron の外 (ブラウザーで開いたとき) は、ブラウザーの通知を出す
function showNotification(title, body) {
  if (window.notifier) window.notifier.show(title, body);
  else new Notification(title, { body, silent: true });
}

// --- 画面の更新 ---
function render() {
  const now = Date.now();
  document.body.dataset.appMode = settings.appMode;
  for (const button of appModeButtons) button.setAttribute('aria-checked', String(button.dataset.appMode === settings.appMode));
  // 時間割モードでは、時刻・名前・円・色を時間割から決める。ノイズは「予定の最中 = 作業」として扱う
  const timerLike = settings.appMode === 'schedule' ? renderSchedule(now) : renderTimer();

  // 隠していても回数の記録は続け、表示を戻したら正しい回数を出す
  els.stats.hidden = !settings.showStats;
  els.today.textContent = String(todayCount(stats, new Date()));
  els.cycle.textContent = String(state.completedWork % settings.longBreakInterval);
  els.interval.textContent = String(settings.longBreakInterval);

  // 作業が始まった・休憩が始まった・作業中にタイマーを止めた、をノイズに反映する
  if (timerLike !== lastTimerState) {
    playback = { ...playback, noise: nextNoise(playback.noise, lastTimerState, timerLike, durationMs('work', settings)) };
    lastTimerState = timerLike;
  }
  bgm.sync(isBgmPlaying());
  renderPlayer();
  renderNextEvent(now);
}

// タイマーモードの表示 (残り時間・モード・円)。ノイズの判断に使うタイマーの状態を返す
function renderTimer() {
  const time = formatTime(state.remainingMs);
  els.time.textContent = time;
  els.label.textContent = t(`mode.${state.mode}`);
  els.toggle.textContent = state.running ? t('pause') : t('start');
  document.body.dataset.mode = state.mode;
  document.title = `${time} - ${t(`mode.${state.mode}`)}`;

  for (const tab of document.querySelectorAll('[data-mode-tab]')) {
    tab.classList.toggle('active', tab.dataset.modeTab === state.mode);
  }

  // 実行中に設定を短く変えると 1 を超えうるので 0〜1 に収める
  const ratio = Math.min(1, Math.max(0, state.remainingMs / durationMs(state.mode, settings)));
  els.progress.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - ratio));
  els.scheduleNext.hidden = true;
  els.clock.hidden = true;
  return state;
}

function update() {
  // 予定の知らせ: タイマーモードでは開始時刻にタイマーを準備し、時間割モードでは区切りごとにアラームを鳴らす
  if (settings.appMode === 'schedule') checkSchedule(Date.now());
  else checkEvents(Date.now());
  const result = tick(state, Date.now(), settings);
  state = result.state;
  if (result.finished) {
    if (result.finishedMode === 'work') {
      stats = addCompletion(stats, new Date());
      save('stats', stats);
    }
    playAlarm(effectiveVolume(settings, 'alarmVolume'), settings.alarmSound);
    notify(result.finishedMode);
  }
  render();
}

// --- 操作 ---
function onControl(button, action) {
  button.addEventListener('click', () => {
    playClick(effectiveVolume(settings, 'seVolume'), settings.seSound);
    action();
    render();
  });
}
onControl(els.toggle, () => {
  state = state.running ? pause(state, Date.now()) : start(state, Date.now());
});
onControl(els.reset, () => {
  state = reset(state, settings);
});
onControl(els.skip, () => {
  state = skip(state, settings, Date.now());
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const action = escapeAction({ settingsOpen: panelOpen(), popupOpen: openPopup !== null, fullScreen });
    if (action === 'closeSettings') closePanel();
    if (action === 'closePopup') {
      // 閉じた小窓を開いたボタンに戻る (キーボードで続けて操作できるように)
      const opener = openPopup === 'list' ? player.openList : player.openVolume;
      showPopup(null);
      opener.focus();
    }
    if (action === 'exitFullScreen') window.windowControls.exitFullScreen();
    return;
  }
  // Space で開始/停止 (設定・カレンダーを開いているときと、入力欄・選択欄・ボタンにいるときは除く)
  if (
    e.code === 'Space' &&
    !panelOpen() &&
    !(e.target instanceof HTMLInputElement) &&
    !(e.target instanceof HTMLSelectElement) &&
    !(e.target instanceof HTMLButtonElement)
  ) {
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
  applyAppearance();
  applyLanguage();
  bgm.setSource(settings.bgm);
  bgm.setVolume(effectiveVolume(settings, 'bgmVolume'));
  renderVolumes();
  renderChoices();
  renderUpdate();
  render();
}

let appVersion = null;

// HTML に書いた文字 (data-i18n / data-i18n-aria) を、選んでいる言語に差し替える
function applyLanguage() {
  // lang 属性は、読み上げソフトやフォントの選び方に使われる
  document.documentElement.lang = settings.language;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const column of document.querySelectorAll('[data-label-key]')) {
    column.querySelector('.wheel')?.setAttribute('aria-label', t(column.dataset.labelKey));
  }
  els.language.value = settings.language;
  renderFullScreen();
  if (appVersion) els.appVersion.textContent = t('version', { version: appVersion });
}

function applyAppearance() {
  document.documentElement.dataset.theme = settings.theme;
  // タイマーの数字のフォント (style.css の .time が使う)
  const font = timerFont(settings.timerFont);
  document.documentElement.style.setProperty('--timer-font', font.family);
  document.documentElement.style.setProperty('--timer-weight', String(font.weight));
  document.documentElement.style.setProperty('--timer-size', String(font.size));

  const [kind, value] = settings.wallpaper.split(':');
  const isPreset = kind === 'preset' && WALLPAPER_PRESETS.some((p) => p.id === value);
  const isImport = kind === 'import';
  els.wallpaper.className = 'wallpaper';
  els.wallpaper.style.removeProperty('--wallpaper-image');
  if (isPreset) els.wallpaper.classList.add(`wp-${value}`);
  if (isImport) {
    els.wallpaper.classList.add('wp-import');
    els.wallpaper.style.setProperty('--wallpaper-image', `url("${mediaUrl('wallpapers', value)}")`);
  }
  const hasWallpaper = isPreset || isImport;
  document.documentElement.classList.toggle('has-wallpaper', hasWallpaper);
  document.documentElement.style.setProperty('--card-opacity', String(settings.cardOpacity));
  // 壁紙がないときはカードが出ないので、不透明度は変えられないようにして、理由の一言を出す
  els.cardOpacity.disabled = !hasWallpaper;
  els.cardOpacityHint.hidden = hasWallpaper;
  els.cardOpacity.value = String(settings.cardOpacity);
  els.cardOpacityOutput.textContent = `${settings.cardOpacity}%`;
}

// --- 設定パネルの開閉とタブ ---
// 設定パネルの中のタブだけ (再生リストの小窓の「音楽 / BGM」のタブは別に扱う)
const tabs = [...els.settings.querySelectorAll('[role="tab"]')];

function selectTab(name) {
  for (const tab of tabs) {
    const selected = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute('aria-controls')).hidden = !selected;
  }
  // 閉じていたタブの中は描画されておらず、ホイールの位置を合わせられないので、表示したときに合わせ直す
  if (name === 'timer') wheels.forEach((picker) => picker.refresh());
}

function openSettings() {
  showPopup(null);
  els.calendar.hidden = true;
  els.settings.hidden = false;
  // 前に開いていたタブ。まだどれも選んでいなければ Timer
  selectTab(tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.dataset.tab ?? 'timer');
  tabs.find((tab) => tab.tabIndex === 0).focus();
}

function closeSettings() {
  els.settings.hidden = true;
  els.openSettings.focus();
}

els.openSettings.addEventListener('click', openSettings);

// 設定・カレンダーのどちらかが開いているか (Esc・戻る・Space で使う)。閉じるときは開いているほうを閉じる
function panelOpen() {
  return !els.settings.hidden || !els.calendar.hidden;
}

function closePanel() {
  if (!els.calendar.hidden) closeCalendar();
  else closeSettings();
}

// --- 全画面表示 (F11 はメインプロセスが受け取り、切り替わったら onChange で知らせてくる) ---
let fullScreen = false;

function renderFullScreen() {
  els.fullScreen.dataset.fullscreen = String(fullScreen);
  const label = t(fullScreen ? 'exitFullScreen' : 'enterFullScreen');
  els.fullScreen.setAttribute('aria-label', label);
  els.fullScreen.title = label; // マウスを乗せたときに、キーでも切り替えられることを見せる
}

// クレジットの「GitHub」ボタン。開くページはメインプロセスが決めている (Electron の外ではボタンを出さない)
if (window.appLinks) {
  const button = $('open-repository');
  button.hidden = false;
  button.addEventListener('click', () => window.appLinks.openRepository());
}

// Electron の外 (ブラウザーで index.html を開いたとき) には windowControls がないので、ボタンを出さない
if (window.windowControls) {
  els.fullScreen.hidden = false;
  els.fullScreen.addEventListener('click', () => window.windowControls.toggleFullScreen());
  window.windowControls.onChange((value) => {
    fullScreen = value;
    renderFullScreen();
  });
  window.windowControls.isFullScreen().then((value) => {
    fullScreen = value;
    renderFullScreen();
  });
}
els.closeSettings.addEventListener('click', closeSettings);
for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab.dataset.tab));
  // 左右の矢印キーでタブを移動する (タブの標準的な操作方法)
  tab.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!step) return;
    const next = tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length];
    selectTab(next.dataset.tab);
    next.focus();
  });
}

// --- Timer タブ: ホイール ---
const wheels = [...document.querySelectorAll('[data-setting]')].map((column) => {
  const key = column.dataset.setting;
  const [min, max] = RANGES[key];
  const picker = createWheelPicker({
    min,
    max,
    value: settings[key],
    label: t(column.dataset.labelKey),
    onChange: (value) => updateSettings({ [key]: value }),
  });
  // タイトルと単位の間にホイールを入れる
  column.insertBefore(picker.element, column.querySelector('.wheel-unit'));
  picker.setValue(settings[key]);
  // どの設定項目のホイールかを覚えておく (プリセットで値をまとめて変えたときに、位置を合わせるため)
  return Object.assign(picker, { key });
});

// --- Timer タブ: プリセット ---
const presetEls = {
  list: $('preset-list'),
  open: $('preset-save-open'),
  form: $('preset-form'),
  name: $('preset-name'),
  cancel: $('preset-cancel'),
  hint: $('preset-hint'),
};

function presetButton(preset, label, selected) {
  const wrap = document.createElement('div');
  wrap.className = 'preset';
  wrap.classList.toggle('checked', selected);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'preset-select';
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-checked', String(selected));
  const name = document.createElement('span');
  name.className = 'preset-name';
  name.textContent = label; // 自分で付けた名前も textContent で入れる (HTML として解釈させない)
  const detail = document.createElement('span');
  detail.className = 'preset-values';
  const v = preset.values;
  detail.textContent = t('presetValues', { work: v.workMinutes, short: v.shortBreakMinutes, long: v.longBreakMinutes, interval: v.longBreakInterval });
  button.append(name, detail);
  // 4 つの値をまとめて変え、ホイールの位置も合わせる (動いているセッションには、次から反映される)
  button.addEventListener('click', () => {
    updateSettings(preset.values);
    for (const picker of wheels) picker.setValue(settings[picker.key]);
  });
  wrap.append(button);
  return wrap;
}

function renderPresets() {
  const selectedId = findMatchingPreset(settings.customPresets, settings);
  const items = DEFAULT_PRESETS.map((p) => presetButton(p, t(`preset.${p.id}`), p.id === selectedId));
  for (const preset of settings.customPresets) {
    const item = presetButton(preset, preset.name, preset.id === selectedId);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', t('remove', { name: preset.name }));
    remove.addEventListener('click', () => {
      if (!confirm(t('confirmRemovePreset', { name: preset.name }))) return;
      updateSettings({ customPresets: removeCustomPreset(settings.customPresets, preset.id) });
    });
    item.append(remove);
    items.push(item);
  }
  presetEls.list.replaceChildren(...items);

  // 保存できないとき (上限に達した・同じ値のプリセットがすでにある) は、ボタンを押せなくして理由を出す
  const full = settings.customPresets.length >= MAX_CUSTOM_PRESETS;
  const exists = selectedId !== null;
  presetEls.open.disabled = full || exists;
  presetEls.hint.hidden = !(full || exists);
  presetEls.hint.textContent = full ? t('presetFull', { max: MAX_CUSTOM_PRESETS }) : exists ? t('presetExists') : '';
  if (presetEls.open.disabled) closePresetForm();
}

function openPresetForm() {
  presetEls.form.hidden = false;
  presetEls.open.hidden = true;
  presetEls.name.value = '';
  // 名前を入れなかったときに付く名前を、薄い文字で見せておく
  presetEls.name.placeholder = t('presetCustomName', { n: nextCustomNumber(settings.customPresets) });
  presetEls.name.focus();
}

function closePresetForm() {
  presetEls.form.hidden = true;
  presetEls.open.hidden = false;
}

presetEls.open.addEventListener('click', openPresetForm);
presetEls.cancel.addEventListener('click', closePresetForm);
presetEls.form.addEventListener('submit', (event) => {
  event.preventDefault(); // フォームの送信でページを読み込み直さないようにする
  const fallback = t('presetCustomName', { n: nextCustomNumber(settings.customPresets) });
  updateSettings({ customPresets: addCustomPreset(settings.customPresets, presetEls.name.value, settings, fallback) });
  closePresetForm();
});
// 入力中の Esc は、設定パネルを閉じずに入力欄だけを閉じる
presetEls.name.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  event.stopPropagation();
  closePresetForm();
  presetEls.open.focus();
});

// --- Sound タブ: 音量 ---
const volumeSliders = [...document.querySelectorAll('[data-volume]')];

// スライダーの位置と、音量の数字 (0 のときは「消音」の文字) を表示する。
// 位置も合わせるのは、初期化ボタンなどスライダー以外で音量が変わることがあるため
function renderVolumes() {
  for (const slider of volumeSliders) {
    const value = settings[slider.dataset.volume];
    slider.value = String(value);
    document.querySelector(`output[for="${slider.id}"]`).textContent = value === 0 ? t('mute') : String(value);
  }
}

for (const slider of volumeSliders) {
  slider.addEventListener('input', () => updateSettings({ [slider.dataset.volume]: slider.value }));
}

const TESTS = {
  alarm: () => playAlarm(effectiveVolume(settings, 'alarmVolume'), settings.alarmSound),
  se: () => playClick(effectiveVolume(settings, 'seVolume'), settings.seSound),
  bgm: () => bgm.preview(),
};
// 初期化: 押し間違いで元の音量を失わないよう、確認してから戻す
$('reset-sound').addEventListener('click', () => {
  if (!confirm(t('confirmResetSound'))) return;
  updateSettings(resetSoundSettings(settings));
});

for (const button of document.querySelectorAll('[data-test]')) {
  button.addEventListener('click', TESTS[button.dataset.test]);
}

// --- Sound タブのアラーム・BGM の一覧と、Appearance タブの壁紙一覧 ---
// key は選んだときに書き換える設定の項目、id はその値
function choiceButton(label, key, id) {
  const wrap = document.createElement('div');
  wrap.className = 'choice';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'choice-select';
  button.setAttribute('role', 'radio');
  const checked = settings[key] === id;
  button.setAttribute('aria-checked', String(checked));
  wrap.classList.toggle('checked', checked);
  const name = document.createElement('span');
  name.className = 'choice-name';
  name.textContent = label; // ファイル名は textContent で入れる (HTML として解釈させない)
  button.append(name);
  button.addEventListener('click', () => updateSettings({ [key]: id }));
  wrap.append(button);
  return wrap;
}

function removeButton(kind, entry, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'remove-button';
  button.textContent = '×';
  button.setAttribute('aria-label', t('remove', { name: label }));
  button.addEventListener('click', async (e) => {
    e.stopPropagation();
    // 曲は確認せずに消す (取り込み元のファイルは残るので、また取り込める)。壁紙は確認する
    if (kind !== 'bgm' && !confirm(t('confirmRemove', { name: entry.name }))) return;
    await window.media.remove(kind, entry.file);
    media[kind] = media[kind].filter((m) => m.file !== entry.file);
    // 使っていたものを消したら「なし」に戻す。曲は、すべてのプレイリストからも除く
    const settingKey = kind === 'bgm' ? 'bgm' : 'wallpaper';
    const patch = kind === 'bgm' ? { bgmPlaylists: removeTrackEverywhere(settings.bgmPlaylists, entry.file) } : {};
    if (settings[settingKey] === `import:${entry.file}`) patch[settingKey] = 'none';
    updateSettings(patch);
  });
  return button;
}

function importButton(kind, className, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.addEventListener('click', async () => {
    const { added, skipped } = await window.media.import(kind);
    if (skipped.length > 0) alert(t('importSkipped', { files: skipped.join('\n') }));
    if (added.length === 0) return;
    media[kind].push(...added);
    // 取り込んだら、最後に取り込んだものをすぐ使う
    const settingKey = kind === 'bgm' ? 'bgm' : 'wallpaper';
    updateSettings({ [settingKey]: `import:${added.at(-1).file}` });
    // 曲が多くて枠がスクロールしているときも、取り込んだ曲が見えるようにする
    if (kind === 'bgm') revealSelectedTrack();
  });
  label(button);
  return button;
}

// アラームは選んだらすぐ試聴する (音の違いは聞かないと分からないため)
function renderAlarmList() {
  els.alarmList.replaceChildren(...ALARM_SOUNDS.map((id) => {
    const item = choiceButton(t(`alarmSound.${id}`), 'alarmSound', id);
    item.querySelector('button').addEventListener('click', TESTS.alarm);
    return item;
  }));
}

// 効果音も、選んだらすぐ試聴する
function renderSeList() {
  els.seList.replaceChildren(...SE_SOUNDS.map((id) => {
    const item = choiceButton(t(`seSound.${id}`), 'seSound', id);
    item.querySelector('button').addEventListener('click', TESTS.se);
    return item;
  }));
}

function renderBgmList() {
  const items = [choiceButton(t('none'), 'bgm', 'none')];
  for (const type of NOISE_TYPES) items.push(choiceButton(t(`noise.${type}`), 'bgm', `noise:${type}`));
  // 取り込んだ曲は、多くなったら枠の中でスクロールする (なし・ノイズ・取り込むボタンは、いつも見えるように枠の外に置く)
  if (media.bgm.length > 0) {
    // 設定を変えるたびに一覧を作り直すので、スクロールの位置を引き継ぐ (音量を動かしただけで先頭に戻らないように)
    const scrollTop = els.bgmList.querySelector('.bgm-tracks')?.scrollTop ?? 0;
    const tracks = document.createElement('div');
    tracks.className = 'bgm-tracks';
    for (const entry of media.bgm) {
      const item = choiceButton(entry.name, 'bgm', `import:${entry.file}`);
      item.append(removeButton('bgm', entry, entry.name));
      tracks.append(item);
    }
    items.push(tracks);
    queueMicrotask(() => { tracks.scrollTop = scrollTop; });
  }
  if (window.media) {
    items.push(importButton('bgm', 'secondary small import-button', (b) => { b.textContent = t('importEllipsis'); }));
  }
  els.bgmList.replaceChildren(...items);
}

// 選んでいる曲が枠の外にあれば、枠の真ん中あたりに見えるまでスクロールする (取り込んだ直後に使う)
function revealSelectedTrack() {
  const tracks = els.bgmList.querySelector('.bgm-tracks');
  const selected = tracks?.querySelector('.choice.checked');
  if (!tracks || !selected) return;
  const top = selected.offsetTop; // .bgm-tracks は position: relative なので、枠の中での位置
  if (top < tracks.scrollTop || top + selected.offsetHeight > tracks.scrollTop + tracks.clientHeight) {
    tracks.scrollTop = top - (tracks.clientHeight - selected.offsetHeight) / 2;
  }
}

function swatch(name, id, configure) {
  const wrap = document.createElement('div');
  wrap.className = 'swatch-wrap';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'swatch';
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-checked', String(settings.wallpaper === id));
  const label = document.createElement('span');
  label.className = 'swatch-name';
  label.textContent = name;
  button.append(label);
  button.addEventListener('click', () => updateSettings({ wallpaper: id }));
  configure?.(button);
  wrap.append(button);
  return wrap;
}

function renderWallpaperGrid() {
  const items = [swatch(t('none'), 'none', (b) => b.classList.add('wp-none'))];
  for (const preset of WALLPAPER_PRESETS) {
    items.push(swatch(preset.name, `preset:${preset.id}`, (b) => b.classList.add(`wp-${preset.id}`)));
  }
  for (const entry of media.wallpapers) {
    const item = swatch(entry.name, `import:${entry.file}`, (b) => {
      b.classList.add('wp-import');
      b.style.backgroundImage = `url("${mediaUrl('wallpapers', entry.file)}")`;
    });
    item.append(removeButton('wallpapers', entry, entry.name));
    items.push(item);
  }
  if (window.media) {
    const add = document.createElement('div');
    add.className = 'swatch-wrap';
    add.append(importButton('wallpapers', 'swatch add', (b) => {
      b.setAttribute('aria-label', t('importWallpaper'));
      b.textContent = '+';
      const name = document.createElement('span');
      name.className = 'swatch-name';
      name.textContent = t('import');
      b.append(name);
    }));
    items.push(add);
  }
  els.wallpaperGrid.replaceChildren(...items);
}

// 外観タブ: タイマーの数字のフォント。それぞれのフォントで見本の「25:00」を見せ、押したらすぐ変える
function renderFontGrid() {
  els.fontGrid.replaceChildren(...TIMER_FONTS.map((font) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'font-sample';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(settings.timerFont === font.id));
    const digits = document.createElement('span');
    digits.className = 'font-sample-digits';
    digits.textContent = '25:00';
    digits.style.fontFamily = font.family;
    digits.style.fontWeight = String(font.weight);
    digits.style.fontSize = `${26 * font.size}px`;
    digits.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'font-sample-name';
    name.textContent = t(`timerFont.${font.id}`);
    button.append(digits, name);
    button.addEventListener('click', () => updateSettings({ timerFont: font.id }));
    return button;
  }));
}

function renderChoices() {
  renderPresets();
  renderAlarmList();
  renderSeList();
  renderBgmList();
  renderFontGrid();
  renderWallpaperGrid();
  renderPlaylist();
}

els.cardOpacity.addEventListener('input', () => updateSettings({ cardOpacity: els.cardOpacity.value }));

for (const radio of document.querySelectorAll('input[name="theme"]')) {
  radio.checked = radio.value === settings.theme;
  radio.addEventListener('change', () => updateSettings({ theme: radio.value }));
}

// --- General タブ: 言語 (選択肢の名前は、それぞれの言語で書く) ---
els.language.replaceChildren(
  ...LANGUAGES.map(({ id, name }) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = name;
    return option;
  }),
);
els.language.addEventListener('change', () => updateSettings({ language: els.language.value }));

els.showStats.checked = settings.showStats;
els.showStats.addEventListener('change', () => updateSettings({ showStats: els.showStats.checked }));

// --- BGM の再生バー ---
function trackName() {
  const [kind, value] = settings.bgm.split(':');
  if (kind === 'noise') return t(`noise.${value}`);
  return media.bgm.find((entry) => entry.file === value)?.name ?? '';
}

// 0.25 秒ごとに呼ばれるので、文字と属性を書き換えるだけにする (一覧は作り直さない)
function renderPlayer() {
  const visible = settings.bgm !== 'none';
  player.root.hidden = !visible;
  document.documentElement.classList.toggle('has-player', visible);
  if (!visible) {
    if (openPopup) showPopup(null);
    return;
  }
  const track = currentTrack(); // ノイズのときは null
  player.title.textContent = trackName();
  player.title.title = player.title.textContent; // 長い曲名は省略されるので、マウスを乗せたら全部見せる

  // ▶ / ⏸ は、今流しているかで切り替える
  const playing = isBgmPlaying();
  player.toggle.dataset.state = playing ? 'pause' : 'play';
  player.toggle.setAttribute('aria-label', t(playing ? 'playerPause' : 'playerPlay'));
  player.prev.disabled = track === null;
  // リピート「オフ」の最後の曲では、次の曲がないので押せなくする
  player.next.disabled = track === null || nextInQueue(bgmQueue(), track, settings.bgmRepeat) === null;

  const position = track === null ? null : bgm.position();
  const duration = position?.duration ?? NaN;
  const canSeek = Number.isFinite(duration) && duration > 0;
  player.seek.disabled = !canSeek;
  if (!seekDragging) {
    player.seek.max = String(canSeek ? duration : 1);
    player.seek.value = String(canSeek ? position.current : 0);
  }
  const current = canSeek ? Number(player.seek.value) : 0;
  player.seek.style.setProperty('--seek', String(canSeek ? (current / duration) * 100 : 0));
  const timeText = `${formatTrackTime(current)} / ${formatTrackTime(duration)}`;
  player.seek.setAttribute('aria-valuetext', timeText);

  // 曲は経過時間。止まっているノイズは、作業が始まると流れることを知らせる
  player.time.textContent = track !== null ? timeText : playing ? '' : t('playerWaiting');

  player.repeat.dataset.repeat = settings.bgmRepeat;
  player.repeat.setAttribute('aria-label', t(`repeat.${settings.bgmRepeat}`));
  player.repeat.title = t(`repeat.${settings.bgmRepeat}`);
  player.shuffle.setAttribute('aria-pressed', String(settings.bgmShuffle));
  player.shuffle.title = t('shuffle');

  player.openVolume.dataset.muted = String(effectiveVolume(settings, 'bgmVolume') === 0);
  player.volume.value = String(settings.bgmVolume);
  player.volumeOutput.textContent = settings.bgmVolume === 0 ? t('mute') : String(settings.bgmVolume);

  // 再生リストの「今の曲」の印は、鳴っている間だけ動かす
  player.list.classList.toggle('playing', bgm.playing);
  noiseList.classList.toggle('playing', bgm.playing);
  renderMediaSession(canSeek ? { duration, position: current } : null);
}

// --- キーボードのメディアキー・Windows の再生操作 (Media Session) ---
// 曲名と再生状態を Windows に知らせ、▶⏸・前へ・次へのキーを再生バーのボタンと同じ動きにする
let mediaTitle = null;
function renderMediaSession(position) {
  if (!('mediaSession' in navigator)) return;
  const title = settings.bgm === 'none' ? '' : trackName();
  // 曲名は変わったときだけ渡す (0.25 秒ごとに作り直さない)
  if (title !== mediaTitle) {
    mediaTitle = title;
    navigator.mediaSession.metadata = title ? new MediaMetadata({ title }) : null;
  }
  navigator.mediaSession.playbackState = settings.bgm === 'none' ? 'none' : bgm.playing ? 'playing' : 'paused';
  try {
    navigator.mediaSession.setPositionState(position ? { ...position, playbackRate: 1 } : undefined);
  } catch {
    // 曲の長さを読み込む途中など、位置が長さを超えるときは送らない
  }
}

if ('mediaSession' in navigator) {
  // 押せないとき (ノイズ・リピート「オフ」の最後の曲) は、ボタンと同じく何もしない
  const pressPlayerButton = (button) => () => {
    if (!player.root.hidden && !button.disabled) button.click();
  };
  const handlers = {
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    previoustrack: pressPlayerButton(player.prev),
    nexttrack: pressPlayerButton(player.next),
    seekto: (details) => { bgm.seek(details.seekTime); renderPlayer(); },
  };
  for (const [action, handler] of Object.entries(handlers)) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // 対応していない操作は登録しない
    }
  }
}

function showPopup(name) {
  openPopup = name;
  // 閉じたら、次に開いたときは普通の一覧から (作りかけ・編集中のままにしない)
  if (name !== 'list') playlistMode = 'view';
  // 開いたときは、今選んでいるもの (曲かノイズか) のタブを見せる
  if (name === 'list') popupTab = settings.bgm.startsWith('noise:') ? 'noise' : 'music';
  player.listPopup.hidden = name !== 'list';
  player.volumePopup.hidden = name !== 'volume';
  player.openList.setAttribute('aria-expanded', String(name === 'list'));
  player.openVolume.setAttribute('aria-expanded', String(name === 'volume'));
  if (name === 'list') {
    renderPlaylist();
    // 今の曲が見える位置まで動かす
    player.list.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
  }
}

// 曲を選んで流す (止めていても流す)。今の曲を選んだときは、続きから流す
function playTrack(file) {
  playback = { ...playback, music: true };
  if (file === currentTrack()) render();
  else updateSettings({ bgm: `import:${file}` });
}

// 前へ・次へ。同じ曲になるとき (1 曲だけの再生リストなど) は、最初から流し直す
function switchTrack(file) {
  if (file === null) return;
  if (file === currentTrack()) bgm.restart();
  playTrack(file);
}

const playlistEls = {
  choose: $('playlist-choose'),
  create: $('playlist-new'),
  edit: $('playlist-edit'),
  form: $('playlist-form'),
  name: $('playlist-name'),
  save: $('playlist-save'),
  cancel: $('playlist-cancel'),
  editActions: $('playlist-edit-actions'),
  remove: $('playlist-delete'),
  done: $('playlist-done'),
};
// 小窓の中の状態: 'view' (曲を選んで再生) / 'create' (名前を入れて新しく作る) / 'edit' (曲を選ぶ・名前を変える)
let playlistMode = 'view';
// 小窓のタブ: 'music' (取り込んだ曲・プレイリスト) / 'noise' (BGM のノイズ)
let popupTab = 'music';
const popupTabs = [...document.querySelectorAll('[data-popup-tab]')];
const noiseList = $('noise-list');

// 今の曲・ノイズの印 (3 本の棒)。鳴っている間だけ上下に動く (CSS の .playlist.playing)
function playingMeter() {
  const meter = document.createElement('span');
  meter.className = 'playlist-meter';
  meter.setAttribute('aria-hidden', 'true');
  meter.append(...[0, 1, 2].map(() => document.createElement('i')));
  return meter;
}

// BGM タブの 1 行。押すとそのノイズに切り替えて流す (プレイリストには入れられないので、チェックもドラッグもない)
function noiseItem(type, isCurrent) {
  const item = document.createElement('li');
  item.className = 'playlist-item';
  item.classList.toggle('current', isCurrent);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'playlist-select';
  button.textContent = t(`noise.${type}`);
  button.dataset.file = `noise:${type}`;
  if (isCurrent) button.setAttribute('aria-current', 'true');
  button.addEventListener('click', () => playNoise(type));
  item.append(button);
  if (isCurrent) item.append(playingMeter());
  return item;
}

// ノイズを選んで流す (止めていても流す)
function playNoise(type) {
  playback = { ...playback, noise: { on: true, resume: false } };
  if (settings.bgm === `noise:${type}`) render();
  else updateSettings({ bgm: `noise:${type}` });
}

function selectPopupTab(name) {
  popupTab = name;
  if (name === 'noise') playlistMode = 'view'; // 作りかけ・編集中のプレイリストはやめる
  renderPlaylist();
}

for (const tab of popupTabs) {
  tab.addEventListener('click', () => selectPopupTab(tab.dataset.popupTab));
  // 左右の矢印キーでタブを移動する (設定パネルのタブと同じ)
  tab.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!step) return;
    const next = popupTabs[(popupTabs.indexOf(tab) + step + popupTabs.length) % popupTabs.length];
    selectPopupTab(next.dataset.popupTab);
    next.focus();
  });
}

function trackLabel(file) {
  return media.bgm.find((entry) => entry.file === file)?.name ?? file;
}

// 編集中の 1 行: チェックを付けた曲がプレイリストに入る
function playlistCheckItem(file, checked) {
  const item = document.createElement('li');
  item.className = 'playlist-item';
  const label = document.createElement('label');
  label.className = 'playlist-check';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.dataset.file = file;
  box.addEventListener('change', () => {
    const playlist = customPlaylist();
    if (!playlist) return;
    const tracks = toggleTrack(playlistOrder(), file, box.checked);
    updateSettings({ bgmPlaylists: setPlaylistTracks(settings.bgmPlaylists, playlist.id, tracks) });
  });
  const name = document.createElement('span');
  name.textContent = trackLabel(file); // ファイル名は textContent で入れる (HTML として解釈させない)
  name.title = name.textContent;
  label.append(box, name);
  item.append(label);
  return item;
}

function playlistItem(file, index, isCurrent) {
  const item = document.createElement('li');
  item.className = 'playlist-item';
  item.classList.toggle('current', isCurrent);
  item.draggable = true;
  item.dataset.index = String(index);
  const handle = document.createElement('span');
  handle.className = 'playlist-handle';
  handle.setAttribute('aria-hidden', 'true');
  handle.textContent = '⋮⋮';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'playlist-select';
  // ファイル名は textContent で入れる (HTML として解釈させない)
  button.textContent = trackLabel(file);
  button.title = button.textContent;
  button.dataset.file = file;
  if (isCurrent) button.setAttribute('aria-current', 'true');
  button.addEventListener('click', () => playTrack(file));
  // キーボードでは Alt + ↑ / ↓ で 1 つずつ動かす (ドラッグができない人のため)
  button.addEventListener('keydown', (e) => {
    const step = e.altKey ? { ArrowUp: -1, ArrowDown: 1 }[e.key] : undefined;
    if (!step) return;
    e.preventDefault();
    if (reorderTrack(index, index + step)) player.list.children[index + step].querySelector('button').focus();
  });
  item.append(handle, button);
  if (isCurrent) item.append(playingMeter());
  return item;
}

// 一覧は、開いているときだけ作る (曲の増減・並べ替え・曲やプレイリストの切り替えで作り直す)
function renderPlaylist() {
  if (openPopup !== 'list') return;
  for (const tab of popupTabs) {
    const selected = tab.dataset.popupTab === popupTab;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute('aria-controls')).hidden = !selected;
  }
  if (popupTab === 'noise') {
    const focusedNoise = noiseList.contains(document.activeElement) ? document.activeElement.dataset.file : undefined;
    noiseList.replaceChildren(...NOISE_TYPES.map((type) => noiseItem(type, settings.bgm === `noise:${type}`)));
    if (focusedNoise) noiseList.querySelector(`[data-file="${CSS.escape(focusedNoise)}"]`)?.focus();
    return;
  }
  const playlist = customPlaylist();
  // 編集できるのは自分で作ったプレイリストだけ (「全曲」に切り替わったら編集をやめる)
  if (playlistMode === 'edit' && !playlist) playlistMode = 'view';

  // 上の段: 全曲 + 自分で作ったプレイリスト
  playlistEls.choose.replaceChildren(
    ...[{ id: ALL_TRACKS, name: t('playlistAll') }, ...settings.bgmPlaylists].map(({ id, name }) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = name; // 自分で付けた名前も textContent で入れる
      return option;
    }),
  );
  playlistEls.choose.value = settings.bgmPlaylist;
  const full = settings.bgmPlaylists.length >= MAX_PLAYLISTS;
  playlistEls.choose.disabled = playlistMode !== 'view';
  playlistEls.create.disabled = full || playlistMode !== 'view';
  playlistEls.create.title = full ? t('playlistFull', { max: MAX_PLAYLISTS }) : t('playlistNew');
  playlistEls.edit.hidden = !playlist || playlistMode !== 'view';
  playlistEls.form.hidden = playlistMode === 'view';
  // 編集中の名前は、入力を終えたら (Enter・ほかを押す) すぐ変えるので、保存・キャンセルのボタンは要らない
  playlistEls.save.hidden = playlistMode === 'edit';
  playlistEls.cancel.hidden = playlistMode === 'edit';
  playlistEls.editActions.hidden = playlistMode !== 'edit';

  // 一覧を作り直してもキーボードの位置を失わないよう、選んでいた曲に戻す
  const focusedFile = player.list.contains(document.activeElement) ? document.activeElement.dataset.file : undefined;
  const order = playlistOrder();
  let hint;
  if (playlistMode === 'edit') {
    // 編集中は全曲を並べ、プレイリストに入っている曲にチェックを付ける
    const all = orderTracks(media.bgm.map((entry) => entry.file), settings.bgmOrder);
    player.list.replaceChildren(...all.map((file) => playlistCheckItem(file, order.includes(file))));
    hint = all.length === 0 ? 'playlistEmpty' : 'playlistEditHint';
  } else {
    const current = currentTrack();
    player.list.replaceChildren(...order.map((file, index) => playlistItem(file, index, file === current)));
    if (media.bgm.length === 0) hint = 'playlistEmpty';
    else if (order.length === 0) hint = 'playlistEmptyCustom';
    else hint = 'playlistHint';
  }
  player.list.hidden = player.list.children.length === 0;
  player.listHint.textContent = playlistMode === 'create' ? '' : t(hint);
  player.listHint.hidden = playlistMode === 'create';
  if (focusedFile) player.list.querySelector(`[data-file="${CSS.escape(focusedFile)}"]`)?.focus();
}

function setPlaylistMode(mode) {
  playlistMode = mode;
  if (mode === 'create') {
    playlistEls.name.value = '';
    // 名前を入れなかったときに付く名前を、薄い文字で見せておく
    playlistEls.name.placeholder = t('playlistCustomName', { n: nextPlaylistNumber(settings.bgmPlaylists) });
  }
  if (mode === 'edit') {
    playlistEls.name.value = customPlaylist()?.name ?? '';
    playlistEls.name.placeholder = '';
  }
  renderPlaylist();
  if (mode === 'view') playlistEls.choose.focus();
  else if (mode === 'create') playlistEls.name.focus();
}

// 並べ替えて保存する (「全曲」は bgmOrder、自分で作ったものはそのプレイリストの順)。動かせたら true
function reorderTrack(from, to) {
  const order = playlistOrder();
  if (from === to || to < 0 || to >= order.length) return false;
  const moved = moveTrack(order, from, to);
  const playlist = customPlaylist();
  if (playlist) updateSettings({ bgmPlaylists: setPlaylistTracks(settings.bgmPlaylists, playlist.id, moved) });
  else updateSettings({ bgmOrder: moved });
  return true;
}

// プレイリストを切り替える (流している曲はそのまま。次へ・曲の終わりから、選んだ一覧の曲に進む)
playlistEls.choose.addEventListener('change', () => {
  shuffledQueue = null;
  updateSettings({ bgmPlaylist: playlistEls.choose.value });
});
playlistEls.create.addEventListener('click', () => setPlaylistMode('create'));
playlistEls.edit.addEventListener('click', () => setPlaylistMode('edit'));
playlistEls.done.addEventListener('click', () => setPlaylistMode('view'));
playlistEls.cancel.addEventListener('click', () => setPlaylistMode('view'));
playlistEls.form.addEventListener('submit', (event) => {
  event.preventDefault(); // フォームの送信でページを読み込み直さないようにする
  if (playlistMode === 'edit') {
    playlistEls.name.blur(); // change で名前を変える
    return;
  }
  // 作ったら、そのプレイリストを選んで、すぐ曲を選べるように編集を始める
  const fallback = t('playlistCustomName', { n: nextPlaylistNumber(settings.bgmPlaylists) });
  const lists = addPlaylist(settings.bgmPlaylists, playlistEls.name.value, fallback);
  if (lists === settings.bgmPlaylists) return; // 上限
  shuffledQueue = null;
  playlistMode = 'edit';
  updateSettings({ bgmPlaylists: lists, bgmPlaylist: lists.at(-1).id });
  setPlaylistMode('edit');
});
// 編集中の名前の変更 (空にしたら元の名前に戻す)
playlistEls.name.addEventListener('change', () => {
  const playlist = customPlaylist();
  if (playlistMode !== 'edit' || !playlist) return;
  updateSettings({ bgmPlaylists: renamePlaylist(settings.bgmPlaylists, playlist.id, playlistEls.name.value) });
  playlistEls.name.value = customPlaylist().name;
});
// 名前の入力中の Esc は、小窓を閉じずに入力だけをやめる
playlistEls.name.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  event.stopPropagation();
  if (playlistMode === 'create') setPlaylistMode('view');
  else playlistEls.name.value = customPlaylist()?.name ?? '';
});
playlistEls.remove.addEventListener('click', () => {
  const playlist = customPlaylist();
  if (!playlist || !confirm(t('confirmRemovePlaylist', { name: playlist.name }))) return;
  shuffledQueue = null;
  playlistMode = 'view';
  updateSettings({ bgmPlaylists: removePlaylist(settings.bgmPlaylists, playlist.id), bgmPlaylist: ALL_TRACKS });
  setPlaylistMode('view');
});

player.toggle.addEventListener('click', () => setPlaying(!isBgmPlaying()));
player.next.addEventListener('click', () => {
  switchTrack(nextInQueue(bgmQueue(), currentTrack(), settings.bgmRepeat));
});
player.prev.addEventListener('click', () => {
  const current = currentTrack();
  if (current === null) return;
  // 曲が少し進んでいたら、まずその曲の最初に戻る
  const restart = prevAction(bgm.position()?.current ?? 0) === 'restart';
  switchTrack(restart ? current : prevInQueue(bgmQueue(), current, settings.bgmRepeat));
});
player.repeat.addEventListener('click', () => updateSettings({ bgmRepeat: nextRepeatMode(settings.bgmRepeat) }));
player.shuffle.addEventListener('click', () => {
  shuffledQueue = null; // オンにするたびに、今の曲を先頭にして並べ直す
  updateSettings({ bgmShuffle: !settings.bgmShuffle });
});

player.seek.addEventListener('pointerdown', () => { seekDragging = true; });
window.addEventListener('pointerup', () => { seekDragging = false; });
player.seek.addEventListener('input', () => {
  bgm.seek(Number(player.seek.value));
  renderPlayer();
});

player.volume.addEventListener('input', () => updateSettings({ bgmVolume: player.volume.value }));
player.openVolume.addEventListener('click', () => showPopup(openPopup === 'volume' ? null : 'volume'));
player.openList.addEventListener('click', () => showPopup(openPopup === 'list' ? null : 'list'));
// 再生バーの外を押したら小窓を閉じる
document.addEventListener('pointerdown', (e) => {
  if (openPopup && !player.root.contains(e.target)) showPopup(null);
});

// --- 戻る: 何もないところのクリック・どこでも右クリックで、メイン画面に向かって 1 つ戻る (設定パネル → 小窓) ---
function goBack() {
  const action = backAction({ settingsOpen: panelOpen(), popupOpen: openPopup !== null });
  if (action === 'closeSettings') closePanel();
  if (action === 'closePopup') showPopup(null);
}

// 「何もないところ」: 画面の背景・タイマーのカードの余白・設定パネルの外側 (中身の列の外)。
// 設定の中の項目と項目のすき間は含めない (スライダーなどを少し外して押しただけで閉じないように)
function isEmptySpot(target) {
  return target === document.documentElement || target === document.body || target === els.wallpaper
    || target === els.settings || target === els.calendar || target.matches?.('.app');
}
// 押したところも何もないところだったときだけ戻る
// (スライダーをつかんで外で離すと、離した場所の「クリック」になるため)
let pressedOnEmpty = false;
document.addEventListener('pointerdown', (e) => {
  pressedOnEmpty = e.button === 0 && isEmptySpot(e.target);
});
document.addEventListener('click', (e) => {
  if (pressedOnEmpty && isEmptySpot(e.target)) goBack();
  pressedOnEmpty = false;
});
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  goBack();
});

// ドラッグで並べ替える。落とす場所 (曲の上半分なら前、下半分なら後ろ) に線を出す
let dragFrom = null;
function clearDropMarks() {
  for (const item of player.list.children) item.classList.remove('drop-before', 'drop-after', 'dragging');
}
player.list.addEventListener('dragstart', (e) => {
  const item = e.target.closest('.playlist-item');
  if (!item) return;
  dragFrom = Number(item.dataset.index);
  item.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
});
player.list.addEventListener('dragover', (e) => {
  const item = e.target.closest('.playlist-item');
  if (dragFrom === null || !item) return;
  e.preventDefault(); // これで「ここに落とせる」ことになる
  const rect = item.getBoundingClientRect();
  const after = e.clientY > rect.top + rect.height / 2;
  for (const other of player.list.children) other.classList.remove('drop-before', 'drop-after');
  item.classList.add(after ? 'drop-after' : 'drop-before');
});
player.list.addEventListener('drop', (e) => {
  const item = e.target.closest('.playlist-item');
  if (dragFrom === null || !item) return;
  e.preventDefault();
  const from = dragFrom;
  dragFrom = null;
  if (!reorderTrack(from, dropIndex(from, Number(item.dataset.index), item.classList.contains('drop-after')))) clearDropMarks();
});
player.list.addEventListener('dragend', () => {
  dragFrom = null;
  clearDropMarks();
});

// --- カレンダー (calendar.js の決まりごと) ---
const cal = {
  close: $('close-calendar'),
  prev: $('month-prev'),
  next: $('month-next'),
  today: $('month-today'),
  monthTitle: $('month-title'),
  grid: $('month-grid'),
  dayTitle: $('day-title'),
  add: $('event-add'),
  list: $('event-list'),
  empty: $('event-empty'),
  form: $('event-form'),
  title: $('event-title'),
  date: $('event-date'),
  start: $('event-start'),
  end: $('event-end'),
  preset: $('event-preset'),
  error: $('event-error'),
  remove: $('event-delete'),
  cancel: $('event-cancel'),
};
// 見ている月 (month は 0〜11)・選んでいる日・編集中の予定 (null: フォームを閉じている / 'new': 新しく作る / 予定の ID)
let calMonth = { year: new Date().getFullYear(), month: new Date().getMonth() };
let selectedDate = toDateKey(new Date());
let editingEvent = null;

function saveEvents(next) {
  events = next;
  save('events', events);
  renderCalendar();
  render();
}

// 予定に選んだプリセットの名前。消したプリセット・「今の設定のまま」は null
function eventPreset(id) {
  return DEFAULT_PRESETS.find((p) => p.id === id) ?? settings.customPresets.find((p) => p.id === id) ?? null;
}

function presetLabel(id) {
  const preset = eventPreset(id);
  if (!preset) return t('eventPresetCurrent');
  return DEFAULT_PRESETS.includes(preset) ? t(`preset.${preset.id}`) : preset.name;
}

// 日付・月の名前は、選んでいる言語の書き方で出す (例: 2026年10月 / October 2026)
const formatDate = (date, options) => new Intl.DateTimeFormat(settings.language, options).format(date);

function renderCalendar() {
  if (els.calendar.hidden || calTab !== 'month') return;
  const { year, month } = calMonth;
  cal.monthTitle.textContent = formatDate(new Date(year, month, 1), { year: 'numeric', month: 'long' });

  // 曜日の行 (日曜始まり。2026-10-04 は日曜日) と 6 週のマス
  const weekdays = Array.from({ length: 7 }, (_, i) => {
    const cell = document.createElement('div');
    cell.className = 'weekday';
    cell.classList.toggle('sun', i === 0);
    cell.classList.toggle('sat', i === 6);
    cell.textContent = formatDate(new Date(2026, 9, 4 + i), { weekday: 'narrow' });
    cell.setAttribute('aria-hidden', 'true');
    return cell;
  });
  const marked = datesWithEvents(events);
  const todayKey = toDateKey(new Date());
  const days = monthDays(year, month).map(({ key, day, inMonth }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'day-cell';
    button.classList.toggle('outside', !inMonth);
    button.classList.toggle('today', key === todayKey);
    button.classList.toggle('has-events', marked.has(key));
    button.setAttribute('aria-selected', String(key === selectedDate));
    button.setAttribute('aria-label', formatDate(parseDateKey(key), { month: 'long', day: 'numeric', weekday: 'long' }));
    button.dataset.date = key;
    button.textContent = String(day);
    button.addEventListener('click', () => selectDate(key));
    return button;
  });
  cal.grid.replaceChildren(...weekdays, ...days);

  // 選んだ日の予定
  cal.dayTitle.textContent = formatDate(parseDateKey(selectedDate), { month: 'long', day: 'numeric', weekday: 'short' });
  // その日の予定: 1 回だけの予定と、その曜日の時間割 (毎週。押すと時間割のタブで編集する) を始まる順に
  const dayEvents = eventsOn(events, selectedDate);
  const weekly = slotsOn(timetable, parseDateKey(selectedDate).getDay());
  const items = [...dayEvents.map((e) => ({ start: e.start, end: e.end, el: eventItem(e) })), ...weekly.map((s) => ({ start: s.start, end: s.end, el: weeklyItem(s) }))];
  items.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  cal.list.replaceChildren(...items.map((i) => i.el));
  cal.empty.hidden = items.length > 0 || editingEvent !== null;
  cal.add.disabled = editingEvent !== null;
}

function eventItem(event) {
  const item = document.createElement('li');
  item.className = 'event-item';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'event-open';
  const time = document.createElement('span');
  time.className = 'event-time';
  time.textContent = `${event.start} – ${event.end}`;
  const name = document.createElement('span');
  name.className = 'event-name';
  name.textContent = event.title; // 自分で付けた名前も textContent で入れる (HTML として解釈させない)
  const preset = document.createElement('span');
  preset.className = 'event-preset';
  preset.textContent = `${t('eventPreset')}: ${presetLabel(event.preset)}`;
  open.append(time, name, preset);
  open.addEventListener('click', () => openEventForm(event));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove-button';
  remove.textContent = '×';
  remove.setAttribute('aria-label', t('remove', { name: event.title }));
  remove.addEventListener('click', () => deleteEvent(event));
  item.append(open, remove);
  return item;
}

// カレンダーの日の一覧に出す、時間割のコマ (毎週)。押すと時間割のタブで、その曜日を開く
function weeklyItem(slot) {
  const item = document.createElement('li');
  item.className = 'event-item weekly';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'event-open';
  const time = document.createElement('span');
  time.className = 'event-time';
  time.textContent = `${slot.start} – ${slot.end}`;
  const name = document.createElement('span');
  name.className = 'event-name';
  name.textContent = slot.title;
  const tag = document.createElement('span');
  tag.className = 'event-tag';
  tag.textContent = t('weeklyTag');
  name.append(tag);
  open.append(time, name);
  open.addEventListener('click', () => {
    selectedWeekday = slot.weekday;
    selectCalTab('timetable');
    openSlotForm(slot);
  });
  item.append(open);
  return item;
}

function selectDate(key) {
  selectedDate = key;
  const date = parseDateKey(key);
  calMonth = { year: date.getFullYear(), month: date.getMonth() };
  if (editingEvent === 'new') cal.date.value = key; // 作っている途中なら、日付も合わせる
  renderCalendar();
}

function moveMonth(step) {
  calMonth = { year: calMonth.year, month: calMonth.month + step };
  const first = new Date(calMonth.year, calMonth.month, 1);
  calMonth = { year: first.getFullYear(), month: first.getMonth() };
  renderCalendar();
}

// プリセットの選択肢: 今の設定のまま・デフォルト・自分で保存したもの
function renderPresetOptions(selectedId) {
  const options = [{ id: '', label: t('eventPresetCurrent') }];
  for (const p of DEFAULT_PRESETS) options.push({ id: p.id, label: t(`preset.${p.id}`) });
  for (const p of settings.customPresets) options.push({ id: p.id, label: p.name });
  cal.preset.replaceChildren(...options.map(({ id, label }) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = label;
    return option;
  }));
  cal.preset.value = eventPreset(selectedId) ? selectedId : '';
}

// 予定の追加 (event なし) と編集で、同じフォームを使う
function openEventForm(event = null) {
  editingEvent = event ? event.id : 'new';
  cal.title.value = event?.title ?? '';
  cal.title.placeholder = t('eventUntitled');
  cal.date.value = event?.date ?? selectedDate;
  // 新しい予定は、次のちょうどの時刻から 1 時間 (今日なら今の次の時、ほかの日なら 9:00)
  const nextHour = selectedDate === toDateKey(new Date()) ? Math.min(new Date().getHours() + 1, 22) : 9;
  cal.start.value = event?.start ?? `${String(nextHour).padStart(2, '0')}:00`;
  cal.end.value = event?.end ?? `${String(nextHour + 1).padStart(2, '0')}:00`;
  renderPresetOptions(event?.preset ?? null);
  cal.error.hidden = true;
  cal.remove.hidden = !event;
  cal.form.hidden = false;
  renderCalendar();
  cal.title.focus();
}

function closeEventForm() {
  editingEvent = null;
  cal.form.hidden = true;
  renderCalendar();
  cal.add.focus();
}

function showEventError(key) {
  cal.error.textContent = t(key, { max: MAX_EVENTS });
  cal.error.hidden = false;
}

cal.form.addEventListener('submit', (e) => {
  e.preventDefault(); // フォームの送信でページを読み込み直さないようにする
  const isNew = editingEvent === 'new';
  if (isNew && events.length >= MAX_EVENTS) {
    showEventError('eventErrorFull');
    return;
  }
  const id = isNew ? nextEventId(events) : editingEvent;
  const input = { title: cal.title.value, date: cal.date.value, start: cal.start.value, end: cal.end.value, preset: cal.preset.value };
  const made = makeEvent(input, id, t('eventUntitled'));
  if (made.error) {
    const messages = { endBeforeStart: 'eventErrorEndBeforeStart', invalidTime: 'eventErrorInvalidTime', invalidDate: 'eventErrorInvalidDate' };
    showEventError(messages[made.error]);
    return;
  }
  editingEvent = null;
  cal.form.hidden = true;
  // 保存した予定の日を選んで見せる (別の日に変えたときも、どこに入ったか分かるように)
  selectedDate = made.event.date;
  const date = parseDateKey(selectedDate);
  calMonth = { year: date.getFullYear(), month: date.getMonth() };
  saveEvents(isNew ? addEvent(events, made.event) : replaceEvent(events, made.event));
  cal.add.focus();
});

function deleteEvent(event) {
  if (editingEvent === event.id) {
    editingEvent = null;
    cal.form.hidden = true;
  }
  saveEvents(removeEvent(events, event.id));
}

cal.remove.addEventListener('click', () => {
  const event = events.find((e) => e.id === editingEvent);
  if (event) deleteEvent(event);
});
cal.cancel.addEventListener('click', closeEventForm);
// フォームの中の Esc は、カレンダーを閉じずにフォームだけを閉じる
cal.form.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  closeEventForm();
});
cal.add.addEventListener('click', () => openEventForm());
cal.prev.addEventListener('click', () => moveMonth(-1));
cal.next.addEventListener('click', () => moveMonth(1));
cal.today.addEventListener('click', () => selectDate(toDateKey(new Date())));
cal.close.addEventListener('click', closeCalendar);
// 矢印キーで日を動かす (← → は 1 日、↑ ↓ は 1 週)
cal.grid.addEventListener('keydown', (e) => {
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
  if (!step || !e.target.dataset.date) return;
  e.preventDefault();
  const date = parseDateKey(e.target.dataset.date);
  selectDate(toDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + step)));
  cal.grid.querySelector(`[data-date="${selectedDate}"]`)?.focus();
});

// tab は 'month' (カレンダー) か 'timetable' (時間割)。時間割は、その日の曜日を選んで開く
function openCalendar(dateKey = toDateKey(new Date()), tab = 'month') {
  showPopup(null);
  els.settings.hidden = true;
  els.calendar.hidden = false;
  selectedWeekday = parseDateKey(dateKey).getDay();
  selectDate(dateKey);
  selectCalTab(tab);
  if (tab === 'month') cal.grid.querySelector(`[data-date="${selectedDate}"]`)?.focus();
  else tt.picker.querySelector('[aria-checked="true"]')?.focus();
}

function closeEventFormQuietly() {
  editingEvent = null;
  cal.form.hidden = true;
}

function closeCalendar() {
  els.calendar.hidden = true;
  closeEventFormQuietly();
  closeSlotFormQuietly();
  els.openCalendar.focus();
}

els.openCalendar.addEventListener('click', () => openCalendar());
els.nextEvent.addEventListener('click', () => openCalendar());

// メイン画面の今日の予定の 1 行 (今やっている予定か、このあと始まる予定)
function renderNextEvent(now) {
  // 時間割モードでは、メイン画面そのものが予定を数えるので出さない
  const found = settings.appMode === 'timer' ? currentOrNextEvent(events, now) : null;
  els.nextEvent.hidden = !found;
  document.documentElement.classList.toggle('has-next-event', Boolean(found));
  if (!found) return;
  const { event, ongoing } = found;
  const text = t(ongoing ? 'nextEventOngoing' : 'nextEventUpcoming', { start: event.start, end: event.end, title: event.title });
  els.nextEvent.textContent = text;
  els.nextEvent.title = text;
  els.nextEvent.classList.toggle('ongoing', ongoing);
}

// 予定の開始・終了の知らせ。前回確かめた時刻から今までに来たものを出す
// (起動した時刻より前の予定は知らせない。スリープ明けなどで 5 分より遅れたものも出さない)
let lastEventCheck = Date.now();

function checkEvents(now) {
  const due = dueTriggers(events, lastEventCheck, now);
  lastEventCheck = now;
  for (const { event, kind } of due) {
    if (kind === 'start') startScheduledEvent(event);
    else showNotification(t('notifyEventEndTitle', { title: event.title }), t('notifyEventEndBody', { start: event.start, end: event.end }));
  }
}

// 開始時刻: 止まっていれば、予定のプリセットで作業の頭に準備する (スタートは自分で押す)。動いていれば何も変えない
function startScheduledEvent(event) {
  const title = t('notifyEventStartTitle', { title: event.title });
  if (state.running) {
    showNotification(title, t('notifyEventStartRunning'));
    return;
  }
  const preset = eventPreset(event.preset);
  if (preset) {
    updateSettings(preset.values);
    for (const picker of wheels) picker.setValue(settings[picker.key]);
  }
  state = prepareFocus(state, settings);
  render();
  showNotification(title, t('notifyEventStartPrepared', { preset: presetLabel(event.preset) }));
}

// --- 時間割モード (schedule.js の決まりごと) ---
// 今日の予定 = 今日の曜日の時間割 + 今日のカレンダーの予定
function todayPlan(now) {
  return dayPlan(timetable, events, toDateKey(new Date(now)));
}

const formatClock = (now) => new Intl.DateTimeFormat(settings.language, { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);

// 時間割モードの表示 (残り時間・予定の名前・円・色・次の予定)。
// ノイズの判断に使う「タイマーのような状態」を返す (予定の最中は作業中、それ以外は休憩中として扱う)
function renderSchedule(now) {
  const status = scheduleStatus(todayPlan(now), now);
  const progress = scheduleProgress(status, now);
  const labels = {
    period: status.item?.title,
    break: t('scheduleBreak'),
    beforeStart: t('scheduleBeforeStart'),
    done: t('scheduleDone'),
    empty: t('scheduleEmpty'),
  };
  // 数えるものがない (今日の予定が終わった・ない) ときは、今の時刻を出す
  const time = progress ? formatScheduleTime(progress.remainingMs) : formatClock(now);
  els.time.textContent = time;
  // 残り時間を数えているときは、下に小さく今の時刻を出す (大きい数字が時刻のときは出さない)
  els.clock.hidden = !progress;
  if (progress) els.clock.textContent = formatClock(now);
  els.label.textContent = labels[status.kind];
  els.label.title = labels[status.kind];
  // 色: 予定の最中は作業の色、休み時間・予定の前は短い休憩の色、予定がないときは長い休憩の色
  const colorMode = { period: 'work', break: 'shortBreak', beforeStart: 'shortBreak', done: 'longBreak', empty: 'longBreak' }[status.kind];
  document.body.dataset.mode = colorMode;
  document.title = `${time} - ${labels[status.kind]}`;
  els.progress.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - (progress?.ratio ?? 1)));

  // 次の予定 (今の予定が最後なら「このあとの予定はありません」)
  let nextText = null;
  if (status.next) nextText = t('scheduleNext', { start: status.next.start, end: status.next.end, title: status.next.title });
  else if (status.kind === 'period') nextText = t('scheduleNoMore');
  els.scheduleNext.hidden = nextText === null;
  els.scheduleNext.textContent = nextText ?? '';
  els.scheduleNext.title = nextText ?? '';

  const working = status.kind === 'period';
  return { mode: working ? 'work' : 'shortBreak', running: true, remainingMs: progress?.remainingMs ?? 0 };
}

// 区切り (予定の始まり・終わり) ごとに、アラームを鳴らして通知する。
// 同じ時刻に終わりと始まりがあるとき (続けて次の予定) は、始まりとして 1 回だけ知らせる
function checkSchedule(now) {
  const plan = todayPlan(now);
  const groups = scheduleBoundaries(plan, lastEventCheck, now);
  // 「あと N 分で〇〇」の知らせ (設定で選んだときだけ。音は鳴らさない)
  for (const item of scheduleReminders(plan, lastEventCheck, now, settings.scheduleReminder)) {
    showNotification(t('notifyReminderTitle', { n: settings.scheduleReminder, title: item.title }), t('notifySchedRange', { start: item.start, end: item.end }));
  }
  lastEventCheck = now;
  for (const { at, starts, ends } of groups) {
    playAlarm(effectiveVolume(settings, 'alarmVolume'), settings.alarmSound);
    if (starts.length > 0) {
      const item = starts.at(-1);
      showNotification(t('notifySchedStart', { title: item.title }), t('notifySchedRange', { start: item.start, end: item.end }));
    } else {
      const item = ends.at(-1);
      const next = plan.find((p) => p.startAt > at);
      showNotification(
        t('notifySchedEnd', { title: item.title }),
        next ? t('notifySchedNext', { start: next.start, title: next.title }) : t('notifySchedLast'),
      );
    }
  }
}

// モードの切り替え。時間割モードに入るときは、動いているタイマーを一時停止する (見えないところで鳴らないように)
for (const button of appModeButtons) {
  button.addEventListener('click', () => {
    const mode = button.dataset.appMode;
    if (mode === settings.appMode) return;
    if (mode === 'schedule' && state.running) state = pause(state, Date.now());
    // 切り替える前の予定の知らせは、切り替えたあとに出さない
    lastEventCheck = Date.now();
    updateSettings({ appMode: mode });
  });
}
els.scheduleNext.addEventListener('click', () => openCalendar(undefined, 'timetable'));

// --- カレンダーのタブ (カレンダー / 時間割) と時間割の編集 ---
const calTabs = [...document.querySelectorAll('[data-cal-tab]')];
let calTab = 'month';

function selectCalTab(name) {
  calTab = name;
  for (const tab of calTabs) {
    const selected = tab.dataset.calTab === name;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute('aria-controls')).hidden = !selected;
  }
  closeEventFormQuietly();
  closeSlotFormQuietly();
  renderCalendar();
  renderTimetable();
}

for (const tab of calTabs) {
  tab.addEventListener('click', () => selectCalTab(tab.dataset.calTab));
  tab.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!step) return;
    const next = calTabs[(calTabs.indexOf(tab) + step + calTabs.length) % calTabs.length];
    selectCalTab(next.dataset.calTab);
    next.focus();
  });
}

const tt = {
  picker: $('weekday-picker'),
  title: $('timetable-title'),
  add: $('slot-add'),
  list: $('slot-list'),
  empty: $('slot-empty'),
  form: $('slot-form'),
  name: $('slot-title'),
  start: $('slot-start'),
  end: $('slot-end'),
  error: $('slot-error'),
  remove: $('slot-delete'),
  cancel: $('slot-cancel'),
};
// 選んでいる曜日 (0 = 日曜)。時間割表と同じく月曜始まりで並べる
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
let selectedWeekday = new Date().getDay();
let editingSlot = null; // null / 'new' / コマの ID

// 曜日の名前 (2026-10-04 は日曜日なので、そこから数える)
const weekdayName = (weekday, style) => formatDate(new Date(2026, 9, 4 + weekday), { weekday: style });

function saveTimetable(next) {
  timetable = next;
  save('timetable', timetable);
  renderTimetable();
  renderCalendar();
  render();
}

function renderTimetable() {
  if (els.calendar.hidden || calTab !== 'timetable') return;
  const withSlots = new Set(timetable.map((slot) => slot.weekday));
  tt.picker.replaceChildren(...WEEKDAY_ORDER.map((weekday) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(weekday === selectedWeekday));
    button.setAttribute('aria-label', weekdayName(weekday, 'long'));
    button.classList.toggle('sun', weekday === 0);
    button.classList.toggle('sat', weekday === 6);
    button.classList.toggle('has-slots', withSlots.has(weekday));
    button.textContent = weekdayName(weekday, 'short');
    button.addEventListener('click', () => {
      selectedWeekday = weekday;
      closeSlotFormQuietly();
      renderTimetable();
    });
    return button;
  }));
  tt.title.textContent = weekdayName(selectedWeekday, 'long');
  const slots = slotsOn(timetable, selectedWeekday);
  tt.list.replaceChildren(...slots.map(slotItem));
  tt.empty.hidden = slots.length > 0 || editingSlot !== null;
  tt.add.disabled = editingSlot !== null || !tools.generateForm.hidden || !tools.copyForm.hidden;
  renderTimetableTools();
}

function slotItem(slot) {
  const item = document.createElement('li');
  item.className = 'event-item';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'event-open';
  const time = document.createElement('span');
  time.className = 'event-time';
  time.textContent = `${slot.start} – ${slot.end}`;
  const name = document.createElement('span');
  name.className = 'event-name';
  name.textContent = slot.title; // 自分で付けた名前も textContent で入れる
  open.append(time, name);
  open.addEventListener('click', () => openSlotForm(slot));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove-button';
  remove.textContent = '×';
  remove.setAttribute('aria-label', t('remove', { name: slot.title }));
  remove.addEventListener('click', () => deleteSlot(slot));
  item.append(open, remove);
  return item;
}

// コマの追加 (slot なし) と編集で、同じフォームを使う。新しいコマは、その曜日の最後のコマの終わりから 50 分
function openSlotForm(slot = null) {
  closeToolForms();
  editingSlot = slot ? slot.id : 'new';
  const last = slotsOn(timetable, selectedWeekday).at(-1);
  const defaultStart = last?.end ?? '09:00';
  const [h, m] = defaultStart.split(':').map(Number);
  const endMinutes = Math.min(h * 60 + m + 50, 23 * 60 + 59);
  const defaultEnd = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
  tt.name.value = slot?.title ?? '';
  tt.name.placeholder = t('eventUntitled');
  tt.start.value = slot?.start ?? defaultStart;
  tt.end.value = slot?.end ?? defaultEnd;
  tt.error.hidden = true;
  tt.remove.hidden = !slot;
  tt.form.hidden = false;
  renderTimetable();
  tt.name.focus();
}

function closeSlotFormQuietly() {
  editingSlot = null;
  tt.form.hidden = true;
  closeToolForms();
}

function closeSlotForm() {
  closeSlotFormQuietly();
  renderTimetable();
  tt.add.focus();
}

function deleteSlot(slot) {
  if (editingSlot === slot.id) closeSlotFormQuietly();
  saveTimetable(removeSlot(timetable, slot.id));
}

tt.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const isNew = editingSlot === 'new';
  if (isNew && timetable.length >= MAX_SLOTS) {
    tt.error.textContent = t('slotErrorFull', { max: MAX_SLOTS });
    tt.error.hidden = false;
    return;
  }
  const id = isNew ? nextSlotId(timetable) : editingSlot;
  const made = makeSlot({ weekday: selectedWeekday, title: tt.name.value, start: tt.start.value, end: tt.end.value }, id, t('eventUntitled'));
  if (made.error) {
    tt.error.textContent = t(made.error === 'endBeforeStart' ? 'eventErrorEndBeforeStart' : 'eventErrorInvalidTime');
    tt.error.hidden = false;
    return;
  }
  closeSlotFormQuietly();
  saveTimetable(isNew ? addSlot(timetable, made.slot) : replaceSlot(timetable, made.slot));
  tt.add.focus();
});
tt.remove.addEventListener('click', () => {
  const slot = timetable.find((s) => s.id === editingSlot);
  if (slot) deleteSlot(slot);
});
tt.cancel.addEventListener('click', closeSlotForm);
tt.add.addEventListener('click', () => openSlotForm());
// フォームの中の Esc は、カレンダーを閉じずにフォームだけを閉じる
tt.form.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  closeSlotForm();
});

// --- 時間割: まとめて作る・ほかの曜日にコピー・予定の前の知らせ ---
const tools = {
  generateOpen: $('generate-open'),
  copyOpen: $('copy-open'),
  clearDay: $('clear-day'),
  generateForm: $('generate-form'),
  generateStart: $('generate-start'),
  generatePeriod: $('generate-period'),
  generateBreak: $('generate-break'),
  generateCount: $('generate-count'),
  generatePreview: $('generate-preview'),
  generateError: $('generate-error'),
  generateCancel: $('generate-cancel'),
  copyForm: $('copy-form'),
  copyTitle: $('copy-title'),
  copyDays: $('copy-days'),
  copyError: $('copy-error'),
  copyCancel: $('copy-cancel'),
  reminder: $('schedule-reminder'),
};

// 時間割のタブのフォーム (コマ・まとめて作る・コピー) は、1 つずつしか開かない
function closeToolForms() {
  tools.generateForm.hidden = true;
  tools.copyForm.hidden = true;
}

function renderTimetableTools() {
  const hasSlots = slotsOn(timetable, selectedWeekday).length > 0;
  const busy = editingSlot !== null || !tools.generateForm.hidden || !tools.copyForm.hidden;
  tools.generateOpen.disabled = busy;
  tools.copyOpen.disabled = busy || !hasSlots; // コピーするコマがない曜日からはコピーできない
  tools.clearDay.disabled = busy || !hasSlots;
  tools.reminder.replaceChildren(...REMINDER_MINUTES.map((n) => {
    const option = document.createElement('option');
    option.value = String(n);
    option.textContent = n === 0 ? t('reminderOff') : t('reminderMinutes', { n });
    return option;
  }));
  tools.reminder.value = String(settings.scheduleReminder);
}

// まとめて作る: 入れた値で、何時から何時までに何コマできるかを先に見せる
function generateInput() {
  return {
    weekday: selectedWeekday,
    start: tools.generateStart.value,
    period: tools.generatePeriod.value,
    breakMinutes: tools.generateBreak.value,
    count: tools.generateCount.value,
  };
}

function updateGeneratePreview() {
  const result = generateDay(generateInput(), timetable, (n) => t('generateName', { n }));
  tools.generateError.hidden = true;
  if (result.error) {
    tools.generatePreview.textContent = '';
    return result;
  }
  const created = slotsOn(result.slots, selectedWeekday);
  tools.generatePreview.textContent = t('generatePreview', { count: result.created, start: created[0].start, end: created.at(-1).end });
  return result;
}

function openGenerateForm() {
  closeSlotFormQuietly();
  tools.copyForm.hidden = true;
  // 初めの値は、よくある学校の時間割 (8:50 から 50 分授業・休み 10 分・6 コマ)
  tools.generateStart.value ||= '08:50';
  tools.generatePeriod.value ||= '50';
  tools.generateBreak.value ||= '10';
  tools.generateCount.value ||= '6';
  tools.generateForm.hidden = false;
  updateGeneratePreview();
  renderTimetable();
  tools.generateStart.focus();
}

for (const input of [tools.generateStart, tools.generatePeriod, tools.generateBreak, tools.generateCount]) {
  input.addEventListener('input', updateGeneratePreview);
}

tools.generateForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const result = updateGeneratePreview();
  if (result.error) {
    tools.generateError.textContent = t(result.error === 'noRoom' ? 'generateErrorNoRoom' : result.error === 'invalidTime' ? 'eventErrorInvalidTime' : 'generateErrorRange');
    tools.generateError.hidden = false;
    return;
  }
  // すでにコマがある曜日は、置き換えてよいか確かめる
  if (slotsOn(timetable, selectedWeekday).length > 0 && !confirm(t('confirmReplaceDay', { weekday: weekdayName(selectedWeekday, 'long') }))) return;
  tools.generateForm.hidden = true;
  saveTimetable(result.slots);
  tools.generateOpen.focus();
});

function openCopyForm() {
  closeSlotFormQuietly();
  tools.generateForm.hidden = true;
  tools.copyTitle.textContent = t('copyTitle', { weekday: weekdayName(selectedWeekday, 'long') });
  tools.copyDays.replaceChildren(...WEEKDAY_ORDER.map((weekday) => {
    const label = document.createElement('label');
    label.className = 'copy-day';
    label.classList.toggle('sun', weekday === 0);
    label.classList.toggle('sat', weekday === 6);
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = String(weekday);
    box.disabled = weekday === selectedWeekday; // コピー元の曜日
    box.setAttribute('aria-label', weekdayName(weekday, 'long'));
    const name = document.createElement('span');
    name.textContent = weekdayName(weekday, 'short');
    name.setAttribute('aria-hidden', 'true');
    label.append(box, name);
    return label;
  }));
  tools.copyError.hidden = true;
  tools.copyForm.hidden = false;
  renderTimetable();
  tools.copyDays.querySelector('input:not(:disabled)')?.focus();
}

tools.copyForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const targets = [...tools.copyDays.querySelectorAll('input:checked')].map((box) => Number(box.value));
  const showError = (key) => {
    tools.copyError.textContent = t(key, { max: MAX_SLOTS });
    tools.copyError.hidden = false;
  };
  if (targets.length === 0) return showError('copyErrorNone');
  const result = copyDay(timetable, selectedWeekday, targets);
  if (!result) return showError('copyErrorFull');
  // コピー先にコマがある曜日は、置き換えてよいか確かめる
  const replaced = targets.filter((weekday) => slotsOn(timetable, weekday).length > 0);
  if (replaced.length > 0) {
    const days = replaced.map((weekday) => weekdayName(weekday, 'long')).join(t('listSeparator'));
    if (!confirm(t('confirmReplaceDays', { days }))) return;
  }
  tools.copyForm.hidden = true;
  saveTimetable(result);
  tools.copyOpen.focus();
});

tools.generateOpen.addEventListener('click', openGenerateForm);
tools.copyOpen.addEventListener('click', openCopyForm);
// この曜日のコマをすべて消す (1 つずつ消すときと違い、まとめて消えるので確認する)
tools.clearDay.addEventListener('click', () => {
  if (!confirm(t('confirmClearDay', { weekday: weekdayName(selectedWeekday, 'long') }))) return;
  saveTimetable(replaceDay(timetable, selectedWeekday, []));
  tt.add.focus();
});
for (const [form, cancel, opener] of [[tools.generateForm, tools.generateCancel, tools.generateOpen], [tools.copyForm, tools.copyCancel, tools.copyOpen]]) {
  const close = () => {
    form.hidden = true;
    renderTimetable();
    opener.focus();
  };
  cancel.addEventListener('click', close);
  // フォームの中の Esc は、カレンダーを閉じずにフォームだけを閉じる
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    close();
  });
}
tools.reminder.addEventListener('change', () => updateSettings({ scheduleReminder: tools.reminder.value }));

// 取り込んだファイルの一覧を読み込む。選んでいたファイルが見つからなければ (手で消された場合など)「なし」に戻す
async function loadMedia() {
  if (!window.media) return;
  [media.wallpapers, media.bgm] = await Promise.all([window.media.list('wallpapers'), window.media.list('bgm')]);
  const missing = (kind, id) => id.startsWith('import:') && !media[kind].some((m) => `import:${m.file}` === id);
  const patch = {};
  if (missing('wallpapers', settings.wallpaper)) patch.wallpaper = 'none';
  if (missing('bgm', settings.bgm)) patch.bgm = 'none';
  updateSettings(patch);
}

// --- 自動アップデートの案内 ---
// window.updater は preload.cjs が用意する。ブラウザで直接開いたときなどは存在しないので、何もしない
const UPDATE_VIEW = {
  available: { text: (u) => t('updateAvailable', { version: u.version }), action: 'updateNow', later: true },
  downloading: { text: (u) => t('downloading', { percent: u.percent }), action: null, later: false },
  downloaded: { text: () => t('updateReady'), action: 'restartToUpdate', later: true },
  error: { text: () => t('updateFailed'), action: 'retry', later: true },
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
  els.updateAction.textContent = view.action ? t(view.action) : '';
  els.updateLater.hidden = !view.later;
}

if (window.updater) {
  window.updater.onEvent(dispatchUpdate);
  window.updater.getVersion().then((version) => {
    appVersion = version;
    els.appVersion.textContent = t('version', { version });
    els.appVersion.hidden = false;
  });

  els.updateAction.addEventListener('click', () => {
    if (updateState.phase === 'downloaded') {
      // 再起動するとタイマーが止まるので、動いているときは確認する
      if (state.running && !confirm(t('confirmRestart'))) return;
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
applyAppearance();
applyLanguage();
bgm.setSource(settings.bgm);
bgm.setVolume(effectiveVolume(settings, 'bgmVolume'));
renderVolumes();
renderChoices();
loadMedia();
setInterval(update, 250);
render();
