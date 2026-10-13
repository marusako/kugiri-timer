import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SWIPE_DISTANCE, GESTURE_MARGIN, swipeDirection, inSystemGestureZone } from '../src/swipe.js';

test('40px 以上動いたら、上か下のスワイプ。それより短いものは、スワイプではない (タップ)', () => {
  assert.equal(SWIPE_DISTANCE, 40);
  assert.equal(swipeDirection(500, 460), 'up');
  assert.equal(swipeDirection(500, 540), 'down');
  assert.equal(swipeDirection(500, 461), null);
  assert.equal(swipeDirection(500, 539), null);
  assert.equal(swipeDirection(500, 500), null);
});

test('画面の下の端 (下の帯の高さ + 余白) から始めたものは、Android の「ホームに戻る」の操作として扱う', () => {
  assert.equal(GESTURE_MARGIN, 24);
  // 画面の高さ 800px・下の帯 48px なら、800 - 48 - 24 = 728px より下から始めたものは無視する
  assert.equal(inSystemGestureZone(729, 800, 48), true);
  assert.equal(inSystemGestureZone(800, 800, 48), true);
  assert.equal(inSystemGestureZone(728, 800, 48), false);
  assert.equal(inSystemGestureZone(600, 800, 48), false);
  // 帯の高さが分からない (0) ときも、余白の分だけは無視する
  assert.equal(inSystemGestureZone(780, 800, 0), true);
  assert.equal(inSystemGestureZone(770, 800, 0), false);
});
