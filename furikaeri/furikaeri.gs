// ============================================================================
//  授業ふりかえりアンケート（このファイル1つだけで動きます）
//
//  【使い方】このファイルの中身を「すべて」コピーして、
//   Apps Script の「コード.gs」の中身と置きかえて保存してください。
//   くわしい手順は README.md の「設置方法」を見てください。
//
//  ※ このファイルは src/ から自動で作っています（node src/build.js）。
//    先生が中身を書きかえる必要はありません。
// ============================================================================

/**
 * 授業ふりかえりアンケート（Google Apps Script Webアプリ）
 *
 * ・生徒用フォーム   …… WebアプリのURL
 * ・先生用閲覧ページ …… WebアプリのURL + ?page=teacher
 * ・回答はこのスクリプトを入れたスプレッドシートの「回答」シートに1行ずつ蓄積されます
 * ・先生用パスコードは、スプレッドシートのメニュー「ふりかえり」→「先生用パスコードを設定する」で設定します
 *
 * 設置方法は README.md を参照してください。
 */

// ===================== 設定（ふつうは変更不要） =====================
const CONFIG = {
  // 学年ごとのクラス数（1年6クラス、2年6クラス、3年7クラス）
  CLASSES: { 1: 6, 2: 6, 3: 7 },
  // 出席番号の最大
  MAX_NUMBER: 35,
  // 時限の最大（0 にすると時限の欄を表示しません）
  MAX_PERIOD: 6,
  // 教科名（フォームの見出しに表示）
  SUBJECT: '技術',
  // 回答を保存するシート名
  SHEET_NAME: '回答',
  // キャラ育成：false にすると育成の機能を止めます
  PETS: true,
  // 何回提出すると1段階進化するか
  GROW_PER_STAGE: 3,
  // 1日に育成ポイントがもらえる回数の上限（2時間続きの授業でも2回まで）
  GROW_MAX_PER_DAY: 2,
};
// ==========================================================================

const TZ = 'Asia/Tokyo';
const PASS_KEY = 'TEACHER_PASSCODE';
const TRASH_NAME = '削除済み';
const PET_SHEET = 'キャラ';
// src/pets.js の list と同じ並び（id）
const PET_IDS = ['usa', 'neko', 'hana', 'moko', 'yuni', 'dora', 'garu', 'meka', 'raiga', 'aqua'];
const PET_HEADERS = ['キー', '学年', '組', '番号', '氏名', '育成中のキャラ', '育成ポイント', '最後に育てた日', 'その日に数えた授業', '育て上げたキャラ', '更新日時'];

const HEADERS = [
  '送信日時', '授業日', '時限', '学年', '組', '番号', '氏名',
  '理解度', '理解度の理由', '進捗度', '進捗度の理由', '質問・感想', 'アカウント',
];
const LEVELS = ['A', 'B', 'C'];
const MAX_TEXT = 1000;

function doGet(e) {
  const page = e && e.parameter && e.parameter.page === 'teacher' ? 'Teacher' : 'Form';
  const t = HtmlService.createTemplate(page === 'Teacher' ? TEACHER_HTML : FORM_HTML);
  t.settings = JSON.stringify(publicSettings_());
  return t.evaluate()
    .setTitle(page === 'Teacher' ? 'ふりかえり 集計（先生用）' : CONFIG.SUBJECT + ' 授業ふりかえり')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function publicSettings_() {
  return {
    classes: CONFIG.CLASSES,
    maxNumber: CONFIG.MAX_NUMBER,
    maxPeriod: CONFIG.MAX_PERIOD,
    subject: CONFIG.SUBJECT,
    pets: CONFIG.PETS,
    growPerStage: CONFIG.GROW_PER_STAGE,
    needWord: wordSettings_().mode !== 'off',
  };
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.SHEET_NAME);
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#eef3fa');
  }
  return sh;
}

function today_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function clean_(s) {
  // 先頭の = + - @ はスプレッドシートで数式扱いされないよう ' を付ける
  let v = String(s == null ? '' : s).replace(/\r\n?/g, '\n').trim().slice(0, MAX_TEXT);
  if (/^[=+\-@]/.test(v)) v = "'" + v;
  return v;
}

function toInt_(v) {
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

/** 生徒の回答を検証する。問題があればエラーメッセージ、なければ null */
function validate_(r) {
  const grade = toInt_(r.grade);
  const cls = toInt_(r.cls);
  const num = toInt_(r.num);
  if (!CONFIG.CLASSES[grade]) return '学年を選んでください。';
  if (!(cls >= 1 && cls <= CONFIG.CLASSES[grade])) return '組を選んでください。';
  if (!(num >= 1 && num <= CONFIG.MAX_NUMBER)) return '出席番号を選んでください。';
  if (!String(r.name || '').trim()) return '氏名を入力してください。';
  if (CONFIG.MAX_PERIOD > 0) {
    const p = toInt_(r.period);
    if (!(p >= 1 && p <= CONFIG.MAX_PERIOD)) return '時限を選んでください。';
  }
  if (LEVELS.indexOf(r.understand) < 0) return '本時の理解度（A・B・C）を選んでください。';
  if (!String(r.understandReason || '').trim()) return '理解度の理由を書いてください。';
  if (LEVELS.indexOf(r.progress) < 0) return '本時の作業の進捗度（A・B・C）を選んでください。';
  if (!String(r.progressReason || '').trim()) return '進捗度の理由を書いてください。';
  return null;
}

/** 生徒用フォームから呼ばれる */
function submitReflection(r) {
  r = r || {};
  const err = validate_(r);
  if (err) return { ok: false, message: err };
  if (!checkWord_(r.word)) {
    return { ok: false, message: '合言葉がちがいます。先生が黒板に書いた合言葉を入力してください。', field: 'word' };
  }

  let email = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch (e) { /* 取得できない環境では空欄 */ }

  const row = [
    new Date(),
    today_(),
    CONFIG.MAX_PERIOD > 0 ? toInt_(r.period) : '',
    toInt_(r.grade),
    toInt_(r.cls),
    toInt_(r.num),
    clean_(r.name).slice(0, 40),
    r.understand,
    clean_(r.understandReason),
    r.progress,
    clean_(r.progressReason),
    clean_(r.question),
    email,
  ];

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let pet = null;
  try {
    sheet_().appendRow(row);
    if (CONFIG.PETS) pet = growPet_(row[3], row[4], row[5], row[6], row[1] + '#' + row[2]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, date: row[1], pet: pet };
}

// ===================== キャラ育成 =====================
// 「キャラ」シートに、生徒1人につき1行で記録する（学年-組-番号がキー）
function petSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(PET_SHEET);
  if (!sh) sh = ss.insertSheet(PET_SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(PET_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, PET_HEADERS.length).setFontWeight('bold').setBackground('#fdeef7');
  }
  return sh;
}

function petKey_(g, c, n) { return g + '-' + c + '-' + n; }

function loadPet_(sh, key) {
  const n = sh.getLastRow() - 1;
  if (n > 0) {
    const vals = sh.getRange(2, 1, n, PET_HEADERS.length).getValues();
    for (let i = 0; i < vals.length; i++) {
      if (String(vals[i][0]) === key) {
        const v = vals[i];
        return {
          row: i + 2, key: key, grade: v[1], cls: v[2], num: v[3], name: String(v[4]),
          current: String(v[5] || ''), points: Number(v[6]) || 0, day: cellDate_(v[7]),
          lessons: String(v[8] || '').split(',').filter(String),
          done: String(v[9] || '').split(',').filter(String),
        };
      }
    }
  }
  return null;
}

function savePet_(sh, p) {
  const v = [p.key, p.grade, p.cls, p.num, p.name, p.current, p.points, p.day, p.lessons.join(','), p.done.join(','), new Date()];
  if (p.row) sh.getRange(p.row, 1, 1, v.length).setValues([v]);
  else { sh.appendRow(v); p.row = sh.getLastRow(); }
}

function petStage_(points) {
  return Math.min(5, Math.floor(points / CONFIG.GROW_PER_STAGE));
}

/** 生徒の画面に返す情報 */
function petView_(p) {
  const stage = p.current ? petStage_(p.points) : 0;
  return {
    current: p.current, points: p.points, stage: stage, done: p.done,
    needEgg: !p.current || stage === 5,
  };
}

/** この授業を育成ポイントとして数えてよいか（同じ授業は1回、1日の上限あり）。数えるなら記録する */
function countLesson_(p, lesson) {
  const day = lesson.split('#')[0];
  if (p.day !== day) { p.day = day; p.lessons = []; }
  if (p.lessons.indexOf(lesson) >= 0) return 'same';
  if (p.lessons.length >= CONFIG.GROW_MAX_PER_DAY) return 'limit';
  p.lessons.push(lesson);
  return 'ok';
}

/** 送信のたびに呼ぶ。育成中のキャラがいればポイントを1増やす */
function growPet_(g, c, n, name, lesson) {
  const sh = petSheet_();
  const key = petKey_(g, c, n);
  const p = loadPet_(sh, key) || { key: key, grade: g, cls: c, num: n, current: '', points: 0, day: '', lessons: [], done: [] };
  p.name = name;
  const before = p.current ? petStage_(p.points) : -1;
  let counted = 'none';
  if (p.current && before < 5) {
    counted = countLesson_(p, lesson);
    if (counted === 'ok') p.points++;
  }
  savePet_(sh, p);
  const view = petView_(p);
  view.counted = counted;
  view.from = before;
  view.evolved = before >= 0 && view.stage > before;
  if (view.needEgg) {
    // タマゴを選ぶための合札（30分有効）。この送信の分を、選んだタマゴのポイントにする
    view.token = Utilities.getUuid();
    CacheService.getScriptCache().put('egg_' + view.token, JSON.stringify({ key: key, lesson: lesson }), 1800);
  }
  return view;
}

/** 送信後のタマゴ選び */
function chooseEgg(token, id) {
  if (!CONFIG.PETS) throw new Error('キャラ育成は使われていません。');
  const cache = CacheService.getScriptCache();
  const raw = cache.get('egg_' + String(token || ''));
  if (!raw) throw new Error('時間がたちすぎました。次にふりかえりを送信したときに選んでください。');
  if (PET_IDS.indexOf(id) < 0) throw new Error('タマゴを選んでください。');
  const t = JSON.parse(raw);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = petSheet_();
    const p = loadPet_(sh, t.key);
    if (!p) throw new Error('記録が見つかりません。');
    const v = petView_(p);
    if (!v.needEgg) throw new Error('もうタマゴを選んでいます。');
    if (p.current) p.done.push(p.current); // 究極体まで育てたキャラは図鑑へ
    const all = PET_IDS.every(function (x) { return p.done.indexOf(x) >= 0; });
    if (!all && p.done.indexOf(id) >= 0) throw new Error('そのキャラはもう育て上げました。ほかのタマゴを選んでください。');
    p.current = id;
    p.points = 0;
    const counted = countLesson_(p, t.lesson);
    if (counted === 'ok') p.points = 1;
    savePet_(sh, p);
    cache.remove('egg_' + token);
    const view = petView_(p);
    view.counted = counted;
    return view;
  } finally {
    lock.releaseLock();
  }
}

/** フォームを開いたときに、自分のキャラを表示する */
function getPet(g, c, n) {
  if (!CONFIG.PETS) return null;
  g = toInt_(g); c = toInt_(c); n = toInt_(n);
  if (!CONFIG.CLASSES[g] || !(c >= 1 && c <= CONFIG.CLASSES[g]) || !(n >= 1 && n <= CONFIG.MAX_NUMBER)) return null;
  const p = loadPet_(petSheet_(), petKey_(g, c, n));
  return p ? petView_(p) : null;
}

// ===================== スプレッドシートのメニュー =====================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ふりかえり')
    .addItem('先生用パスコードを設定する', 'setPasscodeMenu')
    .addToUi();
}

function setPasscodeMenu() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('先生用パスコードの設定',
    '先生用ページを開くときのパスコードを決めて入力してください（4文字以上）。\n生徒には教えないでください。',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const v = res.getResponseText().trim();
  if (v.length < 4) {
    ui.alert('4文字以上で入力してください。もう一度メニューから設定してください。');
    return;
  }
  PropertiesService.getScriptProperties().setProperty(PASS_KEY, v);
  sheet_();
  ui.alert('パスコードを設定しました。\n「回答」シートも作成しました。\n\n次は Apps Script の画面で「デプロイ」をしてください。');
}

function checkPass_(pass) {
  const want = PropertiesService.getScriptProperties().getProperty(PASS_KEY);
  if (!want) {
    throw new Error('先生用パスコードがまだ設定されていません。スプレッドシートのメニュー「ふりかえり」→「先生用パスコードを設定する」で設定してください。');
  }
  if (String(pass || '') !== want) {
    throw new Error('パスコードが違います。');
  }
}

// ===================== 合言葉 =====================
// 設定はスクリプトプロパティに保存し、先生用ページから変更する（コードの書きかえ・再デプロイ不要）
//   mode: 'daily'（毎日自動でかわる4けたの数字）/ 'fixed'（先生が決めた言葉）/ 'off'（使わない）
const WORD_KEY = 'WORD_SETTINGS';

function wordSettings_() {
  const props = PropertiesService.getScriptProperties();
  let s = null;
  try { s = JSON.parse(props.getProperty(WORD_KEY) || 'null'); } catch (e) { s = null; }
  if (!s || !s.secret) {
    s = { mode: (s && s.mode) || 'daily', fixed: (s && s.fixed) || '', secret: Utilities.getUuid() };
    props.setProperty(WORD_KEY, JSON.stringify(s));
  }
  return s;
}

/** 全角→半角、大文字→小文字、前後の空白を除いて比べる */
function normWord_(w) {
  return String(w == null ? '' : w).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

/** その日の合言葉（4けた）。日付と秘密の値から計算するので、日付が変わると自動で変わる */
function dailyWord_(secret, day) {
  const sig = Utilities.computeHmacSha256Signature(day, secret);
  let n = 0;
  for (let i = 0; i < 4; i++) n = n * 256 + (sig[i] & 255);
  return ('000' + (n % 10000)).slice(-4);
}

function currentWord_(s) {
  if (s.mode === 'fixed') return s.fixed;
  if (s.mode === 'daily') return dailyWord_(s.secret, today_());
  return '';
}

function checkWord_(w) {
  const s = wordSettings_();
  if (s.mode === 'off') return true;
  const want = normWord_(currentWord_(s));
  return want !== '' && normWord_(w) === want;
}

/** 先生用ページ：合言葉の設定と、今日の合言葉を返す */
function getWordSettings(pass) {
  checkPass_(pass);
  const s = wordSettings_();
  return { mode: s.mode, fixed: s.fixed, current: currentWord_(s), date: today_() };
}

/** 先生用ページ：合言葉の設定を変更する */
function setWordSettings(pass, v) {
  checkPass_(pass);
  v = v || {};
  if (['daily', 'fixed', 'off'].indexOf(v.mode) < 0) throw new Error('設定が正しくありません。');
  const fixed = String(v.fixed || '').trim().slice(0, 20);
  if (v.mode === 'fixed' && !normWord_(fixed)) throw new Error('合言葉を入力してください。');
  const s = wordSettings_();
  s.mode = v.mode;
  if (v.mode === 'fixed') s.fixed = fixed;
  if (v.renew) s.secret = Utilities.getUuid(); // 毎日の合言葉の並びを作り直す（漏れたとき用）
  PropertiesService.getScriptProperties().setProperty(WORD_KEY, JSON.stringify(s));
  return getWordSettings(pass);
}

/** 先生用ページ：パスコードの確認 */
function teacherLogin(pass) {
  checkPass_(pass);
  return true;
}

function cellDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return String(v || '');
}

function cellStamp_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm');
  return String(v || '');
}

function unquote_(v) {
  v = String(v == null ? '' : v);
  return v.charAt(0) === "'" ? v.slice(1) : v;
}

/**
 * 先生用ページ：回答データを返す
 * filter = { grade, cls, from, to }（すべて省略可。grade/cls を指定すると、そのクラスだけ返す）
 * 返り値は配列の配列（列は HEADERS の順。送信日時と授業日は文字列化済み）
 */
