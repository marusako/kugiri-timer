import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseReleaseNotes, notesPathForTag } from '../scripts/release-notes.mjs';

test('1 行目の「# 」の後ろがタイトル、残りが説明文になる', () => {
  const { title, body } = parseReleaseNotes('# v1.2.0 — 新機能\n\n説明の段落\n\n## 見出し\n- 項目\n');
  assert.equal(title, 'v1.2.0 — 新機能');
  assert.equal(body, '説明の段落\n\n## 見出し\n- 項目');
});

test('Windows の改行 (CRLF) でも読める', () => {
  const { title, body } = parseReleaseNotes('# v1.2.0\r\n\r\n本文\r\n');
  assert.equal(title, 'v1.2.0');
  assert.equal(body, '本文');
});

test('1 行目がタイトルでなければエラー', () => {
  assert.throws(() => parseReleaseNotes('v1.2.0\n\n本文'), /タイトル/);
  assert.throws(() => parseReleaseNotes('#   \n\n本文'), /タイトル/);
});

test('説明文が空ならエラー (説明文のない Release を公開しない)', () => {
  assert.throws(() => parseReleaseNotes('# v1.2.0\n\n   \n'), /説明文/);
});

test('タグからファイルの場所を決める', () => {
  assert.equal(notesPathForTag('v1.2.0'), 'release-notes/v1.2.0.md');
});

test('タグの形がおかしければエラー (フォルダーの外を指させない)', () => {
  assert.throws(() => notesPathForTag('../secret'), /タグ/);
  assert.throws(() => notesPathForTag('1.2.0'), /タグ/);
});

test('リポジトリにある説明文は、どれも正しい形になっている', () => {
  for (const tag of ['v1.2.0', 'v1.3.0']) {
    const path = notesPathForTag(tag);
    assert.ok(existsSync(path), `${path} がない`);
    const { title } = parseReleaseNotes(readFileSync(path, 'utf8'));
    assert.ok(title.startsWith(tag), `${path} のタイトルがタグ ${tag} で始まっていない`);
  }
});
