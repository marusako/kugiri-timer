// BGM の再生リスト (取り込んだ曲の一覧) の決まりごと。画面にも音声 API にも依存しない純粋関数だけにしている。
// 曲は保存名 (例: 1a2b3c.mp3) で表す

export const REPEAT_MODES = Object.freeze(['off', 'all', 'one']);
// 前へボタンで「今の曲の最初に戻る」か「前の曲へ」かの境目 (YouTube Music などと同じ動き)
export const PREV_RESTART_SECONDS = 3;

// 並び順: 保存した順 (savedOrder) を守り、新しく取り込んだ曲は後ろに足し、消した曲は除く。
// files は取り込んだ順の一覧
export function orderTracks(files, savedOrder) {
  const kept = savedOrder.filter((file) => files.includes(file));
  return [...kept, ...files.filter((file) => !kept.includes(file))];
}

// from 番目の曲を to 番目に動かした新しい一覧を返す (to が範囲の外なら端に動かす)
export function moveTrack(order, from, to) {
  const result = [...order];
  const [track] = result.splice(from, 1);
  result.splice(Math.min(Math.max(to, 0), result.length), 0, track);
  return result;
}

// ドラッグで並べ替えるときの、moveTrack に渡す移動先。from 番目の曲を、over 番目の曲の前 (after が true なら後ろ) に落とす。
// moveTrack は先に曲を抜き出すので、下へ動かすときは 1 つ手前になる
export function dropIndex(from, over, after) {
  const to = over + (after ? 1 : 0);
  return to > from ? to - 1 : to;
}

// 実際に再生する順。シャッフルなら全曲を 1 回ずつ並べ替え (フィッシャー–イェーツ法)、今の曲を先頭にする。
// random は 0 以上 1 未満を返す関数 (テストでは決まった値を返すものに差し替える)
export function playQueue(order, shuffle, current, random = Math.random) {
  if (!shuffle) return [...order];
  const rest = order.filter((file) => file !== current);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return order.includes(current) ? [current, ...rest] : rest;
}

// 次の曲。auto は「曲が終わって自動で進む」とき (リピート「1 曲」はそのときだけ同じ曲をくり返す)。
// 最後まで来たら、リピート「オフ」は null (止める)、それ以外は最初の曲へ
export function nextInQueue(queue, current, repeat, { auto = false } = {}) {
  if (queue.length === 0) return null;
  if (auto && repeat === 'one') return current;
  const index = queue.indexOf(current);
  if (index === -1) return queue[0];
  if (index + 1 < queue.length) return queue[index + 1];
  return repeat === 'off' ? null : queue[0];
}

// 前の曲。最初の曲では、リピート「全曲」なら最後の曲、それ以外は同じ曲 (最初から聞き直す)
export function prevInQueue(queue, current, repeat) {
  if (queue.length === 0) return null;
  const index = queue.indexOf(current);
  if (index === -1) return queue[0]; // 今の曲が一覧にない (別のプレイリストに切り替えた) ときは、その一覧の最初へ
  if (index > 0) return queue[index - 1];
  return repeat === 'all' ? queue[queue.length - 1] : current;
}

// 前へボタンを押したときの動き。曲が少し進んでいたら、まずその曲の最初に戻す
export function prevAction(positionSeconds) {
  return positionSeconds > PREV_RESTART_SECONDS ? 'restart' : 'previous';
}

export function nextRepeatMode(mode) {
  const index = REPEAT_MODES.indexOf(mode);
  return REPEAT_MODES[(Math.max(index, 0) + 1) % REPEAT_MODES.length];
}

