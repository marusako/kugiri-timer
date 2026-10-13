// Windows がアプリを見分ける識別子 (AppUserModelID)。デスクトップ通知とタスクバーのまとまりに使われる。
// - インストールしたアプリは package.json の build.appId と同じ値にする。アプリ名を変えても、この値は変えない
//   (変えるとインストーラーが別のアプリとして扱い、自動アップデートで古い版が残ったまま二重にインストールされるため)
// - 開発版 (npm start) は別の値にする。同じ値だと、Windows が同じアプリとして扱い、開発版の electron.exe を
//   タスクバーにピン留めしたあと、インストールしたアプリをピン留めできず、ピンを押すと開発版の electron.exe が開いてしまう
export const APP_USER_MODEL_ID = 'io.github.marusako.pomodoro-timer';

export function appUserModelId(isPackaged) {
  return isPackaged ? APP_USER_MODEL_ID : `${APP_USER_MODEL_ID}.dev`;
}

// 開発版のスタートメニューのショートカット。Windows は、識別子が付いたショートカットがスタートメニューにないアプリの
// 通知を出さないことがあるので、開発版を起動したときに作る (インストールしたアプリのショートカットはインストーラーが作る)。
// アイコンは electron.exe のもの (Electron のマーク) のままにして、インストールしたアプリと見分けやすくする
export const DEV_SHORTCUT_NAME = 'Focusr (開発版).lnk';

export function devShortcutOptions(electronPath, projectPath) {
  return {
    target: electronPath,
    args: `"${projectPath}"`,
    cwd: projectPath,
    appUserModelId: appUserModelId(false),
    description: 'Focusr (開発版)',
  };
}
