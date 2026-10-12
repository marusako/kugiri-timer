// 取り込んだ壁紙・BGM を、ブラウザーの仕組みだけでしまう (Android 版と、ブラウザーで画面だけを開いたとき)。
// パソコン版の window.media (preload.cjs → media-store.js) と同じ形の操作を用意する:
//   list(kind) → [{ file, name }]、import(kind) → { added, skipped }、remove(kind, file)、cover(file) → { mime, data } | null
// - ファイルは <input type="file"> で選ぶ (Android 版では、Capacitor が Android のファイル選択の画面につなぐ)
// - 選んだファイルの中身は IndexedDB (ブラウザーが持つデータベース) にしまう。アプリを更新しても残り、アンインストールすると消える
// - 使うときは blob: の URL にする。url(kind, file) で同期的に返せるように、list と import のときに作っておく
import { isStoredName, storedNameFor, acceptFor } from './media-rules.js';
import { extractCover } from './cover-art.js';

const DB_NAME = 'kugiri-media';
const STORE = 'files';

// IndexedDB の要求 (request) を Promise にする
function done(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDb() {
  const request = indexedDB.open(DB_NAME, 1);
  // 1 件 = { key: '<種類>/<保存名>', kind, file: 保存名, name: 元のファイル名, blob: 中身, addedAt: 取り込んだ順 }
  request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
  return done(request);
}

// ファイル選択の画面を開き、選ばれたファイルを返す (やめたら空の配列)
function pickFiles(kind) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = acceptFor(kind);
    input.addEventListener('change', () => resolve([...input.files]), { once: true });
    input.addEventListener('cancel', () => resolve([]), { once: true });
    input.click();
  });
}

// ブラウザーに IndexedDB がなければ null (取り込みのボタンを出さない)
export function createWebMedia() {
  if (typeof indexedDB === 'undefined') return null;
  let dbPromise = null;
  const db = () => (dbPromise ??= openDb());
  const urls = new Map(); // key → blob: の URL
  const keyOf = (kind, file) => `${kind}/${file}`;

  function urlFor(record) {
    if (!urls.has(record.key)) urls.set(record.key, URL.createObjectURL(record.blob));
    return urls.get(record.key);
  }

  async function records(kind) {
    const all = await done((await db()).transaction(STORE).objectStore(STORE).getAll());
    return all.filter((r) => r.kind === kind).sort((a, b) => a.addedAt - b.addedAt);
  }

  return {
    async list(kind) {
      const found = await records(kind);
      for (const record of found) urlFor(record);
      return found.map(({ file, name }) => ({ file, name }));
    },

    async import(kind) {
      const files = await pickFiles(kind);
      const added = [];
      const skipped = [];
      for (const picked of files) {
        const file = storedNameFor(kind, picked.name, crypto.randomUUID());
        if (!file) {
          skipped.push(picked.name);
          continue;
        }
        // 元のファイルを動かしたり消したりしても使い続けられるように、中身を読んでからしまう
        const blob = new Blob([await picked.arrayBuffer()], { type: picked.type });
        const record = { key: keyOf(kind, file), kind, file, name: picked.name, blob, addedAt: Date.now() + added.length };
        await done((await db()).transaction(STORE, 'readwrite').objectStore(STORE).put(record));
        urlFor(record);
        added.push({ file, name: picked.name });
      }
      return { added, skipped };
    },

    async remove(kind, file) {
      const key = keyOf(kind, file);
      await done((await db()).transaction(STORE, 'readwrite').objectStore(STORE).delete(key));
      if (urls.has(key)) URL.revokeObjectURL(urls.get(key));
      urls.delete(key);
    },

    // 曲のファイルの中のジャケットの絵 (cover-art.js)。{ mime, data: Uint8Array } か、なければ null
    async cover(file) {
      if (!isStoredName('bgm', file)) return null;
      const record = await done((await db()).transaction(STORE).objectStore(STORE).get(keyOf('bgm', file)));
      return record ? extractCover(new Uint8Array(await record.blob.arrayBuffer())) : null;
    },

    // 保存名の決まりを満たし、list か import で読んだものだけ URL を返す (なければ空の文字)
    url(kind, file) {
      return isStoredName(kind, file) ? urls.get(keyOf(kind, file)) ?? '' : '';
    },
  };
}
