import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALARM_SOUNDS, DEFAULT_ALARM, alarmNotes } from '../src/alarms.js';

const WAVES = ['sine', 'square', 'triangle', 'sawtooth'];

// sound.js と同じ形の音量の変化 (attack で gain まで上がり、duration の終わりにほぼ 0 まで指数的に下がる)
function envelopeAt(note, time) {
  const t = time - note.at;
  if (t < 0 || t > note.duration) return 0;
  if (t < note.attack) return note.gain * (t / note.attack);
  return note.gain * (0.0001 / note.gain) ** ((t - note.attack) / (note.duration - note.attack));
}

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
    const notes = alarmNotes(id);
    assert.ok(notes.length > 0);
    for (const n of notes) {
      assert.ok(n.at >= 0, 'at は 0 以上');
      assert.ok(n.freq >= 100 && n.freq <= 8000, `周波数 ${n.freq} は耳に届きやすい範囲`);
      assert.ok(WAVES.includes(n.wave), `波形 ${n.wave}`);
      assert.ok(n.attack > 0 && n.attack < n.duration, '立ち上がりは鳴る長さより短い');
      assert.ok(n.gain > 0 && n.gain <= 1, '音の大きさは 0〜1');
    }
  });

  test(`${id}: 3 秒以内に鳴り終わる (次のセッションまで引きずらない)`, () => {
    const end = Math.max(...alarmNotes(id).map((n) => n.at + n.duration));
    assert.ok(end <= 3, `${end} 秒`);
  });

  // 最大の大きさは Chime (gain 1) を基準にそろえる。Chime は前の音の余韻がわずかに重なる (以前の版と同じ音のまま) ので、1% だけ余裕をみる
  test(`${id}: 重なった音を足しても Chime の大きさを超えない (音割れしない・急に大きく鳴らない)`, () => {
    const notes = alarmNotes(id);
    const end = Math.max(...notes.map((n) => n.at + n.duration));
    for (let time = 0; time <= end; time += 0.001) {
      const sum = notes.reduce((total, n) => total + envelopeAt(n, time), 0);
      assert.ok(sum <= 1.01, `${time.toFixed(3)} 秒で ${sum.toFixed(3)}`);
    }
  });
}
