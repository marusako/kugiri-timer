import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundStatus, roundFocusMs, statusKey, komaFinished } from '../src/round-timer.js';

// 2026-10-05 は月曜日。時刻はローカル時刻で作る
const at = (h, m = 0, s = 0) => new Date(2026, 9, 5, h, m, s).getTime();
const koma = (id, start, end, skips = []) => ({ id, title: id, start, end, skips });
const weekly = (id, weekday, komas, title = id) => ({ id, title, weekday, date: null, komas });
// 月曜: 午前のラウンド (1限と 2限の間に 10 分の休み、2限と 3限は続けて)。午後のラウンドは別
const rounds = [
  weekly('rd-1', 1, [koma('tt-1', '09:00', '09:50'), koma('tt-2', '10:00', '10:50'), koma('tt-3', '10:50', '11:40')], '午前'),
  weekly('rd-2', 1, [koma('tt-4', '13:00', '13:45')], '午後'),
  weekly('rd-3', 2, [koma('tt-5', '09:00', '09:50')]),
];

test('ラウンドの外 (始まる前・ラウンドとラウンドの間・終わったあと・ほかの曜日) は null', () => {
  assert.equal(roundStatus(rounds, at(8, 59)), null);
  assert.equal(roundStatus(rounds, at(11, 40)), null, '最後のコマの終わりちょうどは外');
  assert.equal(roundStatus(rounds, at(12)), null);
  assert.equal(roundStatus([], at(9, 30)), null);
});

test('コマの間は作業: そのコマの始まり〜終わり。何コマ目かと、コマの数も返す', () => {
  const status = roundStatus(rounds, at(9, 30));
  assert.equal(status.round.id, 'rd-1');
  assert.equal(status.round.title, '午前');
  assert.equal(status.phase, 'work');
  assert.equal(status.koma.id, 'tt-1');
  assert.deepEqual([status.startAt, status.endAt, status.index, status.count], [at(9), at(9, 50), 0, 3]);
  assert.equal(roundStatus(rounds, at(9)).koma.id, 'tt-1', '始まりちょうどは作業');
});

test('コマとコマの間は休憩: 前のコマの終わり〜次のコマの始まり。koma は次のコマ', () => {
  const status = roundStatus(rounds, at(9, 55));
  assert.equal(status.phase, 'break');
  assert.equal(status.koma.id, 'tt-2');
  assert.deepEqual([status.startAt, status.endAt, status.index], [at(9, 50), at(10), 1]);
});

test('続けてあるコマは、休憩をはさまずに次のコマの作業になる', () => {
  const status = roundStatus(rounds, at(10, 50));
  assert.equal(status.phase, 'work');
  assert.equal(status.koma.id, 'tt-3');
});

test('この日だけ休んだコマは除く (休んだところは休憩になる)', () => {
  const skipped = [weekly('rd-1', 1, [koma('tt-1', '09:00', '09:50'), koma('tt-2', '10:00', '10:50', ['2026-10-05']), koma('tt-3', '11:00', '11:50')])];
  const status = roundStatus(skipped, at(10, 30));
  assert.equal(status.phase, 'break');
  assert.equal(status.koma.id, 'tt-3');
  assert.deepEqual([status.startAt, status.endAt], [at(9, 50), at(11)]);
});

test('ラウンドが重なっているときは、先に始まったほう', () => {
  const overlap = [...rounds, weekly('rd-4', 1, [koma('tt-6', '09:20', '09:40')])];
  assert.equal(roundStatus(overlap, at(9, 30)).round.id, 'rd-1');
});

test('様子の見分け: ラウンド・作業か休憩か・コマが同じなら同じ。ラウンドの外は null', () => {
  assert.equal(statusKey(roundStatus(rounds, at(9, 10))), statusKey(roundStatus(rounds, at(9, 40))));
  assert.notEqual(statusKey(roundStatus(rounds, at(9, 40))), statusKey(roundStatus(rounds, at(9, 55))));
  assert.notEqual(statusKey(roundStatus(rounds, at(10, 40))), statusKey(roundStatus(rounds, at(10, 55))), '続けてあるコマでも、コマが変われば違う');
  assert.equal(statusKey(null), null);
});

test('コマを終えたか: 前に見た様子が作業で、その終わりの時刻を過ぎた', () => {
  const working = roundStatus(rounds, at(9, 40));
  assert.equal(komaFinished(working, at(9, 49)), false);
  assert.equal(komaFinished(working, at(9, 50)), true);
  assert.equal(komaFinished(roundStatus(rounds, at(9, 55)), at(10, 1)), false, '休憩のあとは数えない');
  assert.equal(komaFinished(null, at(10)), false);
});

test('集中として数える時間: from〜to のうち、ラウンドのコマ (作業) と重なる分。コマが重なっていても 1 回だけ', () => {
  assert.equal(roundFocusMs(rounds, at(9, 10), at(9, 10, 1)), 1000);
  assert.equal(roundFocusMs(rounds, at(9, 49, 59), at(9, 50, 1)), 1000, 'コマの終わりより先は数えない');
  assert.equal(roundFocusMs(rounds, at(9, 55), at(9, 56)), 0, '休憩は数えない');
  assert.equal(roundFocusMs(rounds, at(9, 59, 59), at(10, 0, 1)), 1000, '始まりより前は数えない');
  const overlap = [...rounds, weekly('rd-4', 1, [koma('tt-6', '09:20', '09:40')])];
  assert.equal(roundFocusMs(overlap, at(9, 30), at(9, 30, 2)), 2000);
  assert.equal(roundFocusMs(rounds, at(9, 30), at(9, 30)), 0);
});
