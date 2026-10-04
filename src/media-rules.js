// 取り込んだ壁紙・BGM のファイルについての決まりごと。
// メインプロセス (media-store.js) と画面 (renderer.js) の両方から使う純粋な関数。

export const MEDIA_KINDS = Object.freeze({
  wallpapers: { label: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
  bgm: { label: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a'] },
});

function extensionOf(name) {
  const match = /\.([^.]+)$/.exec(name);
  return match ? match[1].toLowerCase() : '';
}

// 取り込もうとしているファイルが、その種類で受け付ける形式か
export function isAllowedFile(kind, name) {
  const rule = MEDIA_KINDS[kind];
  return Boolean(rule) && rule.extensions.includes(extensionOf(name));
}

// アプリが保存時に付けた名前 (英数字とハイフン + 許可された拡張子) か。
// 読み込み口で「../」などを使って保存フォルダーの外を読まれないよう、この形以外は拒否する
export function isStoredName(kind, name) {
  return /^[a-z0-9-]+\.[a-z0-9]+$/.test(name) && isAllowedFile(kind, name);
}

// 画面から取り込んだファイルを読むための URL (main.js が app-media: の読み込み口を用意する)
export function mediaUrl(kind, storedName) {
  return `app-media://${kind}/${storedName}`;
}

// 読み込み口が返すファイルの種類 (Content-Type)
const MIME_TYPES = Object.freeze({
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
});

export function mimeType(name) {
  return MIME_TYPES[extensionOf(name)] ?? 'application/octet-stream';
}

// 「ファイルの途中から読みたい」という要求 (Range ヘッダー) を、読む範囲 { start, end } (end を含む) にする。
// 音声の再生位置を動かす (シーク) と、再生の部品がこの要求を送ってくる。
// - Range がない・読めない形・複数の範囲のときは null (ファイル全体を返す。HTTP では Range を無視してよい)
// - ファイルの外を指しているときは 'unsatisfiable' (416 を返す)
export function parseByteRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  const [, first, last] = match;
  if (first === '') {
    // 「最後の n バイト」
    const length = Number(last);
    if (length === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(first);
  if (start >= size) return 'unsatisfiable';
  if (last === '') return { start, end: size - 1 };
  const end = Number(last);
  if (end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}
