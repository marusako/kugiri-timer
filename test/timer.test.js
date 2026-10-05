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
  applySettings,
  formatTime,
  prepareFocus,
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

test('作業が終わると完了数が増え、短い休憩がすぐに動き出す', () => {
  const state = start(createState(s), 0);
  const result = tick(state, 25 * MIN + 300, s);
  assert.equal(result.finished, true);
  assert.equal(result.finishedMode, 'work');
  assert.equal(result.state.mode, 'shortBreak');
  assert.equal(result.state.running, true);
  assert.equal(result.state.completedWork, 1);
  // 終了を検知した時刻から次の長さを数える
  assert.equal(result.state.endAt, 25 * MIN + 300 + 5 * MIN);
});

test('終了前の tick では finished は false', () => {
  const state = start(createState(s), 0);
  assert.equal(tick(state, 25 * MIN - 1, s).finished, false);
});

test('休憩が終わると作業がすぐに動き出す', () => {
  let state = { ...createState(s), mode: 'shortBreak', remainingMs: 5 * MIN, completedWork: 1 };
  state = start(state, 0);
  const result = tick(state, 5 * MIN, s);
  assert.equal(result.finishedMode, 'shortBreak');
  assert.equal(result.state.mode, 'work');
  assert.equal(result.state.running, true);
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

test('スリープ明けなどで tick が遅れても、何回分も一気に完了しない', () => {
  const state = start(createState(s), 0);
  // 作業終了から 3 時間後に初めて tick が来た
  const { state: next } = tick(state, 3 * 60 * MIN, s);
  assert.equal(next.completedWork, 1);
  assert.equal(next.mode, 'shortBreak');
  assert.equal(tick(next, 3 * 60 * MIN + 1000, s).finished, false);
});

test('スキップすると次のモードがすぐに動き出す', () => {
  const state = skip(start(createState(s), 0), s, 60_000);
  assert.equal(state.mode, 'shortBreak');
  assert.equal(state.running, true);
  assert.equal(state.endAt, 60_000 + 5 * MIN);
});

test('止まっている状態からスキップしても、次のモードが動き出す', () => {
  const state = skip(createState(s), s, 0);
  assert.equal(state.mode, 'shortBreak');
  assert.equal(state.running, true);
});

test('作業をスキップしても完了数は増えない', () => {
  const state = skip(start(createState(s), 0), s, 0);
  assert.equal(state.completedWork, 0);
});

test('reset は現在のモードの最初に戻して停止する', () => {
  let state = start(createState(s), 0);
  ({ state } = tick(state, 3 * MIN, s));
  state = reset(state, s);
  assert.equal(state.mode, 'work');
  assert.equal(state.running, false);
  assert.equal(state.remainingMs, 25 * MIN);
});

test('applySettings: まだ始めていないセッションは、新しい時間にすぐ変わる', () => {
  const next = { ...s, workMinutes: 50 };
  const state = applySettings(createState(s), s, next);
  assert.equal(state.remainingMs, 50 * MIN);
  assert.equal(state.running, false);
});

test('applySettings: 動いている途中のセッションはそのまま進む', () => {
  let state = start(createState(s), 0);
  ({ state } = tick(state, 3 * MIN, s));
  const after = applySettings(state, s, { ...s, workMinutes: 50 });
  assert.equal(after, state);
});

test('applySettings: 一時停止している途中のセッションも、進み具合を消さない', () => {
  const paused = pause(start(createState(s), 0), 3 * MIN);
  const after = applySettings(paused, s, { ...s, workMinutes: 50 });
  assert.equal(after.remainingMs, 22 * MIN);
});

test('applySettings: 変えたのが別のモードの時間なら、今のセッションは変わらない', () => {
  const state = createState(s);
  const after = applySettings(state, s, { ...s, shortBreakMinutes: 10 });
  assert.equal(after.remainingMs, 25 * MIN);
});

test('applySettings: 新しい時間は次のセッションから使われる', () => {
  const next = { ...s, shortBreakMinutes: 10 };
  let state = start(createState(s), 0);
  state = applySettings(state, s, next);
  const { state: afterWork } = tick(state, 25 * MIN, next);
  assert.equal(afterWork.remainingMs, 10 * MIN);
});

test('formatTime は mm:ss 形式で、端数は切り上げる', () => {
  assert.equal(formatTime(25 * MIN), '25:00');
  assert.equal(formatTime(61_000), '01:01');
  assert.equal(formatTime(500), '00:01'); // 0.5秒残りは「00:00」ではなく「00:01」
  assert.equal(formatTime(0), '00:00');
});

test('予定の開始: 止まっていれば、作業の頭 (残り 1 回分) に準備する。完了した回数はそのまま', () => {
  const settings = { ...DEFAULT_SETTINGS, workMinutes: 45 };
  const breakState = { mode: 'shortBreak', running: false, remainingMs: 1000, endAt: null, completedWork: 3 };
  assert.deepEqual(prepareFocus(breakState, settings), { mode: 'work', running: false, remainingMs: 45 * 60 * 1000, endAt: null, completedWork: 3 });
  const pausedWork = { mode: 'work', running: false, remainingMs: 600000, endAt: null, completedWork: 1 };
  assert.equal(prepareFocus(pausedWork, settings).remainingMs, 45 * 60 * 1000, '途中で止めていた作業も、頭からにする');
});

test('予定の開始: 動いているタイマーは変えない', () => {
  const running = start(createState(DEFAULT_SETTINGS), 0);
  assert.equal(prepareFocus(running, DEFAULT_SETTINGS), running);
});
