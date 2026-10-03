// 自動アップデートの案内バナーの状態。メインプロセスからの通知と、ユーザーの操作を
// イベントとして受け取り、次の状態を返す (画面にも Electron にも依存しない純粋関数)。
//
// phase の移り変わり:
//   idle → available → downloading → downloaded
//                ↑            ↓
//                └── error ←──┘   (error から「再試行」で downloading に戻る)
//   available / downloaded / error は「あとで」で hidden になる

export const INITIAL_UPDATE_STATE = Object.freeze({ phase: 'idle', version: null, percent: 0 });

const VISIBLE_PHASES = new Set(['available', 'downloading', 'downloaded', 'error']);

export function isBannerVisible(state) {
  return VISIBLE_PHASES.has(state.phase);
}

export function nextUpdateState(state, event) {
  switch (event.type) {
    case 'available':
      return { ...state, phase: 'available', version: event.version };
    case 'download-start':
      if (state.phase !== 'available' && state.phase !== 'error') return state;
      return { ...state, phase: 'downloading', percent: 0 };
    case 'progress':
      if (state.phase !== 'downloading') return state;
      return { ...state, percent: Math.min(100, Math.max(0, Math.floor(event.percent))) };
    case 'downloaded':
      return { ...state, phase: 'downloaded', version: event.version ?? state.version, percent: 100 };
    case 'error':
      // 更新の確認だけが失敗した場合 (オフラインなど) は、利用者に見せる必要がないので出さない
      if (state.phase !== 'downloading') return state;
      return { ...state, phase: 'error' };
    case 'dismiss':
      // ダウンロード中に閉じると状況が分からなくなるので、閉じさせない
      if (state.phase === 'downloading') return state;
      return { ...state, phase: 'hidden' };
    default:
      return state;
  }
}
