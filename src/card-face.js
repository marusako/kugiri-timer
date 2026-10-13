// ラウンドの間の、タイマーのカードの表と裏 (画面にも Electron にも依存しない純粋な関数)。
// 表 ('round') はラウンドのタイマー、裏 ('timer') は通常のタイマー。ラウンドの間だけ、めくって入れ替えられる

// めくれる、カードの左右の端の幅 (px)
export const EDGE_PX = 24;

export function flipFace(face) {
  return face === 'round' ? 'timer' : 'round';
}

// ラウンドの外に出たら表に戻す (次のラウンドは、ラウンドのタイマーから見せる)。ラウンドの間はそのまま
export function settleFace(face, inRound) {
  return inRound ? face : 'round';
}

// カードにラウンドのタイマーを出すか (ラウンドの外は、いつも通常のタイマー)
export function showsRoundTimer(face, inRound) {
  return inRound && face === 'round';
}

// カードの左端から x (px) のところを押したのが、左右の端か (width はカードの幅)
export function isEdgePress(x, width) {
  return x < EDGE_PX || x > width - EDGE_PX;
}
