import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodDays, shiftAnchor, periodFocus, axisTicks } from '../src/focus-stats.js';
import { TOTAL_ID, addFocusTime, addFocusCount } from '../src/focus-log.js';

// 2026-10-05 は月曜日、2026-10-11 は日曜日
test('週は月曜始まりの 7 日。どの曜日を渡しても、その週になる', () => {
  const week = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
  assert.deepEqual(periodDays('week', '2026-10-05'), week);
  assert.deepEqual(periodDays('week', '2026-10-08'), week);
  assert.deepEqual(periodDays('week', '2026-10-11'), week, '日曜日は前の月曜日からの週');
  assert.deepEqual(periodDays('week', '2026-09-30').slice(0, 2), ['2026-09-28', '2026-09-29'], '月をまたぐ週');
});

test('月は 1 日〜末日', () => {
  const october = periodDays('month', '2026-10-17');
  assert.equal(october.length, 31);
  assert.equal(october[0], '2026-10-01');
  assert.equal(october[30], '2026-10-31');
  assert.equal(periodDays('month', '2028-02-10').length, 29, 'うるう年');
  assert.equal(periodDays('month', '2026-02-10').length, 28);
});

test('前後の週・月に移る', () => {
  assert.equal(shiftAnchor('week', '2026-10-08', -1), '2026-10-01');
  assert.equal(shiftAnchor('week', '2026-10-08', 1), '2026-10-15');
  assert.equal(shiftAnchor('month', '2026-10-31', -1), '2026-09-01', '月は 1 日にそろえる (9 月 31 日はないため)');
  assert.equal(shiftAnchor('month', '2026-12-15', 1), '2027-01-01');
});

test('縦軸の目盛り (分): 0 から切りのいい間隔で、いちばん長い日以上の値まで。線は 0 を含めて 4 本まで', () => {
  const min = (m) => m * 60000;
  assert.deepEqual(axisTicks(min(130)), [0, 60, 120, 180]);
  assert.deepEqual(axisTicks(min(45)), [0, 15, 30, 45]);
  assert.deepEqual(axisTicks(min(46)), [0, 30, 60]);
  assert.deepEqual(axisTicks(min(3)), [0, 1, 2, 3]);
  assert.deepEqual(axisTicks(min(10 * 60)), [0, 240, 480, 720]);
  assert.deepEqual(axisTicks(min(24 * 60)), [0, 480, 960, 1440], '1 日まるごとでも 4 本に収まる');
  assert.deepEqual(axisTicks(30000), [0, 1], '1 分未満でも、0 だけにはしない');
  assert.deepEqual(axisTicks(0), [0, 30, 60], '記録がない期間は 0〜60 分の枠だけ見せる');
  for (const ms of [min(1), min(7), min(59), min(61), min(200), min(1000)]) {
    const ticks = axisTicks(ms);
    assert.ok(ticks.at(-1) * 60000 >= ms, `${ms}: 一番上の目盛りが最大以上`);
    assert.ok(ticks.length >= 2 && ticks.length <= 4, `${ms}: 目盛りの数`);
  }
});

test('期間の合計は日ごとの合計 (TOTAL_ID) から数え、日ごとの値も返す。記録のない日は 0', () => {
  let log = addFocusTime({}, '2026-10-05', [TOTAL_ID, 'ev-1', 'ev-2'], 2000);
  log = addFocusCount(log, '2026-10-05', [TOTAL_ID, 'ev-1', 'ev-2']);
  log = addFocusTime(log, '2026-10-07', [TOTAL_ID], 1500);
  log = addFocusTime(log, '2026-10-12', [TOTAL_ID], 9999); // 次の週
  log = addFocusTime(log, '2026-10-06', ['ev-1'], 700); // 日ごとの合計がない (前の版の記録) 日は数えない
  const result = periodFocus(log, periodDays('week', '2026-10-05'));
  assert.equal(result.ms, 3500, '重なった予定を二重に数えない');
  assert.equal(result.count, 1);
  assert.equal(result.days.length, 7);
  assert.deepEqual(result.days[0], { key: '2026-10-05', ms: 2000, count: 1 });
  assert.deepEqual(result.days[1], { key: '2026-10-06', ms: 0, count: 0 });
  assert.deepEqual(result.days[2], { key: '2026-10-07', ms: 1500, count: 0 });
});
