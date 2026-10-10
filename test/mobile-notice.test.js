import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextTimerNotice } from '../src/mobile-notice.js';

const running = (mode, endAt) => ({ mode, running: true, endAt, remainingMs: 0 });
const stopped = (mode) => ({ mode, running: false, endAt: null, remainingMs: 60000 });

test('タイマーが動き出したら、終わる時刻に予約する', () => {
  assert.deepEqual(nextTimerNotice(running('work', 5000), null), { kind: 'schedule', at: 5000, mode: 'work' });
});

test('同じ終わりの時刻とモードで予約済みなら、何もしない (画面の更新のたびに予約し直さない)', () => {
  assert.equal(nextTimerNotice(running('work', 5000), { at: 5000, mode: 'work' }), null);
});

test('終わりの時刻やモードが変わったら (一時停止からの再開・次のセッション)、予約し直す', () => {
  assert.deepEqual(nextTimerNotice(running('work', 9000), { at: 5000, mode: 'work' }), { kind: 'schedule', at: 9000, mode: 'work' });
  assert.deepEqual(nextTimerNotice(running('shortBreak', 5000), { at: 5000, mode: 'work' }), { kind: 'schedule', at: 5000, mode: 'shortBreak' });
});

test('止まったら (一時停止・リセット)、予約を取り消す。予約がなければ何もしない', () => {
  assert.deepEqual(nextTimerNotice(stopped('work'), { at: 5000, mode: 'work' }), { kind: 'cancel' });
  assert.equal(nextTimerNotice(stopped('work'), null), null);
});
