// アプリ名を「Pomodoro Timer」から「Kugiri Timer」に変えたときの、保存データの引き継ぎ (メインプロセス側)。
// 保存フォルダーはアプリ名で決まるので、%APPDATA%\pomodoro-timer から %APPDATA%\kugiri-timer に変わる。
// 新しいフォルダーにまだ設定がなければ、古いフォルダーから設定・記録と取り込んだファイルをコピーする。
// 古いフォルダーは消さずに残す (うまくいかなかったときの予備)
import fs from 'node:fs';
import path from 'node:path';

export const LEGACY_NAME = 'pomodoro-timer';

// 引き継ぐもの: 設定・完了回数 (localStorage) と、取り込んだ壁紙・BGM。
// キャッシュなどは、新しいフォルダーで作り直されるのでコピーしない
const ITEMS = ['Local Storage', 'media'];

// from から to へコピーする。コピーしたら true。
// to にすでに設定がある (引き継ぎ済み・新しい版で使い始めている) とき、from がないときは何もしない
export function migrateLegacyData(from, to) {
  if (fs.existsSync(path.join(to, 'Local Storage'))) return false;
  const items = ITEMS.filter((item) => fs.existsSync(path.join(from, item)));
  if (items.length === 0) return false;
  for (const item of items) {
    fs.cpSync(path.join(from, item), path.join(to, item), { recursive: true });
  }
  return true;
}
