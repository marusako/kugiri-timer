import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIMER_FONTS, DEFAULT_TIMER_FONT, timerFont } from '../src/fonts.js';
import { MESSAGES } from '../src/i18n.js';

test('タイマーのフォントは 6 種類で、ID は重ならない。初期値は以前の版と同じ「default」', () => {
  assert.deepEqual(TIMER_FONTS.map((f) => f.id), ['default', 'light', 'bold', 'din', 'mono', 'serif']);
  assert.equal(new Set(TIMER_FONTS.map((f) => f.id)).size, TIMER_FONTS.length);
  assert.equal(DEFAULT_TIMER_FONT, 'default');
  assert.equal(timerFont('default').weight, 600, '以前の版の時刻と同じ太さ');
});

test('どのフォントも、最後に汎用のフォント (sans-serif など) を指定している (入っていない環境でも表示できる)', () => {
  for (const font of TIMER_FONTS) {
    assert.match(font.family, /(sans-serif|serif|monospace)$/, font.id);
    assert.ok(font.weight >= 100 && font.weight <= 900, font.id);
    assert.ok(font.size > 0.7 && font.size <= 1, `${font.id}: 大きさの倍率`);
  }
});

test('知らない ID は「default」として扱う', () => {
  assert.equal(timerFont('comic').id, 'default');
});

test('どのフォントにも、すべての言語の名前がある', () => {
  for (const lang of Object.keys(MESSAGES)) {
    for (const font of TIMER_FONTS) assert.ok(MESSAGES[lang][`timerFont.${font.id}`], `${lang}: timerFont.${font.id}`);
  }
});
