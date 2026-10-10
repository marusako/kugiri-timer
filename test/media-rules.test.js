import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEDIA_KINDS, isAllowedFile, isStoredName, mediaUrl, mimeType, parseByteRange, storedNameFor, acceptFor } from '../src/media-rules.js';

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

test('読み込み口が返すファイルの種類 (拡張子から決める)', () => {
  assert.equal(mimeType('a.mp3'), 'audio/mpeg');
  assert.equal(mimeType('a.m4a'), 'audio/mp4');
  assert.equal(mimeType('a.JPG'), 'image/jpeg');
  assert.equal(mimeType('a.txt'), 'application/octet-stream');
  // 取り込める拡張子は、どれも種類が決まっている
  for (const { extensions } of Object.values(MEDIA_KINDS)) {
    for (const ext of extensions) assert.notEqual(mimeType(`x.${ext}`), 'application/octet-stream', ext);
  }
});

test('Range: 途中から読む範囲 (シークで使う)', () => {
  assert.deepEqual(parseByteRange('bytes=0-', 1000), { start: 0, end: 999 });
  assert.deepEqual(parseByteRange('bytes=500-', 1000), { start: 500, end: 999 });
  assert.deepEqual(parseByteRange('bytes=100-199', 1000), { start: 100, end: 199 });
  assert.deepEqual(parseByteRange('bytes=900-5000', 1000), { start: 900, end: 999 }, '終わりがファイルより後ろなら最後まで');
  assert.deepEqual(parseByteRange('bytes=-100', 1000), { start: 900, end: 999 }, '最後の 100 バイト');
  assert.deepEqual(parseByteRange('bytes=-5000', 1000), { start: 0, end: 999 });
});

test('Range: ないとき・読めない形・複数の範囲は null (ファイル全体を返す)', () => {
  assert.equal(parseByteRange(null, 1000), null);
  assert.equal(parseByteRange('', 1000), null);
  assert.equal(parseByteRange('bytes=-', 1000), null);
  assert.equal(parseByteRange('bytes=0-10,20-30', 1000), null);
  assert.equal(parseByteRange('items=0-10', 1000), null);
  assert.equal(parseByteRange('bytes=200-100', 1000), null);
});

test('Range: ファイルの外を指しているときは unsatisfiable (416)', () => {
  assert.equal(parseByteRange('bytes=1000-', 1000), 'unsatisfiable');
  assert.equal(parseByteRange('bytes=-0', 1000), 'unsatisfiable');
  assert.equal(parseByteRange('bytes=0-', 0), 'unsatisfiable');
});

test('保存するときの名前: ID + 元の拡張子 (小文字)。保存名の決まり (isStoredName) を満たす', () => {
  const name = storedNameFor('wallpapers', 'Photo.JPG', '1b4e28ba-2fa1-11d2-883f-0016d3cca427');
  assert.equal(name, '1b4e28ba-2fa1-11d2-883f-0016d3cca427.jpg');
  assert.equal(isStoredName('wallpapers', name), true);
  assert.equal(storedNameFor('bgm', 'song.mp3', 'ABC'), 'abc.mp3', 'ID も小文字にする');
  assert.equal(storedNameFor('bgm', 'notes.txt', 'abc'), null, '受け付けない形式なら null');
});

test('ファイル選択の画面に渡す、選べる形式の一覧', () => {
  assert.equal(acceptFor('wallpapers'), '.png,.jpg,.jpeg,.webp,.gif');
  assert.equal(acceptFor('bgm'), '.mp3,.wav,.ogg,.m4a');
});
