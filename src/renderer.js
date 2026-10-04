// レンダラープロセス: 画面の表示とボタン操作を担当する (ブラウザと同じ環境)
import { createState, durationMs, start, pause, reset, tick, skip, applySettings, formatTime } from './timer.js';
import { RANGES, parseSettings, effectiveVolume, resetSoundSettings } from './settings.js';
import { addCompletion, todayCount } from './stats.js';
import { INITIAL_UPDATE_STATE, nextUpdateState, isBannerVisible } from './update-status.js';
import { createWheelPicker } from './wheel-picker.js';
import { WALLPAPER_PRESETS } from './wallpapers.js';
import { mediaUrl } from './media-rules.js';
import { NOISE_TYPES } from './noise.js';
import { ALARM_SOUNDS } from './alarms.js';
import { escapeAction } from './fullscreen.js';
import { shouldPlayBgm } from './bgm.js';
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
  bgmList: $('bgm-list'),
  wallpaperGrid: $('wallpaper-grid'),
  appVersion: $('app-version'),
  updateBanner: $('update-banner'),
  updateText: $('update-text'),
  updateProgress: $('update-progress'),
  updateAction: $('update-action'),
  updateLater: $('update-later'),
  language: $('language'),
  stats: $('stats'),
  showStats: $('show-stats'),
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
// 言語がまだ決まっていなければ (初回起動・以前の版から更新した直後)、Windows の言語から決めて保存する
if (settings.language === null) {
  settings = { ...settings, language: detectLanguage(navigator.language) };
  save('settings', settings);
}

// 画面の文字は、すべて翻訳表 (i18n.js) から選んでいる言語で取り出す
const t = (key, params) => translate(settings.language, key, params);
let stats = load('stats', null);
let state = createState(settings);

// 取り込んだ壁紙・BGM の一覧 ({ file: 保存名, name: 元のファイル名 })。window.media がない環境では空のまま
const media = { wallpapers: [], bgm: [] };
const bgm = new BgmPlayer((storedName) => mediaUrl('bgm', storedName));

// 終わると次のモードが自動で始まっているので、何が始まったかを知らせる
function notify(finishedMode) {
  const started = t('notifyStarted', { mode: t(`modeText.${state.mode}`) });
  const body = finishedMode === 'work' ? t('notifyWorkDone', { started }) : started;
  new Notification(t('notifyTitle', { mode: t(`modeText.${finishedMode}`) }), { body, silent: true });
}

// --- 画面の更新 ---
function render() {
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

  // 隠していても回数の記録は続け、表示を戻したら正しい回数を出す
  els.stats.hidden = !settings.showStats;
  els.today.textContent = String(todayCount(stats, new Date()));
  els.cycle.textContent = String(state.completedWork % settings.longBreakInterval);
  els.interval.textContent = String(settings.longBreakInterval);

  bgm.sync(shouldPlayBgm(state, settings.bgm));
}

function update() {
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
    playClick(effectiveVolume(settings, 'seVolume'));
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
    const action = escapeAction({ settingsOpen: !els.settings.hidden, fullScreen });
    if (action === 'closeSettings') closeSettings();
    if (action === 'exitFullScreen') window.windowControls.exitFullScreen();
    return;
  }
  // Space で開始/停止 (設定画面を開いているときと、入力欄・選択欄・ボタンにいるときは除く)
  if (
    e.code === 'Space' &&
    els.settings.hidden &&
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
const tabs = [...document.querySelectorAll('[role="tab"]')];

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
  els.settings.hidden = false;
  selectTab(tabs.find((tab) => tab.getAttribute('aria-selected') === 'true').dataset.tab);
  tabs.find((tab) => tab.tabIndex === 0).focus();
}

function closeSettings() {
  els.settings.hidden = true;
  els.openSettings.focus();
}

els.openSettings.addEventListener('click', openSettings);

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
  return picker;
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
  se: () => playClick(effectiveVolume(settings, 'seVolume')),
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
    if (!confirm(t('confirmRemove', { name: entry.name }))) return;
    await window.media.remove(kind, entry.file);
    media[kind] = media[kind].filter((m) => m.file !== entry.file);
    // 使っていたものを消したら「なし」に戻す
    const settingKey = kind === 'bgm' ? 'bgm' : 'wallpaper';
    if (settings[settingKey] === `import:${entry.file}`) updateSettings({ [settingKey]: 'none' });
    else renderChoices();
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

function renderBgmList() {
  const items = [choiceButton(t('none'), 'bgm', 'none')];
  for (const type of NOISE_TYPES) items.push(choiceButton(t(`noise.${type}`), 'bgm', `noise:${type}`));
  for (const entry of media.bgm) {
    const item = choiceButton(entry.name, 'bgm', `import:${entry.file}`);
    item.append(removeButton('bgm', entry, entry.name));
    items.push(item);
  }
  if (window.media) {
    items.push(importButton('bgm', 'secondary small import-button', (b) => { b.textContent = t('importEllipsis'); }));
  }
  els.bgmList.replaceChildren(...items);
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

function renderChoices() {
  renderAlarmList();
  renderBgmList();
  renderWallpaperGrid();
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
