// 画面 (renderer.js) やメインプロセス (main.js) は単体テストで実行しないため、
// 変数名の重複などの構文エラーがあっても気づけない。node --check で全ファイルの構文だけを検査する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const files = [
  'main.js',
  'media-store.js',
  'legacy-data.js',
  'preload.cjs',
  'scripts/release-notes.mjs',
  ...readdirSync('src').filter((f) => f.endsWith('.js')).map((f) => `src/${f}`),
];

for (const file of files) {
  test(`${file} に構文エラーがない`, () => {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });
}
