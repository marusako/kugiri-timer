// スマホ版の上下の帯 (時刻・電池の帯と、ナビゲーションの帯) の文字の色 (画面にも Capacitor にも依存しない純粋な関数)。
// 帯の後ろにはアプリの画面がそのまま見える (edge-to-edge) ので、アプリのテーマに合わせないと、
// 例えばスマホがライトでアプリがダークのときに、暗い背景に暗い文字になって読めない。
// 返す値は Capacitor の SystemBars の style: 'DARK' は暗い背景に明るい文字、'LIGHT' は明るい背景に暗い文字
export function systemBarStyle(theme, prefersDark) {
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  return dark ? 'DARK' : 'LIGHT';
}
