import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_UPDATE_STATE, nextUpdateState, isBannerVisible } from '../src/update-status.js';

const run = (...events) => events.reduce(nextUpdateState, INITIAL_UPDATE_STATE);

test('最初はバナーを出さない', () => {
  assert.equal(isBannerVisible(INITIAL_UPDATE_STATE), false);
});

test('新しい版が見つかったら、バージョン付きで案内する', () => {
  const s = run({ type: 'available', version: '1.2.0' });
  assert.equal(s.phase, 'available');
  assert.equal(s.version, '1.2.0');
  assert.equal(isBannerVisible(s), true);
});

test('「更新する」でダウンロード中になり、進み具合が反映される', () => {
  const s = run({ type: 'available', version: '1.2.0' }, { type: 'download-start' }, { type: 'progress', percent: 42.7 });
  assert.equal(s.phase, 'downloading');
  assert.equal(s.percent, 42);
});

test('進み具合は 0〜100 に収める', () => {
  const base = [{ type: 'available', version: '1.2.0' }, { type: 'download-start' }];
  assert.equal(run(...base, { type: 'progress', percent: 130 }).percent, 100);
  assert.equal(run(...base, { type: 'progress', percent: -5 }).percent, 0);
});

test('ダウンロードが終わったら、再起動の案内にする', () => {
  const s = run({ type: 'available', version: '1.2.0' }, { type: 'download-start' }, { type: 'downloaded', version: '1.2.0' });
  assert.equal(s.phase, 'downloaded');
  assert.equal(isBannerVisible(s), true);
});

test('ダウンロード中の失敗はエラー表示になり、再試行できる', () => {
  let s = run({ type: 'available', version: '1.2.0' }, { type: 'download-start' }, { type: 'error', message: 'net::ERR' });
  assert.equal(s.phase, 'error');
  assert.equal(isBannerVisible(s), true);
  s = nextUpdateState(s, { type: 'download-start' });
  assert.equal(s.phase, 'downloading');
  assert.equal(s.percent, 0);
});

test('更新の確認自体の失敗 (オフラインなど) ではバナーを出さない', () => {
  const s = run({ type: 'error', message: 'offline' });
  assert.equal(isBannerVisible(s), false);
});

test('「あとで」でバナーを閉じる', () => {
  const s = run({ type: 'available', version: '1.2.0' }, { type: 'dismiss' });
  assert.equal(isBannerVisible(s), false);
});

test('ダウンロード中は「あとで」で閉じない', () => {
  const s = run({ type: 'available', version: '1.2.0' }, { type: 'download-start' }, { type: 'dismiss' });
  assert.equal(s.phase, 'downloading');
});

test('ダウンロード中でないときの進み具合は無視する', () => {
  const s = run({ type: 'available', version: '1.2.0' }, { type: 'progress', percent: 50 });
  assert.equal(s.phase, 'available');
});
