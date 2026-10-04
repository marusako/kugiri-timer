// BGM の再生リスト (取り込んだ曲の一覧) の決まりごと。画面にも音声 API にも依存しない純粋関数だけにしている。
// 曲は保存名 (例: 1a2b3c.mp3) で表す

export const REPEAT_MODES = Object.freeze(['off', 'all', 'one']);
// 前へボタンで「今の曲の最初に戻る」か「前の曲へ」かの境目 (YouTube Music などと同じ動き)
export const PREV_RESTART_SECONDS = 3;

// 並び順: 保存した順 (savedOrder) を守り、新しく取り込んだ曲は後ろに足し、消した曲は除く。
// files は取り込んだ順の一覧
export function orderTracks(files, savedOrder) {
  const kept = savedOrder.filter((file) => files.includes(file));
  return [...kept, ...files.filter((file) => !kept.includes(file))];
}

// from 番目の曲を to 番目に動かした新しい一覧を返す (to が範囲の外なら端に動かす)
export function moveTrack(order, from, to) {
  const result = [...order];
  const [track] = result.splice(from, 1);
  result.splice(Math.min(Math.max(to, 0), result.length), 0, track);
  return result;
}

// 実際に再生する順。シャッフルなら全曲を 1 回ずつ並べ替え (フィッシャー–イェーツ法)、今の曲を先頭にする。
// random は 0 以上 1 未満を返す関数 (テストでは決まった値を返すものに差し替える)
export function playQueue(order, shuffle, current, random = Math.random) {
  if (!shuffle) return [...order];
  const rest = order.filter((file) => file !== current);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return order.includes(current) ? [current, ...rest] : rest;
}

// 次の曲。auto は「曲が終わって自動で進む」とき (リピート「1 曲」はそのときだけ同じ曲をくり返す)。
// 最後まで来たら、リピート「オフ」は null (止める)、それ以外は最初の曲へ
export function nextInQueue(queue, current, repeat, { auto = false } = {}) {
  if (queue.length === 0) return null;
  if (auto && repeat === 'one') return current;
  const index = queue.indexOf(current);
  if (index === -1) return queue[0];
  if (index + 1 < queue.length) return queue[index + 1];
  return repeat === 'off' ? null : queue[0];
}

// 前の曲。最初の曲では、リピート「全曲」なら最後の曲、それ以外は同じ曲 (最初から聞き直す)
export function prevInQueue(queue, current, repeat) {
  if (queue.length === 0) return null;
  const index = queue.indexOf(current);
  if (index > 0) return queue[index - 1];
  return repeat === 'all' ? queue[queue.length - 1] : current;
}

// 前へボタンを押したときの動き。曲が少し進んでいたら、まずその曲の最初に戻す
export function prevAction(positionSeconds) {
  return positionSeconds > PREV_RESTART_SECONDS ? 'restart' : 'previous';
}

export function nextRepeatMode(mode) {
  const index = REPEAT_MODES.indexOf(mode);
  return REPEAT_MODES[(Math.max(index, 0) + 1) % REPEAT_MODES.length];
}
