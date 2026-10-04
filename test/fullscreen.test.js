import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowKeyAction, escapeAction, backAction } from '../src/fullscreen.js';

const key = (overrides) => ({ type: 'keyDown', key: 'F11', isAutoRepeat: false, control: false, alt: false, shift: false, meta: false, ...overrides });

test('F11 を押すと全画面を切り替える', () => {
  assert.equal(windowKeyAction(key()), 'toggle');
});

test('F11 を押しっぱなしにしても、切り替えは 1 回だけ (画面がちらつかない)', () => {
  assert.equal(windowKeyAction(key({ isAutoRepeat: true })), null);
});

test('キーを離したときは何もしない', () => {
  assert.equal(windowKeyAction(key({ type: 'keyUp' })), null);
});

test('Ctrl などと一緒に押した F11 や、ほかのキーは何もしない', () => {
  assert.equal(windowKeyAction(key({ control: true })), null);
  assert.equal(windowKeyAction(key({ alt: true })), null);
  assert.equal(windowKeyAction(key({ key: 'F10' })), null);
  // Esc は設定パネルを先に閉じる必要があるので、画面側 (escapeAction) で扱う
  assert.equal(windowKeyAction(key({ key: 'Escape' })), null);
});

test('Esc: 設定パネルが開いていれば、全画面でもまずパネルを閉じる', () => {
  assert.equal(escapeAction({ settingsOpen: true, fullScreen: true }), 'closeSettings');
  assert.equal(escapeAction({ settingsOpen: true, fullScreen: false }), 'closeSettings');
});

test('Esc: 再生バーの小窓 (再生リスト・音量) が開いていれば、全画面より先に小窓を閉じる', () => {
  assert.equal(escapeAction({ settingsOpen: false, popupOpen: true, fullScreen: true }), 'closePopup');
  assert.equal(escapeAction({ settingsOpen: true, popupOpen: true, fullScreen: false }), 'closeSettings', '設定パネルが手前にある');
});

test('Esc: パネルが閉じていて全画面なら、全画面を抜ける', () => {
  assert.equal(escapeAction({ settingsOpen: false, fullScreen: true }), 'exitFullScreen');
});

test('Esc: パネルが閉じていて全画面でもなければ、何もしない', () => {
  assert.equal(escapeAction({ settingsOpen: false, fullScreen: false }), null);
});

test('戻る (何もないところのクリック・右クリック): 設定パネル → 小窓 の順に閉じる', () => {
  assert.equal(backAction({ settingsOpen: true, popupOpen: true }), 'closeSettings');
  assert.equal(backAction({ settingsOpen: false, popupOpen: true }), 'closePopup');
});

test('戻る: メイン画面では何もしない (全画面も抜けない)', () => {
  assert.equal(backAction({ settingsOpen: false, popupOpen: false }), null);
});
