import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNewerVersion, versionCode, apkUpdate } from '../src/mobile-update.js';

test('版の比べ方: 数字ごとに比べる (文字の並びでは比べない)', () => {
  assert.equal(isNewerVersion('2.10.0', '2.9.0'), true, '10 は 9 より大きい');
  assert.equal(isNewerVersion('2.9.1', '2.9.0'), true);
  assert.equal(isNewerVersion('3.0.0', '2.99.99'), true);
  assert.equal(isNewerVersion('2.9.0', '2.9.0'), false, '同じ版は新しくない');
  assert.equal(isNewerVersion('2.8.9', '2.9.0'), false);
  assert.equal(isNewerVersion('v2.10.0', '2.9.0'), true, 'タグの v は無視する');
  assert.equal(isNewerVersion('abc', '2.9.0'), false, '形がおかしければ新しくない');
});

test('Android の更新の番号 (versionCode): 新しい版ほど大きい整数にする', () => {
  assert.equal(versionCode('2.9.0'), 20900);
  assert.equal(versionCode('2.10.0'), 21000);
  assert.equal(versionCode('10.0.1'), 100001);
  assert.ok(versionCode('2.10.0') > versionCode('2.9.99'));
  assert.throws(() => versionCode('2.100.0'), '小さい桁が 100 以上だと順番が崩れるので止める');
  assert.throws(() => versionCode('2.9'));
});

const release = (tag, assets, extra = {}) => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  assets: assets.map((name) => ({ name, browser_download_url: `https://github.com/marusako/kugiri-timer/releases/download/${tag}/${name}` })),
  ...extra,
});

test('最新の Release に、今より新しい版の APK があれば、その版とダウンロードの URL を返す', () => {
  const r = release('v2.10.0', ['latest.yml', 'kugiri-timer-Setup-2.10.0.exe', 'kugiri-timer-2.10.0.apk']);
  assert.deepEqual(apkUpdate(r, '2.9.0'), { version: '2.10.0', url: 'https://github.com/marusako/kugiri-timer/releases/download/v2.10.0/kugiri-timer-2.10.0.apk' });
});

test('新しくない・APK がない・下書きや試作版の Release なら null', () => {
  assert.equal(apkUpdate(release('v2.9.0', ['kugiri-timer-2.9.0.apk']), '2.9.0'), null);
  assert.equal(apkUpdate(release('v2.10.0', ['latest.yml']), '2.9.0'), null, 'APK を置く前の Release (パソコン版だけ)');
  assert.equal(apkUpdate(release('v2.10.0', ['kugiri-timer-2.10.0.apk'], { prerelease: true }), '2.9.0'), null);
  assert.equal(apkUpdate(release('v2.10.0', ['kugiri-timer-2.10.0.apk'], { draft: true }), '2.9.0'), null);
  assert.equal(apkUpdate(null, '2.9.0'), null);
  assert.equal(apkUpdate({ message: 'API rate limit exceeded' }, '2.9.0'), null, 'GitHub の API が断ったとき');
});

test('URL は GitHub の Release のものだけ (ほかの場所に飛ばない)', () => {
  const r = release('v2.10.0', ['kugiri-timer-2.10.0.apk']);
  r.assets[0].browser_download_url = 'https://example.com/kugiri-timer-2.10.0.apk';
  assert.equal(apkUpdate(r, '2.9.0'), null);
});
