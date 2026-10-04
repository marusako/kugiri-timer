// 設定の既定値と、外から来た値 (画面の入力・保存データ) を安全な値に整える処理
import { LANGUAGES } from './i18n.js';

export const DEFAULT_SETTINGS = Object.freeze({
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4, // 何回作業したら長い休憩にするか
  alarmVolume: 60, // セッション終了のチャイム (0〜100、0 は消音)
  bgmVolume: 40, // 作業中の BGM
  seVolume: 40, // ボタンの操作音
  theme: 'system', // 'system' は Windows の設定に合わせる
  wallpaper: 'none', // 'none' / 'preset:<id>' / 'import:<保存ファイル名>'
  bgm: 'none', // 'none' / 'noise:<種類>' / 'import:<保存ファイル名>'
  language: null, // i18n.js の LANGUAGES の id。null は「まだ決めていない」(初回起動時に Windows の言語から決める)
  showStats: true, // メイン画面の Today / Round の行を表示するか
});

// 数値の設定の範囲。画面のホイールの選択肢もここから作る
export const RANGES = Object.freeze({
  workMinutes: [1, 120],
  shortBreakMinutes: [1, 60],
  longBreakMinutes: [1, 120],
  longBreakInterval: [2, 10],
  alarmVolume: [0, 100],
  bgmVolume: [0, 100],
  seVolume: [0, 100],
});

export const THEMES = Object.freeze(['system', 'light', 'dark']);

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
  result.theme = THEMES.includes(raw.theme) ? raw.theme : DEFAULT_SETTINGS.theme;
  result.wallpaper = pick(raw.wallpaper, WALLPAPER_ID, DEFAULT_SETTINGS.wallpaper);
  result.bgm = pick(raw.bgm, BGM_ID, DEFAULT_SETTINGS.bgm);
  result.language = LANGUAGE_IDS.includes(raw.language) ? raw.language : DEFAULT_SETTINGS.language;
  // false のときだけ隠す (項目がない以前の保存データや、おかしな値なら表示する)
  result.showStats = raw.showStats !== false;
  // 既定値と同じ並び順にそろえる (以前の版の autoStart・volume など、知らない項目はここで落ちる)
  return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((key) => [key, result[key]]));
}