function getResponses(pass, filter) {
  checkPass_(pass);
  filter = filter || {};
  const sh = sheet_();
  const n = sh.getLastRow() - 1;
  if (n <= 0) return [];
  const values = sh.getRange(2, 1, n, HEADERS.length).getValues();
  const g = filter.grade ? Number(filter.grade) : 0;
  const c = filter.cls ? Number(filter.cls) : 0;
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v[0] === '' && v[3] === '') continue; // 空行
    if (g && Number(v[3]) !== g) continue;
    if (c && Number(v[4]) !== c) continue;
    const d = cellDate_(v[1]);
    if (filter.from && d < filter.from) continue;
    if (filter.to && d > filter.to) continue;
    out.push([
      cellStamp_(v[0]), d, v[2] === '' ? '' : Number(v[2]), Number(v[3]), Number(v[4]), Number(v[5]),
      unquote_(v[6]), String(v[7]), unquote_(v[8]), String(v[9]), unquote_(v[10]), unquote_(v[11]), String(v[12] || ''),
      i + 2, // 最後の要素：シートの行番号（削除に使う）
    ]);
  }
  return out;
}

/**
 * 先生用ページ：回答を削除する
 * items = [{ row, stamp, grade, cls, num }]（row はシートの行番号。他は取りちがえ防止の確認用）
 * 消した行は「削除済み」シートに移すので、まちがえても元に戻せる
 */
function deleteResponses(pass, items) {
  checkPass_(pass);
  items = (items || []).slice().sort(function (a, b) { return b.row - a.row; }); // 下の行から消す
  if (!items.length) return { deleted: 0 };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_();
    const last = sh.getLastRow();
    const rows = [];
    items.forEach(function (it) {
      const r = Number(it.row);
      if (!(r >= 2 && r <= last)) throw new Error('データが変わっています。「表示する」を押して読み込み直してください。');
      const v = sh.getRange(r, 1, 1, HEADERS.length).getValues()[0];
      if (cellStamp_(v[0]) !== String(it.stamp) || Number(v[3]) !== Number(it.grade) ||
          Number(v[4]) !== Number(it.cls) || Number(v[5]) !== Number(it.num)) {
        throw new Error('データが変わっています。「表示する」を押して読み込み直してください。');
      }
      rows.push({ r: r, v: v });
    });
    const trash = trashSheet_();
    const now = new Date();
    rows.forEach(function (x) {
      trash.appendRow(x.v.concat([now]));
      sh.deleteRow(x.r);
    });
    return { deleted: rows.length };
  } finally {
    lock.releaseLock();
  }
}

function trashSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(TRASH_NAME);
  if (!sh) sh = ss.insertSheet(TRASH_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS.concat(['削除した日時']));
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length + 1).setFontWeight('bold').setBackground('#f3e8e8');
  }
  return sh;
}

// ===================== 画面（HTML） =====================
// 生徒用フォーム
const FORM_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
<base target="_top">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>授業ふりかえり</title>
<style>
:root{
  --ink:#1c2430; --ink2:#55637a; --line:#d7dee9; --bg:#f4f7fb; --panel:#fff;
  --accent:#2f6fd0; --err:#c92a2a; --ok:#0f7b46;
  --a:#0f7b46; --b:#2f6fd0; --c:#d9480f;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);line-height:1.6;
  font-family:"BIZ UDPGothic","Hiragino Kaku Gothic ProN","Yu Gothic UI","Meiryo",system-ui,sans-serif;
  -webkit-text-size-adjust:100%}
