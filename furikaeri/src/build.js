// src/ の3ファイルから、Apps Script に貼りつける1ファイル（../furikaeri.gs）を作る
//   使い方： node src/build.js
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
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

${read('server.gs').trim()}

// ===================== 画面（HTML） =====================
// 生徒用フォーム
const FORM_HTML = ${lit(read('Form.html'))};

// 先生用ページ
const TEACHER_HTML = ${lit(read('Teacher.html'))};
`;
fs.writeFileSync(path.join(__dirname, '..', 'furikaeri.gs'), out);
console.log('furikaeri.gs を作成しました（' + out.split('\n').length + '行）');
