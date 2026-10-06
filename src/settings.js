// 設定の既定値と、外から来た値 (画面の入力・保存データ) を安全な値に整える処理
import { LANGUAGES } from './i18n.js';
import { ALARM_SOUNDS, DEFAULT_ALARM } from './alarms.js';
import { SE_SOUNDS, DEFAULT_SE } from './se-sounds.js';
import { TIMER_FONTS, DEFAULT_TIMER_FONT } from './fonts.js';
import { parseCustomPresets } from './presets.js';
import { REPEAT_MODES, ALL_TRACKS, parsePlaylists } from './playlist.js';
import { REMINDER_MINUTES, GENERATE_DEFAULTS, parseGenerateOptions } from './schedule.js';

export const DEFAULT_SETTINGS = Object.freeze({
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4, // 何回作業したら長い休憩にするか
  masterVolume: 100, // すべての音をまとめて上げ下げする (0〜100、0 は消音)
  alarmVolume: 60, // セッション終了のチャイム (0〜100、0 は消音)
  alarmSound: DEFAULT_ALARM, // セッション終了の音の種類 (alarms.js の ALARM_SOUNDS)
  bgmVolume: 40, // 作業中の BGM
  seVolume: 40, // ボタンの操作音
  seSound: DEFAULT_SE, // ボタンの操作音の種類 (se-sounds.js の SE_SOUNDS)
  theme: 'system', // 'system' は Windows の設定に合わせる
  wallpaper: 'none', // 'none' / 'preset:<id>' / 'import:<保存ファイル名>'
  cardOpacity: 72, // 壁紙の上のタイマーのカード (すりガラス) の不透明度 (0〜100、0 は完全に透明)
  timerFont: DEFAULT_TIMER_FONT, // タイマーの数字のフォント (fonts.js の TIMER_FONTS)
  bgm: 'none', // 'none' / 'noise:<種類>' / 'import:<保存ファイル名>'
  bgmOrder: [], // 取り込んだ曲の並び順 (保存ファイル名の一覧。playlist.js の orderTracks で、今ある曲に合わせる)
  bgmRepeat: 'all', // 取り込んだ曲のリピート ('off' / 'all' / 'one')
  bgmShuffle: false, // 取り込んだ曲をシャッフルして再生するか
  bgmPlaylists: [], // 自分で作ったプレイリスト (playlist.js。{ id, name, tracks })
  bgmPlaylist: ALL_TRACKS, // 再生する一覧。'all' (全曲) か、bgmPlaylists の id
  language: null, // i18n.js の LANGUAGES の id。null は「まだ決めていない」(初回起動時に Windows の言語から決める)
  showStats: true, // メイン画面の Today / Round の行を表示するか
  appMode: 'timer', // メイン画面のモード: 'timer' (タイマー) / 'schedule' (時間割。時計どおりに動く)
  scheduleReminder: 0, // 時間割モードで、予定の何分前に知らせるか (schedule.js の REMINDER_MINUTES。0 は知らせない)
  timetableGenerate: GENERATE_DEFAULTS, // 「まとめて作る」で最後に使った値 (次に開いたときの初めの値)
  customPresets: [], // 自分で保存したタイマーのプリセット (presets.js)
});

// 数値の設定の範囲。画面のホイールの選択肢もここから作る
export const RANGES = Object.freeze({
  workMinutes: [1, 120],
  shortBreakMinutes: [1, 60],
  longBreakMinutes: [1, 120],
  longBreakInterval: [2, 10],
  masterVolume: [0, 100],
  alarmVolume: [0, 100],
  bgmVolume: [0, 100],
  seVolume: [0, 100],
  cardOpacity: [0, 100],
});

export const THEMES = Object.freeze(['system', 'light', 'dark']);
export const APP_MODES = Object.freeze(['timer', 'schedule']);

const LANGUAGE_IDS = LANGUAGES.map((l) => l.id);

// 壁紙と BGM の ID の形。取り込んだファイルは保存時の名前 (英数字とハイフン) だけを許し、
// フォルダーの場所などを指せないようにする
const WALLPAPER_ID = /^(none|preset:[a-z]+|import:[a-z0-9-]+\.[a-z0-9]+)$/;
const BGM_ID = /^(none|noise:[a-z]+|import:[a-z0-9-]+\.[a-z0-9]+)$/;

