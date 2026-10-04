import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALARM_SOUNDS, DEFAULT_ALARM, alarmNotes } from '../src/alarms.js';
import { assertValidNotes, assertPeakAtMost, endOf } from './score-checks.js';

test('選べるアラームは Chime・Bell・Digital・Marimba の 4 つで、初期値は Chime (以前の版と同じ音)', () => {
  assert.deepEqual(ALARM_SOUNDS, ['chime', 'bell', 'digital', 'marimba']);
  assert.equal(DEFAULT_ALARM, 'chime');
});

test('Chime は以前の版と同じ「ソ・ソ・ド」', () => {
  const notes = alarmNotes('chime');
  assert.deepEqual(notes.map((n) => n.freq), [784, 784, 1046.5]);
  assert.deepEqual(notes.map((n) => n.at), [0, 0.25, 0.5]);
});

test('知らない音の名前は Chime として扱う', () => {
  assert.deepEqual(alarmNotes('unknown'), alarmNotes('chime'));
});

for (const id of ALARM_SOUNDS) {
  test(`${id}: 音のデータが正しい形`, () => {
    assertValidNotes(alarmNotes(id));
  });

  test(`${id}: 3 秒以内に鳴り終わる (次のセッションまで引きずらない)`, () => {
    const end = endOf(alarmNotes(id));
    assert.ok(end <= 3, `${end} 秒`);
  });

  // 最大の大きさは Chime (gain 1) を基準にそろえる。Chime は前の音の余韻がわずかに重なる (以前の版と同じ音のまま) ので、1% だけ余裕をみる
  test(`${id}: 重なった音を足しても Chime の大きさを超えない (音割れしない・急に大きく鳴らない)`, () => {
    assertPeakAtMost(alarmNotes(id), 1.01);
  });
}
