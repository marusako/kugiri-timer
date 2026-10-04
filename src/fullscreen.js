// 全画面表示のキー操作の判断 (Electron にも画面にも依存しない純粋関数)。
// F11 はメインプロセス (main.js) が、Esc は画面 (renderer.js) が受け取ってここに聞く

// メインプロセスに届いたキー入力 (Electron の before-input-event の input) で何をするか
export function windowKeyAction(input) {
  // 押しっぱなしで届く「くり返し」の入力では切り替えない (全画面が何度も切り替わってちらつくのを防ぐ)
  if (input.type !== 'keyDown' || input.isAutoRepeat) return null;
  const modified = input.control || input.alt || input.shift || input.meta;
  if (input.key === 'F11' && !modified) return 'toggle';
  return null;
}

// Esc で何をするか。設定パネルが開いていればパネルを閉じることを優先し、
// 次に再生バーの小窓 (再生リスト・音量)、全画面はその次の Esc で抜ける
export function escapeAction({ settingsOpen, popupOpen = false, fullScreen }) {
  if (settingsOpen) return 'closeSettings';
  if (popupOpen) return 'closePopup';
  if (fullScreen) return 'exitFullScreen';
  return null;
}

// 何もないところのクリック・右クリックで、メイン画面に向かって 1 つ戻る。
// Esc と同じ順に閉じるが、全画面は抜けない (メイン画面のままなので、戻る先がない)
export function backAction({ settingsOpen, popupOpen = false }) {
  if (settingsOpen) return 'closeSettings';
  if (popupOpen) return 'closePopup';
  return null;
}
