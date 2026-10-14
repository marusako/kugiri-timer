import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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

// Android 版など Windows のフォントがない環境では、同梱した似たフォント (src/timer-fonts、OFL) を使う
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => ({
  family: body.match(/font-family:\s*'([^']+)'/)?.[1],
  file: body.match(/url\('([^']+)'\)/)?.[1],
  weight: Number(body.match(/font-weight:\s*(\d+)/)?.[1]),
  range: body.match(/unicode-range:\s*([^;]+);/)?.[1].trim(),
}));

test('どのフォントにも、Windows のフォントのあと・汎用のフォントの前に、同梱したフォントがある', () => {
  for (const font of TIMER_FONTS) {
    const names = font.family.split(',').map((name) => name.trim().replace(/'/g, ''));
    const index = names.findIndex((name) => name.startsWith('Focusr '));
    assert.ok(index > 0, `${font.id}: 同梱したフォントは Windows のフォントより後 (パソコン版の見た目は変えない)`);
    assert.equal(index, names.length - 2, `${font.id}: 同梱したフォントは汎用のフォントの直前`);
  }
});

test('同梱したフォントは、使う太さで @font-face があり、ファイルがあり、数字と「:」だけに使う', () => {
  for (const font of TIMER_FONTS) {
    const name = font.family.match(/'(Focusr [^']+)'/)[1];
    const face = faces.find((f) => f.family === name);
    assert.ok(face, `${font.id}: ${name} の @font-face`);
    assert.equal(face.weight, font.weight, `${font.id}: 太さが違うと、ブラウザーが字を無理に太く・細くする`);
    assert.equal(face.range, 'U+0030-003A', `${font.id}: 時刻に使う字 (0〜9 と :) だけ`);
    assert.ok(existsSync(new URL(`../src/${face.file}`, import.meta.url)), `${font.id}: ${face.file}`);
  }
});

test('同梱したフォントのライセンス (OFL) の文章を、フォントと一緒に置いている', () => {
  assert.equal(faces.length, TIMER_FONTS.length);
  for (const { file } of faces) {
    const license = new URL(`../src/${file.replace(/\.woff2$/, '')}.OFL.txt`, import.meta.url);
    assert.match(readFileSync(license, 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/i, file);
  }
});
