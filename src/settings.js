// 設定の既定値と、外から来た値 (画面の入力・保存データ) を安全な値に整える処理

export const DEFAULT_SETTINGS = Object.freeze({
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4, // 何回作業したら長い休憩にするか
  volume: 60, // チャイムの音量 (0〜100、0 は消音)
  theme: 'system', // 'system' は Windows の設定に合わせる
});

// 数値の設定の範囲。画面のホイールの選択肢もここから作る
export const RANGES = Object.freeze({
  workMinutes: [1, 120],
  shortBreakMinutes: [1, 60],
  longBreakMinutes: [1, 120],
  longBreakInterval: [2, 10],
  volume: [0, 100],
});

export const THEMES = Object.freeze(['system', 'light', 'dark']);

function toInt(value, [min, max], fallback) {
  const n = Math.round(Number(value));
  // Number('') は 0 になるので、空文字も「入力なし」として既定値に戻す
  if (value === '' || value == null || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function parseSettings(input) {
  const raw = input ?? {};
  const result = {};
  for (const [key, range] of Object.entries(RANGES)) {
    result[key] = toInt(raw[key], range, DEFAULT_SETTINGS[key]);
  }
  result.theme = THEMES.includes(raw.theme) ? raw.theme : DEFAULT_SETTINGS.theme;
  // 既定値と同じ並び順にそろえる (以前の版の autoStart など、知らない項目はここで落ちる)
  return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((key) => [key, result[key]]));
}
