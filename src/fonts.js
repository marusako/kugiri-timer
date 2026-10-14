// タイマーの数字 (残り時間) のフォントの一覧 (画面にも Electron にも依存しない純粋なデータ)。
// パソコン版では Windows 10 / 11 に最初から入っているフォントを使う。それがない環境 (Android 版など) では、
// 似たフォントを数字と「:」だけに絞って同梱したもの (Focusr ○○、src/timer-fonts、OFL。@font-face は style.css) を使う。
// 時刻が変わるたびに数字の幅が変わると表示が揺れるので、数字の幅がそろう (tabular-nums が効く) フォントだけにしている。
// 幅の広いフォントは、3 桁の分 (120:00) でも円に収まるよう、size で少し小さくする (1 が標準の大きさ)。
// 名前は翻訳表 (i18n.js) の timerFont.<id> から出す

export const TIMER_FONTS = Object.freeze([
  { id: 'default', family: "'Segoe UI', 'Yu Gothic UI', 'Malgun Gothic', 'Focusr Sans', sans-serif", weight: 600, size: 1 }, // 以前の版と同じ
  { id: 'light', family: "'Segoe UI Light', 'Focusr Sans Light', sans-serif", weight: 300, size: 1 },
  // Segoe UI Black は数字の幅がそろわない (1 が狭い) ため、Arial Black を使う
  { id: 'bold', family: "'Arial Black', 'Focusr Black', sans-serif", weight: 900, size: 0.88 },
  { id: 'din', family: "Bahnschrift, 'Focusr Condensed', sans-serif", weight: 400, size: 1 },
  { id: 'mono', family: "Consolas, 'Cascadia Mono', 'Focusr Mono', monospace", weight: 400, size: 1 },
  { id: 'serif', family: "Cambria, Georgia, 'Focusr Serif', serif", weight: 400, size: 1 },
]);

export const DEFAULT_TIMER_FONT = 'default';

export function timerFont(id) {
  return TIMER_FONTS.find((font) => font.id === id) ?? TIMER_FONTS[0];
}
