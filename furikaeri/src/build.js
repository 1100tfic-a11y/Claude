// src/ のファイルから、Apps Script に貼りつける1ファイル（../furikaeri.gs）を作る
//   使い方： node src/build.js
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
// <script src="pets.js"></script> を中身に置きかえる（Apps Script では別ファイルを読めないため）
const inline = html => ['pet-images.js', 'pets.js'].reduce((h, f) => {
  const tag = '<script src="' + f + '"></script>';
  return h.includes(tag) ? h.replace(tag, () => '<script>\n' + read(f) + '</script>') : h;
}, html);
// テンプレート文字列に入れるため、\ ` ${ をエスケープする
const lit = s => '`' + s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';

const out = `// ============================================================================
//  授業ふりかえりアンケート（このファイル1つだけで動きます）
//
//  【使い方】このファイルの中身を「すべて」コピーして、
//   Apps Script の「コード.gs」の中身と置きかえて保存してください。
//   くわしい手順は README.md の「設置方法」を見てください。
//
//  ※ このファイルは src/ から自動で作っています（node src/build.js）。
//    先生が中身を書きかえる必要はありません。
// ============================================================================

// 点検用：エディタで何も選ばずに「▶実行」を押すと、この関数が動きます（結果は下の「実行ログ」に出ます）
function checkSetupFirst() { return checkSetup(); }

${read('server.gs').trim()}

// ===================== 画面（HTML） =====================
// 生徒用フォーム
const FORM_HTML = ${lit(inline(read('Form.html')))};

// 先生用ページ
const TEACHER_HTML = ${lit(read('Teacher.html'))};
`;
fs.writeFileSync(path.join(__dirname, '..', 'furikaeri.gs'), out);
console.log('furikaeri.gs を作成しました（' + out.split('\n').length + '行）');
