import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDGE_PX, flipFace, settleFace, showsRoundTimer, isEdgePress } from '../src/card-face.js';

test('めくると、表 (ラウンド) と裏 (通常のタイマー) が入れ替わる', () => {
  assert.equal(flipFace('round'), 'timer');
  assert.equal(flipFace('timer'), 'round');
});

test('ラウンドの外に出たら表に戻る (次のラウンドは、ラウンドのタイマーから見せる)。ラウンドの間はそのまま', () => {
  assert.equal(settleFace('timer', false), 'round');
  assert.equal(settleFace('round', false), 'round');
  assert.equal(settleFace('timer', true), 'timer', 'ラウンドの間は、作業 ↔ 休憩に切り替わっても裏のまま');
  assert.equal(settleFace('round', true), 'round');
});

test('ラウンドのタイマーを出すのは、ラウンドの間で表のときだけ', () => {
  assert.equal(showsRoundTimer('round', true), true);
  assert.equal(showsRoundTimer('timer', true), false);
  assert.equal(showsRoundTimer('round', false), false, 'ラウンドの外は、いつも通常のタイマー');
});

test('カードの左右の端 (24px) を押したときだけ、めくる', () => {
  assert.equal(EDGE_PX, 24);
  assert.equal(isEdgePress(0, 300), true);
  assert.equal(isEdgePress(23.9, 300), true);
  assert.equal(isEdgePress(24, 300), false);
  assert.equal(isEdgePress(150, 300), false, '真ん中は押してもめくらない');
  assert.equal(isEdgePress(276, 300), false);
  assert.equal(isEdgePress(276.1, 300), true);
  assert.equal(isEdgePress(300, 300), true);
  assert.equal(isEdgePress(30, 40), true, '端の幅より狭いカードでは、どこを押してもめくる');
});
