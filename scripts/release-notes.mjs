// リリースのタイトルと説明文を release-notes/<タグ>.md から取り出す。
// ファイルの形: 1 行目が「# タイトル」、その後が説明文 (GitHub の Release にそのまま表示される Markdown)。
//
// 使い方 (GitHub Actions の release.yml から呼ぶ):
//   node scripts/release-notes.mjs <タグ> <説明文の書き出し先>
//   → 説明文をファイルに書き出し、「title=...」「body_file=...」を出力する
// ファイルがない・タイトルや説明文が空のときはエラーで止め、説明文のない Release を公開しないようにする
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function notesPathForTag(tag) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error(`タグの形が正しくありません: ${tag} (例: v1.2.0)`);
  return `release-notes/${tag}.md`;
}

export function parseReleaseNotes(text) {
  const [firstLine, ...rest] = text.replace(/\r\n/g, '\n').split('\n');
  const title = /^# (.*)$/.exec(firstLine)?.[1].trim();
  if (!title) throw new Error('1 行目に「# タイトル」を書いてください');
  const body = rest.join('\n').trim();
  if (!body) throw new Error('説明文が空です');
  return { title, body };
}

// コマンドとして実行されたときだけ動く (テストから import したときは動かない)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tag, outFile] = process.argv.slice(2);
  if (!tag || !outFile) {
    console.error('使い方: node scripts/release-notes.mjs <タグ> <説明文の書き出し先>');
    process.exit(1);
  }
  const notesPath = notesPathForTag(tag);
  let text;
  try {
    text = readFileSync(notesPath, 'utf8');
  } catch {
    console.error(`${notesPath} が見つかりません。リリースの前に説明文を用意してください`);
    process.exit(1);
  }
  const { title, body } = parseReleaseNotes(text);
  writeFileSync(outFile, `${body}\n`);
  console.log(`title=${title}`);
  console.log(`body_file=${path.resolve(outFile)}`);
}
