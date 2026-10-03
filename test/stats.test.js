import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, addCompletion, todayCount } from '../src/stats.js';

test('dateKey はローカル日付を YYYY-MM-DD にする', () => {
  assert.equal(dateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('同じ日なら回数が加算される', () => {
  const day = new Date(2026, 9, 3, 10);
  let stats = addCompletion(null, day);
  stats = addCompletion(stats, day);
  assert.equal(todayCount(stats, day), 2);
});

test('日付が変わると回数は 0 からやり直す', () => {
  const stats = addCompletion(null, new Date(2026, 9, 3, 23));
  const nextDay = new Date(2026, 9, 4, 1);
  assert.equal(todayCount(stats, nextDay), 0);
  assert.equal(todayCount(addCompletion(stats, nextDay), nextDay), 1);
});
