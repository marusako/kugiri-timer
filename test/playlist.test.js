import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REPEAT_MODES, PREV_RESTART_SECONDS,
  orderTracks, moveTrack, dropIndex, playQueue, nextInQueue, prevInQueue, prevAction, nextRepeatMode, formatTrackTime,
  MAX_PLAYLISTS, nextPlaylistNumber, addPlaylist, renamePlaylist, removePlaylist, setPlaylistTracks, toggleTrack,
  removeTrackEverywhere, playlistTracks, parsePlaylists,
} from '../src/playlist.js';

// 0, 0.5, 0.9, ... と決まった順に返す「乱数」(シャッフルの結果をテストで決めるため)
function fixedRandom(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

test('並び順: 保存した順を守り、新しく取り込んだ曲は後ろに足し、消した曲は除く', () => {
  const files = ['a.mp3', 'b.mp3', 'c.mp3', 'd.mp3']; // 取り込んだ順
  assert.deepEqual(orderTracks(files, ['c.mp3', 'x.mp3', 'a.mp3']), ['c.mp3', 'a.mp3', 'b.mp3', 'd.mp3']);
  assert.deepEqual(orderTracks(files, []), files);
});

test('並べ替え: from 番目の曲を to 番目に動かす (元の一覧は書き換えない)', () => {
  const order = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveTrack(order, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveTrack(order, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveTrack(order, 1, 99), ['a', 'c', 'd', 'b'], '範囲の外は端に動かす');
  assert.deepEqual(order, ['a', 'b', 'c', 'd']);
});

test('ドラッグでの並べ替え: 落とした曲の前 / 後ろに入る', () => {
  const order = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveTrack(order, 0, dropIndex(0, 2, true)), ['b', 'c', 'a', 'd'], 'a を c の後ろへ');
  assert.deepEqual(moveTrack(order, 0, dropIndex(0, 2, false)), ['b', 'a', 'c', 'd'], 'a を c の前へ');
  assert.deepEqual(moveTrack(order, 3, dropIndex(3, 0, false)), ['d', 'a', 'b', 'c'], 'd を a の前へ');
  assert.deepEqual(moveTrack(order, 3, dropIndex(3, 1, true)), ['a', 'b', 'd', 'c'], 'd を b の後ろへ');
  assert.deepEqual(moveTrack(order, 1, dropIndex(1, 1, true)), order, '自分の上に落としても動かない');
  assert.deepEqual(moveTrack(order, 1, dropIndex(1, 2, false)), order, 'すぐ下の曲の前に落としても動かない');
});

test('再生する順: シャッフルなしなら並び順のまま', () => {
  assert.deepEqual(playQueue(['a', 'b', 'c'], false, 'b'), ['a', 'b', 'c']);
});

test('再生する順: シャッフルなら全曲を 1 回ずつ並べ替え、今の曲を先頭にする', () => {
  const queue = playQueue(['a', 'b', 'c', 'd', 'e'], true, 'c', fixedRandom([0.1, 0.7, 0.3, 0.9, 0.5]));
  assert.equal(queue[0], 'c');
  assert.deepEqual([...queue].sort(), ['a', 'b', 'c', 'd', 'e']);
});

test('次の曲: 順に進み、最後まで来たら リピート「全曲」は最初へ、「オフ」は止まる (null)', () => {
  const q = ['a', 'b', 'c'];
  assert.equal(nextInQueue(q, 'a', 'all'), 'b');
  assert.equal(nextInQueue(q, 'c', 'all'), 'a');
  assert.equal(nextInQueue(q, 'c', 'off'), null);
});

test('次の曲: リピート「1 曲」は、曲が終わったときだけ同じ曲。次へボタンでは次の曲へ進む', () => {
  const q = ['a', 'b', 'c'];
  assert.equal(nextInQueue(q, 'b', 'one', { auto: true }), 'b');
  assert.equal(nextInQueue(q, 'b', 'one'), 'c');
  assert.equal(nextInQueue(q, 'c', 'one'), 'a', '次へボタンなら、最後の曲からは最初に戻る');
});

test('次の曲: 今の曲が一覧にない・一覧が空のとき', () => {
  assert.equal(nextInQueue(['a', 'b'], 'zzz', 'all'), 'a');
  assert.equal(nextInQueue([], 'a', 'all'), null);
});

test('前の曲: 1 つ前へ。最初の曲では、リピート「全曲」なら最後の曲、それ以外は同じ曲', () => {
  const q = ['a', 'b', 'c'];
  assert.equal(prevInQueue(q, 'b', 'all'), 'a');
  assert.equal(prevInQueue(q, 'a', 'all'), 'c');
  assert.equal(prevInQueue(q, 'a', 'off'), 'a');
  assert.equal(prevInQueue([], 'a', 'all'), null);
});

test('前へボタン: 曲が 3 秒より進んでいれば、その曲の最初に戻る。3 秒以内なら前の曲へ', () => {
  assert.equal(PREV_RESTART_SECONDS, 3);
  assert.equal(prevAction(10), 'restart');
  assert.equal(prevAction(3.5), 'restart');
  assert.equal(prevAction(2), 'previous');
});

test('リピートは オフ → 全曲 → 1 曲 → オフ の順に切り替わる', () => {
  assert.deepEqual(REPEAT_MODES, ['off', 'all', 'one']);
  assert.equal(nextRepeatMode('off'), 'all');
  assert.equal(nextRepeatMode('all'), 'one');
  assert.equal(nextRepeatMode('one'), 'off');
  assert.equal(nextRepeatMode('???'), 'all', '知らない値はオフ扱いにして次へ');
});

test('再生バーの時間表示: 分:秒 (1 時間以上は 時:分:秒)。長さが分からないときは --:--', () => {
  assert.equal(formatTrackTime(0), '0:00');
  assert.equal(formatTrackTime(83.9), '1:23', '端数は切り捨てる');
  assert.equal(formatTrackTime(600), '10:00');
  assert.equal(formatTrackTime(3723), '1:02:03');
  assert.equal(formatTrackTime(NaN), '--:--');
  assert.equal(formatTrackTime(Infinity), '--:--');
  assert.equal(formatTrackTime(-1), '--:--');
});

test('前の曲: 今の曲が一覧にない (別のプレイリストに切り替えた) ときは、その一覧の最初の曲', () => {
  assert.equal(prevInQueue(['a', 'b'], 'zzz', 'all'), 'a');
});

test('プレイリストを作る: 番号は消しても使い回さず、名前が空なら仮の名前。上限は 10 個', () => {
  let lists = addPlaylist([], '  作業用  ', 'プレイリスト 1');
  assert.deepEqual(lists, [{ id: 'list-1', name: '作業用', tracks: [] }]);
  lists = addPlaylist(lists, '', 'プレイリスト 2');
  assert.equal(lists[1].name, 'プレイリスト 2');
  assert.equal(nextPlaylistNumber(removePlaylist(lists, 'list-1')), 3);
  let full = [];
  for (let i = 0; i < MAX_PLAYLISTS + 2; i += 1) full = addPlaylist(full, '', 'x');
  assert.equal(full.length, MAX_PLAYLISTS);
});

test('プレイリストの名前: 20 文字まで。空にしようとしたら元のまま', () => {
  const lists = addPlaylist([], 'a', 'x');
  assert.equal(renamePlaylist(lists, 'list-1', 'あ'.repeat(30))[0].name, 'あ'.repeat(20));
  assert.equal(renamePlaylist(lists, 'list-1', '   '), lists);
});

test('チェックで曲を入れる・外す: 入れた曲は最後に足し、ほかの順は変えない', () => {
  assert.deepEqual(toggleTrack(['a', 'b'], 'c', true), ['a', 'b', 'c']);
  assert.deepEqual(toggleTrack(['a', 'b', 'c'], 'b', false), ['a', 'c']);
  assert.deepEqual(toggleTrack(['a', 'b'], 'a', true), ['b', 'a'], '二重には入らない');
  const lists = setPlaylistTracks(addPlaylist([], 'x', 'x'), 'list-1', ['b', 'a']);
  assert.deepEqual(lists[0].tracks, ['b', 'a']);
});

test('選んでいる一覧の曲: 「全曲」は並び順、カスタムはその順で、消した曲は除く', () => {
  const files = ['a', 'b', 'c'];
  const lists = [{ id: 'list-1', name: 'x', tracks: ['c', 'gone', 'a'] }];
  assert.deepEqual(playlistTracks(files, ['b'], lists, 'all'), ['b', 'a', 'c']);
  assert.deepEqual(playlistTracks(files, [], lists, 'list-1'), ['c', 'a']);
  assert.deepEqual(playlistTracks(files, [], lists, 'list-9'), files, '知らない ID は「全曲」');
  assert.deepEqual(removeTrackEverywhere(lists, 'c')[0].tracks, ['gone', 'a']);
});

test('保存データのプレイリスト: 正しい形のものだけ残す', () => {
  const parsed = parsePlaylists([
    { id: 'list-1', name: ' A ', tracks: ['a1.mp3', '../x.mp3', 'a1.mp3', 5] },
    { id: 'list-1', name: '同じ ID', tracks: [] },
    { id: 'evil', name: 'x', tracks: [] },
    { id: 'list-2', name: '   ', tracks: [] },
    { id: 'list-3', name: 'B' },
    null,
  ]);
  assert.deepEqual(parsed, [
    { id: 'list-1', name: 'A', tracks: ['a1.mp3'] },
    { id: 'list-3', name: 'B', tracks: [] },
  ]);
  assert.deepEqual(parsePlaylists('x'), []);
});
