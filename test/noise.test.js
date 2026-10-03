import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOISE_TYPES, generateNoise } from '../src/noise.js';

// テストで毎回同じ結果になるよう、決まった順に値を返す疑似乱数を使う
function seeded(seed = 1) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

// 隣り合うサンプルの差の平均 (大きいほど高い音が多く、ザーッとした音になる)
function roughness(samples) {
  let sum = 0;
  for (let i = 1; i < samples.length; i += 1) sum += Math.abs(samples[i] - samples[i - 1]);
  return sum / (samples.length - 1);
}

test('ノイズはホワイト・ピンク・ブラウンの 3 種類', () => {
  assert.deepEqual(NOISE_TYPES, ['white', 'pink', 'brown']);
});

test('指定した長さで、値は -1〜1 に収まる', () => {
  for (const type of NOISE_TYPES) {
    const samples = generateNoise(type, 10_000, seeded());
    assert.equal(samples.length, 10_000);
    assert.ok(samples.every((v) => v >= -1 && v <= 1), `${type} の値が範囲外`);
  }
});

test('ホワイト → ピンク → ブラウンの順に、音がなめらか (低い音が中心) になる', () => {
  const [white, pink, brown] = NOISE_TYPES.map((type) => roughness(generateNoise(type, 20_000, seeded())));
  assert.ok(white > pink, `white ${white} > pink ${pink}`);
  assert.ok(pink > brown, `pink ${pink} > brown ${brown}`);
});

test('無音になっていない', () => {
  for (const type of NOISE_TYPES) {
    const samples = generateNoise(type, 10_000, seeded());
    const peak = Math.max(...samples.map(Math.abs));
    assert.ok(peak > 0.1, `${type} の音が小さすぎる (${peak})`);
  }
});

test('知らない種類はエラーにする', () => {
  assert.throws(() => generateNoise('blue', 10, seeded()));
});
