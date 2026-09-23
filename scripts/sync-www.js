// =========================================================
// sync-www.js
// ---------------------------------------------------------
// Vercel(Web版)はリポジトリのルートをそのまま公開しているので、
// そこは今までどおり触らない。
// iOSアプリ(Capacitor)はこの www/ フォルダの中身を「アプリの中身」として
// パッケージングするので、コードを直すたびに
//   npm run sync
// を実行して www/ を最新化してから
//   npx cap copy ios
// を実行する。
//
// コピー対象: ルートにある .html / .js / .css と、assets, images フォルダ。
// 除外: node_modules, ios, android, www自身, .git, scripts, package.json 系
// =========================================================
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEST = path.join(ROOT, 'www');

const EXCLUDE_DIRS = new Set(['node_modules', 'ios', 'android', 'www', '.git', 'scripts']);
const EXCLUDE_FILES = new Set([
  'package.json', 'package-lock.json', 'capacitor.config.json', 'capacitor.config.ts',
  '.gitignore', 'README.md'
]);
const INCLUDE_EXTS = new Set(['.html', '.js', '.css', '.json', '.mp4', '.mp3', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.ico']);

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (EXCLUDE_DIRS.has(entry)) continue;
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    const ext = path.extname(src).toLowerCase();
    const base = path.basename(src);
    if (EXCLUDE_FILES.has(base)) return;
    // トップレベル直下のファイルは拡張子で絞る(ルートに他の設定ファイル等が増えても誤ってコピーしないため)
    if (!INCLUDE_EXTS.has(ext)) return;
    fs.copyFileSync(src, dest);
  }
}

if (fs.existsSync(DEST)) {
  fs.rmSync(DEST, { recursive: true, force: true });
}
fs.mkdirSync(DEST, { recursive: true });

for (const entry of fs.readdirSync(ROOT)) {
  if (EXCLUDE_DIRS.has(entry)) continue;
  if (EXCLUDE_FILES.has(entry)) continue;
  const srcPath = path.join(ROOT, entry);
  const stat = fs.statSync(srcPath);
  if (stat.isDirectory()) {
    copyRecursive(srcPath, path.join(DEST, entry));
  } else {
    const ext = path.extname(entry).toLowerCase();
    if (INCLUDE_EXTS.has(ext)) {
      fs.copyFileSync(srcPath, path.join(DEST, entry));
    }
  }
}

console.log('✅ www/ を更新しました (Capacitor用)');
