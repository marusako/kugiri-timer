// 取り込んだ壁紙・BGM の管理 (メインプロセス側)。
// - 選んだファイルは、アプリの保存フォルダー (userData/media/<種類>/) にランダムな名前でコピーする
// - 一覧 (元のファイル名と保存名の対応) は index.json に保存する
// - 画面からは app-media://<種類>/<保存名> で読み込む。保存フォルダーの外は読めないようにする
import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { MEDIA_KINDS, isAllowedFile, isStoredName, mimeType, parseByteRange } from './src/media-rules.js';

const SCHEME = 'app-media';

// 独自の読み込み口を、通常の Web ページと同じように扱わせる設定。アプリの準備完了 (ready) より前に呼ぶ必要がある。
// stream: true は、音声の途中から読む (シーク) のに必要
export function registerMediaScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

function kindDir(kind) {
  return path.join(app.getPath('userData'), 'media', kind);
}

function assertKind(kind) {
  if (!Object.hasOwn(MEDIA_KINDS, kind)) throw new Error(`unknown media kind: ${kind}`);
}

async function readIndex(kind) {
  try {
    const entries = JSON.parse(await fs.readFile(path.join(kindDir(kind), 'index.json'), 'utf8'));
    // 壊れた項目や、手で書き換えられた怪しい名前は使わない
    return Array.isArray(entries) ? entries.filter((e) => isStoredName(kind, e?.file) && typeof e.name === 'string') : [];
  } catch {
    return []; // まだ何も取り込んでいない (ファイルがない) 場合も含む
  }
}

async function writeIndex(kind, entries) {
  await fs.mkdir(kindDir(kind), { recursive: true });
  await fs.writeFile(path.join(kindDir(kind), 'index.json'), JSON.stringify(entries, null, 2));
}

// ファイルを返す。途中からの読み込み (Range) には、206 と Content-Range で答える。
// net.fetch で file:// を読むと、途中からの中身は返すものの 200 で答えるため、
// 音声の再生部品が「途中から読めない」と判断し、再生位置を動かせなかった
async function serveFile(file, rangeHeader) {
  let size;
  try {
    size = (await fs.stat(file)).size;
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const headers = { 'Content-Type': mimeType(file), 'Accept-Ranges': 'bytes' };
  const range = parseByteRange(rangeHeader, size);
  if (range === 'unsatisfiable') {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const length = Math.max(0, end - start + 1);
  // 長い曲を一度に読み込まないよう、少しずつ流して返す
  const body = length === 0 ? null : Readable.toWeb(createReadStream(file, { start, end }));
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      ...headers,
      'Content-Length': String(length),
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}

export function setupMediaStore() {
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    const kind = url.hostname;
    const name = decodeURIComponent(url.pathname.slice(1));
    if (!Object.hasOwn(MEDIA_KINDS, kind) || !isStoredName(kind, name)) {
      return new Response('Not found', { status: 404 });
    }
    return serveFile(path.join(kindDir(kind), name), request.headers.get('range'));
  });

  ipcMain.handle('media:list', (_event, kind) => {
    assertKind(kind);
    return readIndex(kind);
  });

  ipcMain.handle('media:import', async (event, kind) => {
    assertKind(kind);
    const { label, extensions } = MEDIA_KINDS[kind];
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: label, extensions }],
    });
    if (canceled) return { added: [], skipped: [] };

    await fs.mkdir(kindDir(kind), { recursive: true });
    const entries = await readIndex(kind);
    const added = [];
    const skipped = [];
    for (const source of filePaths) {
      const name = path.basename(source);
      if (!isAllowedFile(kind, name)) {
        skipped.push(name);
        continue;
      }
      // 元のファイル名は表示用に記録するだけで、保存にはランダムな名前を使う
      const file = `${randomUUID()}${path.extname(name).toLowerCase()}`;
      await fs.copyFile(source, path.join(kindDir(kind), file));
      const entry = { file, name };
      entries.push(entry);
      added.push(entry);
    }
    await writeIndex(kind, entries);
    return { added, skipped };
  });

  // アプリにコピーしたファイルだけを消す (取り込み元のファイルには触らない)
  ipcMain.handle('media:remove', async (_event, kind, file) => {
    assertKind(kind);
    if (!isStoredName(kind, file)) throw new Error('invalid media name');
    const entries = await readIndex(kind);
    await fs.rm(path.join(kindDir(kind), file), { force: true });
    await writeIndex(kind, entries.filter((e) => e.file !== file));
  });
}
