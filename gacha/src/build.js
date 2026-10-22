// src/ のファイルから、Apps Script に貼りつける1ファイル（../gacha.gs）を作る
//   使い方： node src/build.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
// chars.js のキャラ一覧から、Apps Script 側で使う部分（id・名前・レア度）だけを取り出す
const box = {};
vm.runInNewContext(read('chars.js') + '\nthis.GACHA = GACHA;', box);
const list = box.GACHA.list.map(c => ({ id: c.id, name: c.name, rarity: c.rarity }));
const ids = new Set();
list.forEach(c => {
  if (!/^[A-Za-z0-9_-]+$/.test(c.id)) throw new Error('id は半角英数字にしてください: ' + c.id);
  if (ids.has(c.id)) throw new Error('id が重複しています: ' + c.id);
  if (!box.GACHA.RARITIES.some(r => r.id === c.rarity)) throw new Error('レア度がちがいます: ' + c.id + ' ' + c.rarity);
  ids.add(c.id);
});
// <script src="chars.js"></script> などを中身に置きかえる（Apps Script では別ファイルを読めないため）
const inline = html => ['char-images.js', 'chars.js'].reduce((h, f) => {
  const tag = '<script src="' + f + '"></script>';
  return h.includes(tag) ? h.replace(tag, () => '<script>\n' + read(f) + '</script>') : h;
}, html);
// テンプレート文字列に入れるため、\ ` ${ をエスケープする
const lit = s => '`' + s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';

const out = `// ============================================================================
//  授業ふりかえりアンケート ガチャ版（このファイル1つだけで動きます）
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

// ガチャのキャラ一覧（src/chars.js から自動で作っています）
const GACHA_LIST = ${JSON.stringify(list, null, 1).replace(/\n\s*/g, ' ')};

// ===================== 画面（HTML） =====================
// 生徒用フォーム
const FORM_HTML = ${lit(inline(read('Form.html')))};

// 先生用ページ
const TEACHER_HTML = ${lit(read('Teacher.html'))};
`;
fs.writeFileSync(path.join(__dirname, '..', 'gacha.gs'), out);
console.log('gacha.gs を作成しました（キャラ' + list.length + '体・' + out.split('\n').length + '行）');
