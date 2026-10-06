// タイマーのプリセット (作業・短い休憩・長い休憩・長い休憩までの回数の組) の決まりごと。
// 画面にも Electron にも依存しない純粋関数だけにして、テストで確かめられるようにしている。
// 値の範囲 (RANGES) は settings.js から引数で受け取る (settings.js もこのファイルを読むので、お互いを読み合わないようにする)

export const PRESET_KEYS = Object.freeze(['workMinutes', 'shortBreakMinutes', 'longBreakMinutes', 'longBreakInterval']);
export const MAX_CUSTOM_PRESETS = 10;
export const MAX_NAME_LENGTH = 20;

// 名前は翻訳表 (i18n.js) の preset.<id> から出す
export const DEFAULT_PRESETS = Object.freeze([
  { id: 'standard', values: { workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4 } },
  { id: 'long', values: { workMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 30, longBreakInterval: 2 } },
]);

const CUSTOM_ID = /^custom-(\d+)$/;

// 前後の空白を除き、長すぎる名前は切り詰める (絵文字などが途中で割れないよう、文字単位で数える)
function cleanName(name) {
  return Array.from(String(name).trim()).slice(0, MAX_NAME_LENGTH).join('');
}

function sameValues(a, b) {
  return PRESET_KEYS.every((key) => a[key] === b[key]);
}

// 今の値 (settings など) と 4 つとも同じプリセットの ID。デフォルトを先に探す。なければ null
export function findMatchingPreset(customPresets, current) {
  const found = [...DEFAULT_PRESETS, ...customPresets].find((p) => sameValues(p.values, current));
  return found ? found.id : null;
}

// 次のカスタムの番号。消した番号は使い回さない (ID が同じだと、別のプリセットと取り違えるおそれがあるため)
export function nextCustomNumber(customPresets) {
  const numbers = customPresets.map((p) => Number(CUSTOM_ID.exec(p.id)?.[1] ?? 0));
  return Math.max(0, ...numbers) + 1;
}

// カスタムを足した新しい一覧を返す。名前が空なら fallbackName を使う。上限に達していたら同じ一覧を返す
export function addCustomPreset(customPresets, name, current, fallbackName) {
  if (customPresets.length >= MAX_CUSTOM_PRESETS) return customPresets;
  const values = Object.fromEntries(PRESET_KEYS.map((key) => [key, current[key]]));
  const preset = { id: `custom-${nextCustomNumber(customPresets)}`, name: cleanName(name) || cleanName(fallbackName), values };
  return [...customPresets, preset];
}

export function removeCustomPreset(customPresets, id) {
  return customPresets.filter((p) => p.id !== id);
}

// 保存データ (localStorage) から読んだ一覧を確かめる。正しい形のものだけ残し、値は範囲に収める
export function parseCustomPresets(raw, ranges) {
  if (!Array.isArray(raw)) return [];
  const result = [];
  for (const item of raw) {
    if (result.length >= MAX_CUSTOM_PRESETS) break;
    if (!item || typeof item !== 'object') continue;
    if (typeof item.id !== 'string' || !CUSTOM_ID.test(item.id) || result.some((p) => p.id === item.id)) continue;
    if (typeof item.name !== 'string' || !cleanName(item.name)) continue;
    const values = {};
    for (const key of PRESET_KEYS) {
      const n = Math.round(Number(item.values?.[key]));
      if (!Number.isFinite(n)) break;
      const [min, max] = ranges[key];
      values[key] = Math.min(max, Math.max(min, n));
    }
    if (Object.keys(values).length !== PRESET_KEYS.length) continue;
    result.push({ id: item.id, name: cleanName(item.name), values });
  }
  return result;
}
