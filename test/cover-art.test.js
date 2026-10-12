import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCover } from '../src/cover-art.js';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 5, 6, 7, 8]);
const ascii = (text) => Uint8Array.from([...text].map((c) => c.charCodeAt(0)));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const be32 = (n) => Uint8Array.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
// ID3v2.4 の大きさ (7 ビットずつの 4 バイト)
const syncsafe = (n) => Uint8Array.from([(n >>> 21) & 127, (n >>> 14) & 127, (n >>> 7) & 127, n & 127]);

function id3(version, frames) {
  const body = concat(...frames);
  return concat(ascii('ID3'), Uint8Array.from([version, 0, 0]), syncsafe(body.length), body, ascii('MP3 の音のデータ'));
}
function frame(version, id, payload) {
  const size = version === 4 ? syncsafe(payload.length) : be32(payload.length);
  return concat(ascii(id), size, Uint8Array.from([0, 0]), payload);
}
// APIC: 文字コード 1 バイト・MIME (0 終わり)・絵の種類 1 バイト・説明 (0 終わり)・絵
function apic({ encoding = 0, mime = 'image/jpeg', type = 3, description = [0], image = JPEG }) {
  return concat(Uint8Array.from([encoding]), ascii(mime), Uint8Array.from([0, type]), Uint8Array.from(description), image);
}

function box(type, ...children) {
  const body = concat(...children);
  return concat(be32(8 + body.length), ascii(type), body);
}
// covr の中の data: 型 (13 = JPEG、14 = PNG)・ロケール 4 バイト・絵
const covr = (kind, image) => box('covr', box('data', be32(kind), be32(0), image));
// meta は中身の前に 4 バイト (バージョンとフラグ) がある
const meta = (...children) => box('meta', Uint8Array.from([0, 0, 0, 0]), ...children);

test('MP3 (ID3v2.3) の APIC から、JPEG の絵を取り出す', () => {
  const file = id3(3, [frame(3, 'TIT2', concat(Uint8Array.from([0]), ascii('曲名'))), frame(3, 'APIC', apic({}))]);
  const cover = extractCover(file);
  assert.equal(cover.mime, 'image/jpeg');
  assert.deepEqual([...cover.data], [...JPEG]);
});

test('MP3 (ID3v2.4): 大きさが 7 ビットずつの形でも読める。説明が UTF-16 (0 が 2 つで終わり) でも読める', () => {
  const description = [0xff, 0xfe, 0x41, 0x00, 0x00, 0x00]; // BOM + "A" + 終わり
  const file = id3(4, [frame(4, 'APIC', apic({ encoding: 1, mime: 'image/png', description, image: PNG }))]);
  const cover = extractCover(file);
  assert.equal(cover.mime, 'image/png');
  assert.deepEqual([...cover.data], [...PNG]);
});

test('MP3: 表紙 (種類 3) があればそれを、なければ最初の絵を使う。MIME がおかしければ中身から決める', () => {
  const back = apic({ type: 4, image: PNG, mime: 'image/png' });
  const front = apic({ type: 3, image: JPEG, mime: 'jpg' });
  assert.deepEqual([...extractCover(id3(3, [frame(3, 'APIC', back), frame(3, 'APIC', front)])).data], [...JPEG]);
  assert.equal(extractCover(id3(3, [frame(3, 'APIC', front)])).mime, 'image/jpeg');
  assert.deepEqual([...extractCover(id3(3, [frame(3, 'APIC', back)])).data], [...PNG]);
});

test('M4A: moov → udta → meta → ilst → covr の絵を取り出す', () => {
  const file = concat(
    box('ftyp', ascii('M4A '), be32(0)),
    box('mdat', ascii('音のデータ')),
    box('moov', box('mvhd', be32(0)), box('udta', meta(box('hdlr', be32(0)), box('ilst', covr(14, PNG))))),
  );
  const cover = extractCover(file);
  assert.equal(cover.mime, 'image/png');
  assert.deepEqual([...cover.data], [...PNG]);
});

test('絵がない・ファイルが壊れている・大きさがおかしいときは null (落ちない)', () => {
  assert.equal(extractCover(id3(3, [frame(3, 'TIT2', ascii('x'))])), null);
  assert.equal(extractCover(ascii('RIFF....WAVE')), null);
  assert.equal(extractCover(new Uint8Array(0)), null);
  const broken = id3(3, [frame(3, 'APIC', apic({}))]);
  assert.equal(extractCover(broken.slice(0, 20)), null, '途中で切れている');
  const huge = concat(ascii('ID3'), Uint8Array.from([3, 0, 0]), syncsafe(1e8), frame(3, 'APIC', apic({})));
  assert.doesNotThrow(() => extractCover(huge));
  assert.equal(extractCover(concat(be32(4), ascii('moov'))), null, '箱の大きさが小さすぎる');
  assert.equal(extractCover(box('moov', box('udta', meta(box('ilst', covr(0, ascii('絵ではない'))))))), null, '絵の形でないものは使わない');
});
