// スマホ版 (Capacitor) の更新のお知らせの決まりごと (画面にも Electron にも依存しない純粋な関数)。
// APK は、パソコン版と同じ GitHub Release に kugiri-timer-<版>.apk として置く (.github/workflows/release.yml)。
// スマホ版は起動したときに最新の Release を見て、今より新しい版の APK があれば知らせる。
// Play 以外から入れたアプリは黙って入れ替えられないので、ダウンロードを開いて、利用者に「インストール」を押してもらう
const VERSION = /^v?(\d+)\.(\d+)\.(\d+)$/;
const APK_NAME = /^kugiri-timer-(\d+\.\d+\.\d+)\.apk$/;
const DOWNLOAD_PREFIX = 'https://github.com/marusako/kugiri-timer/releases/download/';
const PAGE_PREFIX = 'https://github.com/marusako/kugiri-timer/releases/tag/';

function parseVersion(text) {
  const match = VERSION.exec(String(text ?? '').trim());
  return match ? match.slice(1).map(Number) : null;
}

// a が b より新しい版か (数字ごとに比べる)。形がおかしければ false
export function isNewerVersion(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i];
  }
  return false;
}

// Android の更新の番号 (versionCode)。新しい版ほど大きくなるように、2.7.3 → 120703 にする。
// 版の番号を付け直したとき (2026-10-12。2.16.0 → 2.6.0) に、付け直す前に入れたアプリ (2.16.0 = 21600) の上から入れられるよう、
// 100000 を足している (Android は、番号が小さいアプリを上から入れられない)。小さい 2 つの桁が 100 以上だと順番が崩れるので止める
const VERSION_CODE_BASE = 100000;
export function versionCode(version) {
  const parts = parseVersion(version);
  if (!parts || parts[1] >= 100 || parts[2] >= 100) throw new Error(`versionCode にできない版: ${version}`);
  return VERSION_CODE_BASE + parts[0] * 10000 + parts[1] * 100 + parts[2];
}

// GitHub の最新の Release (API の答え) に、今より新しい版の APK があれば { version, page: Release のページの URL }。なければ null。
// APK を直接開くと、アプリから開いた簡易版のブラウザー (Custom Tab) で、ダウンロードの表示が終わっても変わらなかったので、
// Release のページを開いて、そこで APK を押してもらう
export function apkUpdate(release, currentVersion) {
  if (!release || release.draft || release.prerelease || !Array.isArray(release.assets)) return null;
  // URL は、このリポジトリの Release のものだけ受け付ける (ほかの場所に飛ばない)
  const page = String(release.html_url ?? '');
  if (!page.startsWith(PAGE_PREFIX)) return null;
  for (const asset of release.assets) {
    const match = APK_NAME.exec(String(asset?.name ?? ''));
    const url = String(asset?.browser_download_url ?? '');
    if (match && url.startsWith(DOWNLOAD_PREFIX) && isNewerVersion(match[1], currentVersion)) return { version: match[1], page };
  }
  return null;
}
