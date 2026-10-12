// 取り込んだ曲のファイルの中にある、ジャケットの絵を取り出す (画面にも Electron にも依存しない純粋な関数)。
// - MP3: ID3v2 タグ (ファイルの先頭にある、曲の情報をしまう場所) の APIC (v2.3・v2.4) / PIC (v2.2)
// - M4A: MP4 の箱 (box) の moov → udta → meta → ilst → covr → data
// - WAV・OGG などは対象外 (null)。絵が複数あれば表紙 (種類 3) を、なければ最初の絵を使う
// - 中身が本当に絵 (JPEG・PNG・GIF・WebP) かを先頭のバイトで確かめ、MIME もそこから決める (タグに書かれた MIME は信じない)
// - 壊れたファイル・大きさのおかしいファイルでも例外を出さず、null を返す

const FRONT_COVER = 3;

// 先頭のバイトから絵の形を決める (絵でなければ null)
function imageType(bytes) {
  const at = (i, ...values) => values.every((v, k) => bytes[i + k] === v);
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  return null;
}

function picture(data) {
  const mime = imageType(data);
  return mime ? { mime, data } : null;
}

const text = (bytes, from, length) => String.fromCharCode(...bytes.subarray(from, from + length));
const be32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const syncsafe = (b, i) => ((b[i] & 127) << 21) | ((b[i + 1] & 127) << 14) | ((b[i + 2] & 127) << 7) | (b[i + 3] & 127);

// 説明 (文字列) の終わりの次の位置。UTF-16 (文字コード 1・2) は 0 が 2 つで終わる
function afterText(bytes, from, encoding) {
  if (encoding === 1 || encoding === 2) {
    for (let i = from; i + 1 < bytes.length; i += 2) if (bytes[i] === 0 && bytes[i + 1] === 0) return i + 2;
    return -1;
  }
  const end = bytes.indexOf(0, from);
  return end < 0 ? -1 : end + 1;
}

// APIC (v2.3・v2.4): 文字コード・MIME (0 終わり)・種類・説明・絵。PIC (v2.2): 文字コード・形式 3 文字・種類・説明・絵
function readPictureFrame(body, version) {
  const encoding = body[0];
  let at;
  if (version === 2) {
    at = 4;
  } else {
    const mimeEnd = body.indexOf(0, 1);
    if (mimeEnd < 0) return null;
    at = mimeEnd + 1;
  }
  const type = body[at];
  const start = afterText(body, at + 1, encoding);
  if (start < 0 || start >= body.length) return null;
  const found = picture(body.subarray(start));
  return found && { ...found, type };
}

function fromId3(bytes) {
  if (bytes.length < 10 || text(bytes, 0, 3) !== 'ID3') return null;
  const version = bytes[3];
  const flags = bytes[5];
  if (version < 2 || version > 4 || flags & 0x80) return null; // 非同期化 (unsynchronisation) されたタグは読まない (まれ)
  const end = Math.min(bytes.length, 10 + syncsafe(bytes, 6));
  let at = 10;
  if (flags & 0x40 && version >= 3) {
    // 拡張ヘッダーを飛ばす (v2.3 は大きさに自分の 4 バイトを含まない、v2.4 は含む)
    at += version === 3 ? 4 + be32(bytes, at) : syncsafe(bytes, at);
  }
  const headerSize = version === 2 ? 6 : 10;
  const pictureId = version === 2 ? 'PIC' : 'APIC';
  let first = null;
  while (at + headerSize <= end) {
    if (bytes[at] === 0) break; // 残りは埋め草 (padding)
    const id = text(bytes, at, version === 2 ? 3 : 4);
    let size;
    if (version === 2) size = (bytes[at + 3] << 16) | (bytes[at + 4] << 8) | bytes[at + 5];
    else if (version === 4) size = syncsafe(bytes, at + 4);
    else size = be32(bytes, at + 4);
    const bodyStart = at + headerSize;
    if (size <= 0 || bodyStart + size > end) break;
    if (id === pictureId) {
      const found = readPictureFrame(bytes.subarray(bodyStart, bodyStart + size), version);
      if (found?.type === FRONT_COVER) return { mime: found.mime, data: found.data };
      first ??= found && { mime: found.mime, data: found.data };
    }
    at = bodyStart + size;
  }
  return first;
}

// MP4 の箱を順に返す: { type, start (中身の始まり), end }
function* boxes(bytes, from, to) {
  let at = from;
  while (at + 8 <= to) {
    let size = be32(bytes, at);
    const type = text(bytes, at + 4, 4);
    let header = 8;
    if (size === 1) {
      if (at + 16 > to) return;
      const high = be32(bytes, at + 8);
      if (high !== 0) return; // 4GB を超える箱は扱わない
      size = be32(bytes, at + 12);
      header = 16;
    } else if (size === 0) {
      size = to - at; // 最後まで
    }
    if (size < header || at + size > to) return;
    yield { type, start: at + header, end: at + size };
    at += size;
  }
}

function child(bytes, parent, type) {
  for (const b of boxes(bytes, parent.start, parent.end)) if (b.type === type) return b;
  return null;
}

function fromMp4(bytes) {
  if (bytes.length < 8) return null;
  let node = { start: 0, end: bytes.length };
  for (const type of ['moov', 'udta', 'meta', 'ilst', 'covr']) {
    node = child(bytes, node, type);
    if (!node) return null;
    if (type === 'meta') node = { start: node.start + 4, end: node.end }; // meta は中身の前に 4 バイトある
  }
  for (const data of boxes(bytes, node.start, node.end)) {
    if (data.type !== 'data' || data.end - data.start <= 8) continue;
    const found = picture(bytes.subarray(data.start + 8, data.end)); // 型 4 バイト・ロケール 4 バイトのあとが絵
    if (found) return found;
  }
  return null;
}

// bytes: Uint8Array (ファイルの中身)。見つかれば { mime, data: Uint8Array }、なければ null
export function extractCover(bytes) {
  try {
    return fromId3(bytes) ?? fromMp4(bytes);
  } catch {
    return null;
  }
}
