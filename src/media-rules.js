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
