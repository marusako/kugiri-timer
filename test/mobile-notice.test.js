import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextTimerNotice } from '../src/mobile-notice.js';

const running = (mode, endAt) => ({ mode, running: true, endAt, remainingMs: 0 });
const stopped = (mode) => ({ mode, running: false, endAt: null, remainingMs: 60000 });

test('タイマーが動き出したら、終わる時刻に予約する', () => {
  assert.deepEqual(nextTimerNotice(running('work', 5000), null, 1000), { cancel: null, schedule: { at: 5000, mode: 'work' } });
});

test('同じ終わりの時刻とモードで予約済みなら、何もしない (画面の更新のたびに予約し直さない)', () => {
  assert.equal(nextTimerNotice(running('work', 5000), { id: 1, at: 5000, mode: 'work' }, 1000), null);
});

test('時刻が来る前に終わりの時刻が変わったら (一時停止からの再開など)、前の予約を取り消して予約し直す', () => {
  assert.deepEqual(nextTimerNotice(running('work', 9000), { id: 1, at: 5000, mode: 'work' }, 3000), { cancel: 1, schedule: { at: 9000, mode: 'work' } });
});

test('時刻が来て次のセッションに進んだときは、前の通知を消さずに次を予約する (出ている・出かけている通知を消さないように)', () => {
  assert.deepEqual(nextTimerNotice(running('shortBreak', 65000), { id: 1, at: 5000, mode: 'work' }, 5200), { cancel: null, schedule: { at: 65000, mode: 'shortBreak' } });
});

test('止まったら (一時停止・リセット)、時刻が来ていない予約だけ取り消す。予約がなければ何もしない', () => {
  assert.deepEqual(nextTimerNotice(stopped('work'), { id: 1, at: 5000, mode: 'work' }, 3000), { cancel: 1, schedule: null });
  assert.deepEqual(nextTimerNotice(stopped('work'), { id: 1, at: 5000, mode: 'work' }, 6000), { cancel: null, schedule: null }, '時刻が過ぎた予約は、忘れるだけ');
  assert.equal(nextTimerNotice(stopped('work'), null, 3000), null);
});
