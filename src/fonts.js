// タイマーの数字 (残り時間) のフォントの一覧 (画面にも Electron にも依存しない純粋なデータ)。
// どれも Windows 10 / 11 に最初から入っているフォントなので、アプリに同梱せず、ライセンスの心配もない。
// 時刻が変わるたびに数字の幅が変わると表示が揺れるので、数字の幅がそろう (tabular-nums が効く) フォントだけにしている。
// 幅の広いフォントは、3 桁の分 (120:00) でも円に収まるよう、size で少し小さくする (1 が標準の大きさ)。
// 名前は翻訳表 (i18n.js) の timerFont.<id> から出す

export const TIMER_FONTS = Object.freeze([
  { id: 'default', family: "'Segoe UI', 'Yu Gothic UI', 'Malgun Gothic', system-ui, sans-serif", weight: 600, size: 1 }, // 以前の版と同じ
  { id: 'light', family: "'Segoe UI Light', 'Segoe UI', sans-serif", weight: 300, size: 1 },
  // Segoe UI Black は数字の幅がそろわない (1 が狭い) ため、Arial Black を使う
  { id: 'bold', family: "'Arial Black', 'Segoe UI', sans-serif", weight: 900, size: 0.88 },
  { id: 'din', family: "Bahnschrift, 'Segoe UI', sans-serif", weight: 400, size: 1 },
  { id: 'mono', family: "Consolas, 'Cascadia Mono', monospace", weight: 400, size: 1 },
  { id: 'serif', family: "Cambria, Georgia, serif", weight: 400, size: 1 },
]);

export const DEFAULT_TIMER_FONT = 'default';

export function timerFont(id) {
  return TIMER_FONTS.find((font) => font.id === id) ?? TIMER_FONTS[0];
}
