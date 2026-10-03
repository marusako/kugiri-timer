import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, RANGES, THEMES, parseSettings } from '../src/settings.js';

test('空の入力なら既定値になる', () => {
  assert.deepEqual(parseSettings({}), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
});

test('既定値は音量 60、テーマは自動 (system)', () => {
  assert.equal(DEFAULT_SETTINGS.volume, 60);
  assert.equal(DEFAULT_SETTINGS.theme, 'system');
});

test('自動開始の設定はもうない (常に自動開始)', () => {
  assert.equal('autoStart' in DEFAULT_SETTINGS, false);
  // 以前の版で保存された autoStart は読み捨てる
  assert.equal('autoStart' in parseSettings({ autoStart: true }), false);
});

test('文字列の数値を数値に変換する', () => {
  const s = parseSettings({
    workMinutes: '50',
    shortBreakMinutes: '10',
    longBreakMinutes: '30',
    longBreakInterval: '3',
    volume: '0',
    theme: 'dark',
  });
  assert.deepEqual(s, {
    workMinutes: 50,
    shortBreakMinutes: 10,
    longBreakMinutes: 30,
    longBreakInterval: 3,
    volume: 0,
    theme: 'dark',
  });
});

test('テーマは決まった値だけを受け付ける', () => {
  for (const theme of THEMES) assert.equal(parseSettings({ theme }).theme, theme);
  assert.equal(parseSettings({ theme: 'purple' }).theme, 'system');
});

test('範囲外の値は範囲内に収める', () => {
  const s = parseSettings({ workMinutes: 0, longBreakInterval: 99, volume: 150 });
  assert.equal(s.workMinutes, 1);
  assert.equal(s.longBreakInterval, 10);
  assert.equal(s.volume, 100);
});

test('数値でない値や小数は既定値・整数に直す', () => {
  const s = parseSettings({ workMinutes: 'abc', shortBreakMinutes: 4.6 });
  assert.equal(s.workMinutes, DEFAULT_SETTINGS.workMinutes);
  assert.equal(s.shortBreakMinutes, 5);
});

test('範囲の定義は画面のホイールでも使えるよう公開されている', () => {
  assert.deepEqual(RANGES.workMinutes, [1, 120]);
  assert.deepEqual(RANGES.longBreakInterval, [2, 10]);
});

test('知らない項目は捨てる', () => {
  assert.equal('foo' in parseSettings({ foo: 1 }), false);
});
