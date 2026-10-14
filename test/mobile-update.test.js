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

test('Android の更新の番号 (versionCode): 新しい版ほど大きい整数にする。版の番号を付け直す前の最後の番号 (21600) より大きい', () => {
  assert.equal(versionCode('2.9.0'), 120900);
  assert.equal(versionCode('2.10.0'), 121000);
  assert.equal(versionCode('10.0.1'), 200001);
  assert.ok(versionCode('2.7.0') > 21600, '付け直す前に入れた 2.16.0 (21600) の上から入れられる');
  assert.ok(versionCode('2.10.0') > versionCode('2.9.99'));
  assert.throws(() => versionCode('2.100.0'), '小さい桁が 100 以上だと順番が崩れるので止める');
  assert.throws(() => versionCode('2.9'));
});

const release = (tag, assets, extra = {}, repo = 'focusr') => ({
  tag_name: tag,
  html_url: `https://github.com/marusako/${repo}/releases/tag/${tag}`,
  draft: false,
  prerelease: false,
  assets: assets.map((name) => ({ name, browser_download_url: `https://github.com/marusako/${repo}/releases/download/${tag}/${name}` })),
  ...extra,
});

test('最新の Release に、今より新しい版の APK があれば、その版と Release のページの URL を返す', () => {
  // APK を直接開くと、アプリから開いた簡易版のブラウザーでダウンロードの表示が止まって見えたため、Release のページを開く
  const r = release('v2.10.0', ['latest.yml', 'focusr-Setup-2.10.0.exe', 'focusr-2.10.0.apk']);
  assert.deepEqual(apkUpdate(r, '2.9.0'), { version: '2.10.0', page: 'https://github.com/marusako/focusr/releases/tag/v2.10.0' });
});

test('新しくない・APK がない・下書きや試作版の Release なら null', () => {
  assert.equal(apkUpdate(release('v2.9.0', ['focusr-2.9.0.apk']), '2.9.0'), null);
  assert.equal(apkUpdate(release('v2.10.0', ['latest.yml']), '2.9.0'), null, 'APK を置く前の Release (パソコン版だけ)');
  assert.equal(apkUpdate(release('v2.10.0', ['focusr-2.10.0.apk'], { prerelease: true }), '2.9.0'), null);
  assert.equal(apkUpdate(release('v2.10.0', ['focusr-2.10.0.apk'], { draft: true }), '2.9.0'), null);
  assert.equal(apkUpdate(null, '2.9.0'), null);
  assert.equal(apkUpdate({ message: 'API rate limit exceeded' }, '2.9.0'), null, 'GitHub の API が断ったとき');
});

test('URL は このリポジトリの Release のものだけ (ほかの場所に飛ばない)', () => {
  const asset = release('v2.10.0', ['focusr-2.10.0.apk']);
  asset.assets[0].browser_download_url = 'https://example.com/focusr-2.10.0.apk';
  assert.equal(apkUpdate(asset, '2.9.0'), null);
  const page = release('v2.10.0', ['focusr-2.10.0.apk']);
  page.html_url = 'https://example.com/releases/tag/v2.10.0';
  assert.equal(apkUpdate(page, '2.9.0'), null);
});

// 名前を Kugiri Timer から Focusr に変えた (2026-10)。リポジトリの名前と APK の名前は、移り変わりの間はどちらも受け付ける
test('以前のリポジトリの名前 (kugiri-timer) と、以前の APK の名前 (kugiri-timer-<版>.apk) も受け付ける', () => {
  const old = release('v2.10.0', ['kugiri-timer-2.10.0.apk'], {}, 'kugiri-timer');
  assert.deepEqual(apkUpdate(old, '2.9.0'), { version: '2.10.0', page: 'https://github.com/marusako/kugiri-timer/releases/tag/v2.10.0' });
  assert.equal(apkUpdate(release('v2.10.0', ['kugiri-timer-2.10.0.apk']), '2.9.0').version, '2.10.0', '新しいリポジトリに、以前の名前の APK');
  assert.equal(apkUpdate(release('v2.10.0', ['other-2.10.0.apk']), '2.9.0'), null, 'ほかの名前の APK は受け付けない');
});
