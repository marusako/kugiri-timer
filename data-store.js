// 設定・予定・時間割・記録の保存 (メインプロセス側)。保存先は保存フォルダー (userData) の data.json。
// - 画面は起動時に 1 回だけ全部を読み (store:load-all)、変えたら項目ごとに知らせてくる (store:set)
// - 書き込みは少しまとめてから行い、いったん data.json.tmp に書いてから差し替える
//   (書いている途中で電源が切れても、元の data.json が壊れないように)
// - 書き出し・読み込みは、利用者が選んだファイルに対して行う
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_KEYS, isStorableValue, serializeData, parseDataFile, backupFileName } from './src/data-file.js';

const WRITE_DELAY_MS = 500;

export function setupDataStore() {
  const file = path.join(app.getPath('userData'), 'data.json');
  const temp = `${file}.tmp`;
  let data = {};
  let exists = false;
  try {
    const parsed = parseDataFile(fs.readFileSync(file, 'utf8'));
    if (parsed) {
      data = parsed;
      exists = true;
    } else {
      // 読めない形のファイルは、上書きする前に別の名前で残しておく (あとから中身を確かめられるように)
      fs.copyFileSync(file, `${file}.broken-${Date.now()}`);
      console.error('[data] data.json could not be read; kept a copy');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[data] read failed', error);
  }

  let timer = null;
  function writeNow() {
    clearTimeout(timer);
    timer = null;
    try {
      fs.writeFileSync(temp, serializeData(data));
      fs.renameSync(temp, file);
    } catch (error) {
      console.error('[data] write failed', error);
    }
  }
  function scheduleWrite() {
    if (!timer) timer = setTimeout(writeNow, WRITE_DELAY_MS);
  }

  // 画面の起動時に、同期で全部を返す (画面は読み終わるまで先に進まない)。
  // exists が false なら、まだ data.json がない (前の版から更新した直後など)。画面が localStorage から移してくる
  ipcMain.on('store:load-all', (event) => {
    event.returnValue = { exists, data };
  });

  ipcMain.on('store:set', (_event, key, value) => {
    if (!isStorableValue(key, value)) return;
    data = { ...data, [key]: value };
    exists = true;
    scheduleWrite();
  });

  // 書き出し: 今のデータを、利用者が選んだ場所に保存する
  ipcMain.handle('store:export', async (event) => {
    if (timer) writeNow();
    const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
      defaultPath: path.join(app.getPath('documents'), backupFileName()),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { saved: false };
    fs.writeFileSync(filePath, serializeData(data));
    return { saved: true };
  });

  // 読み込み: 利用者が選んだファイルの中身を返す (入れ替えるかどうかは画面で確かめる)。
  // 正しい形でなければ { error: 'invalid' }
  ipcMain.handle('store:import', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || filePaths.length === 0) return { canceled: true };
    try {
      const stat = fs.statSync(filePaths[0]);
      if (stat.size > DATA_KEYS.length * 5 * 1024 * 1024) return { error: 'invalid' };
      const parsed = parseDataFile(fs.readFileSync(filePaths[0], 'utf8'));
      return parsed ? { data: parsed } : { error: 'invalid' };
    } catch {
      return { error: 'invalid' };
    }
  });

  // 読み込んだデータで入れ替える。画面は、このあと読み込み直して、各項目を確かめ直す
  ipcMain.handle('store:replace', (_event, next) => {
    const parsed = parseDataFile(serializeData(next));
    if (!parsed) return false;
    data = parsed;
    exists = true;
    writeNow();
    return true;
  });

  // 終了する前に、まだ書いていないものを書く
  app.on('will-quit', () => {
    if (timer) writeNow();
  });
}
