import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_PLAYBACK, shouldPlayBgm, nextNoise, toggleNoise } from '../src/bgm.js';

const FULL = 25 * 60 * 1000;
const work = (running, remainingMs = FULL) => ({ mode: 'work', running, remainingMs });
const brk = (running, mode = 'shortBreak') => ({ mode, running, remainingMs: 5 * 60 * 1000 });
const ON = { on: true, resume: false };
const OFF = { on: false, resume: false };

test('起動したときは、曲もノイズも流さない', () => {
  assert.equal(shouldPlayBgm('import:a.mp3', INITIAL_PLAYBACK), false);
  assert.equal(shouldPlayBgm('noise:pink', INITIAL_PLAYBACK), false);
});

test('曲は music、ノイズは noise.on で決まる。「なし」は流さない', () => {
  const playback = { music: true, noise: OFF };
  assert.equal(shouldPlayBgm('import:a.mp3', playback), true);
  assert.equal(shouldPlayBgm('noise:pink', playback), false);
  assert.equal(shouldPlayBgm('noise:pink', { music: false, noise: ON }), true);
  assert.equal(shouldPlayBgm('none', { music: true, noise: ON }), false);
});

test('ノイズ: まだ始めていない作業を始めたら流す', () => {
  assert.deepEqual(nextNoise(OFF, work(false), work(true), FULL), ON);
});

test('ノイズ: 休憩から作業に切り替わったら流す (自動で次へ・スキップ)', () => {
  assert.deepEqual(nextNoise(OFF, brk(true), work(true), FULL), ON);
});

test('ノイズ: 休憩が始まったら止める (手で流していても)', () => {
  assert.deepEqual(nextNoise(ON, work(true, 10), brk(true), FULL), OFF);
  assert.deepEqual(nextNoise(ON, work(true, 10), brk(true, 'longBreak'), FULL), OFF);
});

test('ノイズ: 作業中にタイマーを一時停止したら止め、再開したら続きから流す', () => {
  const paused = nextNoise(ON, work(true, 600000), work(false, 600000), FULL);
  assert.deepEqual(paused, { on: false, resume: true });
  assert.deepEqual(nextNoise(paused, work(false, 600000), work(true, 600000), FULL), ON);
});

test('ノイズ: ⏸ で止めていた作業は、タイマーを一時停止 → 再開しても流さない', () => {
  const paused = nextNoise(OFF, work(true, 600000), work(false, 600000), FULL);
  assert.deepEqual(nextNoise(paused, work(false, 600000), work(true, 600000), FULL), OFF);
});

test('ノイズ: 作業中のリセットも一時停止と同じ (止めて、次に始めたら流す)', () => {
  const stopped = nextNoise(ON, work(true, 600000), work(false, FULL), FULL);
  assert.deepEqual(stopped, { on: false, resume: true });
  assert.deepEqual(nextNoise(stopped, work(false, FULL), work(true, FULL), FULL), ON);
});

test('ノイズ: 休憩中は ▶ で流せて、休憩の途中ではそのまま (タイマーの一時停止でも止めない)', () => {
  const on = toggleNoise(OFF);
  assert.deepEqual(on, ON);
  assert.deepEqual(nextNoise(on, brk(true), brk(false), FULL), ON);
  assert.deepEqual(nextNoise(on, brk(false), brk(true), FULL), ON);
});

test('ノイズ: 作業中に ⏸ / ▶ で切り替えられる。手で切り替えたら再開の予定は消す', () => {
  assert.deepEqual(toggleNoise(ON), OFF);
  assert.deepEqual(toggleNoise({ on: false, resume: true }), ON);
  // タイマーが止まっている作業中に ⏸ を押したら、再開しても流さない
  assert.deepEqual(toggleNoise(toggleNoise({ on: false, resume: true })), OFF);
});

test('ノイズ: タイマーが動いているだけ (状態が変わらない) なら何も変えない', () => {
  const noise = { on: false, resume: false };
  assert.equal(nextNoise(noise, work(true, 600000), work(true, 599750), FULL), noise);
});