function toInt(value, [min, max], fallback) {
  const n = Math.round(Number(value));
  // Number('') は 0 になるので、空文字も「入力なし」として既定値に戻す
  if (value === '' || value == null || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// 取り込んだ曲の保存名の一覧。保存名の形 (英数字とハイフン + 拡張子) のものだけを、重ならないように残す
const STORED_NAME = /^[a-z0-9-]+\.[a-z0-9]+$/;
function parseFileList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((name) => typeof name === 'string' && STORED_NAME.test(name)))];
}

function pick(value, pattern, fallback) {
  return typeof value === 'string' && pattern.test(value) ? value : fallback;
}

export function parseSettings(input) {
  // 以前の版の volume (音量が 1 つだった頃) は、アラームの音量として引き継ぐ
  const raw = { ...(input ?? {}) };
  if (raw.alarmVolume == null && raw.volume != null) raw.alarmVolume = raw.volume;

  const result = {};
  for (const [key, range] of Object.entries(RANGES)) {
    result[key] = toInt(raw[key], range, DEFAULT_SETTINGS[key]);
  }
  result.alarmSound = ALARM_SOUNDS.includes(raw.alarmSound) ? raw.alarmSound : DEFAULT_SETTINGS.alarmSound;
  result.seSound = SE_SOUNDS.includes(raw.seSound) ? raw.seSound : DEFAULT_SETTINGS.seSound;
  result.theme = THEMES.includes(raw.theme) ? raw.theme : DEFAULT_SETTINGS.theme;
  result.timerFont = TIMER_FONTS.some((f) => f.id === raw.timerFont) ? raw.timerFont : DEFAULT_SETTINGS.timerFont;
  result.wallpaper = pick(raw.wallpaper, WALLPAPER_ID, DEFAULT_SETTINGS.wallpaper);
  result.bgm = pick(raw.bgm, BGM_ID, DEFAULT_SETTINGS.bgm);
  result.bgmOrder = parseFileList(raw.bgmOrder);
  result.bgmRepeat = REPEAT_MODES.includes(raw.bgmRepeat) ? raw.bgmRepeat : DEFAULT_SETTINGS.bgmRepeat;
  // true のときだけオン (項目がない以前の保存データや、おかしな値ならオフ)
  result.bgmShuffle = raw.bgmShuffle === true;
  result.bgmPlaylists = parsePlaylists(raw.bgmPlaylists);
  // 消したプレイリストを選んでいた・おかしな値なら「全曲」
  result.bgmPlaylist = result.bgmPlaylists.some((p) => p.id === raw.bgmPlaylist) ? raw.bgmPlaylist : ALL_TRACKS;
  result.language = LANGUAGE_IDS.includes(raw.language) ? raw.language : DEFAULT_SETTINGS.language;
  // false のときだけ隠す (項目がない以前の保存データや、おかしな値なら表示する)
  result.showStats = raw.showStats !== false;
  result.appMode = APP_MODES.includes(raw.appMode) ? raw.appMode : DEFAULT_SETTINGS.appMode;
  result.timetableGenerate = parseGenerateOptions(raw.timetableGenerate);
  result.scheduleReminder = REMINDER_MINUTES.includes(Number(raw.scheduleReminder)) ? Number(raw.scheduleReminder) : DEFAULT_SETTINGS.scheduleReminder;
  result.customPresets = parseCustomPresets(raw.customPresets, RANGES);
  // 既定値と同じ並び順にそろえる (以前の版の autoStart・volume など、知らない項目はここで落ちる)
  return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((key) => [key, result[key]]));
}

// Sound タブの「初期化」で既定値に戻す項目。BGM の選択 (bgm) は、選び直す手間がかからないよう残す
const SOUND_RESET_KEYS = ['masterVolume', 'alarmVolume', 'alarmSound', 'bgmVolume', 'seVolume', 'seSound'];

export function resetSoundSettings(settings) {
  return { ...settings, ...Object.fromEntries(SOUND_RESET_KEYS.map((key) => [key, DEFAULT_SETTINGS[key]])) };
}

// 実際に鳴らす音量 (0〜100)。マスター × それぞれの音量なので、全体を下げても Alarm・BGM・SE の比率は変わらない
export function effectiveVolume(settings, key) {
  return (settings.masterVolume * settings[key]) / 100;
}
