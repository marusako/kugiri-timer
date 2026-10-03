// dist/<version>/ にあるリリース用の exe を 1 つの zip にまとめる。
// 使い方: node scripts/zip-release.mjs [version]  (省略時は package.json の version)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = process.argv[2] ?? pkg.version;
const name = pkg.build.productName;
const dir = path.join('dist', version);

// electron-builder が付けるファイル名 (nsis は既定の名前、portable は package.json の artifactName)
const files = [`${name} Setup ${version}.exe`, `${name} ${version} Portable.exe`];
const missing = files.filter((file) => !existsSync(path.join(dir, file)));
if (missing.length > 0) {
  console.error(`見つからないファイルがあります (${dir}):\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

// URL に %20 が入らないよう、zip の名前ではスペースをハイフンにする
const zipName = `${name.replaceAll(' ', '-')}-${version}.zip`;
rmSync(path.join(dir, zipName), { force: true });

// Windows 標準の tar (bsdtar) は -a で拡張子から形式を判断し、zip を作れる。
// PATH 上の別の tar (Git 付属の GNU tar など) と取り違えないよう、フルパスで指定する
const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
execFileSync(tar, ['-a', '-c', '-f', zipName, ...files], { cwd: dir, stdio: 'inherit' });
console.log(`作成しました: ${path.join(dir, zipName)}`);
