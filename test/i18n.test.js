import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, MESSAGES, translate, detectLanguage } from '../src/i18n.js';

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('選べる言語と、その名前 (選択肢の名前は、それぞれの言語で書く)', () => {
  assert.deepEqual(LANGUAGES.map((l) => l.id), ['ja', 'en', 'ko', 'zh-Hans', 'zh-Hant', 'es', 'fr', 'de', 'ru', 'si']);
  assert.deepEqual(LANGUAGES.map((l) => l.name), ['日本語', 'English', '한국어', '简体中文', '繁體中文', 'Español', 'Français', 'Deutsch', 'Русский', 'සිංහල']);
  assert.deepEqual(Object.keys(MESSAGES).sort(), LANGUAGES.map((l) => l.id).sort(), 'どの言語にも翻訳表がある');
});

// 英語以外のすべての言語
const OTHERS = LANGUAGES.map((l) => l.id).filter((id) => id !== 'en');

test('すべての言語に、英語と同じ項目がそろっていて、空のものがない', () => {
  const keys = Object.keys(MESSAGES.en).sort();
  for (const lang of OTHERS) {
    assert.deepEqual(Object.keys(MESSAGES[lang]).sort(), keys, `${lang} の項目が英語と違う`);
    for (const key of keys) assert.ok(MESSAGES[lang][key].trim(), `${lang}.${key} が空`);
  }
});

test('差し込み部分 ({mode} など) が、すべての言語で同じ', () => {
  for (const key of Object.keys(MESSAGES.en)) {
    for (const lang of OTHERS) {
      assert.deepEqual(placeholders(MESSAGES[lang][key]), placeholders(MESSAGES.en[key]), `${lang}.${key}`);
    }
  }
});

test('選んだ言語の表を使い、差し込み部分を置き換える', () => {
  assert.equal(translate('en', 'start'), 'Start');
  assert.equal(translate('ja', 'start'), 'スタート');
  assert.equal(translate('ko', 'start'), '시작');
  assert.equal(translate('en', 'downloading', { percent: 42 }), 'Downloading… 42%');
  assert.equal(translate('ja', 'notifyStarted', { mode: translate('ja', 'modeText.shortBreak') }), '短い休憩を開始しました。');
});

test('知らない言語 (なくした選択肢「日本語 + English」を含む) は English として扱う', () => {
  assert.equal(translate('ja-en', 'start'), 'Start');
  assert.equal(translate('xx', 'later'), 'Later');
});

test('知らない項目はエラーにする (書き間違いにすぐ気づけるように)', () => {
  assert.throws(() => translate('en', 'noSuchKey'), /noSuchKey/);
});

test('Windows の言語から、初めの言語を決める', () => {
  assert.equal(detectLanguage('ja'), 'ja');
  assert.equal(detectLanguage('ja-JP'), 'ja');
  assert.equal(detectLanguage('ko-KR'), 'ko');
  assert.equal(detectLanguage('en-US'), 'en');
  assert.equal(detectLanguage('fr-FR'), 'fr');
  assert.equal(detectLanguage('fr-CA'), 'fr');
  assert.equal(detectLanguage('es-ES'), 'es');
  assert.equal(detectLanguage('es-419'), 'es');
  assert.equal(detectLanguage('de-DE'), 'de');
  assert.equal(detectLanguage('de-AT'), 'de');
  assert.equal(detectLanguage('ru-RU'), 'ru');
  assert.equal(detectLanguage('si-LK'), 'si');
  assert.equal(detectLanguage('it-IT'), 'en', 'まだない言語は English');
  assert.equal(detectLanguage(undefined), 'en');
});

test('中国語は、地域や字体から簡体字と繁体字を分ける (どちらとも分からなければ簡体字)', () => {
  for (const locale of ['zh-CN', 'zh-SG', 'zh-Hans', 'zh-Hans-CN', 'zh']) assert.equal(detectLanguage(locale), 'zh-Hans', locale);
  for (const locale of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-TW', 'ZH-tw']) assert.equal(detectLanguage(locale), 'zh-Hant', locale);
});
