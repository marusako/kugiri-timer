import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valueAtScroll, scrollForValue } from '../src/wheel-picker.js';

const H = 32; // 1 項目の高さ (px)

test('スクロール位置から、中央に来ている値を求める', () => {
  assert.equal(valueAtScroll(0, H, 1, 120), 1);
  assert.equal(valueAtScroll(24 * H, H, 1, 120), 25);
});

test('項目の途中で止まったら、近いほうの値にする', () => {
  assert.equal(valueAtScroll(24 * H + 10, H, 1, 120), 25);
  assert.equal(valueAtScroll(24 * H + 20, H, 1, 120), 26);
});

test('範囲の外までスクロールしても、範囲内の値にする', () => {
  assert.equal(valueAtScroll(-50, H, 1, 120), 1);
  assert.equal(valueAtScroll(500 * H, H, 1, 120), 120);
});

test('値からスクロール位置を求める (valueAtScroll の逆)', () => {
  assert.equal(scrollForValue(25, H, 1), 24 * H);
  assert.equal(valueAtScroll(scrollForValue(7, H, 2), H, 2, 10), 7);
});
