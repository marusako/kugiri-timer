import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, parseSettings } from '../src/settings.js';

test('空の入力なら既定値になる', () => {
  assert.deepEqual(parseSettings({}), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
});

test('既定値は自動開始オフ、音量 60', () => {
  assert.equal(DEFAULT_SETTINGS.autoStart, false);
  assert.equal(DEFAULT_SETTINGS.volume, 60);
});

test('フォームから来た文字列を数値と真偽値に変換する', () => {
  const s = parseSettings({
    workMinutes: '50',
    shortBreakMinutes: '10',
    longBreakMinutes: '30',
    longBreakInterval: '3',
    autoStart: 'on', // チェックボックスはオンのとき 'on' が送られる
    volume: '0',
  });
  assert.deepEqual(s, {
    workMinutes: 50,
    shortBreakMinutes: 10,
    longBreakMinutes: 30,
    longBreakInterval: 3,
    autoStart: true,
    volume: 0,
  });
});

test('保存データの真偽値もそのまま受け取れる', () => {
  assert.equal(parseSettings({ autoStart: true }).autoStart, true);
  assert.equal(parseSettings({ autoStart: false }).autoStart, false);
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

test('知らない項目は捨てる', () => {
  assert.equal('foo' in parseSettings({ foo: 1 }), false);
});
