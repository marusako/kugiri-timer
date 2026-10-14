import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRAG_START, FLING_SPEED, dragProgress, releaseVelocity, settleOpen } from '../src/sheet-drag.js';

// 下から出る板 (再生中の画面・キュー) を指で動かす。dy は指を置いた所からの動き (下へ +)、size は閉じてから開くまでの道のり (px)

test('8px より動いたら、指で動かしているとみなす (それより短いものはタップ)', () => {
  assert.equal(DRAG_START, 8);
});

test('開き具合: 閉じた板は上へ動かした分だけ開き、開いた板は下へ動かした分だけ閉じる。0〜1 に収める', () => {
  assert.equal(dragProgress(false, -100, 400), 0.25);
  assert.equal(dragProgress(true, 100, 400), 0.75);
  assert.equal(dragProgress(false, 50, 400), 0, '閉じた板を下へ動かしても、閉じたまま');
  assert.equal(dragProgress(true, -50, 400), 1, '開いた板を上へ動かしても、開いたまま');
  assert.equal(dragProgress(false, -999, 400), 1);
});

test('離したとき: 道のりの 3 分の 1 以上動かしたら、開け閉めする。足りなければ元に戻る', () => {
  assert.equal(settleOpen(false, -134, 0, 400), true);
  assert.equal(settleOpen(false, -133, 0, 400), false);
  assert.equal(settleOpen(true, 134, 0, 400), false);
  assert.equal(settleOpen(true, 133, 0, 400), true);
});

test('離したとき: 速く払ったら (0.5px/ms 以上)、動いた距離が短くても、払った向きに開け閉めする', () => {
  assert.equal(FLING_SPEED, 0.5);
  assert.equal(settleOpen(false, -30, -0.6, 400), true, '上へ払ったら開く');
  assert.equal(settleOpen(true, 30, 0.6, 400), false, '下へ払ったら閉じる');
  assert.equal(settleOpen(false, -200, 0.6, 400), false, '途中で下へ払い戻したら、閉じたまま');
  assert.equal(settleOpen(true, 30, 0.4, 400), true, '遅ければ、距離で決める');
});

test('離したときの速さ: 最後の 100ms の動き (px/ms。下へ +)。動きがなければ 0', () => {
  assert.equal(releaseVelocity([{ y: 500, t: 0 }, { y: 480, t: 900 }, { y: 400, t: 1000 }], 1000), -0.8);
  assert.equal(releaseVelocity([{ y: 500, t: 0 }, { y: 400, t: 50 }], 1000), 0, '止めてから離したら 0');
  assert.equal(releaseVelocity([{ y: 500, t: 1000 }], 1000), 0);
  assert.equal(releaseVelocity([], 1000), 0);
});
