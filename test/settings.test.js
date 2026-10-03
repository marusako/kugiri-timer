import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, RANGES, THEMES, parseSettings } from '../src/settings.js';

test('空の入力なら既定値になる', () => {
  assert.deepEqual(parseSettings({}), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
});

test('既定値: 音量は アラーム 60・BGM 40・SE 40、テーマは自動、壁紙と BGM はなし', () => {
  assert.equal(DEFAULT_SETTINGS.alarmVolume, 60);
  assert.equal(DEFAULT_SETTINGS.bgmVolume, 40);
  assert.equal(DEFAULT_SETTINGS.seVolume, 40);
  assert.equal(DEFAULT_SETTINGS.theme, 'system');
  assert.equal(DEFAULT_SETTINGS.wallpaper, 'none');
  assert.equal(DEFAULT_SETTINGS.bgm, 'none');
});

test('以前の版の volume は、アラームの音量として引き継ぐ', () => {
  assert.equal(parseSettings({ volume: 25 }).alarmVolume, 25);
  // 新しい alarmVolume があればそちらを優先する
  assert.equal(parseSettings({ volume: 25, alarmVolume: 70 }).alarmVolume, 70);
  assert.equal('volume' in parseSettings({ volume: 25 }), false);
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
    alarmVolume: '0',
    bgmVolume: '20',
    seVolume: '100',
  });
  assert.equal(s.workMinutes, 50);
  assert.equal(s.longBreakInterval, 3);
  assert.equal(s.alarmVolume, 0);
  assert.equal(s.bgmVolume, 20);
  assert.equal(s.seVolume, 100);
});

test('テーマは決まった値だけを受け付ける', () => {
  for (const theme of THEMES) assert.equal(parseSettings({ theme }).theme, theme);
  assert.equal(parseSettings({ theme: 'purple' }).theme, 'system');
});

test('壁紙と BGM は決まった形の ID だけを受け付ける', () => {
  assert.equal(parseSettings({ wallpaper: 'preset:ocean' }).wallpaper, 'preset:ocean');
  assert.equal(parseSettings({ wallpaper: 'import:3f2a-91bc.png' }).wallpaper, 'import:3f2a-91bc.png');
  assert.equal(parseSettings({ bgm: 'noise:brown' }).bgm, 'noise:brown');
  assert.equal(parseSettings({ bgm: 'import:a1b2.mp3' }).bgm, 'import:a1b2.mp3');
  // ファイルの場所を指すような値は受け付けない
  assert.equal(parseSettings({ wallpaper: 'import:../../secret.png' }).wallpaper, 'none');
  assert.equal(parseSettings({ bgm: 'C:\\music\\a.mp3' }).bgm, 'none');
});

test('範囲外の値は範囲内に収める', () => {
  const s = parseSettings({ workMinutes: 0, longBreakInterval: 99, bgmVolume: 150 });
  assert.equal(s.workMinutes, 1);
  assert.equal(s.longBreakInterval, 10);
  assert.equal(s.bgmVolume, 100);
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
