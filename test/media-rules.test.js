import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEDIA_KINDS, isAllowedFile, isStoredName, mediaUrl } from '../src/media-rules.js';

test('種類は壁紙と BGM の 2 つ', () => {
  assert.deepEqual(Object.keys(MEDIA_KINDS).sort(), ['bgm', 'wallpapers']);
});

test('壁紙は画像、BGM は音声の拡張子だけを取り込める (大文字でもよい)', () => {
  assert.equal(isAllowedFile('wallpapers', 'photo.JPG'), true);
  assert.equal(isAllowedFile('wallpapers', 'anim.gif'), true);
  assert.equal(isAllowedFile('wallpapers', 'song.mp3'), false);
  assert.equal(isAllowedFile('bgm', 'song.mp3'), true);
  assert.equal(isAllowedFile('bgm', 'rain.m4a'), true);
  assert.equal(isAllowedFile('bgm', 'virus.exe'), false);
  assert.equal(isAllowedFile('unknown', 'a.png'), false);
});

test('保存ファイル名は、アプリが付けた形 (英数字とハイフン + 許可された拡張子) だけを認める', () => {
  assert.equal(isStoredName('wallpapers', '3f2a91bc-1d2e.png'), true);
  assert.equal(isStoredName('wallpapers', '../main.js'), false);
  assert.equal(isStoredName('wallpapers', 'a/b.png'), false);
  assert.equal(isStoredName('wallpapers', 'abc.mp3'), false);
  assert.equal(isStoredName('bgm', 'abc.mp3'), true);
});

test('読み込み用の URL は専用の app-media: を使う', () => {
  assert.equal(mediaUrl('wallpapers', 'ab-12.png'), 'app-media://wallpapers/ab-12.png');
});