header{background:linear-gradient(100deg,#2f6fd0,#4C97FF 60%,#0FBD8C);color:#fff;padding:.9rem 1rem}
header h1{margin:0 auto;max-width:720px;font-size:1.3rem}
header p{margin:.1rem auto 0;max-width:720px;font-size:.9rem;opacity:.95}
main{max-width:720px;margin:0 auto;padding:1rem 1rem 3rem}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:1rem;margin-bottom:1rem;
  box-shadow:0 2px 6px rgba(28,36,48,.08)}
.panel.bad{border:2px solid var(--err)}
h2{font-size:1.08rem;margin:0 0 .6rem}
.req{display:inline-block;font-size:.72rem;background:var(--err);color:#fff;border-radius:6px;padding:0 .4rem;margin-left:.3rem;vertical-align:middle}
.opt{display:inline-block;font-size:.72rem;background:#8a96a8;color:#fff;border-radius:6px;padding:0 .4rem;margin-left:.3rem;vertical-align:middle}
.row{display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem}
.row.three{grid-template-columns:repeat(3,1fr)}
@media(max-width:520px){.row,.row.three{grid-template-columns:1fr 1fr}}
label.f{display:block;font-size:.85rem;color:var(--ink2);font-weight:700}
select,input[type=text],textarea{width:100%;font:inherit;font-size:1.05rem;padding:.6rem .7rem;border:2px solid var(--line);
  border-radius:10px;background:#fff;color:var(--ink)}
textarea{min-height:4.8rem;resize:vertical}
select:focus,input:focus,textarea:focus{outline:3px solid #bcd5f7;border-color:var(--accent)}
.name{margin-top:.6rem}
.choices{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-bottom:.7rem}
.choices input{position:absolute;opacity:0;pointer-events:none}
.choices label{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;
  border:2px solid var(--line);border-radius:12px;padding:.6rem .3rem;cursor:pointer;background:#fff;min-height:5.2rem;
  font-size:.82rem;color:var(--ink2);user-select:none}
.choices label b{font-size:1.8rem;line-height:1.1;color:var(--ink)}
.choices input:focus-visible+label{outline:3px solid #bcd5f7}
.choices input[value=A]:checked+label{background:var(--a);border-color:var(--a);color:#fff}
.choices input[value=B]:checked+label{background:var(--b);border-color:var(--b);color:#fff}
.choices input[value=C]:checked+label{background:var(--c);border-color:var(--c);color:#fff}
.choices input:checked+label b{color:#fff}
.hint{font-size:.8rem;color:var(--ink2);margin:.25rem 0 0}
.count{float:right}
.btn{display:block;width:100%;background:var(--accent);color:#fff;border:none;border-radius:12px;padding:.9rem;
  font:inherit;font-size:1.15rem;font-weight:700;cursor:pointer}
.btn:disabled{opacity:.6;cursor:wait}
.btn.sub{background:#fff;color:var(--accent);border:2px solid var(--accent);font-size:1rem;padding:.7rem}
.msg{color:var(--err);font-weight:700;margin:.6rem 0 0;min-height:1.4em}
.done{text-align:center}
.done .big{font-size:3rem;line-height:1}
.done dl{display:grid;grid-template-columns:auto 1fr;gap:.2rem .8rem;text-align:left;margin:1rem auto;max-width:28rem}
.done dt{color:var(--ink2);font-weight:700}
.done dd{margin:0;white-space:pre-wrap;word-break:break-word}
.demo{background:#fff8e8;border-left:5px solid #ffbf00;border-radius:6px;padding:.5rem .8rem;font-size:.85rem;margin-bottom:1rem}
.word input{font-size:1.5rem;letter-spacing:.2em;text-align:center;max-width:14rem;display:block;margin:0 auto}
/* ---- キャラ育成 ---- */
.petcard{display:flex;gap:1rem;align-items:center;background:linear-gradient(135deg,#fff,#fff5fa 50%,#f1f7ff)}
.petcard .pic{flex:0 0 auto}
.petcard .info{flex:1;min-width:0}
.petname{font-size:1.25rem;font-weight:800;margin:0}
.petstage{display:inline-block;font-size:.78rem;font-weight:700;background:#eef3fa;border-radius:99px;padding:.05rem .6rem;margin-left:.3rem;vertical-align:middle}
.dots{display:flex;gap:.3rem;align-items:center;margin:.35rem 0;font-size:.85rem;color:var(--ink2)}
.dots i{width:1rem;height:1rem;border-radius:50%;background:#e3e9f2;border:2px solid #c9d3e2;display:inline-block}
.dots i.on{background:#ffcc33;border-color:#e0a800}
.zukan{display:flex;flex-wrap:wrap;gap:.2rem;align-items:center;font-size:.78rem;color:var(--ink2);margin-top:.2rem}
.petmsg{font-weight:700;color:#d14d8b;margin:.3rem 0;min-height:1.4em}
.petmsg.cool{color:#2f6fd0}
.petstage-area{position:relative;display:inline-block}
.evo-flash::after{content:"";position:absolute;inset:-10%;border-radius:50%;background:radial-gradient(#fff 30%,rgba(255,255,255,0));animation:evoFlash 1s ease-out forwards}
@keyframes evoFlash{0%{opacity:0;transform:scale(.4)}40%{opacity:1;transform:scale(1.1)}100%{opacity:0;transform:scale(1.4)}}
.evo-shake svg{animation:evoShake .12s linear infinite}
@keyframes evoShake{0%,100%{transform:translateX(0)}50%{transform:translateX(4px)}}
.evo-pop svg{animation:evoPop .6s cubic-bezier(.2,1.6,.4,1)}
@keyframes evoPop{0%{transform:scale(.3)}100%{transform:scale(1)}}
.eggs h3{font-size:1rem;margin:.8rem 0 .4rem;text-align:left}
.eggs h3.cute{color:#d14d8b} .eggs h3.cool{color:#2f6fd0}
.egg-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:.4rem}
@media(max-width:520px){.egg-grid{grid-template-columns:repeat(3,1fr)}}
.egg-btn{background:#fff;border:3px solid var(--line);border-radius:14px;padding:.3rem .2rem .4rem;cursor:pointer;font:inherit;font-size:.72rem;color:var(--ink);position:relative}
.egg-btn svg{width:100%;height:auto;max-width:90px}
.egg-btn.cute.sel{border-color:#ff6f9c;background:#fff0f6}
.egg-btn.cool.sel{border-color:#3d7bf2;background:#eef4ff}
.egg-btn:disabled{opacity:.45;cursor:not-allowed}
.egg-btn .badge{position:absolute;top:.2rem;right:.2rem;background:#ffcc33;border-radius:99px;font-size:.65rem;padding:0 .35rem;font-weight:700}
.btn.pet{background:linear-gradient(90deg,#ff6f9c,#c77dff,#3d7bf2);margin-top:.8rem}
details.sent{text-align:left;margin-top:1rem;border:1px solid var(--line);border-radius:10px;padding:.4rem .8rem;background:#fbfcfe}
details.sent summary{cursor:pointer;font-weight:700;color:var(--ink2)}
.hidden{display:none !important}
</style>
</head>
<body>
<header>
  <h1 id="title">授業ふりかえり</h1>
  <p id="today"></p>
</header>
<main>
  <div id="demoNote" class="demo hidden">【体験モード】Google Apps Script の外で開いています。送信内容はこの端末のブラウザにだけ保存されます。</div>

  <section class="panel petcard hidden" id="petTop" aria-live="polite"></section>

  <form id="form" novalidate>
    <section class="panel" id="secWho">
      <h2>あなたのこと <span class="req">必須</span></h2>
      <div class="row" id="whoRow">
        <div><label class="f" for="grade">学年</label><select id="grade" required></select></div>
        <div><label class="f" for="cls">組</label><select id="cls" required></select></div>
        <div><label class="f" for="num">番号</label><select id="num" required></select></div>
        <div id="periodBox"><label class="f" for="period">時限</label><select id="period" required></select></div>
      </div>
      <div class="name">
        <label class="f" for="name">氏名（フルネーム）</label>
        <input type="text" id="name" maxlength="40" autocomplete="name" placeholder="例）技術 太郎" required>
      </div>
      <p class="hint">学年・組・番号・氏名は、この端末に記憶されます。次回からは入力しなくてOKです。</p>
    </section>

    <section class="panel" id="secU">
      <h2>① 本時の授業の理解度 <span class="req">必須</span></h2>
      <div class="choices" role="radiogroup" aria-label="理解度">
        <input type="radio" name="understand" id="u-A" value="A"><label for="u-A"><b>A</b>よく理解できた</label>
        <input type="radio" name="understand" id="u-B" value="B"><label for="u-B"><b>B</b>だいたい理解できた</label>
        <input type="radio" name="understand" id="u-C" value="C"><label for="u-C"><b>C</b>あまり理解できなかった</label>
      </div>
      <label class="f" for="uReason">そう思う理由 <span class="req">必須</span><span class="count" id="uCount"></span></label>
      <textarea id="uReason" maxlength="1000" placeholder="例）〇〇のしくみは説明できるが、△△がまだよくわからないから"></textarea>
    </section>

    <section class="panel" id="secP">
      <h2>② 本時の作業の進捗度 <span class="req">必須</span></h2>
      <div class="choices" role="radiogroup" aria-label="進捗度">
        <input type="radio" name="progress" id="p-A" value="A"><label for="p-A"><b>A</b>予定より進んだ</label>
        <input type="radio" name="progress" id="p-B" value="B"><label for="p-B"><b>B</b>予定どおり進んだ</label>
        <input type="radio" name="progress" id="p-C" value="C"><label for="p-C"><b>C</b>予定より遅れている</label>
      </div>
      <label class="f" for="pReason">そう思う理由 <span class="req">必須</span><span class="count" id="pCount"></span></label>
      <textarea id="pReason" maxlength="1000" placeholder="例）〇〇まで完成した。次の時間は△△から始める"></textarea>
    </section>

    <section class="panel" id="secQ">
      <h2>③ 質問・感想など <span class="opt">任意</span></h2>
      <textarea id="question" maxlength="1000" placeholder="先生に聞きたいこと、困っていること、感想など"></textarea>
    </section>

    <section class="panel word hidden" id="secW">
      <h2>🔑 合言葉 <span class="req">必須</span></h2>
      <input type="text" id="word" maxlength="20" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="合言葉">
      <p class="hint" style="text-align:center">先生が黒板（画面）に書いた合言葉を入力してください。</p>
    </section>

    <button type="submit" class="btn" id="send">送信する</button>
    <p class="msg" id="msg" role="alert"></p>
  </form>

  <section class="panel done hidden" id="done">
    <div class="big">✅</div>
    <h2>送信しました。おつかれさまでした！</h2>
    <div id="petDone" class="hidden"></div>
    <details class="sent" id="sentBox"><summary>送信した内容を見る</summary><dl id="summary"></dl></details>
    <button type="button" class="btn sub" id="again" style="margin-top:1rem">まちがえたので、もう一度送る</button>
  </section>
</main>

<script>
/* =========================================================================
 * 育成キャラクター（10種類 × 6段階）を SVG で描く
 *   PETS.list          … キャラクターの一覧
 *   PETS.get(id)       … 1体の情報
 *   PETS.svg(id, st)   … 段階 st（0=タマゴ 〜 5=究極体）の絵（SVG文字列）
 *   PETS.STAGES        … 段階の名前
 * 画像ファイルは使わず、すべて図形で描いています。
 * ========================================================================= */
var PETS = (function(){
  var STAGES = ['タマゴ', '幼年期', '成長期', '成熟期', '完全体', '究極体'];

  // type: cute（ピンクのタマゴ）/ cool（青のタマゴ）
  // egg: タマゴの色 [こい色, うすい色]　c1: からだ　c2: おなか・明るい色　c3: アクセント　ink: 線
  var LIST = [
    { id:'usa',  type:'cute', motif:'bunny',   pattern:'hearts',  egg:['#ff8fb1','#ffe3ec'],
      c1:'#ffc4d6', c2:'#fff4f8', c3:'#ff6f9c', ink:'#6b2f45',
      names:['ハートのタマゴ','ぴょこ','ぴょんりん','ラビリィ','ラビエンジェ','ムーンラビエル'] },
    { id:'neko', type:'cute', motif:'cat',     pattern:'dots',    egg:['#ff9eb5','#fff0f3'],
      c1:'#ffd0b8', c2:'#fff6ef', c3:'#ff7f8f', ink:'#6b3a2f',
      names:['みずたまのタマゴ','にゃこ','にゃもん','ミャルル','ニャンティーヌ','ステラキャット'] },
    { id:'hana', type:'cute', motif:'flower',  pattern:'flowers', egg:['#f78fb3','#ffe6f0'],
      c1:'#ffd6e4', c2:'#fff7fa', c3:'#ff5c93', ink:'#6b2a4a',
      names:['おはなのタマゴ','つぼみん','はなっこ','フルール','ローズフェアリ','フローラクイーン'] },
    { id:'moko', type:'cute', motif:'sheep',   pattern:'clouds',  egg:['#f6a6d0','#fdeef7'],
      c1:'#f3d9ff', c2:'#ffffff', c3:'#d58cff', ink:'#55346b',
      names:['くものタマゴ','もこ','もこもこ','メリーぬ','ドリームメリー','ゆめくもヒツジ'] },
    { id:'yuni', type:'cute', motif:'unicorn', pattern:'stars',   egg:['#ee8fd0','#fde8f6'],
      c1:'#fff0fb', c2:'#ffffff', c3:'#c77dff', ink:'#5b2f6b',
      names:['ほしのタマゴ','ユニぽん','ユニコロ','ユニリィ','ペガユニ','スターユニコーン'] },

    { id:'dora', type:'cool', motif:'dragon',  pattern:'scales',  egg:['#3d7bf2','#d9e8ff'],
      c1:'#5b9dff', c2:'#d8ecff', c3:'#1f4fbf', ink:'#132a5c',
      names:['うろこのタマゴ','ドラピ','ドラグル','ドラグナー','アズールドラゴン','蒼龍ラグナロク'] },
    { id:'garu', type:'cool', motif:'wolf',    pattern:'zigzag',  egg:['#2f5fbf','#dbe6fb'],
      c1:'#7f95c9', c2:'#e8eefb', c3:'#2c3f7a', ink:'#1a2447',
      names:['ギザギザのタマゴ','ガルコ','ガルフ','ウルフガー','シルバーウルフ','天狼フェンリル'] },
    { id:'meka', type:'cool', motif:'robot',   pattern:'gears',   egg:['#4a86c8','#dfeaf6'],
      c1:'#9fb8d6', c2:'#e6eef7', c3:'#2f6db5', ink:'#1d2f45',
      names:['ギアのタマゴ','メカピ','メカボ','ロボガード','メタルナイト','ギガメカオー'] },
    { id:'raiga', type:'cool', motif:'thunder', pattern:'bolts',  egg:['#2a8be0','#dcefff'],
      c1:'#4cc3ff', c2:'#e3f6ff', c3:'#ffd23f', ink:'#0f3352',
      names:['いなずまのタマゴ','ピリコ','ライコ','ライガー','ボルトタイガ','雷神ライジン'] },
    { id:'aqua', type:'cool', motif:'shark',   pattern:'waves',   egg:['#1f8fb8','#d8f1f8'],
      c1:'#48b7d6', c2:'#e6f8fc', c3:'#16708f', ink:'#0d3442',
      names:['なみのタマゴ','アクピ','シャクル','アクアシャーク','タイダルシャーク','海王リヴァイア'] }
  ];
  var BY = {};
  LIST.forEach(function(p){ BY[p.id] = p; });

  // ------------------------------------------------------------ 小さな道具
  function at(o){ var s = ''; for (var k in o) if (o[k] != null) s += ' ' + k + '="' + o[k] + '"'; return s; }
  function ln(ch, w){ return 'stroke="' + ch.ink + '" stroke-width="' + (w || 3) + '" stroke-linejoin="round" stroke-linecap="round"'; }
  function circle(x, y, r, fill, extra){ return '<circle' + at({ cx:x, cy:y, r:r, fill:fill }) + ' ' + (extra || '') + '/>'; }
  function ell(x, y, rx, ry, fill, extra, rot){
    return '<ellipse' + at({ cx:x, cy:y, rx:rx, ry:ry, fill:fill, transform: rot ? 'rotate(' + rot + ' ' + x + ' ' + y + ')' : null }) + ' ' + (extra || '') + '/>';
  }
  // 中心 (cx, cy) のまわりに角度 deg だけ回した花びら
  function petal(cx, cy, dist, rx, ry, deg, fill, extra){
    return '<ellipse' + at({ cx:cx, cy:cy - dist, rx:rx, ry:ry, fill:fill, transform:'rotate(' + deg + ' ' + cx + ' ' + cy + ')' }) + ' ' + (extra || '') + '/>';
  }
  function path(d, fill, extra){ return '<path d="' + d + '" fill="' + fill + '" ' + (extra || '') + '/>'; }
  function starPts(x, y, r, n, inner){
    n = n || 5; inner = inner || 0.45; var p = [];
    for (var i = 0; i < n * 2; i++) {
      var a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r * inner : r;
      p.push((x + Math.cos(a) * rr).toFixed(1) + ',' + (y + Math.sin(a) * rr).toFixed(1));
    }
    return p.join(' ');
  }
  function star(x, y, r, fill, extra){ return '<polygon points="' + starPts(x, y, r) + '" fill="' + fill + '" ' + (extra || '') + '/>'; }
  function heart(x, y, s, fill, extra){
    return '<path transform="translate(' + x + ' ' + y + ') scale(' + s + ')" d="M0 4C0-2-9-2-9 4C-9 9-3 12 0 15C3 12 9 9 9 4C9-2 0-2 0 4Z" fill="' + fill + '" ' + (extra || '') + '/>';
  }
  function bolt(x, y, s, fill, extra){
    return '<path transform="translate(' + x + ' ' + y + ') scale(' + s + ')" d="M2-12L-7 2H0L-3 13L8-3H1Z" fill="' + fill + '" ' + (extra || '') + '/>';
  }
  function sparkle(x, y, r, fill){
    return '<path d="M' + x + ' ' + (y - r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y + r) +
      'Q' + x + ' ' + y + ' ' + (x - r) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y - r) + 'Z" fill="' + fill + '"/>';
  }
  var uid = 0;

  // ------------------------------------------------------------ タマゴ
  var EGG = 'M100 30C140 30 162 92 162 124C162 160 134 184 100 184C66 184 38 160 38 124C38 92 60 30 100 30Z';

  function eggPattern(ch){
    var c = ch.egg[0], w = '#ffffff', s = '';
    switch (ch.pattern) {
      case 'hearts':
        [[70,80,1.1],[122,70,0.9],[96,118,1.3],[60,140,0.9],[134,128,1.1],[100,165,0.8]].forEach(function(h){ s += heart(h[0], h[1] - 8, h[2], c); });
        break;
      case 'dots':
        [[72,78,9],[118,64,7],[100,104,11],[62,128,8],[138,112,9],[88,150,9],[128,158,7]].forEach(function(d){ s += circle(d[0], d[1], d[2], c); });
        break;
      case 'flowers':
        [[74,82,1],[124,78,0.8],[100,124,1.2],[64,150,0.8],[136,146,0.9]].forEach(function(f){
          for (var i = 0; i < 5; i++) s += petal(f[0], f[1], 8 * f[2], 5 * f[2], 8 * f[2], i * 72, c);
          s += circle(f[0], f[1], 4 * f[2], '#ffe680');
        });
        break;
      case 'clouds':
        [[78,84],[124,112],[74,150]].forEach(function(q){
          s += '<g fill="' + c + '">' + circle(q[0] - 12, q[1] + 3, 9, c) + circle(q[0], q[1] - 3, 12, c) + circle(q[0] + 13, q[1] + 3, 9, c) +
            '<rect x="' + (q[0] - 21) + '" y="' + (q[1] + 2) + '" width="42" height="10" rx="5"/></g>';
        });
        break;
      case 'stars':
        [[74,76,9],[124,66,7],[100,110,13],[62,136,8],[136,124,10],[96,160,8]].forEach(function(t){ s += star(t[0], t[1], t[2], c); });
        break;
      case 'scales':
        for (var r = 0; r < 7; r++) for (var i = -1; i < 8; i++) {
          var x = 40 + i * 20 + (r % 2) * 10, y = 60 + r * 18;
          s += '<path d="M' + (x - 10) + ' ' + y + 'Q' + x + ' ' + (y + 16) + ' ' + (x + 10) + ' ' + y + '" fill="none" stroke="' + c + '" stroke-width="3"/>';
        }
        break;
      case 'zigzag':
        [70, 112, 152].forEach(function(y){
          var d = 'M30 ' + y; for (var x = 30; x < 175; x += 14) d += 'L' + (x + 7) + ' ' + (y - 10) + 'L' + (x + 14) + ' ' + y;
          s += '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="7" stroke-linejoin="round"/>';
        });
        break;
      case 'gears':
        [[78,86,16],[124,122,20],[80,152,12]].forEach(function(g){
          s += circle(g[0], g[1], g[2], 'none', 'stroke="' + c + '" stroke-width="7" stroke-dasharray="6 5"') + circle(g[0], g[1], g[2] * 0.45, c);
        });
        break;
      case 'bolts':
        [[76,80,1.3],[126,96,1.1],[92,136,1.6],[136,154,1]].forEach(function(b){ s += bolt(b[0], b[1], b[2], c); });
        s += bolt(64, 160, 0.9, '#ffd23f');
        break;
      case 'waves':
        [72, 104, 136, 166].forEach(function(y, k){
          var d = 'M30 ' + y; for (var x = 30; x < 175; x += 24) d += 'q6 -9 12 0t12 0';
          s += '<path d="' + d + '" fill="none" stroke="' + (k % 2 ? w : c) + '" stroke-width="6" stroke-linecap="round"/>';
        });
        break;
    }
    return s;
  }

  function eggSvg(ch){
    var id = 'e' + (++uid);
    return '<defs><clipPath id="' + id + 'c"><path d="' + EGG + '"/></clipPath>' +
      '<radialGradient id="' + id + 'g" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="' + ch.egg[1] + '"/><stop offset="1" stop-color="' + ch.egg[0] + '" stop-opacity=".55"/></radialGradient></defs>' +
      ell(100, 188, 52, 7, 'rgba(0,0,0,.12)') +
      '<g class="pet-wobble">' +
      path(EGG, 'url(#' + id + 'g)') +
      '<g clip-path="url(#' + id + 'c)" opacity=".85">' + eggPattern(ch) + '</g>' +
      path(EGG, 'none', 'stroke="' + ch.egg[0] + '" stroke-width="4"') +
      ell(76, 72, 9, 16, 'rgba(255,255,255,.75)', '', 25) +
      '</g>';
  }

  // ------------------------------------------------------------ 顔
  function face(ch, P){
    var x = P.hx, y = P.hy + P.hr * 0.12, sp = P.hr * 0.42, k = P.hr / 40, s = '';
    if (ch.motif === 'robot') {
      s += '<rect' + at({ x: x - P.hr * 0.72, y: y - 12 * k, width: P.hr * 1.44, height: 22 * k, rx: 11 * k, fill:'#183049' }) + ' ' + ln(ch, 2.5) + '/>';
      s += ell(x - sp * 0.8, y - 1 * k, 7 * k, 5 * k, '#5ff2ff') + ell(x + sp * 0.8, y - 1 * k, 7 * k, 5 * k, '#5ff2ff');
      s += path('M' + (x - 7 * k) + ' ' + (y + 20 * k) + 'H' + (x + 7 * k), 'none', ln(ch, 2.5));
      return s;
    }
    if (ch.type === 'cute') {
      [-1, 1].forEach(function(d){
        var ex = x + d * sp;
        s += ell(ex, y, 7.5 * k, 9.5 * k, ch.ink);
        s += circle(ex - 2.4 * k, y - 3.5 * k, 3 * k, '#fff') + circle(ex + 2.6 * k, y + 3.5 * k, 1.5 * k, '#fff');
        s += ell(x + d * (sp + 9 * k), y + 13 * k, 7 * k, 4 * k, '#ff8fab', 'opacity=".55"');
      });
      s += path('M' + (x - 6 * k) + ' ' + (y + 11 * k) + 'q3 4 6 0q3 4 6 0', 'none', ln(ch, 2.4));
    } else {
      [-1, 1].forEach(function(d){
        var ex = x + d * sp;
        s += path('M' + (ex - 9 * k * d) + ' ' + (y - 3 * k) + 'Q' + ex + ' ' + (y - 9 * k) + ' ' + (ex + 8 * k * d) + ' ' + (y - 4 * k) +
          'Q' + (ex + 6 * k * d) + ' ' + (y + 8 * k) + ' ' + ex + ' ' + (y + 8 * k) + 'Q' + (ex - 8 * k * d) + ' ' + (y + 7 * k) + ' ' + (ex - 9 * k * d) + ' ' + (y - 3 * k) + 'Z', '#fff', ln(ch, 2.2));
        s += circle(ex + 1.5 * k * d, y + 1.5 * k, 4.2 * k, ch.ink) + circle(ex + 0.2 * k * d, y - 0.2 * k, 1.4 * k, '#fff');
        s += path('M' + (ex - 10 * k * d) + ' ' + (y - 13 * k) + 'L' + (ex + 8 * k * d) + ' ' + (y - 9 * k), 'none', ln(ch, 3));
      });
      s += path('M' + (x - 7 * k) + ' ' + (y + 14 * k) + 'Q' + x + ' ' + (y + 19 * k) + ' ' + (x + 8 * k) + ' ' + (y + 12 * k), 'none', ln(ch, 2.6));
      s += path('M' + (x + 3 * k) + ' ' + (y + 16 * k) + 'l2 4 2-4.5', '#fff', ln(ch, 1.5));
    }
    return s;
  }

  // ------------------------------------------------------------ 特徴（キャラごと）
  // 返り値 { back:体の後ろ, behind:頭の後ろ, deco:体の上, front:頭の上 }
  function motif(ch, st, P){
    var o = { back:'', behind:'', deco:'', front:'' }, x = P.hx, y = P.hy, r = P.hr, L = ln(ch), g = Math.max(1, st);
    var bx = P.bx, by = P.by, brx = P.brx, bry = P.bry;
    switch (ch.motif) {
      case 'bunny':
        var eh = r * (0.55 + 0.13 * g);
        [-1, 1].forEach(function(d){
          var ex = x + d * r * 0.42, ey = y - r * 0.75 - eh * 0.75, rot = d * (8 + g * 2);
          o.behind += ell(ex, ey, r * 0.26, eh, ch.c1, L, rot) + ell(ex, ey + eh * 0.1, r * 0.13, eh * 0.75, ch.c3, 'opacity=".55"', rot);
        });
        if (st >= 3) o.back += circle(bx + brx * 0.95, by + bry * 0.35, 13 + st * 2, ch.c2, L);
        if (st >= 4) o.deco += bow(ch, bx, by - bry * 0.42, 1 + (st - 4) * 0.2);
        if (st >= 5) o.back += wings(ch, bx, by - bry * 0.3, 1.25, 'feather');
        break;
      case 'cat':
        [-1, 1].forEach(function(d){
          var ex = x + d * r * 0.62;
          o.behind += path('M' + (ex - d * r * 0.42) + ' ' + (y - r * 0.55) + 'L' + (ex + d * r * 0.12) + ' ' + (y - r * (1.05 + 0.05 * g)) + 'L' + (ex + d * r * 0.4) + ' ' + (y - r * 0.4) + 'Z', ch.c1, L);
          o.behind += path('M' + (ex - d * r * 0.22) + ' ' + (y - r * 0.6) + 'L' + (ex + d * r * 0.1) + ' ' + (y - r * (0.9 + 0.05 * g)) + 'L' + (ex + d * r * 0.25) + ' ' + (y - r * 0.5) + 'Z', ch.c3, 'opacity=".55"');
          for (var i = -1; i <= 1; i++) o.front += path('M' + (x + d * r * 0.62) + ' ' + (y + r * 0.32 + i * 5) + 'l' + (d * r * 0.42) + ' ' + (i * 5), 'none', ln(ch, 2));
        });
        if (st >= 2) o.back += path('M' + (bx + brx * 0.8) + ' ' + (by + bry * 0.6) + 'C' + (bx + brx * 1.8) + ' ' + (by + bry * 0.6) + ' ' + (bx + brx * 1.2) + ' ' + (by - bry * 1.2) + ' ' + (bx + brx * 1.7) + ' ' + (by - bry * 1.3), 'none', 'stroke="' + ch.ink + '" stroke-width="' + (13 + st) + '" stroke-linecap="round"') +
          path('M' + (bx + brx * 0.8) + ' ' + (by + bry * 0.6) + 'C' + (bx + brx * 1.8) + ' ' + (by + bry * 0.6) + ' ' + (bx + brx * 1.2) + ' ' + (by - bry * 1.2) + ' ' + (bx + brx * 1.7) + ' ' + (by - bry * 1.3), 'none', 'stroke="' + ch.c1 + '" stroke-width="' + (8 + st) + '" stroke-linecap="round"');
        if (st >= 4) o.deco += path('M' + (bx - brx * 0.7) + ' ' + (by - bry * 0.8) + 'Q' + bx + ' ' + (by - bry * 0.55) + ' ' + (bx + brx * 0.7) + ' ' + (by - bry * 0.8), 'none', 'stroke="' + ch.c3 + '" stroke-width="7" stroke-linecap="round"') + circle(bx, by - bry * 0.62, 7, '#ffd84a', ln(ch, 2));
        if (st >= 5) o.back += wings(ch, bx, by - bry * 0.3, 1.2, 'feather');
        break;
      case 'flower':
        var n = 5 + g, pr = r * (0.3 + 0.03 * g);
        for (var i = 0; i < n; i++) {
          var a = -Math.PI / 2 + (i - (n - 1) / 2) * (Math.PI * 1.25 / n);
          var px = x + Math.cos(a) * r * 0.95, py = y + Math.sin(a) * r * 0.95;
          o.behind += ell(px, py, pr * 0.7, pr * 1.15, i % 2 ? ch.c3 : '#ff9cc0', L, (a * 180 / Math.PI + 90).toFixed(0));
        }
        if (st <= 2) o.front += path('M' + x + ' ' + (y - r) + 'q-2 -10 4 -16', 'none', 'stroke="#4caf50" stroke-width="3"') + ell(x + 9, y - r - 14, 7, 4, '#7bd389', ln(ch, 2), -30);
        if (st >= 3) o.back += wings(ch, bx, by - bry * 0.4, 0.75 + st * 0.12, 'butterfly');
        if (st >= 4) o.deco += flowerMark(bx, by - bry * 0.1, 11, ch);
        break;
      case 'sheep':
        var m = 6 + g * 2;
        for (var i = 0; i < m; i++) {
          var a = Math.PI + (i / (m - 1)) * Math.PI;
          o.behind += circle(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.8, r * 0.3, ch.c2, L);
        }
        if (st >= 3) [-1, 1].forEach(function(d){
          o.front += path('M' + (x + d * r * 0.75) + ' ' + (y - r * 0.35) + 'c' + (d * 14) + ' -6 ' + (d * 18) + ' 12 ' + (d * 6) + ' 14c' + (d * -6) + ' 1 ' + (d * -6) + ' -6 ' + (d * -1) + ' -6', 'none', 'stroke="#f2c14e" stroke-width="5" stroke-linecap="round"');
        });
        if (st >= 3) for (var i = 0; i < 7; i++) {
          var a = (i / 6) * Math.PI;
          o.deco += circle(bx + Math.cos(a) * brx * 0.85, by + bry * 0.15 + Math.sin(a) * bry * 0.6, brx * 0.22, ch.c2, L);
        }
        if (st >= 4) o.back += cloudWings(ch, bx, by - bry * 0.5, 0.8 + (st - 4) * 0.35);
        break;
      case 'unicorn':
        var hh = r * (0.35 + 0.1 * g);
        o.front += path('M' + (x - r * 0.13) + ' ' + (y - r * 0.82) + 'L' + x + ' ' + (y - r * 0.82 - hh) + 'L' + (x + r * 0.13) + ' ' + (y - r * 0.82) + 'Z', '#ffe27a', L) +
          path('M' + (x - r * 0.08) + ' ' + (y - r * 0.82 - hh * 0.3) + 'l' + (r * 0.16) + ' -5M' + (x - r * 0.05) + ' ' + (y - r * 0.82 - hh * 0.6) + 'l' + (r * 0.1) + ' -4', 'none', ln(ch, 2));
        [-1, 1].forEach(function(d){
          o.behind += path('M' + (x + d * r * 0.35) + ' ' + (y - r * 0.7) + 'L' + (x + d * r * 0.6) + ' ' + (y - r * 1.12) + 'L' + (x + d * r * 0.72) + ' ' + (y - r * 0.55) + 'Z', ch.c1, L);
        });
        if (st >= 2) {
          // たてがみ：頭の右上から後ろへ、虹色の巻き毛
          var mc = ['#ff9cc0', '#c99cff', '#8fd3ff', '#ffd27f', '#ff9cc0'], mn = 2 + st;
          for (var i = 0; i < mn; i++) {
            var a = -Math.PI * 0.45 + i * (Math.PI * 0.75 / (mn - 1));
            o.behind += circle(x + Math.cos(a) * r * 1.0, y + Math.sin(a) * r * 1.0, r * 0.28, mc[i % mc.length], L);
          }
        }
        if (st >= 3) o.back += path('M' + (bx + brx * 0.85) + ' ' + (by + bry * 0.2) + 'q' + (30 + st * 4) + ' -10 ' + (24 + st * 4) + ' 30q-4 -18 -22 -12', '#c99cff', L);
        if (st >= 4) o.back += wings(ch, bx, by - bry * 0.4, 0.95 + (st - 4) * 0.3, 'feather');
        break;
      case 'dragon':
        [-1, 1].forEach(function(d){
          var hx = x + d * r * 0.5;
          o.front += path('M' + (hx - d * 5) + ' ' + (y - r * 0.78) + 'Q' + (hx + d * r * 0.1) + ' ' + (y - r * (1.15 + 0.08 * g)) + ' ' + (hx + d * r * (0.35 + 0.05 * g)) + ' ' + (y - r * (1.25 + 0.1 * g)) + 'Q' + (hx + d * 4) + ' ' + (y - r * 0.95) + ' ' + (hx + d * 9) + ' ' + (y - r * 0.65) + 'Z', '#fff3c4', L);
        });
        if (st >= 2) o.back += tail(ch, bx, by, brx, bry, st, true);
        if (st >= 3) o.back += wings(ch, bx, by - bry * 0.5, 0.7 + st * 0.13, 'bat');
        o.deco += belly(ch, bx, by, brx, bry, true);
        break;
      case 'wolf':
        [-1, 1].forEach(function(d){
          var ex = x + d * r * 0.55;
          o.behind += path('M' + (ex - d * r * 0.3) + ' ' + (y - r * 0.6) + 'L' + (ex + d * r * 0.08) + ' ' + (y - r * (1.2 + 0.07 * g)) + 'L' + (ex + d * r * 0.42) + ' ' + (y - r * 0.38) + 'Z', ch.c1, L) +
            path('M' + (ex - d * r * 0.12) + ' ' + (y - r * 0.6) + 'L' + (ex + d * r * 0.06) + ' ' + (y - r * (1.0 + 0.06 * g)) + 'L' + (ex + d * r * 0.22) + ' ' + (y - r * 0.5) + 'Z', ch.c3, 'opacity=".6"');
        });
        if (st >= 2) o.back += path('M' + (bx + brx * 0.7) + ' ' + (by + bry * 0.5) + 'Q' + (bx + brx * 2) + ' ' + (by + bry * 0.4) + ' ' + (bx + brx * 1.6) + ' ' + (by - bry * (0.6 + st * 0.15)) + 'Q' + (bx + brx * 1.3) + ' ' + (by - bry * 0.1) + ' ' + (bx + brx * 0.7) + ' ' + (by + bry * 0.1) + 'Z', ch.c1, L);
        if (st >= 3) {
          var sp = '';
          for (var i = 0; i < 9; i++) {
            var a = Math.PI * 0.15 + i * Math.PI * 0.7 / 8;
            var mx = x + Math.cos(a) * r * 0.95, my = y + Math.sin(a) * r * 0.85;
            sp += 'L' + (x + Math.cos(a) * r * (1.25 + st * 0.04)).toFixed(1) + ' ' + (y + Math.sin(a) * r * 1.15).toFixed(1) + 'L' + mx.toFixed(1) + ' ' + my.toFixed(1);
          }
          o.behind += path('M' + (x + r * 0.9) + ' ' + (y + r * 0.2) + sp + 'Z', ch.c2, L);
        }
        if (st >= 4) o.deco += path('M' + (bx - brx * 0.8) + ' ' + (by - bry * 0.75) + 'Q' + bx + ' ' + (by - bry * 0.45) + ' ' + (bx + brx * 0.8) + ' ' + (by - bry * 0.75) + 'L' + (bx + brx * 0.55) + ' ' + (by - bry * 0.2) + 'L' + (bx + brx * 0.35) + ' ' + (by - bry * 0.6) + 'Z', '#e94e5b', L);
        o.deco += belly(ch, bx, by, brx, bry, false);
        if (st >= 5) o.back += wings(ch, bx, by - bry * 0.4, 1.2, 'bat');
        break;
      case 'robot':
        var ah = 14 + g * 5;
        o.front += path('M' + x + ' ' + (y - r * 0.85) + 'V' + (y - r * 0.85 - ah), 'none', ln(ch, 3)) + circle(x, y - r * 0.85 - ah, 6 + st * 0.6, st >= 4 ? '#ff5c5c' : '#5ff2ff', ln(ch, 2.5));
        [-1, 1].forEach(function(d){ o.behind += circle(x + d * r * 0.98, y, r * 0.24, ch.c3, L) + circle(x + d * r * 0.98, y, r * 0.09, '#fff'); });
        o.deco += '<rect' + at({ x: bx - brx * 0.45, y: by - bry * 0.4, width: brx * 0.9, height: bry * 0.7, rx: 6, fill: ch.c2 }) + ' ' + L + '/>' +
          circle(bx - brx * 0.18, by - bry * 0.05, 4, '#ff5c5c') + circle(bx + brx * 0.18, by - bry * 0.05, 4, '#5ff2ff');
        if (st >= 4) [-1, 1].forEach(function(d){
          o.back += path('M' + (bx + d * brx * 0.6) + ' ' + (by - bry * 0.6) + 'L' + (bx + d * brx * (1.7 + (st - 4) * 0.4)) + ' ' + (by - bry * (1.3 + (st - 4) * 0.3)) + 'L' + (bx + d * brx * (1.5 + (st - 4) * 0.4)) + ' ' + (by + bry * 0.1) + 'Z', ch.c3, L) +
            path('M' + (bx + d * brx * 0.9) + ' ' + (by - bry * 0.45) + 'L' + (bx + d * brx * 1.4) + ' ' + (by - bry * 0.75), 'none', 'stroke="#5ff2ff" stroke-width="3" stroke-linecap="round"');
        });
        break;
      case 'thunder':
        [-1, 1].forEach(function(d){
          var ex = x + d * r * 0.55, k2 = 0.8 + g * 0.12;
          o.behind += '<path transform="translate(' + ex + ' ' + (y - r * 0.95) + ') scale(' + (d * 1.4 * k2) + ' ' + (1.6 * k2) + ')" d="M2-12L-7 2H0L-3 13L8-3H1Z" fill="' + ch.c3 + '" ' + ln(ch, 2) + '/>';
        });
        if (st >= 2) {
          var d2 = 'M' + (bx + brx * 0.8) + ' ' + (by + bry * 0.4), tx = bx + brx * 0.8, ty = by + bry * 0.4;
          for (var i = 0; i < 2 + st; i++) { tx += 9; ty -= (i % 2 ? -10 : 18); d2 += 'L' + tx + ' ' + ty; }
          o.back += path(d2, 'none', 'stroke="' + ch.ink + '" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"') + path(d2, 'none', 'stroke="' + ch.c3 + '" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"');
        }
        for (var i = -1; i <= 1; i++) o.deco += path('M' + (bx + i * brx * 0.45 - 6) + ' ' + (by - bry * 0.3) + 'l6 10-6 10', 'none', 'stroke="' + ch.ink + '" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".55"');
        if (st >= 4) [-1, 1].forEach(function(d){ o.back += bolt(bx + d * brx * 1.55, by - bry * 0.7, 1.5 + (st - 4) * 0.4, ch.c3, ln(ch, 2)); });
        break;
      case 'shark':
        o.front += path('M' + (x - r * 0.25) + ' ' + (y - r * 0.85) + 'Q' + (x + r * 0.05) + ' ' + (y - r * (1.25 + 0.08 * g)) + ' ' + (x + r * (0.35 + 0.04 * g)) + ' ' + (y - r * (1.35 + 0.08 * g)) + 'Q' + (x + r * 0.2) + ' ' + (y - r * 1.05) + ' ' + (x + r * 0.3) + ' ' + (y - r * 0.8) + 'Z', ch.c3, L);
        [-1, 1].forEach(function(d){
          o.behind += path('M' + (x + d * r * 0.85) + ' ' + (y + r * 0.1) + 'q' + (d * r * 0.5) + ' -' + (r * 0.1) + ' ' + (d * r * 0.55) + ' -' + (r * 0.45) + 'q-' + (d * r * 0.1) + ' ' + (r * 0.35) + ' -' + (d * r * 0.45) + ' ' + (r * 0.6) + 'Z', ch.c3, L);
          o.front += path('M' + (x + d * r * 0.6) + ' ' + (y + r * 0.45) + 'l' + (d * 3) + ' 6M' + (x + d * r * 0.68) + ' ' + (y + r * 0.38) + 'l' + (d * 3) + ' 6', 'none', ln(ch, 2));
        });
        if (st >= 2) o.back += path('M' + (bx + brx * 0.75) + ' ' + (by + bry * 0.3) + 'L' + (bx + brx * (1.55 + st * 0.08)) + ' ' + (by - bry * 0.4) + 'L' + (bx + brx * (1.3 + st * 0.05)) + ' ' + (by + bry * 0.3) + 'L' + (bx + brx * (1.55 + st * 0.08)) + ' ' + (by + bry * 0.9) + 'Z', ch.c3, L);
        o.deco += belly(ch, bx, by, brx, bry, false);
        if (st >= 4) [-1, 1].forEach(function(d){
          o.back += path('M' + (bx + d * brx * 1.1) + ' ' + (by + bry * 0.8) + 'q' + (d * 18) + ' -20 0 -40q' + (d * -16) + ' -16 ' + (d * 4) + ' -34', 'none', 'stroke="#7fdcf2" stroke-width="' + (6 + (st - 4) * 3) + '" stroke-linecap="round" opacity=".8"');
        });
        break;
    }
    return o;
  }

  function bow(ch, x, y, k){
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + k + ')">' +
      path('M0 0L-16-9V9Z', ch.c3, ln(ch, 2.5)) + path('M0 0L16-9V9Z', ch.c3, ln(ch, 2.5)) + circle(0, 0, 5, '#ff9cc0', ln(ch, 2.5)) + '</g>';
  }
  function flowerMark(x, y, r, ch){
    var s = '';
    for (var i = 0; i < 5; i++) s += petal(x, y, r * 0.6, r * 0.42, r * 0.65, i * 72, '#ff9cc0', ln(ch, 2));
    return s + circle(x, y, r * 0.35, '#ffe680', ln(ch, 2));
  }
  function belly(ch, bx, by, brx, bry, lines){
    var s = ell(bx, by + bry * 0.12, brx * 0.6, bry * 0.66, ch.c2);
    if (lines) for (var i = 0; i < 3; i++) s += path('M' + (bx - brx * 0.4) + ' ' + (by - bry * 0.15 + i * bry * 0.3) + 'Q' + bx + ' ' + (by - bry * 0.02 + i * bry * 0.3) + ' ' + (bx + brx * 0.4) + ' ' + (by - bry * 0.15 + i * bry * 0.3), 'none', ln(ch, 2) + ' opacity=".4"');
    return s;
  }
  function tail(ch, bx, by, brx, bry, st, spikes){
    var tx = bx + brx * (1.4 + st * 0.12), ty = by - bry * 0.1;
    var s = path('M' + (bx + brx * 0.6) + ' ' + (by + bry * 0.75) + 'Q' + (bx + brx * 1.5) + ' ' + (by + bry * 0.9) + ' ' + tx + ' ' + ty + 'Q' + (bx + brx * 1.2) + ' ' + (by + bry * 0.4) + ' ' + (bx + brx * 0.6) + ' ' + (by + bry * 0.2) + 'Z', ch.c1, ln(ch));
    if (spikes) s += path('M' + (tx - 4) + ' ' + (ty + 6) + 'l6 -14 4 12Z', '#fff3c4', ln(ch, 2));
    return s;
  }
  function wings(ch, x, y, k, kind){
    var s = '';
    [-1, 1].forEach(function(d){
      var t = 'translate(' + x + ' ' + y + ') scale(' + (d * k) + ' ' + k + ')';
      if (kind === 'bat') {
        s += '<path transform="' + t + '" d="M20 0C40-30 70-40 92-30C84-18 84-6 88 4C76 0 66 2 62 12C54 6 42 8 38 18C32 10 26 8 20 12Z" fill="' + ch.c3 + '" ' + ln(ch, 3 / k) + '/>';
      } else if (kind === 'butterfly') {
        s += '<g transform="' + t + '" opacity=".92"><path d="M14-4C30-44 78-46 70-10C66 6 40 6 14 2Z" fill="#ffd6ec" ' + ln(ch, 2.5 / k) + '/>' +
          '<path d="M14 4C40 8 62 18 52 36C40 50 20 30 12 10Z" fill="#ffb3d6" ' + ln(ch, 2.5 / k) + '/>' + circle(48, -16, 7, '#fff', '') + '</g>';
      } else {
        s += '<path transform="' + t + '" d="M18 0C30-30 64-44 90-38C80-28 86-22 78-16C86-10 78-4 72 0C76 6 66 10 60 10C60 18 46 18 40 16C32 18 24 12 18 8Z" fill="#ffffff" ' + ln(ch, 3 / k) + '/>';
      }
    });
    return s;
  }
  function cloudWings(ch, x, y, k){
    var s = '';
    [-1, 1].forEach(function(d){
      s += '<g transform="translate(' + x + ' ' + y + ') scale(' + (d * k) + ' ' + k + ')">' + circle(44, -6, 16, '#fff', ln(ch, 2.5)) + circle(64, -16, 14, '#fff', ln(ch, 2.5)) + circle(70, 4, 12, '#fff', ln(ch, 2.5)) + circle(50, 10, 12, '#fff', ln(ch, 2.5)) + '</g>';
    });
    return s;
  }
  function crown(ch, x, y, k){
    var gem = ch.type === 'cute' ? '#ff5c93' : '#3d7bf2';
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + k + ')">' +
      path('M-22 0L-26-24L-12-12L0-30L12-12L26-24L22 0Z', '#ffd84a', ln(ch, 2.5 / k)) +
      circle(0, -10, 4.5, gem, ln(ch, 1.5)) + circle(-26, -24, 3.5, gem) + circle(26, -24, 3.5, gem) + circle(0, -30, 3.5, gem) + '</g>';
  }

  // ------------------------------------------------------------ からだ
  function creature(ch, st){
    // 段階ごとの大きさ（頭 hx,hy,hr と からだ bx,by,brx,bry）
    var P = [null,
      { hx:100, hy:132, hr:38 },
      { hx:100, hy:114, hr:44, bx:100, by:150, brx:40, bry:28 },
      { hx:100, hy:84,  hr:40, bx:100, by:146, brx:36, bry:34 },
      { hx:100, hy:80,  hr:39, bx:100, by:142, brx:42, bry:38 },
      { hx:100, hy:78,  hr:40, bx:100, by:140, brx:45, bry:40 }][st];
    var robot = ch.motif === 'robot', L = ln(ch), s = '';
    if (st === 1) { P.bx = 100; P.by = 160; P.brx = 30; P.bry = 20; }
    var M = motif(ch, st, P), gid = 'p' + (++uid);

    s += '<defs><radialGradient id="' + gid + 'a"><stop offset="0" stop-color="' + (ch.type === 'cute' ? '#ffe3f1' : '#d9ecff') + '"/><stop offset=".6" stop-color="' + (ch.type === 'cute' ? '#ffd0e6' : '#bfe0ff') + '" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>';
    if (st === 5) {
      s += circle(100, 105, 98, 'url(#' + gid + 'a)');
      for (var i = 0; i < 12; i++) {
        var a = i * Math.PI / 6;
        s += path('M' + (100 + Math.cos(a) * 60).toFixed(1) + ' ' + (105 + Math.sin(a) * 60).toFixed(1) + 'L' + (100 + Math.cos(a) * 95).toFixed(1) + ' ' + (105 + Math.sin(a) * 95).toFixed(1), 'none', 'stroke="' + (ch.type === 'cute' ? '#ffb3d1' : '#9cc9ff') + '" stroke-width="4" stroke-linecap="round" opacity=".55"');
      }
    }
    s += ell(100, 188, 46 + st * 4, 7, 'rgba(0,0,0,.13)');
    s += '<g class="pet-bounce">';
    s += M.back;

    if (st === 1) {
      // タマゴのからに入った赤ちゃん
      s += M.behind;
      s += robot ? '<rect' + at({ x: P.hx - P.hr, y: P.hy - P.hr * 0.9, width: P.hr * 2, height: P.hr * 1.9, rx: P.hr * 0.6, fill: ch.c1 }) + ' ' + L + '/>' : circle(P.hx, P.hy, P.hr, ch.c1, L);
      s += face(ch, P) + M.front;
      s += path('M50 150L62 140L72 152L84 138L96 150L108 138L120 152L132 140L146 150C150 172 130 186 100 186C70 186 48 172 50 150Z', ch.egg[1], 'stroke="' + ch.egg[0] + '" stroke-width="3.5" stroke-linejoin="round"');
      s += '<g opacity=".7">' + (ch.type === 'cute' ? heart(80, 160, 0.7, ch.egg[0]) + heart(122, 164, 0.6, ch.egg[0]) : star(80, 166, 6, ch.egg[0]) + star(122, 168, 5, ch.egg[0])) + '</g>';
      return s + '</g>';
    }

    // 足
    [-1, 1].forEach(function(d){ s += ell(P.bx + d * P.brx * 0.5, P.by + P.bry * 0.9, 12 + st, 8 + st * 0.6, ch.c1, L); });
    // からだ
    s += robot ? '<rect' + at({ x: P.bx - P.brx, y: P.by - P.bry, width: P.brx * 2, height: P.bry * 2, rx: P.brx * 0.35, fill: ch.c1 }) + ' ' + L + '/>' : ell(P.bx, P.by, P.brx, P.bry, ch.c1, L);
    s += M.deco;
    // うで
    if (st >= 3) [-1, 1].forEach(function(d){ s += ell(P.bx + d * P.brx * 0.95, P.by - P.bry * 0.05, 9 + st, 15 + st * 1.5, ch.c1, L, d * -25); });
    else [-1, 1].forEach(function(d){ s += ell(P.bx + d * P.brx * 0.92, P.by, 7, 10, ch.c1, L, d * -30); });
    // 頭
    s += M.behind;
    s += robot ? '<rect' + at({ x: P.hx - P.hr, y: P.hy - P.hr * 0.85, width: P.hr * 2, height: P.hr * 1.75, rx: P.hr * 0.45, fill: ch.c1 }) + ' ' + L + '/>' : circle(P.hx, P.hy, P.hr, ch.c1, L);
    s += face(ch, P) + M.front;
    if (st === 5) {
      s += crown(ch, P.hx, P.hy - P.hr * (ch.motif === 'unicorn' || ch.motif === 'robot' || ch.motif === 'shark' ? 0.92 : 0.9), 0.9);
      [[32,52,10],[168,60,8],[40,150,7],[166,146,9],[150,28,6]].forEach(function(q){ s += sparkle(q[0], q[1], q[2], ch.type === 'cute' ? '#ff8fc0' : '#6fb6ff'); });
    } else if (st === 4) {
      [[40,60,7],[162,70,6]].forEach(function(q){ s += sparkle(q[0], q[1], q[2], ch.type === 'cute' ? '#ffb3d1' : '#9cc9ff'); });
    }
    return s + '</g>';
  }

  function svg(id, st, size){
    var ch = BY[id];
    if (!ch) return '';
    st = Math.max(0, Math.min(5, Number(st) || 0));
    var inner = st === 0 ? eggSvg(ch) : creature(ch, st);
    return '<svg class="pet-svg" viewBox="0 0 200 200" width="' + (size || 160) + '" height="' + (size || 160) + '" role="img" aria-label="' + ch.names[st] + '">' + inner + '</svg>';
  }

  return {
    STAGES: STAGES,
    list: LIST,
    get: function(id){ return BY[id]; },
    name: function(id, st){ var p = BY[id]; return p ? p.names[Math.max(0, Math.min(5, st))] : ''; },
    svg: svg,
    // アニメーション用のCSS（ページに1回だけ入れる）
    css: '.pet-svg{overflow:visible}.pet-wobble{transform-origin:100px 184px;animation:petWob 2.4s ease-in-out infinite}' +
      '.pet-bounce{transform-origin:100px 186px;animation:petBob 2s ease-in-out infinite}' +
      '@keyframes petWob{0%,100%{transform:rotate(0)}20%{transform:rotate(-6deg)}40%{transform:rotate(5deg)}60%{transform:rotate(-2deg)}}' +
      '@keyframes petBob{0%,100%{transform:translateY(0) scale(1,1)}50%{transform:translateY(-4px) scale(1.02,.98)}}' +
      '@media (prefers-reduced-motion:reduce){.pet-wobble,.pet-bounce{animation:none}}'
  };
})();
</script>
<script>
var SETTINGS = (function(){
  try { return JSON.parse('<?!= settings ?>'); } catch(e) {
    // Apps Script の外で開いたとき（体験モード）
    var w = null;
    try { w = JSON.parse(localStorage.getItem('furikaeri_demo_word') || 'null'); } catch(x) {}
    return { classes:{1:6,2:6,3:7}, maxNumber:35, maxPeriod:6, subject:'技術', needWord: !w || w.mode !== 'off', pets:true, growPerStage:3 };
  }
})();
var DEMO = typeof google === 'undefined' || !google.script;
var ME_KEY = 'furikaeri_me';
var $ = function(id){ return document.getElementById(id); };

function store(key, val){
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
    localStorage.setItem(key, JSON.stringify(val));
  } catch(e) { return null; }
}

function fillSelect(sel, n, unit, keep){
  var prev = keep ? sel.value : '';
  sel.innerHTML = '<option value="">選ぶ</option>';
  for (var i = 1; i <= n; i++) {
    var o = document.createElement('option');
    o.value = i; o.textContent = i + unit;
    sel.appendChild(o);
  }
  if (prev && Number(prev) <= n) sel.value = prev;
}

function setupForm(){
  $('title').textContent = SETTINGS.subject + ' 授業ふりかえり';
  var d = new Date(), w = '日月火水木金土'.charAt(d.getDay());
  $('today').textContent = (d.getMonth()+1) + '月' + d.getDate() + '日（' + w + '）の授業';
  if (DEMO) $('demoNote').classList.remove('hidden');
  if (SETTINGS.needWord) $('secW').classList.remove('hidden');

  var g = $('grade');
  g.innerHTML = '<option value="">選ぶ</option>';
  Object.keys(SETTINGS.classes).forEach(function(k){
    var o = document.createElement('option'); o.value = k; o.textContent = k + '年'; g.appendChild(o);
  });
  fillSelect($('cls'), 0, '組');
  fillSelect($('num'), SETTINGS.maxNumber, '番');
  if (SETTINGS.maxPeriod > 0) {
    fillSelect($('period'), SETTINGS.maxPeriod, '時間目');
  } else {
    $('periodBox').remove();
    $('whoRow').classList.add('three');
  }
  g.addEventListener('change', function(){
    fillSelect($('cls'), SETTINGS.classes[g.value] || 0, '組', true);
  });

  var me = store(ME_KEY);
  if (me) {
    g.value = me.grade || '';
    fillSelect($('cls'), SETTINGS.classes[g.value] || 0, '組');
    $('cls').value = me.cls || '';
    $('num').value = me.num || '';
    $('name').value = me.name || '';
  }
  if (SETTINGS.pets) {
    document.head.insertAdjacentHTML('beforeend', '<style>' + PETS.css + '</style>');
    ['grade','cls','num'].forEach(function(id){ $(id).addEventListener('change', loadTopPet); });
    loadTopPet();
  }

  [['uReason','uCount'],['pReason','pCount']].forEach(function(p){
    var t = $(p[0]), c = $(p[1]);
    var upd = function(){ c.textContent = t.value.trim().length + '文字'; };
    t.addEventListener('input', upd); upd();
  });
  document.querySelectorAll('select,input,textarea').forEach(function(el){
    el.addEventListener('change', function(){ var s = el.closest('.panel'); if (s) s.classList.remove('bad'); });
  });

  $('form').addEventListener('submit', onSubmit);
  $('again').addEventListener('click', function(){
    $('done').classList.add('hidden');
    $('form').classList.remove('hidden');
    if (SETTINGS.pets) loadTopPet();
    window.scrollTo(0, 0);
  });
}

function radio(name){
  var r = document.querySelector('input[name="' + name + '"]:checked');
  return r ? r.value : '';
}

function collect(){
  return {
    grade: $('grade').value, cls: $('cls').value, num: $('num').value,
    period: SETTINGS.maxPeriod > 0 ? $('period').value : '',
    name: $('name').value.trim(),
    understand: radio('understand'), understandReason: $('uReason').value.trim(),
    progress: radio('progress'), progressReason: $('pReason').value.trim(),
    question: $('question').value.trim(),
    word: $('word').value.trim()
  };
}

function check(r){
  if (!r.grade) return ['secWho','grade','学年を選んでください。'];
  if (!r.cls) return ['secWho','cls','組を選んでください。'];
  if (!r.num) return ['secWho','num','出席番号を選んでください。'];
  if (SETTINGS.maxPeriod > 0 && !r.period) return ['secWho','period','何時間目の授業か選んでください。'];
  if (!r.name) return ['secWho','name','氏名を入力してください。'];
  if (!r.understand) return ['secU','u-A','① 理解度を A・B・C から選んでください。'];
  if (!r.understandReason) return ['secU','uReason','① 理解度の理由を書いてください。'];
  if (!r.progress) return ['secP','p-A','② 進捗度を A・B・C から選んでください。'];
  if (!r.progressReason) return ['secP','pReason','② 進捗度の理由を書いてください。'];
  if (SETTINGS.needWord && !r.word) return ['secW','word','合言葉を入力してください。'];
  return null;
}

function onSubmit(ev){
  ev.preventDefault();
  var r = collect();
  var bad = check(r);
  document.querySelectorAll('.panel.bad').forEach(function(p){ p.classList.remove('bad'); });
  if (bad) {
    $(bad[0]).classList.add('bad');
    $('msg').textContent = bad[2];
    $(bad[0]).scrollIntoView({ behavior:'smooth', block:'center' });
    $(bad[1]).focus({ preventScroll:true });
    return;
  }
  $('msg').textContent = '';
  $('send').disabled = true;
  $('send').textContent = '送信中…';
  send(r, function(res){
    $('send').disabled = false;
    $('send').textContent = '送信する';
    if (!res || !res.ok) {
      $('msg').textContent = (res && res.message) || '送信できませんでした。もう一度ためしてください。';
      if (res && res.field === 'word') {
        // 先生が合言葉を使う設定にしたのが、このページを開いた後だった場合も入力欄を出す
        SETTINGS.needWord = true;
        $('secW').classList.remove('hidden');
        $('secW').classList.add('bad');
        $('word').select();
        $('word').focus();
      }
      return;
    }
    store(ME_KEY, { grade:r.grade, cls:r.cls, num:r.num, name:r.name });
    showDone(r);
    if (SETTINGS.pets && res.pet) showPetAfterSend(res.pet);
  });
}

function send(r, cb){
  if (DEMO) {
    var want = demoWord();
    if (want && demoNorm(r.word) !== demoNorm(want)) {
      setTimeout(function(){ cb({ ok:false, field:'word', message:'合言葉がちがいます。先生が黒板に書いた合言葉を入力してください。' }); }, 300);
      return;
    }
    var rows = store('furikaeri_demo_rows') || [];
    var d = new Date(), pad = function(n){ return ('0' + n).slice(-2); };
    var day = d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
    rows.push([day + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()), day,
      r.period ? Number(r.period) : '', Number(r.grade), Number(r.cls), Number(r.num), r.name,
      r.understand, r.understandReason, r.progress, r.progressReason, r.question, '']);
    store('furikaeri_demo_rows', rows);
    var pet = demoPet.grow(r, day + '#' + (r.period || ''));
    setTimeout(function(){ cb({ ok:true, pet:pet }); }, 300);
    return;
  }
  google.script.run
    .withSuccessHandler(cb)
    .withFailureHandler(function(e){ cb({ ok:false, message:'通信エラー：' + (e && e.message || e) + '　もう一度ためしてください。' }); })
    .submitReflection(r);
}

// 体験モード用の合言葉（本番では Code.gs が判定する）
function demoNorm(w){ return String(w || '').normalize('NFKC').replace(/\\s+/g, '').toLowerCase(); }
function demoDaily(day){
  var h = 2166136261;
  for (var i = 0; i < day.length; i++) { h ^= day.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return ('000' + (h % 10000)).slice(-4);
}
function demoWord(){
  var w = store('furikaeri_demo_word') || { mode:'daily', fixed:'' };
  var d = new Date(), pad = function(n){ return ('0' + n).slice(-2); };
  if (w.mode === 'off') return '';
  if (w.mode === 'fixed') return w.fixed;
  return demoDaily(d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()));
}

// ======================= キャラ育成 =======================
function serverCall(fn, args, ok, ng){
  if (DEMO) {
    setTimeout(function(){ try { ok(demoPet[fn].apply(null, args)); } catch(e) { ng(e); } }, 200);
    return;
  }
  var run = google.script.run.withSuccessHandler(ok).withFailureHandler(ng);
  run[fn].apply(run, args);
}

function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}

// 進化までの ●●○
function progressHtml(v){
  if (v.stage >= 5) return '<div class="dots">🎉 究極体まで育て上げた！</div>';
  var n = SETTINGS.growPerStage, have = v.points % n, dots = '';
  for (var i = 0; i < n; i++) dots += '<i class="' + (i < have ? 'on' : '') + '"></i>';
  return '<div class="dots">' + dots + '<span>あと<b>' + (n - have) + '回</b>で' + (v.stage === 0 ? 'うまれる！' : '進化！') + '</span></div>';
}

function zukanHtml(v){
  if (!v.done || !v.done.length) return '';
  return '<div class="zukan">図鑑：' + v.done.map(function(id){
    return '<span title="' + esc(PETS.name(id, 5)) + '">' + PETS.svg(id, 5, 40) + '</span>';
  }).join('') + '</div>';
}

// フォーム上の「わたしのキャラ」
var topReq = 0;
function loadTopPet(){
  var g = $('grade').value, c = $('cls').value, n = $('num').value, box = $('petTop');
  if (!g || !c || !n) { box.classList.add('hidden'); return; }
  var my = ++topReq;
  serverCall('getPet', [g, c, n], function(v){
    if (my !== topReq) return; // 選びなおしたあとの古い返事は使わない
    box.classList.remove('hidden');
    if (!v || !v.current) {
      box.innerHTML = '<div class="pic">' + PETS.svg('usa', 0, 80).replace('pet-svg', 'pet-svg" style="filter:grayscale(1);opacity:.35') + '</div>' +
        '<div class="info"><p class="petname">キャラを育てよう！</p><div class="muted">ふりかえりを送信すると、タマゴを1つ選べます。' + SETTINGS.growPerStage + '回送信するごとに進化します。</div>' + (v ? zukanHtml(v) : '') + '</div>';
      return;
    }
    box.innerHTML = '<div class="pic">' + PETS.svg(v.current, v.stage, 120) + '</div><div class="info">' +
      '<p class="petname">' + esc(PETS.name(v.current, v.stage)) + '<span class="petstage">' + PETS.STAGES[v.stage] + '</span></p>' +
      progressHtml(v) + (v.stage >= 5 ? '<div class="muted">次にふりかえりを送信すると、新しいタマゴを選べます。</div>' : '') + zukanHtml(v) + '</div>';
  }, function(){ box.classList.add('hidden'); });
}

var COUNT_MSG = {
  ok: '育成ポイント +1！',
  same: '同じ授業の2回目の送信なので、育成ポイントは増えません。',
  limit: '今日はもう育成ポイントをもらったので、続きは次の授業で！'
};

function showPetAfterSend(v){
  var box = $('petDone');
  box.classList.remove('hidden');
  $('sentBox').open = false;
  if (v.needEgg) {
    var head = '';
    if (v.current && v.stage >= 5) {
      head = '<div class="petstage-area" id="evoArea">' + PETS.svg(v.current, v.evolved ? v.from : 5, 150) + '</div>' +
        '<p class="petmsg" id="evoMsg"></p>';
    }
    box.innerHTML = head + eggChooserHtml(v);
    bindEggChooser(v);
    if (v.current && v.evolved) runEvolution(v.current, v.from, 5, function(){ $('evoMsg').textContent = '究極体まで育て上げた！ 新しいタマゴを選べるよ（次回でもOK）'; });
    else if (v.current) $('evoMsg').textContent = '究極体まで育て上げた！ 新しいタマゴを選ぼう';
    return;
  }
  var cool = (PETS.get(v.current) || {}).type === 'cool' ? ' cool' : '';
  box.innerHTML = '<div class="petstage-area" id="evoArea">' + PETS.svg(v.current, v.evolved ? v.from : v.stage, 150) + '</div>' +
    '<p class="petname" id="evoName">' + esc(PETS.name(v.current, v.evolved ? v.from : v.stage)) + '<span class="petstage">' + PETS.STAGES[v.evolved ? v.from : v.stage] + '</span></p>' +
    '<p class="petmsg' + cool + '" id="evoMsg">' + esc(COUNT_MSG[v.counted] || '') + '</p>' +
    '<div id="evoProg">' + progressHtml(v) + '</div>';
  if (v.evolved) {
    $('evoProg').style.visibility = 'hidden';
    runEvolution(v.current, v.from, v.stage, function(){
      $('evoName').innerHTML = esc(PETS.name(v.current, v.stage)) + '<span class="petstage">' + PETS.STAGES[v.stage] + '</span>';
      $('evoMsg').textContent = v.from === 0
        ? 'タマゴがかえって「' + PETS.name(v.current, v.stage) + '」がうまれた！'
        : '「' + PETS.name(v.current, v.from) + '」は「' + PETS.name(v.current, v.stage) + '」に進化した！';
      $('evoProg').style.visibility = '';
    });
  }
}

// 進化の演出：ぶるぶる → ピカッ → 新しい姿
function runEvolution(id, from, to, done){
  var a = $('evoArea');
  a.classList.add('evo-shake');
  setTimeout(function(){
    a.classList.remove('evo-shake');
    a.classList.add('evo-flash');
    setTimeout(function(){
      a.innerHTML = PETS.svg(id, to, 150);
      a.classList.remove('evo-flash');
      a.classList.add('evo-pop');
      done();
    }, 450);
  }, 1100);
}

function eggChooserHtml(v){
  var done = v.done || [], cur = v.current && v.stage >= 5 ? done.concat([v.current]) : done;
  var all = PETS.list.every(function(p){ return cur.indexOf(p.id) >= 0; });
  var group = function(type, title){
    return '<h3 class="' + type + '">' + title + '</h3><div class="egg-grid">' + PETS.list.filter(function(p){ return p.type === type; }).map(function(p){
      var finished = cur.indexOf(p.id) >= 0;
      return '<button type="button" class="egg-btn ' + type + '" data-id="' + p.id + '"' + (finished && !all ? ' disabled' : '') + '>' +
        (finished ? '<span class="badge">育てた！</span>' : '') + PETS.svg(p.id, 0, 90) + '<br>' + esc(p.names[0]) + '</button>';
    }).join('') + '</div>';
  };
  return '<div class="eggs"><h2 style="margin-top:.6rem">🥚 タマゴを1つ選んでね</h2>' +
    group('cute', '💗 かわいい系（ピンクのタマゴ）') + group('cool', '💙 かっこいい系（青のタマゴ）') +
    '<button type="button" class="btn pet" id="eggGo" disabled>タマゴを選んでね</button><p class="msg" id="eggMsg"></p></div>';
}

function bindEggChooser(v){
  var chosen = '';
  document.querySelectorAll('.egg-btn').forEach(function(b){
    b.addEventListener('click', function(){
      document.querySelectorAll('.egg-btn').forEach(function(x){ x.classList.remove('sel'); });
      b.classList.add('sel');
      chosen = b.getAttribute('data-id');
      $('eggGo').disabled = false;
      $('eggGo').textContent = '「' + PETS.name(chosen, 0) + '」を育てる！';
    });
  });
  $('eggGo').addEventListener('click', function(){
    if (!chosen) return;
    $('eggGo').disabled = true;
    $('eggGo').textContent = '準備中…';
    serverCall('chooseEgg', [v.token, chosen], function(nv){
      var box = $('petDone');
      box.innerHTML = '<div class="petstage-area evo-pop">' + PETS.svg(nv.current, 0, 150) + '</div>' +
        '<p class="petname">' + esc(PETS.name(nv.current, 0)) + '<span class="petstage">タマゴ</span></p>' +
        '<p class="petmsg' + ((PETS.get(nv.current) || {}).type === 'cool' ? ' cool' : '') + '">タマゴを手に入れた！' + (nv.counted === 'ok' ? '（今回の送信も育成ポイントに入ったよ）' : '') + '</p>' + progressHtml(nv);
    }, function(e){
      $('eggGo').disabled = false;
      $('eggGo').textContent = 'もう一度ためす';
      $('eggMsg').textContent = (e && e.message) || String(e);
    });
  });
}

// 体験モード用（本番では Apps Script 側で同じことをします）
var demoPet = (function(){
  var KEY = 'furikaeri_demo_pets';
  function all(){ return store(KEY) || {}; }
  function view(p){
    var st = p.current ? Math.min(5, Math.floor(p.points / SETTINGS.growPerStage)) : 0;
    return { current:p.current, points:p.points, stage:st, done:p.done.slice(), needEgg: !p.current || st === 5 };
  }
  function count(p, lesson){
    var day = lesson.split('#')[0];
    if (p.day !== day) { p.day = day; p.lessons = []; }
    if (p.lessons.indexOf(lesson) >= 0) return 'same';
    if (p.lessons.length >= 2) return 'limit';
    p.lessons.push(lesson); return 'ok';
  }
  return {
    grow: function(r, lesson){
      var db = all(), key = r.grade + '-' + r.cls + '-' + r.num;
      var p = db[key] || { current:'', points:0, day:'', lessons:[], done:[] };
      var before = p.current ? Math.min(5, Math.floor(p.points / SETTINGS.growPerStage)) : -1, counted = 'none';
      if (p.current && before < 5) { counted = count(p, lesson); if (counted === 'ok') p.points++; }
      db[key] = p; store(KEY, db);
      var v = view(p);
      v.counted = counted; v.from = before; v.evolved = before >= 0 && v.stage > before;
      if (v.needEgg) v.token = key + '|' + lesson;
      return v;
    },
    chooseEgg: function(token, id){
      var t = token.split('|'), db = all(), p = db[t[0]];
      if (!p || !view(p).needEgg) throw new Error('もうタマゴを選んでいます。');
      if (p.current) p.done.push(p.current);
      p.current = id; p.points = 0;
      var c = count(p, t[1]); if (c === 'ok') p.points = 1;
      store(KEY, db);
      var v = view(p); v.counted = c; return v;
    },
    getPet: function(g, c, n){ var p = all()[g + '-' + c + '-' + n]; return p ? view(p) : null; }
  };
})();

function showDone(r){
  var items = [
    ['クラス', r.grade + '年' + r.cls + '組 ' + r.num + '番 ' + r.name + (r.period ? '（' + r.period + '時間目）' : '')],
    ['理解度', r.understand + '　' + r.understandReason],
    ['進捗度', r.progress + '　' + r.progressReason]
  ];
  if (r.question) items.push(['質問など', r.question]);
  $('petDone').classList.add('hidden');
  $('petTop').classList.add('hidden'); // 送信後は下の結果にキャラを出す
  $('sentBox').open = true;
  var dl = $('summary'); dl.innerHTML = '';
  items.forEach(function(it){
    var dt = document.createElement('dt'); dt.textContent = it[0];
    var dd = document.createElement('dd'); dd.textContent = it[1];
    dl.appendChild(dt); dl.appendChild(dd);
  });
  // 次の時間のために、回答欄だけ空にする（学年・組・番号・氏名は残す）
  document.querySelectorAll('input[type=radio]').forEach(function(x){ x.checked = false; });
  ['uReason','pReason','question','word'].forEach(function(id){ $(id).value = ''; $(id).dispatchEvent(new Event('input')); });
  $('form').classList.add('hidden');
  $('done').classList.remove('hidden');
  window.scrollTo(0, 0);
}

setupForm();
</script>
</body>
</html>
`;

// 先生用ページ
const TEACHER_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
<base target="_top">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ふりかえり 集計（先生用）</title>
<style>
:root{
  --ink:#1c2430; --ink2:#55637a; --line:#d7dee9; --bg:#f4f7fb; --panel:#fff;
  --accent:#2f6fd0; --err:#c92a2a;
  --a:#0f7b46; --b:#2f6fd0; --c:#d9480f; --a-bg:#e3f6ec; --b-bg:#e6efff; --c-bg:#ffe9df;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);line-height:1.6;font-size:15px;
  font-family:"BIZ UDPGothic","Hiragino Kaku Gothic ProN","Yu Gothic UI","Meiryo",system-ui,sans-serif}
header{background:linear-gradient(100deg,#2f6fd0,#4C97FF 60%,#0FBD8C);color:#fff;padding:.7rem 1rem 0}
.hrow{max-width:1280px;margin:0 auto;display:flex;align-items:center;gap:.8rem;flex-wrap:wrap}
header h1{margin:0;font-size:1.2rem}
nav{max-width:1280px;margin:.5rem auto 0;display:flex;gap:.25rem;flex-wrap:wrap}
nav button{background:rgba(255,255,255,.8);border:none;border-radius:10px 10px 0 0;padding:.45rem 1rem;font:inherit;
  font-weight:700;color:#2b3a52;cursor:pointer;opacity:.75}
nav button[aria-selected=true]{background:var(--bg);color:var(--accent);opacity:1}
main{max-width:1280px;margin:0 auto;padding:1rem 1rem 3rem}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:1rem;margin-bottom:1rem;
  box-shadow:0 2px 6px rgba(28,36,48,.08)}
h2{font-size:1.1rem;margin:0 0 .5rem}
.ctrl{display:flex;gap:.6rem;flex-wrap:wrap;align-items:flex-end}
.ctrl label{font-size:.8rem;color:var(--ink2);font-weight:700;display:block}
select,input{font:inherit;padding:.4rem .5rem;border:2px solid var(--line);border-radius:8px;background:#fff;color:var(--ink)}
.btn{background:var(--accent);color:#fff;border:none;border-radius:8px;padding:.5rem 1rem;font:inherit;font-weight:700;cursor:pointer}
.btn.sub{background:#fff;color:var(--accent);border:2px solid var(--accent);padding:.4rem .8rem}
.btn:disabled{opacity:.6}
.muted{color:var(--ink2);font-size:.85rem}
.err{color:var(--err);font-weight:700}
.tablewrap{overflow:auto;max-height:75vh;border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;background:#fff;font-size:.86rem;width:100%}
th,td{border:1px solid var(--line);padding:.3rem .45rem;vertical-align:top;text-align:left}
th{background:#eef3fa;position:sticky;top:0;z-index:1;white-space:nowrap}
td.n,th.n{text-align:right;white-space:nowrap}
td.c{text-align:center;white-space:nowrap}
.mx td.cell{text-align:center;cursor:pointer;white-space:nowrap;font-weight:700;padding:.2rem .3rem}
.mx td.cell:hover{outline:2px solid var(--accent)}
.mx th.stu,.mx td.stu{position:sticky;left:0;background:#fff;z-index:2;white-space:nowrap}
.mx th.stu{background:#eef3fa;z-index:3}
.mx td.stu a{color:var(--accent);cursor:pointer;text-decoration:underline}
.mx tfoot td{background:#f7f9fc;font-size:.8rem}
.L{display:inline-block;min-width:1.5em;border-radius:4px;text-align:center;font-weight:700}
.LA{background:var(--a-bg);color:var(--a)} .LB{background:var(--b-bg);color:var(--b)} .LC{background:var(--c-bg);color:var(--c)}
.wrap{white-space:pre-wrap;word-break:break-word;min-width:12em}
.q{background:#fff8e8}
.stats{display:flex;gap:1rem;flex-wrap:wrap}
.stat{border:1px solid var(--line);border-radius:10px;padding:.6rem .9rem;min-width:15rem;flex:1}
.stat h3{margin:0 0 .3rem;font-size:.95rem}
.dist{display:flex;height:22px;border-radius:5px;overflow:hidden;background:#eef2f7;margin:.2rem 0}
.dist i{display:block;height:100%;color:#fff;font-style:normal;font-size:.75rem;text-align:center;line-height:22px;overflow:hidden}
.dist .A{background:var(--a)} .dist .B{background:var(--b)} .dist .C{background:var(--c)}
.big{font-size:1.5rem;font-weight:800}
.strip{display:flex;gap:2px;flex-wrap:wrap;margin:.3rem 0}
.strip span{width:1.4rem;height:1.4rem;border-radius:3px;font-size:.7rem;font-weight:700;display:grid;place-items:center}
.legend{font-size:.8rem;color:var(--ink2)}
.chk{font-size:.85rem;display:inline-flex;align-items:center;gap:.25rem;margin-right:.8rem}
.btn.del{background:#fff;color:var(--err);border:2px solid var(--err);padding:.4rem .8rem}
td.sel,th.sel{width:2rem;text-align:center}
td.sel input,th.sel input{width:1.1rem;height:1.1rem}
tr.picked td{background:#fff1f1}
.delbar{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin:.6rem 0}
.demo{background:#fff8e8;border-left:5px solid #ffbf00;border-radius:6px;padding:.5rem .8rem;font-size:.85rem;margin-bottom:1rem}
#login{max-width:420px;margin:3rem auto}
.wordbox{display:flex;gap:1.2rem;flex-wrap:wrap;align-items:center}
.wordnow{border:2px dashed #9dbbe6;border-radius:12px;padding:.4rem 1.2rem;text-align:center;min-width:12rem;background:#f7fbff}
.wordnow b{display:block;font-size:2.2rem;letter-spacing:.15em;line-height:1.2}
.wordset{display:flex;flex-direction:column;gap:.25rem;font-size:.9rem}
.wordset label{display:inline-flex;align-items:center;gap:.35rem}
#wordFull{position:fixed;inset:0;background:#fff;z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer}
#wordFull p{font-size:4vw;margin:0;color:var(--ink2)}
#wordFull b{font-size:22vw;line-height:1.1;letter-spacing:.1em;color:var(--ink)}
#wordFull b.long{font-size:12vw}
.hidden{display:none !important}
@media print{
  header,nav,.noprint,.demo{display:none !important}
  body{background:#fff;font-size:11px}
  .panel{box-shadow:none;border:none;padding:0}
  .tablewrap{max-height:none;overflow:visible;border:none}
  th{position:static}
  .mx th.stu,.mx td.stu{position:static}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style>
</head>
<body>
<header>
  <div class="hrow"><h1>📊 授業ふりかえり 集計（先生用）</h1></div>
  <nav class="hidden" id="tabs" role="tablist">
    <button role="tab" data-tab="class" aria-selected="true">🏫 クラス一覧</button>
    <button role="tab" data-tab="lesson" aria-selected="false">📅 授業ごと</button>
    <button role="tab" data-tab="person" aria-selected="false">👤 個人</button>
  </nav>
</header>

<main>
  <div id="demoNote" class="demo hidden">【体験モード】Apps Script の外で開いています。サンプルデータ（1年1組・2年3組）を表示します。パスコードは <b>demo</b> です。</div>

  <section class="panel" id="login">
    <h2>🔒 パスコードを入力</h2>
    <form id="loginForm" class="ctrl">
      <input type="password" id="pass" autocomplete="current-password" style="flex:1">
      <button class="btn" type="submit">ひらく</button>
    </form>
    <p class="err" id="loginMsg"></p>
  </section>

  <div id="app" class="hidden">
    <section class="panel noprint" id="wordPanel">
      <h2>🔑 合言葉（生徒が送信するときに必要）</h2>
      <div class="wordbox">
        <div class="wordnow"><span class="muted" id="wordDate">今日の合言葉</span><b id="wordNow">…</b>
          <button class="btn sub" id="wordShow" style="margin:.2rem 0 .3rem">大きく表示</button></div>
        <div class="wordset">
          <label><input type="radio" name="wmode" value="daily">毎日自動でかわる（4けたの数字・おすすめ）</label>
          <label><input type="radio" name="wmode" value="fixed">自分で決める：<input type="text" id="wordFixed" maxlength="20" style="width:10rem" placeholder="例）はんだ"></label>
          <label><input type="radio" name="wmode" value="off">使わない</label>
          <div class="ctrl" style="margin-top:.3rem">
            <button class="btn" id="wordSave">設定を保存</button>
            <button class="btn sub" id="wordRenew" title="毎日の合言葉が外部に知られてしまったときに使います">毎日の合言葉を作り直す</button>
          </div>
          <span class="muted" id="wordMsg"></span>
        </div>
      </div>
    </section>
    <div id="wordFull" class="hidden" title="クリックで閉じる"><p id="wordFullDate"></p><b id="wordFullText"></b><p>（クリックで閉じる）</p></div>

    <section class="panel noprint">
      <div class="ctrl">
        <div><label for="fGrade">学年</label><select id="fGrade"></select></div>
        <div><label for="fCls">組</label><select id="fCls"></select></div>
        <div><label for="fFrom">期間（から）</label><input type="date" id="fFrom"></div>
        <div><label for="fTo">（まで）</label><input type="date" id="fTo"></div>
        <button class="btn" id="load">表示する</button>
        <button class="btn sub" id="csv" disabled>CSV保存</button>
        <button class="btn sub" id="print">印刷</button>
      </div>
      <p class="muted" id="status">学年と組を選んで「表示する」を押してください。</p>
    </section>

    <!-- クラス一覧 -->
    <section class="panel tab" id="t-class">
      <h2 id="classTitle">クラス一覧</h2>
      <p class="legend noprint">各マスは「理解度／進捗度」。マスを押すとその授業の一覧、氏名を押すと個人のページを開きます。平均は A=3・B=2・C=1 で計算。</p>
      <div class="tablewrap" id="matrix"></div>
    </section>

    <!-- 授業ごと -->
    <section class="panel tab hidden" id="t-lesson">
      <div class="ctrl noprint" style="margin-bottom:.6rem">
        <div><label for="lessonSel">授業（日付・時限）</label><select id="lessonSel"></select></div>
        <label class="chk"><input type="checkbox" id="onlyQ">質問・感想ありのみ</label>
        <label class="chk"><input type="checkbox" id="onlyC">C をつけた生徒のみ</label>
      </div>
      <h2 id="lessonTitle"></h2>
      <div class="stats" id="lessonStats"></div>
      <p id="missing" class="muted"></p>
      <div class="delbar noprint">
        <button class="btn del" id="delLessonSel">選んだ回答を削除</button>
        <button class="btn del" id="delLessonAll">この授業の回答をすべて削除</button>
        <span class="muted">試しに取った回答などを消せます。消した回答はスプレッドシートの「削除済み」シートに移ります。</span>
      </div>
      <div class="tablewrap" id="lessonTable"></div>
    </section>

    <!-- 個人 -->
    <section class="panel tab hidden" id="t-person">
      <div class="ctrl noprint" style="margin-bottom:.6rem">
        <div><label for="personSel">生徒</label><select id="personSel"></select></div>
        <button class="btn sub" id="prevP">◀ 前の番号</button>
        <button class="btn sub" id="nextP">次の番号 ▶</button>
      </div>
      <h2 id="personTitle"></h2>
      <div class="stats" id="personStats"></div>
      <div class="delbar noprint">
        <button class="btn del" id="delPersonSel">選んだ回答を削除</button>
      </div>
      <div class="tablewrap" id="personTable"></div>
    </section>
  </div>
</main>

<script>
var SETTINGS = (function(){
  try { return JSON.parse('<?!= settings ?>'); } catch(e) {
    return { classes:{1:6,2:6,3:7}, maxNumber:35, maxPeriod:6, subject:'技術' };
  }
})();
var DEMO = typeof google === 'undefined' || !google.script;
var COLS = ['送信日時','授業日','時限','学年','組','番号','氏名','理解度','理解度の理由','進捗度','進捗度の理由','質問・感想','アカウント'];
var I = { stamp:0, date:1, period:2, grade:3, cls:4, num:5, name:6, u:7, uR:8, p:9, pR:10, q:11, mail:12, row:13 };
var SCORE = { A:3, B:2, C:1 };
var PASS = '';
var state = { rows:[], grade:0, cls:0, lessons:[], students:[] };
var $ = function(id){ return document.getElementById(id); };

function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}
function L(v){ return v ? '<span class="L L' + esc(v) + '">' + esc(v) + '</span>' : ''; }
function avg(list){
  var s = 0, n = 0;
  list.forEach(function(v){ if (SCORE[v]) { s += SCORE[v]; n++; } });
  return n ? (s / n).toFixed(2) : '－';
}
function count(list){
  var c = { A:0, B:0, C:0 };
  list.forEach(function(v){ if (c[v] != null) c[v]++; });
  return c;
}
function lessonKey(r){ return r[I.date] + '#' + (r[I.period] === '' ? '' : r[I.period]); }
function lessonLabel(k, short){
  var p = k.split('#'), d = p[0].split('-');
  var dt = new Date(Number(d[0]), Number(d[1]) - 1, Number(d[2]));
  var s = Number(d[1]) + '/' + Number(d[2]);
  if (!short) s += '（' + '日月火水木金土'.charAt(dt.getDay()) + '）';
  if (p[1]) s += short ? '<br>' + p[1] + '限' : ' ' + p[1] + '時間目';
  return s;
}

// ---------------- 通信（本番は google.script.run／体験モードはサンプル） ----------------
function call(fn, args, ok, ng){
  if (DEMO) {
    setTimeout(function(){
      try { ok(demoApi[fn].apply(null, args)); } catch(e) { ng(e); }
    }, 150);
    return;
  }
  var r = google.script.run.withSuccessHandler(ok).withFailureHandler(ng);
  r[fn].apply(r, args);
}

var demoApi = {
  getWordSettings: function(p){
    demoApi.teacherLogin(p);
    var w = {};
    try { w = JSON.parse(localStorage.getItem('furikaeri_demo_word') || '{}') || {}; } catch(e) {}
    var mode = w.mode || 'daily', d = todayStr();
    return { mode:mode, fixed:w.fixed || '', date:d,
      current: mode === 'fixed' ? w.fixed : mode === 'daily' ? demoDaily(d) : '' };
  },
  setWordSettings: function(p, v){
    demoApi.teacherLogin(p);
    if (v.mode === 'fixed' && !String(v.fixed || '').trim()) throw new Error('合言葉を入力してください。');
    var old = demoApi.getWordSettings(p);
    localStorage.setItem('furikaeri_demo_word', JSON.stringify({ mode:v.mode, fixed: v.mode === 'fixed' ? String(v.fixed).trim() : old.fixed }));
    return demoApi.getWordSettings(p);
  },
  deleteResponses: function(p, items){
    demoApi.teacherLogin(p);
    var gone = demoDeleted();
    items.forEach(function(it){ gone[it.row] = true; });
    localStorage.setItem('furikaeri_demo_deleted', JSON.stringify(gone));
    return { deleted: items.length };
  },
  teacherLogin: function(p){ if (p !== 'demo') throw new Error('パスコードが違います。（体験モードは demo）'); return true; },
  getResponses: function(p, f){
    demoApi.teacherLogin(p);
    var rows = demoSample();
    try { rows = rows.concat(JSON.parse(localStorage.getItem('furikaeri_demo_rows') || '[]')); } catch(e) {}
    var gone = demoDeleted();
    rows.forEach(function(r, i){ r[I.row] = 'd' + i; });
    return rows.filter(function(r){
      if (gone[r[I.row]]) return false;
      return (!f.grade || r[I.grade] == f.grade) && (!f.cls || r[I.cls] == f.cls) &&
        (!f.from || r[I.date] >= f.from) && (!f.to || r[I.date] <= f.to);
    });
  }
};
function demoDeleted(){
  try { return JSON.parse(localStorage.getItem('furikaeri_demo_deleted') || '{}') || {}; } catch(e) { return {}; }
}
function todayStr(){
  var d = new Date(), pad = function(n){ return ('0' + n).slice(-2); };
  return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
}
// 体験モード用（Form.html と同じ計算。本番の合言葉は Code.gs が計算する）
function demoDaily(day){
  var h = 2166136261;
  for (var i = 0; i < day.length; i++) { h ^= day.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return ('000' + (h % 10000)).slice(-4);
}
function demoSample(){
  var seed = 7;
  var rnd = function(){ seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  var fam = ['佐藤','鈴木','高橋','田中','伊藤','渡辺','山本','中村','小林','加藤','吉田','山田','佐々木','山口','松本','井上','木村','林','斎藤','清水'];
  var giv = ['陽翔','結菜','蓮','葵','湊','陽葵','大和','凛','悠真','芽依','律','紬','蒼','美桜','樹','咲良','颯','杏','奏太','心春'];
  var uR = { A:['設計の手順を自分で説明できる','先生の例を見て、すぐに自分でもできた','前回の疑問が解決した'],
             B:['だいたいわかったが、計算の部分が少し不安','教科書を見ればできる','友達に聞いて理解できた'],
             C:['どのブロックを使えばいいかわからなかった','欠席していたので前の内容がわからない','用語の意味がよくわからなかった'] };
  var pR = { A:['予定より早く組み立てが終わった','次の工程まで進めた'],
             B:['予定どおり部品の加工が終わった','今日の目標まではできた'],
             C:['寸法をまちがえて作り直した','道具の使い方に時間がかかった','説明を聞いていて作業時間が足りなかった'] };
  var qs = ['次の時間までに何を準備すればいいですか','','','','やすりのかけ方をもう一度教えてほしい','','楽しかった','','',''];
  var pick = function(a){ return a[Math.floor(rnd() * a.length)]; };
  var lvl = function(bias){ var x = rnd() + bias; return x > .75 ? 'A' : x > .3 ? 'B' : 'C'; };
  var rows = [], base = new Date(); base.setDate(base.getDate() - 7 * 9);
  [[1,1,32,3],[2,3,30,5]].forEach(function(c){
    for (var w = 0; w < 9; w++) {
      var d = new Date(base); d.setDate(base.getDate() + w * 7 + c[0]);
      var ds = d.getFullYear() + '-' + ('0' + (d.getMonth()+1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      for (var n = 1; n <= c[2]; n++) {
        if (rnd() < .07) continue; // 未提出
        var bias = ((n * 37) % 10) / 25 - .15;
        var u = lvl(bias), p = lvl(bias + w / 60);
        rows.push([ds + ' 1' + c[3] + ':4' + (n % 10), ds, c[3], c[0], c[1], n,
          fam[(n * 7 + c[1]) % fam.length] + ' ' + giv[(n * 3 + c[0]) % giv.length],
          u, pick(uR[u]), p, pick(pR[p]), pick(qs), '']);
      }
    }
  });
  return rows;
}

// ---------------- ログイン ----------------
function initLogin(){
  if (DEMO) $('demoNote').classList.remove('hidden');
  try { PASS = sessionStorage.getItem('furikaeri_pass') || ''; } catch(e) {}
  $('loginForm').addEventListener('submit', function(ev){
    ev.preventDefault(); login($('pass').value);
  });
  if (PASS) login(PASS);
}
function login(p){
  $('loginMsg').textContent = '確認中…';
  call('teacherLogin', [p], function(){
    PASS = p;
    try { sessionStorage.setItem('furikaeri_pass', p); } catch(e) {}
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('tabs').classList.remove('hidden');
    initApp();
  }, function(e){
    try { sessionStorage.removeItem('furikaeri_pass'); } catch(x) {}
    $('loginMsg').textContent = (e && e.message) || String(e);
  });
}

// ---------------- 画面の準備 ----------------
var inited = false;
function initApp(){
  if (inited) return; inited = true;
  var g = $('fGrade');
  g.innerHTML = '<option value="">選ぶ</option>';
  Object.keys(SETTINGS.classes).forEach(function(k){ g.innerHTML += '<option value="' + k + '">' + k + '年</option>'; });
  var fillCls = function(){
    var n = SETTINGS.classes[g.value] || 0, prev = $('fCls').value;
    var h = '<option value="">選ぶ</option>';
    for (var i = 1; i <= n; i++) h += '<option value="' + i + '">' + i + '組</option>';
    $('fCls').innerHTML = h;
    if (prev && prev <= n) $('fCls').value = prev;
  };
  g.addEventListener('change', fillCls); fillCls();

  document.querySelectorAll('nav button').forEach(function(b){
    b.addEventListener('click', function(){ showTab(b.getAttribute('data-tab')); });
  });
  $('load').addEventListener('click', load);
  $('csv').addEventListener('click', downloadCsv);
  $('print').addEventListener('click', function(){ window.print(); });
  $('lessonSel').addEventListener('change', renderLesson);
  $('onlyQ').addEventListener('change', renderLesson);
  $('onlyC').addEventListener('change', renderLesson);
  $('personSel').addEventListener('change', renderPerson);
  $('prevP').addEventListener('click', function(){ stepPerson(-1); });
  $('nextP').addEventListener('click', function(){ stepPerson(1); });
  $('delLessonSel').addEventListener('click', function(){ deleteRows(picked('lessonTable', state.lessonShown)); });
  $('delLessonAll').addEventListener('click', function(){
    var k = $('lessonSel').value;
    // 同じ生徒が2回以上送った分（一覧には最後の1件だけ表示）もまとめて消す
    deleteRows(state.rows.filter(function(r){ return lessonKey(r) === k; }), lessonLabel(k) + ' の回答すべて');
  });
  $('delPersonSel').addEventListener('click', function(){ deleteRows(picked('personTable', state.personShown)); });
  ['lessonTable','personTable'].forEach(function(id){
    $(id).addEventListener('change', function(ev){
      var t = ev.target;
      if (!t.classList.contains('pick')) return;
      if (t.hasAttribute('data-all')) {
        $(id).querySelectorAll('input.pick[data-i]').forEach(function(c){ c.checked = t.checked; c.closest('tr').classList.toggle('picked', t.checked); });
      } else {
        t.closest('tr').classList.toggle('picked', t.checked);
      }
    });
  });

  $('wordSave').addEventListener('click', function(){ saveWord(false); });
  $('wordRenew').addEventListener('click', function(){
    if (confirm('毎日の合言葉の並びを作り直します。今日の合言葉も変わります。よろしいですか？')) saveWord(true);
  });
  $('wordShow').addEventListener('click', function(){ $('wordFull').classList.remove('hidden'); });
  $('wordFull').addEventListener('click', function(){ $('wordFull').classList.add('hidden'); });
  $('wordFixed').addEventListener('focus', function(){ document.querySelector('input[name=wmode][value=fixed]').checked = true; });
  call('getWordSettings', [PASS], showWord, function(e){ $('wordMsg').textContent = (e && e.message) || e; });

  try {
    var last = JSON.parse(localStorage.getItem('furikaeri_teacher_last') || 'null');
    if (last) { g.value = last.grade; fillCls(); $('fCls').value = last.cls; if ($('fCls').value) load(); }
  } catch(e) {}
}

// ---------------- 合言葉 ----------------
function showWord(w){
  var r = document.querySelector('input[name=wmode][value="' + w.mode + '"]');
  if (r) r.checked = true;
  $('wordFixed').value = w.fixed || '';
  var d = w.date.split('-'), label = Number(d[1]) + '月' + Number(d[2]) + '日の合言葉';
  var text = w.mode === 'off' ? 'なし' : w.current;
  $('wordDate').textContent = w.mode === 'daily' ? label : '現在の合言葉';
  $('wordNow').textContent = text;
  $('wordShow').classList.toggle('hidden', w.mode === 'off');
  $('wordFullDate').textContent = (w.mode === 'daily' ? label : '合言葉') + '（ふりかえりの送信に使います）';
  $('wordFullText').textContent = text;
  $('wordFullText').classList.toggle('long', String(text).length > 5);
}
function saveWord(renew){
  var m = document.querySelector('input[name=wmode]:checked');
  if (!m) { $('wordMsg').textContent = 'どれかを選んでください。'; return; }
  $('wordMsg').textContent = '保存中…';
  call('setWordSettings', [PASS, { mode:m.value, fixed:$('wordFixed').value, renew:renew }], function(w){
    showWord(w); $('wordMsg').textContent = '保存しました。';
  }, function(e){ $('wordMsg').textContent = (e && e.message) || e; });
}

function showTab(name){
  document.querySelectorAll('nav button').forEach(function(b){
    b.setAttribute('aria-selected', b.getAttribute('data-tab') === name ? 'true' : 'false');
  });
  document.querySelectorAll('.tab').forEach(function(s){ s.classList.toggle('hidden', s.id !== 't-' + name); });
}

function load(){
  var grade = $('fGrade').value, cls = $('fCls').value;
  if (!grade || !cls) { $('status').innerHTML = '<span class="err">学年と組を選んでください。</span>'; return; }
  $('status').textContent = '読み込み中…';
  $('load').disabled = true;
  try { localStorage.setItem('furikaeri_teacher_last', JSON.stringify({ grade:grade, cls:cls })); } catch(e) {}
  var f = { grade:grade, cls:cls, from:$('fFrom').value, to:$('fTo').value };
  call('getResponses', [PASS, f], function(rows){
    $('load').disabled = false;
    state.grade = Number(grade); state.cls = Number(cls);
    build(rows || []);
    $('csv').disabled = !state.rows.length;
    $('status').textContent = grade + '年' + cls + '組：' + state.rows.length + '件の回答、授業' + state.lessons.length + '回分、生徒' + state.students.length + '人。';
    renderAll();
  }, function(e){
    $('load').disabled = false;
    $('status').innerHTML = '<span class="err">' + esc((e && e.message) || e) + '</span>';
  });
}

// 同じ生徒が同じ授業で複数回送ったときは、最後の回答を使う
function build(rows){
  rows.sort(function(a, b){ return a[I.stamp] < b[I.stamp] ? -1 : a[I.stamp] > b[I.stamp] ? 1 : 0; });
  state.rows = rows;
  var lessons = {}, students = {};
  rows.forEach(function(r){
    var k = lessonKey(r), n = r[I.num];
    lessons[k] = true;
    if (!students[n]) students[n] = { num:n, name:'', names:{}, byLesson:{}, all:[] };
    var s = students[n];
    s.name = r[I.name]; s.names[r[I.name]] = true;
    s.byLesson[k] = r; s.all.push(r);
  });
  state.lessons = Object.keys(lessons).sort();
  state.students = Object.keys(students).map(function(k){ return students[k]; })
    .sort(function(a, b){ return a.num - b.num; });
  state.byNum = students;
}

function renderAll(){
  renderMatrix();
  var ls = $('lessonSel'), prevL = ls.value;
  ls.innerHTML = state.lessons.slice().reverse().map(function(k){
    return '<option value="' + esc(k) + '">' + esc(lessonLabel(k)) + '</option>';
  }).join('');
  if (prevL && state.lessons.indexOf(prevL) >= 0) ls.value = prevL;
  renderLesson();
  var ps = $('personSel'), prevP = ps.value;
  ps.innerHTML = state.students.map(function(s){
    return '<option value="' + s.num + '">' + s.num + '番 ' + esc(s.name) + '</option>';
  }).join('');
  if (prevP && state.byNum[prevP]) ps.value = prevP;
  renderPerson();
}

// ---------------- クラス一覧 ----------------
function renderMatrix(){
  var cname = state.grade + '年' + state.cls + '組';
  $('classTitle').textContent = cname + '　クラス一覧';
  if (!state.rows.length) { $('matrix').innerHTML = '<p class="muted" style="padding:1rem">まだ回答がありません。</p>'; return; }
  var h = '<table class="mx"><thead><tr><th class="stu">番号・氏名</th>';
  state.lessons.forEach(function(k){ h += '<th class="c">' + lessonLabel(k, true) + '</th>'; });
  h += '<th class="n">回答</th><th class="n">理解<br>平均</th><th class="n">進捗<br>平均</th><th class="n">質問</th></tr></thead><tbody>';
  state.students.forEach(function(s){
    var us = [], ps = [], q = 0;
    state.lessons.forEach(function(k){ var r = s.byLesson[k]; if (r) { us.push(r[I.u]); ps.push(r[I.p]); if (r[I.q]) q++; } });
    h += '<tr><td class="stu">' + s.num + ' <a data-p="' + s.num + '">' + esc(s.name) + '</a></td>';
    state.lessons.forEach(function(k){
      var r = s.byLesson[k];
      if (!r) { h += '<td class="cell" style="color:#b0b8c4" data-l="' + esc(k) + '">・</td>'; return; }
      var tip = '理解 ' + r[I.u] + '：' + r[I.uR] + '\\n進捗 ' + r[I.p] + '：' + r[I.pR] + (r[I.q] ? '\\n質問：' + r[I.q] : '');
      h += '<td class="cell' + (r[I.q] ? ' q' : '') + '" data-l="' + esc(k) + '" title="' + esc(tip) + '">' + L(r[I.u]) + L(r[I.p]) + '</td>';
    });
    h += '<td class="n">' + us.length + '/' + state.lessons.length + '</td><td class="n">' + avg(us) + '</td><td class="n">' + avg(ps) +
      '</td><td class="n">' + (q || '') + '</td></tr>';
  });
  h += '</tbody><tfoot><tr><td class="stu">回答数／理解平均</td>';
  state.lessons.forEach(function(k){
    var us = state.students.map(function(s){ return s.byLesson[k]; }).filter(Boolean).map(function(r){ return r[I.u]; });
    h += '<td class="c">' + us.length + '<br>' + avg(us) + '</td>';
  });
  h += '<td colspan="4"></td></tr></tfoot></table>';
  $('matrix').innerHTML = h;
  $('matrix').querySelectorAll('a[data-p]').forEach(function(a){
    a.addEventListener('click', function(){ $('personSel').value = a.getAttribute('data-p'); renderPerson(); showTab('person'); });
  });
  $('matrix').querySelectorAll('td.cell').forEach(function(td){
    td.addEventListener('click', function(){ $('lessonSel').value = td.getAttribute('data-l'); renderLesson(); showTab('lesson'); });
  });
}

// ---------------- 授業ごと ----------------
function distHtml(title, list){
  var c = count(list), n = list.length || 1;
  var bar = ['A','B','C'].map(function(k){
    var w = c[k] / n * 100;
    return w ? '<i class="' + k + '" style="width:' + w + '%">' + k + ' ' + c[k] + '</i>' : '';
  }).join('');
  return '<div class="stat"><h3>' + title + '</h3><div class="dist">' + bar + '</div>' +
    '<div class="muted">A ' + c.A + '人・B ' + c.B + '人・C ' + c.C + '人　平均 <b>' + avg(list) + '</b></div></div>';
}

function renderLesson(){
  var k = $('lessonSel').value;
  if (!k) { $('lessonTitle').textContent = '回答がありません'; $('lessonStats').innerHTML = ''; $('lessonTable').innerHTML = ''; $('missing').textContent = ''; return; }
  var rs = state.students.map(function(s){ return s.byLesson[k]; }).filter(Boolean);
  $('lessonTitle').textContent = state.grade + '年' + state.cls + '組　' + lessonLabel(k) + '　（回答 ' + rs.length + '人）';
  $('lessonStats').innerHTML = distHtml('理解度', rs.map(function(r){ return r[I.u]; })) +
    distHtml('進捗度', rs.map(function(r){ return r[I.p]; }));
  var miss = state.students.filter(function(s){ return !s.byLesson[k]; });
  $('missing').innerHTML = miss.length
    ? '<b>未提出（この期間に1回以上回答した生徒のうち）：</b>' + miss.map(function(s){ return s.num + '番 ' + esc(s.name); }).join('、')
    : '未提出者はいません。';
  var shown = rs.filter(function(r){
    return (!$('onlyQ').checked || r[I.q]) && (!$('onlyC').checked || r[I.u] === 'C' || r[I.p] === 'C');
  });
  state.lessonShown = shown;
  var h = '<table><thead><tr><th class="sel noprint"><input type="checkbox" class="pick" data-all title="すべて選ぶ"></th><th class="n">番号</th><th>氏名</th><th class="c">理解</th><th>理由</th><th class="c">進捗</th><th>理由</th><th>質問・感想</th></tr></thead><tbody>';
  shown.forEach(function(r, i){
    h += '<tr><td class="sel noprint"><input type="checkbox" class="pick" data-i="' + i + '"></td><td class="n">' + r[I.num] + '</td><td style="white-space:nowrap">' + esc(r[I.name]) + '</td><td class="c">' + L(r[I.u]) +
      '</td><td class="wrap">' + esc(r[I.uR]) + '</td><td class="c">' + L(r[I.p]) + '</td><td class="wrap">' + esc(r[I.pR]) +
      '</td><td class="wrap' + (r[I.q] ? ' q' : '') + '">' + esc(r[I.q]) + '</td></tr>';
  });
  if (!shown.length) h += '<tr><td colspan="8" class="muted">該当する回答はありません。</td></tr>';
  $('lessonTable').innerHTML = h + '</tbody></table>';
}

// ---------------- 個人 ----------------
function stepPerson(d){
  var ps = $('personSel');
  var i = ps.selectedIndex + d;
  if (i >= 0 && i < ps.options.length) { ps.selectedIndex = i; renderPerson(); }
}

function renderPerson(){
  var s = state.byNum && state.byNum[$('personSel').value];
  if (!s) { $('personTitle').textContent = '回答がありません'; $('personStats').innerHTML = ''; $('personTable').innerHTML = ''; return; }
  var names = Object.keys(s.names);
  $('personTitle').textContent = state.grade + '年' + state.cls + '組 ' + s.num + '番　' + s.name +
    (names.length > 1 ? '（別の表記：' + names.filter(function(n){ return n !== s.name; }).join('、') + '）' : '');
  var rs = state.lessons.map(function(k){ return s.byLesson[k]; }).filter(Boolean);
  var us = rs.map(function(r){ return r[I.u]; }), ps = rs.map(function(r){ return r[I.p]; });
  var strip = function(key){
    return '<div class="strip">' + state.lessons.map(function(k){
      var r = s.byLesson[k], v = r ? r[key] : '';
      return '<span class="' + (v ? 'L L' + v : '') + '" style="' + (v ? '' : 'background:#eef2f7;color:#9aa5b5') + '" title="' + esc(lessonLabel(k)) + '">' + (v || '－') + '</span>';
    }).join('') + '</div>';
  };
  var qn = rs.filter(function(r){ return r[I.q]; }).length;
  $('personStats').innerHTML =
    '<div class="stat"><h3>提出状況</h3><div class="big">' + rs.length + ' / ' + state.lessons.length + '回</div>' +
      '<div class="muted">質問・感想の記入 ' + qn + '回</div></div>' +
    distHtml('理解度（左から古い順）', us).replace('</div></div>', '</div>' + strip(I.u) + '</div>') +
    distHtml('進捗度（左から古い順）', ps).replace('</div></div>', '</div>' + strip(I.p) + '</div>');
  state.personShown = [];
  var h = '<table><thead><tr><th class="sel noprint"><input type="checkbox" class="pick" data-all title="すべて選ぶ"></th><th>授業</th><th class="c">理解</th><th>理由</th><th class="c">進捗</th><th>理由</th><th>質問・感想</th><th>送信日時</th></tr></thead><tbody>';
  state.lessons.forEach(function(k){
    var r = s.byLesson[k];
    if (!r) { h += '<tr><td class="sel noprint"></td><td style="white-space:nowrap">' + esc(lessonLabel(k)) + '</td><td colspan="6" class="muted">未提出</td></tr>'; return; }
    h += '<tr><td class="sel noprint"><input type="checkbox" class="pick" data-i="' + state.personShown.length + '"></td><td style="white-space:nowrap">' + esc(lessonLabel(k)) + '</td><td class="c">' + L(r[I.u]) + '</td><td class="wrap">' + esc(r[I.uR]) +
      '</td><td class="c">' + L(r[I.p]) + '</td><td class="wrap">' + esc(r[I.pR]) + '</td><td class="wrap' + (r[I.q] ? ' q' : '') + '">' + esc(r[I.q]) +
      '</td><td class="muted" style="white-space:nowrap">' + esc(r[I.stamp]) + '</td></tr>';
    state.personShown.push(r);
  });
  $('personTable').innerHTML = h + '</tbody></table>';
}

// ---------------- 削除 ----------------
function picked(tableId, list){
  var out = [];
  $(tableId).querySelectorAll('input.pick[data-i]:checked').forEach(function(c){
    var r = list[Number(c.getAttribute('data-i'))];
    if (r) out.push(r);
  });
  return out;
}

function deleteRows(rows, label){
  if (!rows.length) { alert('削除する回答にチェックを入れてください。'); return; }
  var names = rows.slice(0, 8).map(function(r){
    return '・' + lessonLabel(lessonKey(r)) + '　' + r[I.num] + '番 ' + r[I.name];
  }).join('\\n') + (rows.length > 8 ? '\\n　ほか ' + (rows.length - 8) + '件' : '');
  if (!confirm((label ? label + '（' + rows.length + '件）' : rows.length + '件の回答') + 'を削除します。\\n\\n' + names +
      '\\n\\n消した回答はスプレッドシートの「削除済み」シートに移ります。よろしいですか？')) return;
  $('status').textContent = '削除中…';
  var items = rows.map(function(r){
    return { row:r[I.row], stamp:r[I.stamp], grade:r[I.grade], cls:r[I.cls], num:r[I.num] };
  });
  call('deleteResponses', [PASS, items], function(res){
    load();
    setTimeout(function(){ alert(res.deleted + '件の回答を削除しました。'); }, 50);
  }, function(e){
    $('status').innerHTML = '<span class="err">' + esc((e && e.message) || e) + '</span>';
  });
}

// ---------------- CSV ----------------
function downloadCsv(){
  var q = function(v){ v = String(v == null ? '' : v); return /[",\\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var lines = [COLS.map(q).join(',')].concat(state.rows.map(function(r){ return r.slice(0, COLS.length).map(q).join(','); }));
  var blob = new Blob(['\\ufeff' + lines.join('\\r\\n')], { type:'text/csv' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'furikaeri_' + state.grade + '-' + state.cls + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
}

initLogin();
</script>
</body>
</html>
`;
