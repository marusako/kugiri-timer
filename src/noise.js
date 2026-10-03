// BGM 用のノイズの波形を作る (音声ファイルを使わずに、数値の並びとして生成する)。
// random を引数で受け取るのは、テストで毎回同じ結果を出すため。

export const NOISE_TYPES = ['white', 'pink', 'brown'];

const PEAK = 0.9; // 種類による音量差をなくすため、最大値をここにそろえる

function normalize(samples) {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  if (peak === 0) return samples;
  const scale = PEAK / peak;
  for (let i = 0; i < samples.length; i += 1) samples[i] *= scale;
  return samples;
}

export function generateNoise(type, length, random = Math.random) {
  if (!NOISE_TYPES.includes(type)) throw new Error(`unknown noise type: ${type}`);
  const samples = new Float32Array(length);

  if (type === 'white') {
    // すべての高さの音を同じ強さで含む (ザーッという音)
    for (let i = 0; i < length; i += 1) samples[i] = random() * 2 - 1;
  } else if (type === 'pink') {
    // ホワイトノイズに何段かのフィルターをかけ、高い音ほど弱くする (雨音に近い)。
    // Paul Kellet の近似式として知られる方法
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i += 1) {
      const w = random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      samples[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
  } else {
    // ホワイトノイズを少しずつ足し合わせ、ゆっくり変わる波にする (低くこもった滝のような音)。
    // 足し続けると値が際限なく大きくなるので、毎回少しだけ 0 に引き戻す
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      last = (last + 0.02 * (random() * 2 - 1)) / 1.02;
      samples[i] = last;
    }
  }
  return normalize(samples);
}
