// スマホ版 (Capacitor) の更新のお知らせの決まりごと (画面にも Electron にも依存しない純粋な関数)。
// APK は、パソコン版と同じ GitHub Release に kugiri-timer-<版>.apk として置く (.github/workflows/release.yml)。
// スマホ版は起動したときに最新の Release を見て、今より新しい版の APK があれば知らせる。
// Play 以外から入れたアプリは黙って入れ替えられないので、ダウンロードを開いて、利用者に「インストール」を押してもらう
const VERSION = /^v?(\d+)\.(\d+)\.(\d+)$/;
const APK_NAME = /^kugiri-timer-(\d+\.\d+\.\d+)\.apk$/;
const DOWNLOAD_PREFIX = 'https://github.com/marusako/kugiri-timer/releases/download/';

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

// Android の更新の番号 (versionCode)。新しい版ほど大きくなるように、2.10.3 → 21003 にする。
// 小さい 2 つの桁が 100 以上だと順番が崩れるので止める
export function versionCode(version) {
  const parts = parseVersion(version);
  if (!parts || parts[1] >= 100 || parts[2] >= 100) throw new Error(`versionCode にできない版: ${version}`);
  return parts[0] * 10000 + parts[1] * 100 + parts[2];
}

// GitHub の最新の Release (API の答え) に、今より新しい版の APK があれば { version, url }。なければ null
export function apkUpdate(release, currentVersion) {
  if (!release || release.draft || release.prerelease || !Array.isArray(release.assets)) return null;
  for (const asset of release.assets) {
    const match = APK_NAME.exec(String(asset?.name ?? ''));
    const url = String(asset?.browser_download_url ?? '');
    // ダウンロードの URL は、このリポジトリの Release のものだけ受け付ける
    if (match && url.startsWith(DOWNLOAD_PREFIX) && isNewerVersion(match[1], currentVersion)) return { version: match[1], url };
  }
  return null;
}
