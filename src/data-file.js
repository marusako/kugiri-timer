// 保存データのファイル (data.json) と、書き出し・読み込みのファイルの形 (画面にも Electron にも依存しない純粋な関数)。
// 形: { app: 'kugiri-timer', version: 1, savedAt: '2026-10-10T12:00:00.000Z', data: { settings, stats, events, timetable, focusLog } }
// - data の中身の正しさ (値の範囲など) は、読み込んだあとに画面側の parseSettings・parseEvents などが確かめる。
//   ここでは、知っている項目だけを残すことと、ファイルの形だけを確かめる
// - 取り込んだ曲と壁紙のファイルは大きいので、ここには入れない (media フォルダーにある)

export const DATA_KEYS = Object.freeze(['settings', 'stats', 'events', 'timetable', 'focusLog']);
export const FILE_VERSION = 1;
export const APP_ID = 'kugiri-timer';
// 1 つの項目の大きさの上限 (文字数)。おかしな値で保存ファイルが大きくなりすぎないように
export const MAX_VALUE_LENGTH = 5 * 1024 * 1024;

// 知っている項目で、JSON にできて、大きすぎない値か
export function isStorableValue(key, value) {
  if (!DATA_KEYS.includes(key) || value === undefined) return false;
  try {
    const text = JSON.stringify(value);
    return typeof text === 'string' && text.length <= MAX_VALUE_LENGTH;
  } catch {
    return false; // 循環参照など
  }
}

// 知っている項目だけを残す
export function pickData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return Object.fromEntries(DATA_KEYS.filter((key) => key in data && isStorableValue(key, data[key])).map((key) => [key, data[key]]));
}

// ファイルに書く文字 (人が読めるように字下げする)
export function serializeData(data, now = new Date()) {
  return `${JSON.stringify({ app: APP_ID, version: FILE_VERSION, savedAt: now.toISOString(), data: pickData(data) }, null, 2)}\n`;
}

// ファイルの文字を読む。正しい形でなければ null (知っている項目が 1 つもないものも null)
export function parseDataFile(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text).replace(/^﻿/, '')); // メモ帳で保存すると先頭に付くことがある印 (BOM) を除く
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || parsed.app !== APP_ID || !Number.isInteger(parsed.version)) return null;
  if (parsed.version > FILE_VERSION) return null; // 新しい版のアプリで書いたファイルは、形が違うかもしれないので読まない
  const data = pickData(parsed.data);
  return Object.keys(data).length > 0 ? data : null;
}

// 書き出すファイルの初めの名前 (例: kugiri-timer-backup-2026-10-10.json)
export function backupFileName(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${APP_ID}-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}
