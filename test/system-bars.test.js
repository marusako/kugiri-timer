import { test } from 'node:test';
import assert from 'node:assert/strict';
import { systemBarStyle } from '../src/system-bars.js';

// SystemBars の style: 'DARK' は暗い背景に明るい文字、'LIGHT' は明るい背景に暗い文字 (Capacitor の公式ドキュメント)
test('ダークのテーマでは、帯の文字を明るくする (DARK)。ライトでは暗くする (LIGHT)', () => {
  assert.equal(systemBarStyle('dark', false), 'DARK');
  assert.equal(systemBarStyle('light', true), 'LIGHT', 'スマホがダークでも、アプリがライトなら LIGHT');
});

test('自動のテーマでは、スマホのダーク / ライトに合わせる', () => {
  assert.equal(systemBarStyle('system', true), 'DARK');
  assert.equal(systemBarStyle('system', false), 'LIGHT');
});