// 再生バーの経過時間・長さの表示 (例: 83 秒 → '1:23'、1 時間以上は '1:02:03')。
// 曲を読み込む前など、長さが分からないとき (NaN・Infinity) は '--:--'
export function formatTrackTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// --- カスタムのプレイリスト (「全曲」とは別に、取り込んだ曲から選んで作る一覧) ---
// 形: { id: 'list-1', name: '名前', tracks: ['保存名', ...] }。tracks の順が再生の順
export const ALL_TRACKS = 'all'; // 「全曲」(取り込んだ曲すべて。並び順は bgmOrder)
export const MAX_PLAYLISTS = 10;
export const MAX_PLAYLIST_NAME_LENGTH = 20;

const PLAYLIST_ID = /^list-(\d+)$/;
const STORED_NAME = /^[a-z0-9-]+\.[a-z0-9]+$/;

// 前後の空白を除き、長すぎる名前は切り詰める (絵文字などが途中で割れないよう、文字単位で数える)
function cleanPlaylistName(name) {
  return Array.from(String(name).trim()).slice(0, MAX_PLAYLIST_NAME_LENGTH).join('');
}

// 次の番号。消した番号は使い回さない (ID が同じだと、別のプレイリストと取り違えるおそれがあるため)
export function nextPlaylistNumber(playlists) {
  const numbers = playlists.map((p) => Number(PLAYLIST_ID.exec(p.id)?.[1] ?? 0));
  return Math.max(0, ...numbers) + 1;
}

// 空のプレイリストを足す。名前が空なら fallbackName。上限なら同じ一覧を返す
export function addPlaylist(playlists, name, fallbackName) {
  if (playlists.length >= MAX_PLAYLISTS) return playlists;
  const playlist = { id: `list-${nextPlaylistNumber(playlists)}`, name: cleanPlaylistName(name) || cleanPlaylistName(fallbackName), tracks: [] };
  return [...playlists, playlist];
}

// 名前を変える。空にしようとしたら元の名前のまま
export function renamePlaylist(playlists, id, name) {
  const cleaned = cleanPlaylistName(name);
  if (!cleaned) return playlists;
  return playlists.map((p) => (p.id === id ? { ...p, name: cleaned } : p));
}

export function removePlaylist(playlists, id) {
  return playlists.filter((p) => p.id !== id);
}

export function setPlaylistTracks(playlists, id, tracks) {
  return playlists.map((p) => (p.id === id ? { ...p, tracks: [...tracks] } : p));
}

// チェックを付けた曲は最後に足し、外した曲は除く (付けたままの曲の順は変えない)
export function toggleTrack(tracks, file, include) {
  const without = tracks.filter((t) => t !== file);
  return include ? [...without, file] : without;
}

// 取り込んだ曲を消したとき、すべてのプレイリストから除く
export function removeTrackEverywhere(playlists, file) {
  return playlists.map((p) => ({ ...p, tracks: p.tracks.filter((t) => t !== file) }));
}

// 選んでいる一覧の曲 (並び順どおり)。files は取り込んだ順の一覧、order は「全曲」の並び順 (bgmOrder)。
// カスタムでは、もう消した曲は除く。知らない ID なら「全曲」
export function playlistTracks(files, order, playlists, activeId) {
  const custom = playlists.find((p) => p.id === activeId);
  if (!custom) return orderTracks(files, order);
  return custom.tracks.filter((file) => files.includes(file));
}

// 保存データから読んだ一覧を確かめる。正しい形のものだけ残す
export function parsePlaylists(raw) {
  if (!Array.isArray(raw)) return [];
  const result = [];
  for (const item of raw) {
    if (result.length >= MAX_PLAYLISTS) break;
    if (!item || typeof item !== 'object') continue;
    if (typeof item.id !== 'string' || !PLAYLIST_ID.test(item.id) || result.some((p) => p.id === item.id)) continue;
    if (typeof item.name !== 'string' || !cleanPlaylistName(item.name)) continue;
    const tracks = Array.isArray(item.tracks) ? item.tracks.filter((t) => typeof t === 'string' && STORED_NAME.test(t)) : [];
    result.push({ id: item.id, name: cleanPlaylistName(item.name), tracks: [...new Set(tracks)] });
  }
  return result;
}
