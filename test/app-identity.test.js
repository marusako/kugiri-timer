import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_USER_MODEL_ID, DEV_SHORTCUT_NAME, appUserModelId, devShortcutOptions } from '../src/app-identity.js';

test('インストールしたアプリの識別子は、前の版から変えない (変えると、自動アップデートで二重にインストールされる)', () => {
  assert.equal(APP_USER_MODEL_ID, 'io.github.marusako.pomodoro-timer');
  assert.equal(appUserModelId(true), APP_USER_MODEL_ID);
});

test('開発版 (npm start) は別の識別子にする (タスクバーで、インストールしたアプリと 1 つにまとめられないように)', () => {
  assert.equal(appUserModelId(false), 'io.github.marusako.pomodoro-timer.dev');
  assert.notEqual(appUserModelId(false), appUserModelId(true));
});

test('開発版のスタートメニューのショートカット: 開発版の識別子を付け、プロジェクトのフォルダーを開く electron.exe にする', () => {
  // 空白を含むフォルダーでも開けるように、フォルダーは " で囲む
  assert.deepEqual(devShortcutOptions('D:/my project/node_modules/electron/dist/electron.exe', 'D:/my project'), {
    target: 'D:/my project/node_modules/electron/dist/electron.exe',
    args: '"D:/my project"',
    cwd: 'D:/my project',
    appUserModelId: 'io.github.marusako.pomodoro-timer.dev',
    description: 'Focusr (開発版)',
  });
  assert.equal(DEV_SHORTCUT_NAME, 'Focusr (開発版).lnk');
});
