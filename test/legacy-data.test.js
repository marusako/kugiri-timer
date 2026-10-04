import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { migrateLegacyData } from '../legacy-data.js';

// 一時フォルダーに、古いフォルダー (from) と新しいフォルダー (to) を作る
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-data-'));
  const from = path.join(root, 'pomodoro-timer');
  const to = path.join(root, 'kugiri-timer');
  const write = (dir, file, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  };
  return { root, from, to, write, read: (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8') };
}

test('新しいフォルダーに設定がなければ、設定・記録と取り込んだファイルをコピーする', () => {
  const { from, to, write, read } = setup();
  write(from, 'Local Storage/leveldb/000003.log', 'settings');
  write(from, 'media/bgm/a1.mp3', 'song');
  write(from, 'Cache/data_0', 'cache');
  assert.equal(migrateLegacyData(from, to), true);
  assert.equal(read(to, 'Local Storage/leveldb/000003.log'), 'settings');
  assert.equal(read(to, 'media/bgm/a1.mp3'), 'song');
  assert.equal(fs.existsSync(path.join(to, 'Cache')), false, 'キャッシュはコピーしない');
  assert.equal(read(from, 'media/bgm/a1.mp3'), 'song', '古いフォルダーは残す');
});

test('新しいフォルダーにすでに設定があれば、何もしない (上書きしない)', () => {
  const { from, to, write, read } = setup();
  write(from, 'Local Storage/leveldb/000003.log', 'old');
  write(to, 'Local Storage/leveldb/000003.log', 'new');
  assert.equal(migrateLegacyData(from, to), false);
  assert.equal(read(to, 'Local Storage/leveldb/000003.log'), 'new');
});

test('Electron が先に作ったほかのファイルがあっても、設定がなければコピーする', () => {
  const { from, to, write, read } = setup();
  write(from, 'Local Storage/leveldb/000003.log', 'settings');
  write(to, 'Local State', '{}');
  assert.equal(migrateLegacyData(from, to), true);
  assert.equal(read(to, 'Local Storage/leveldb/000003.log'), 'settings');
});

test('古いフォルダーがない (初めてインストールした) ときは何もしない', () => {
  const { from, to } = setup();
  assert.equal(migrateLegacyData(from, to), false);
  assert.equal(fs.existsSync(to), false);
});

test('片方だけあるときは、あるものだけコピーする', () => {
  const { from, to, write, read } = setup();
  write(from, 'media/wallpapers/w1.png', 'image');
  assert.equal(migrateLegacyData(from, to), true);
  assert.equal(read(to, 'media/wallpapers/w1.png'), 'image');
});
