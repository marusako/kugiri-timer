// アラームと効果音の楽譜 (alarms.js・se-sounds.js) に共通の確かめ方。
// ファイル名が .test.js ではないので、これ自体はテストとして実行されない
import assert from 'node:assert/strict';

const WAVES = ['sine', 'square', 'triangle', 'sawtooth'];

// sound.js と同じ形の音量の変化 (attack で gain まで上がり、duration の終わりにほぼ 0 まで指数的に下がる)
export function envelopeAt(note, time) {
  const t = time - note.at;
  if (t < 0 || t > note.duration) return 0;
  if (t < note.attack) return note.gain * (t / note.attack);
  return note.gain * (0.0001 / note.gain) ** ((t - note.attack) / (note.duration - note.attack));
}

export function endOf(notes) {
  return Math.max(...notes.map((n) => n.at + n.duration));
}

// 1 つ 1 つの音のデータが正しい形か
export function assertValidNotes(notes) {
  assert.ok(notes.length > 0);
  for (const n of notes) {
    assert.ok(n.at >= 0, 'at は 0 以上');
    assert.ok(n.freq >= 100 && n.freq <= 8000, `周波数 ${n.freq} は耳に届きやすい範囲`);
    assert.ok(WAVES.includes(n.wave), `波形 ${n.wave}`);
    assert.ok(n.attack > 0 && n.attack < n.duration, '立ち上がりは鳴る長さより短い');
    assert.ok(n.gain > 0 && n.gain <= 1, '音の大きさは 0〜1');
    // 途中で高さを変える音 (freqEnd と glide はセットで使う)
    if (n.freqEnd !== undefined || n.glide !== undefined) {
      assert.ok(n.freqEnd >= 100 && n.freqEnd <= 8000, `変化後の周波数 ${n.freqEnd}`);
      assert.ok(n.glide > 0 && n.glide <= n.duration, '高さの変化は鳴っている間に終わる');
    }
  }
}

// 重なった音を足しても limit を超えないか (音割れや、急に大きく鳴るのを防ぐ)
export function assertPeakAtMost(notes, limit) {
  const end = endOf(notes);
  for (let time = 0; time <= end; time += 0.0005) {
    const sum = notes.reduce((total, n) => total + envelopeAt(n, time), 0);
    assert.ok(sum <= limit, `${time.toFixed(4)} 秒で ${sum.toFixed(3)}`);
  }
}
