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
// 中身を確かめる・コピーするための同じ内容のファイル（.gs を開けない端末用）
fs.writeFileSync(path.join(__dirname, '..', 'gacha.txt'), out);
const html = out.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
fs.writeFileSync(path.join(__dirname, '..', 'gacha-copy.html'), `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>gacha.gs の中身（コピー用）</title>
<style>
:root{--ink:#1c2430;--ink2:#55637a;--line:#d7dee9;--bg:#f4f7fb;--accent:#2f6fd0}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"BIZ UDPGothic","Hiragino Kaku Gothic ProN","Yu Gothic UI","Meiryo",system-ui,sans-serif;line-height:1.6}
main{max-width:960px;margin:0 auto;padding:1rem}
h1{font-size:1.2rem;margin:0 0 .4rem}
p{margin:.2rem 0 .6rem;color:var(--ink2);font-size:.9rem}
.bar{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin-bottom:.6rem}
button{font:inherit;font-weight:700;font-size:1rem;color:#fff;background:var(--accent);border:0;border-radius:10px;padding:.6rem 1.2rem;cursor:pointer}
#st{font-weight:700;color:#0f7b46}
textarea{width:100%;height:75vh;font-family:Consolas,"Courier New",monospace;font-size:12px;line-height:1.45;border:1px solid var(--line);border-radius:10px;padding:.6rem;background:#fff;color:var(--ink);white-space:pre;overflow:auto}
</style>
</head>
<body>
<main>
<h1>gacha.gs の中身（コピー用）</h1>
<p>Apps Script の「コード.gs」に貼りつける内容です（${out.split('\n').length}行）。下のボタンで全部コピーできます。</p>
<div class="bar"><button type="button" id="cp">すべてコピー</button><span id="st"></span></div>
<textarea id="code" readonly spellcheck="false">${html}</textarea>
</main>
<script>
document.getElementById('cp').addEventListener('click', function(){
  var t = document.getElementById('code'), st = document.getElementById('st');
  var done = function(){ st.textContent = 'コピーしました。Apps Script の「コード.gs」に Ctrl＋V で貼りつけてください。'; };
  var old = function(){ t.focus(); t.select(); try { document.execCommand('copy'); done(); } catch(e) { st.textContent = 'Ctrl＋C でコピーしてください（全体を選択済み）'; } };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(done, old); else old();
});
</script>
</body>
</html>
`);
console.log('gacha.gs を作成しました（キャラ' + list.length + '体・' + out.split('\n').length + '行）');
