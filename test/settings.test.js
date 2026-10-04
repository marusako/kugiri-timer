import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, RANGES, THEMES, parseSettings, effectiveVolume } from '../src/settings.js';

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

test('言語は、まだ決めていない (null) が既定値で、決まった値だけを受け付ける', () => {
  assert.equal(DEFAULT_SETTINGS.language, null);
  for (const language of ['ja', 'en', 'ko']) assert.equal(parseSettings({ language }).language, language);
  assert.equal(parseSettings({ language: 'fr' }).language, null);
  // なくした選択肢「日本語 + English」が保存されていたら、まだ決めていない扱いにして、Windows の言語から選び直す
  assert.equal(parseSettings({ language: 'ja-en' }).language, null);
});

test('統計の表示は、既定値が「表示する」で、false のときだけ隠す', () => {
  assert.equal(DEFAULT_SETTINGS.showStats, true);
  assert.equal(parseSettings({ showStats: false }).showStats, false);
  assert.equal(parseSettings({ showStats: true }).showStats, true);
  // 以前の版の保存データにはこの項目がないので、表示する
  assert.equal(parseSettings({}).showStats, true);
  assert.equal(parseSettings({ showStats: 'no' }).showStats, true);
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

test('マスター音量: 既定値は 100 で、項目がない以前の保存データでも 100 になる', () => {
  assert.equal(DEFAULT_SETTINGS.masterVolume, 100);
  assert.equal(parseSettings({ alarmVolume: 30 }).masterVolume, 100);
  assert.equal(parseSettings({ masterVolume: '50' }).masterVolume, 50);
  assert.equal(parseSettings({ masterVolume: 150 }).masterVolume, 100);
  assert.equal(parseSettings({ masterVolume: -5 }).masterVolume, 0);
});

test('実際の音量は「マスター × それぞれの音量」になる', () => {
  const s = parseSettings({ masterVolume: 50, alarmVolume: 60, bgmVolume: 40, seVolume: 100 });
  assert.equal(effectiveVolume(s, 'alarmVolume'), 30);
  assert.equal(effectiveVolume(s, 'bgmVolume'), 20);
  assert.equal(effectiveVolume(s, 'seVolume'), 50);
  // マスターが 100 なら、それぞれの音量のまま (以前の版と同じ大きさ)
  assert.equal(effectiveVolume(parseSettings({ bgmVolume: 40 }), 'bgmVolume'), 40);
  // どちらかが 0 なら消音
  assert.equal(effectiveVolume(parseSettings({ masterVolume: 0 }), 'alarmVolume'), 0);
  assert.equal(effectiveVolume(parseSettings({ seVolume: 0 }), 'seVolume'), 0);
});

test('アラームの音: 既定値は Chime。選べる音だけを受け付け、知らない値や以前の保存データは Chime にする', () => {
  assert.equal(DEFAULT_SETTINGS.alarmSound, 'chime');
  assert.equal(parseSettings({ alarmSound: 'bell' }).alarmSound, 'bell');
  assert.equal(parseSettings({ alarmSound: 'siren' }).alarmSound, 'chime');
  assert.equal(parseSettings({ alarmVolume: 30 }).alarmSound, 'chime');
});

test('カードの不透明度: 既定値は 72 (以前の版と同じ見た目)。0〜100 に収め、項目がない以前の保存データは 72 にする', () => {
  assert.equal(DEFAULT_SETTINGS.cardOpacity, 72);
  assert.equal(parseSettings({ alarmVolume: 30 }).cardOpacity, 72);
  assert.equal(parseSettings({ cardOpacity: '0' }).cardOpacity, 0);
  assert.equal(parseSettings({ cardOpacity: 100 }).cardOpacity, 100);
  assert.equal(parseSettings({ cardOpacity: 140 }).cardOpacity, 100);
  assert.equal(parseSettings({ cardOpacity: -10 }).cardOpacity, 0);
});
