import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/settings.js';
import {
  createState,
  durationMs,
  start,
  pause,
  reset,
  tick,
  skip,
  formatTime,
} from '../src/timer.js';

const MIN = 60 * 1000;
const s = DEFAULT_SETTINGS;

test('初期状態は作業モードで停止中、残り時間は作業時間', () => {
  const state = createState(s);
  assert.equal(state.mode, 'work');
  assert.equal(state.running, false);
  assert.equal(state.remainingMs, 25 * MIN);
  assert.equal(state.completedWork, 0);
});

test('durationMs は設定の分数をミリ秒にする', () => {
  assert.equal(durationMs('work', s), 25 * MIN);
  assert.equal(durationMs('shortBreak', s), 5 * MIN);
  assert.equal(durationMs('longBreak', s), 15 * MIN);
});

test('start 後、経過時間ぶん残り時間が減る', () => {
  let state = start(createState(s), 0);
  ({ state } = tick(state, 10_000, s));
  assert.equal(state.remainingMs, 25 * MIN - 10_000);
  assert.equal(state.running, true);
});

test('tick の呼ばれる間隔がズレても、実時間で正しく計算される', () => {
  // setInterval が遅れても、終了時刻との差で計算するので誤差が積み重ならない
  let state = start(createState(s), 0);
  ({ state } = tick(state, 999, s));
  ({ state } = tick(state, 5_000, s));
  assert.equal(state.remainingMs, 25 * MIN - 5_000);
});

test('pause すると時間が止まり、再開すると続きから進む', () => {
  let state = start(createState(s), 0);
  state = pause(state, 60_000);
  assert.equal(state.running, false);
  assert.equal(state.remainingMs, 24 * MIN);

  // 停止中に時間が経っても減らない
  ({ state } = tick(state, 10 * MIN, s));
  assert.equal(state.remainingMs, 24 * MIN);

  state = start(state, 10 * MIN);
  ({ state } = tick(state, 11 * MIN, s));
  assert.equal(state.remainingMs, 23 * MIN);
});

test('作業が終わると完了数が増え、短い休憩に切り替わって停止する', () => {
  let state = start(createState(s), 0);
  const result = tick(state, 25 * MIN, s);
  assert.equal(result.finished, true);
  assert.equal(result.finishedMode, 'work');
  assert.equal(result.state.mode, 'shortBreak');
  assert.equal(result.state.running, false);
  assert.equal(result.state.remainingMs, 5 * MIN);
  assert.equal(result.state.completedWork, 1);
});

test('終了前の tick では finished は false', () => {
  const state = start(createState(s), 0);
  assert.equal(tick(state, 25 * MIN - 1, s).finished, false);
});

test('休憩が終わると作業に戻る', () => {
  let state = { ...createState(s), mode: 'shortBreak', remainingMs: 5 * MIN, completedWork: 1 };
  state = start(state, 0);
  const result = tick(state, 5 * MIN, s);
  assert.equal(result.finishedMode, 'shortBreak');
  assert.equal(result.state.mode, 'work');
  assert.equal(result.state.completedWork, 1);
});

test('4回目の作業が終わると長い休憩になる', () => {
  let state = { ...createState(s), completedWork: 3 };
  state = start(state, 0);
  const { state: next } = tick(state, 25 * MIN, s);
  assert.equal(next.completedWork, 4);
  assert.equal(next.mode, 'longBreak');
  assert.equal(next.remainingMs, 15 * MIN);
});

test('自動開始オンなら、終了と同時に次のモードが動き出す', () => {
  const auto = { ...s, autoStart: true };
  const state = start(createState(auto), 0);
  const { state: next, finished } = tick(state, 25 * MIN + 300, auto);
  assert.equal(finished, true);
  assert.equal(next.mode, 'shortBreak');
  assert.equal(next.running, true);
  // 終了を検知した時刻から次の長さを数える
  assert.equal(next.endAt, 25 * MIN + 300 + 5 * MIN);
});

test('自動開始オンでも、スリープ明けに何回分も一気に完了しない', () => {
  const auto = { ...s, autoStart: true };
  const state = start(createState(auto), 0);
  // 作業終了から 3 時間後に初めて tick が来た
  const { state: next } = tick(state, 3 * 60 * MIN, auto);
  assert.equal(next.completedWork, 1);
  assert.equal(next.mode, 'shortBreak');
  assert.equal(tick(next, 3 * 60 * MIN + 1000, auto).finished, false);
});

test('自動開始オフなら、終了後は停止する', () => {
  const state = start(createState(s), 0);
  assert.equal(tick(state, 25 * MIN, s).state.running, false);
});

test('スキップは自動開始オンでも停止状態になる', () => {
  const auto = { ...s, autoStart: true };
  assert.equal(skip(start(createState(auto), 0), auto).running, false);
});

test('作業をスキップしても完了数は増えない', () => {
  const state = skip(start(createState(s), 0), s);
  assert.equal(state.mode, 'shortBreak');
  assert.equal(state.completedWork, 0);
  assert.equal(state.running, false);
});

test('reset は現在のモードの最初に戻して停止する', () => {
  let state = start(createState(s), 0);
  ({ state } = tick(state, 3 * MIN, s));
  state = reset(state, s);
  assert.equal(state.mode, 'work');
  assert.equal(state.running, false);
  assert.equal(state.remainingMs, 25 * MIN);
});

test('formatTime は mm:ss 形式で、端数は切り上げる', () => {
  assert.equal(formatTime(25 * MIN), '25:00');
  assert.equal(formatTime(61_000), '01:01');
  assert.equal(formatTime(500), '00:01'); // 0.5秒残りは「00:00」ではなく「00:01」
  assert.equal(formatTime(0), '00:00');
});
