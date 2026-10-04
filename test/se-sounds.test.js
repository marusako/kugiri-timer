import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SE_SOUNDS, DEFAULT_SE, seNotes } from '../src/se-sounds.js';
import { assertValidNotes, assertPeakAtMost, endOf } from './score-checks.js';

test('選べる効果音は Pop・Click・Wood・Soft の 4 つで、初期値は Pop (以前の版と同じ音)', () => {
  assert.deepEqual(SE_SOUNDS, ['pop', 'click', 'wood', 'soft']);
  assert.equal(DEFAULT_SE, 'pop');
});

test('Pop は以前の版と同じ「ポンッ」(660Hz から 330Hz へ 0.08 秒で下がり、0.12 秒で消える)', () => {
  assert.deepEqual(seNotes('pop'), [
    { at: 0, freq: 660, freqEnd: 330, glide: 0.08, wave: 'sine', attack: 0.005, duration: 0.12, gain: 1 },
  ]);
});

test('知らない音の名前は Pop として扱う', () => {
  assert.deepEqual(seNotes('unknown'), seNotes('pop'));
});

for (const id of SE_SOUNDS) {
  test(`${id}: 音のデータが正しい形`, () => {
    assertValidNotes(seNotes(id));
  });

  test(`${id}: 0.3 秒以内に鳴り終わる (続けて押しても音が重ならない)`, () => {
    const end = endOf(seNotes(id));
    assert.ok(end <= 0.3, `${end} 秒`);
  });

  test(`${id}: 重なった音を足しても Pop の大きさを超えない (音割れしない・急に大きく鳴らない)`, () => {
    assertPeakAtMost(seNotes(id), 1);
  });
}
