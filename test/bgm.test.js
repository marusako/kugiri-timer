import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldPlayBgm } from '../src/bgm.js';

test('作業中でタイマーが動いているときだけ BGM を流す', () => {
  assert.equal(shouldPlayBgm({ mode: 'work', running: true }, 'noise:pink'), true);
  assert.equal(shouldPlayBgm({ mode: 'work', running: false }, 'noise:pink'), false);
  assert.equal(shouldPlayBgm({ mode: 'shortBreak', running: true }, 'noise:pink'), false);
  assert.equal(shouldPlayBgm({ mode: 'longBreak', running: true }, 'noise:pink'), false);
});

test('BGM が「なし」なら流さない', () => {
  assert.equal(shouldPlayBgm({ mode: 'work', running: true }, 'none'), false);
});

test('再生バーの ⏸ で止めているときは、作業中でも流さない', () => {
  assert.equal(shouldPlayBgm({ mode: 'work', running: true }, 'noise:pink', true), false);
  assert.equal(shouldPlayBgm({ mode: 'work', running: true }, 'noise:pink', false), true);
});
