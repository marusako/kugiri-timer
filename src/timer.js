// タイマーの状態遷移ロジック。画面 (DOM) にも Electron にも依存しない純粋な関数だけを置く。
// 状態は書き換えずに新しいオブジェクトを返す (イミュータブル) ので、テストしやすく、バグも追いやすい。
// settings の形と既定値は settings.js を参照。

const MINUTES_KEY = {
  work: 'workMinutes',
  shortBreak: 'shortBreakMinutes',
  longBreak: 'longBreakMinutes',
};

export function durationMs(mode, settings) {
  return settings[MINUTES_KEY[mode]] * 60 * 1000;
}

export function createState(settings) {
  return {
    mode: 'work',
    running: false,
    remainingMs: durationMs('work', settings),
    endAt: null, // 実行中だけ使う「終了予定時刻」(ミリ秒のタイムスタンプ)
    completedWork: 0,
  };
}

// 残り時間を毎秒 1 ずつ減らす方式だと、setInterval の遅れが積み重なってズレる。
// そこで開始時に「終了予定時刻」を決め、毎回「終了予定時刻 - 今」で残りを計算する。
export function start(state, now) {
  if (state.running) return state;
  return { ...state, running: true, endAt: now + state.remainingMs };
}

export function pause(state, now) {
  if (!state.running) return state;
  return { ...state, running: false, endAt: null, remainingMs: Math.max(0, state.endAt - now) };
}

export function reset(state, settings) {
  return { ...state, running: false, endAt: null, remainingMs: durationMs(state.mode, settings) };
}

// 現在のモードを終えて次のモードへ進める。counted が true のときだけ作業完了として数える。
function advance(state, settings, counted) {
  const countsAsWork = counted && state.mode === 'work';
  const completedWork = state.completedWork + (countsAsWork ? 1 : 0);
  let mode = 'work';
  if (state.mode === 'work') {
    // 実際に完了した回数が区切りに達したときだけ長い休憩 (スキップでは長い休憩にならない)
    const isLong = countsAsWork && completedWork % settings.longBreakInterval === 0;
    mode = isLong ? 'longBreak' : 'shortBreak';
  }
  return {
    mode,
    running: false,
    endAt: null,
    remainingMs: durationMs(mode, settings),
    completedWork,
  };
}

export function tick(state, now, settings) {
  if (!state.running) return { state, finished: false };
  const remainingMs = state.endAt - now;
  if (remainingMs > 0) return { state: { ...state, remainingMs }, finished: false };
  let next = advance(state, settings, true);
  // 次の開始時刻は「前の終了予定時刻」ではなく「今」にする。
  // そうしないと、スリープ明けなどで tick が遅れたとき、何回分もまとめて完了扱いになってしまう
  if (settings.autoStart) next = start(next, now);
  return { state: next, finished: true, finishedMode: state.mode };
}

export function skip(state, settings) {
  return advance(state, settings, false);
}

export function formatTime(ms) {
  // 切り上げにすることで、残り 0.5 秒のときに「00:00」と表示されて止まらない問題を防ぐ
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}
