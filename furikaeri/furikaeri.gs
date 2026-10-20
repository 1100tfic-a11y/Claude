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
const PET_IDS = ['inu', 'neko', 'usagi', 'panda', 'hamu', 'dragon', 'samurai', 'knight', 'ninja', 'robo'];
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
        let current = String(v[5] || '');
        let points = Number(v[6]) || 0;
        // 昔のキャラ（今は無いもの）を育てていた場合は、タマゴ選びからやり直し
        if (current && PET_IDS.indexOf(current) < 0) { current = ''; points = 0; }
        return {
          row: i + 2, key: key, grade: v[1], cls: v[2], num: v[3], name: String(v[4]),
          current: current, points: points, day: cellDate_(v[7]),
          lessons: String(v[8] || '').split(',').filter(String),
          done: String(v[9] || '').split(',').filter(function (x) { return PET_IDS.indexOf(x) >= 0; }),
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
 * タマゴの色だけ「かわいい系＝ピンク」「かっこいい系＝青」で、生まれた後の色は自由です。
 * ========================================================================= */
var PETS = (function(){
  var STAGES = ['タマゴ', '幼年期', '成長期', '成熟期', '完全体', '究極体'];

  // type: cute（ピンクのタマゴ）/ cool（青のタマゴ）　egg: タマゴの色 [こい色, うすい色]　aura: 究極体の光の色
  var LIST = [
    { id:'inu',     type:'cute', pattern:'paws',     egg:['#ff8fb1','#ffe3ec'], ink:'#4a2a10', aura:'#ffb347',
      names:['にくきゅうのタマゴ','こしば','しばまる','ワンダフル','ヒーローわんこ','聖獣こまいぬ'] },
    { id:'neko',    type:'cute', pattern:'stars',    egg:['#ee8fd0','#fde8f6'], ink:'#16141f', aura:'#b388ff',
      names:['ほしのタマゴ','くろにゃん','ノワール','まほうねこ','ムーンウィッチ','星の大魔女ルナ'] },
    { id:'usagi',   type:'cute', pattern:'hearts',   egg:['#ff9eb5','#fff0f3'], ink:'#5a3442', aura:'#ffd6f0',
      names:['ハートのタマゴ','ちびうさ','ぴょんた','はなうさぎ','フラワープリンセス','月のうさぎ姫'] },
    { id:'panda',   type:'cute', pattern:'dots',     egg:['#f78fb3','#ffe6f0'], ink:'#1c1c1c', aura:'#9be15d',
      names:['みずたまのタマゴ','ころぱん','パンパン','ささパンダ','カンフーパンダ','パンダ大王'] },
    { id:'hamu',    type:'cute', pattern:'flowers',  egg:['#f6a6d0','#fdeef7'], ink:'#5c3a1a', aura:'#ffd23f',
      names:['ひまわりのタマゴ','ちびハム','ほっぺハム','もぐもぐハム','どんぐり探検家','ひまわり女王ハム'] },

    { id:'dragon',  type:'cool', pattern:'scales',   egg:['#3d7bf2','#d9e8ff'], ink:'#3d0f06', aura:'#ff7a29',
      names:['りゅうのタマゴ','チビドラ','ボルカドラ','フレアドラゴン','インフェルノドラゴン','紅蓮竜王バハムーン'] },
    { id:'samurai', type:'cool', pattern:'zigzag',   egg:['#2f5fbf','#dbe6fb'], ink:'#1d1b2e', aura:'#ffc9de',
      names:['かたなのタマゴ','わかまる','けんたろう','サムライ剣士','鎧武者','天下無双の将軍'] },
    { id:'knight',  type:'cool', pattern:'shields',  egg:['#4a86c8','#dfeaf6'], ink:'#232836', aura:'#fff3a8',
      names:['たてのタマゴ','みならいナイト','ナイトくん','シルバーナイト','ロイヤルナイト','聖騎士パラディオン'] },
    { id:'ninja',   type:'cool', pattern:'shuriken', egg:['#2a6fd0','#dcebff'], ink:'#120f1c', aura:'#b46bff',
      names:['しゅりけんのタマゴ','ちびにん','にんまる','シノビ','影丸','忍頭ハンゾウ'] },
    { id:'robo',    type:'cool', pattern:'gears',    egg:['#1f8fb8','#d8f1f8'], ink:'#1b1f24', aura:'#5ff2ff',
      names:['ギアのタマゴ','ポコボ','メカボックス','ガードロボ','バトルメカ','超機神ギガブレイバー'] }
  ];
  var BY = {};
  LIST.forEach(function(p){ BY[p.id] = p; });

  // ------------------------------------------------------------ 小さな道具
  var K = 1; // いま描いている縮尺（線の太さをそろえるため）
  var INK = '#222';
  function at(o){ var s = ''; for (var k in o) if (o[k] != null) s += ' ' + k + '="' + o[k] + '"'; return s; }
  function L(w){ return 'stroke="' + INK + '" stroke-width="' + ((w || 3) / K).toFixed(2) + '" stroke-linejoin="round" stroke-linecap="round"'; }
  function S(color, w){ return 'fill="none" stroke="' + color + '" stroke-width="' + (w / K).toFixed(2) + '" stroke-linecap="round" stroke-linejoin="round"'; }
  function circle(x, y, r, fill, extra){ return '<circle' + at({ cx:x, cy:y, r:r, fill:fill }) + ' ' + (extra || '') + '/>'; }
  function ell(x, y, rx, ry, fill, extra, rot){
    return '<ellipse' + at({ cx:x, cy:y, rx:rx, ry:ry, fill:fill, transform: rot ? 'rotate(' + rot + ' ' + x + ' ' + y + ')' : null }) + ' ' + (extra || '') + '/>';
  }
  function rect(x, y, w, h, r, fill, extra, rot){
    return '<rect' + at({ x:x, y:y, width:w, height:h, rx:r, fill:fill, transform: rot ? 'rotate(' + rot + ')' : null }) + ' ' + (extra || '') + '/>';
  }
  function path(d, fill, extra){ return '<path d="' + d + '" fill="' + fill + '" ' + (extra || '') + '/>'; }
  function g(tf, inner){ return '<g transform="' + tf + '">' + inner + '</g>'; }
  function both(fn){ return fn(-1) + fn(1); }
  function petal(cx, cy, dist, rx, ry, deg, fill, extra){
    return '<ellipse' + at({ cx:cx, cy:cy - dist, rx:rx, ry:ry, fill:fill, transform:'rotate(' + deg + ' ' + cx + ' ' + cy + ')' }) + ' ' + (extra || '') + '/>';
  }
  function starPts(x, y, r, n, inner){
    n = n || 5; inner = inner || 0.45; var p = [];
    for (var i = 0; i < n * 2; i++) {
      var a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r * inner : r;
      p.push((x + Math.cos(a) * rr).toFixed(1) + ',' + (y + Math.sin(a) * rr).toFixed(1));
    }
    return p.join(' ');
  }
  function star(x, y, r, fill, extra, n, inner){ return '<polygon points="' + starPts(x, y, r, n, inner) + '" fill="' + fill + '" ' + (extra || '') + '/>'; }
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
  function flower(x, y, r, petalColor, center){
    var s = '';
    for (var i = 0; i < 5; i++) s += petal(x, y, r * 0.62, r * 0.42, r * 0.6, i * 72, petalColor, L(1.6));
    return s + circle(x, y, r * 0.38, center || '#ffd23f', L(1.6));
  }
  function flame(x, y, s, outer, inner){
    return g('translate(' + x + ' ' + y + ') scale(' + s + ')',
      path('M0 0C-14 0-20-12-14-24C-12-16-6-16-6-16C-10-28-2-38 6-44C4-34 14-30 16-20C18-24 18-28 16-32C26-22 24 0 0 0Z', outer || '#ff7a29', L(2.2)) +
      path('M0-4C-7-4-9-12-5-18C-4-12 0-12 0-12C-1-20 4-24 8-28C8-20 13-16 10-8C9-5 6-4 0-4Z', inner || '#ffd23f'));
  }
  var uid = 0;

  // ------------------------------------------------------------ 顔のパーツ
  function eyesCute(cx, cy, gap, s, col){
    return both(function(d){
      var x = cx + d * gap;
      return ell(x, cy, 6 * s, 7.5 * s, col || '#2b1a10') + circle(x - 2 * s, cy - 3 * s, 2.4 * s, '#fff') + circle(x + 2.2 * s, cy + 2.6 * s, 1.2 * s, '#fff');
    });
  }
  function blush(cx, cy, gap, s){ return both(function(d){ return ell(cx + d * gap, cy, 6 * s, 3.4 * s, '#ff8fab', 'opacity=".6"'); }); }
  function catMouth(cx, cy, s){ return path('M' + (cx - 6 * s) + ' ' + cy + 'q' + (3 * s) + ' ' + (4 * s) + ' ' + (6 * s) + ' 0q' + (3 * s) + ' ' + (4 * s) + ' ' + (6 * s) + ' 0', 'none', L(2.2)); }
  // かっこいい系の目（白目＋色のついた瞳＋きりっとした眉）
  function eyesHero(cx, cy, gap, s, iris, noBrow){
    return both(function(d){
      var x = cx + d * gap;
      return ell(x, cy, 7 * s, 8.5 * s, '#fff', L(2)) + ell(x + d * 0.8 * s, cy + 1 * s, 4.6 * s, 6 * s, iris) +
        circle(x + d * 0.8 * s, cy + 1.5 * s, 2.4 * s, '#111') + circle(x - 1.5 * s, cy - 2 * s, 1.6 * s, '#fff') +
        (noBrow ? '' : path('M' + (x - d * 8 * s) + ' ' + (cy - 11 * s) + 'L' + (x + d * 9 * s) + ' ' + (cy - 15 * s), 'none', L(3.4)));
    });
  }
  function grin(cx, cy, s){
    return path('M' + (cx - 7 * s) + ' ' + cy + 'Q' + cx + ' ' + (cy + 10 * s) + ' ' + (cx + 7 * s) + ' ' + cy + 'Z', '#7a1f1f', L(2)) +
      path('M' + (cx - 4 * s) + ' ' + (cy + 4.5 * s) + 'Q' + cx + ' ' + (cy + 2 * s) + ' ' + (cx + 4 * s) + ' ' + (cy + 4.5 * s), '#ff8a8a');
  }

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
      case 'paws':
        [[76,82,1],[124,100,1.2],[82,142,1.1],[130,156,0.8]].forEach(function(f){
          s += ell(f[0], f[1] + 4 * f[2], 8 * f[2], 6.5 * f[2], c);
          [[-8,-6],[-3,-10],[3,-10],[8,-6]].forEach(function(t){ s += circle(f[0] + t[0] * f[2], f[1] + t[1] * f[2], 2.8 * f[2], c); });
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
      case 'shields':
        [[76,84,1],[126,108,1.1],[84,146,0.9]].forEach(function(f){
          s += g('translate(' + f[0] + ' ' + f[1] + ') scale(' + f[2] + ')', path('M-11-12H11V0C11 8 4 13 0 15C-4 13-11 8-11 0Z', c) + path('M0-9V11M-7-2H7', 'none', 'stroke="#fff" stroke-width="2.5"'));
        });
        break;
      case 'shuriken':
        [[74,80,10],[124,72,8],[100,116,13],[64,148,9],[134,140,10]].forEach(function(t){ s += star(t[0], t[1], t[2], c, '', 4, 0.32) + circle(t[0], t[1], t[2] * 0.2, w); });
        break;
      case 'gears':
        [[78,86,16],[124,122,20],[80,152,12]].forEach(function(q){
          s += circle(q[0], q[1], q[2], 'none', 'stroke="' + c + '" stroke-width="7" stroke-dasharray="6 5"') + circle(q[0], q[1], q[2] * 0.45, c);
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

  // ==================================================================
  //  キャラクターごとの絵（足もとを (0,0) として上向きに描く。高さはおよそ 150）
  // ==================================================================

  // ---------------------------------------------- 柴犬
  function drawInu(st){
    var holy = st === 5;
    var fur = holy ? '#fff4dc' : '#f0a04b', white = '#fffaf2', s = '';
    // しっぽ（くるん）
    s += circle(30, -46, 15, 'none', S(INK, 15)) + circle(30, -46, 15, 'none', S(holy ? '#ffd27a' : fur, 9)) + circle(30, -46, 6, white, L(2));
    if (holy) {
      // 翼
      s += both(function(d){ return g('scale(' + d + ' 1)', path('M18-60C40-92 76-100 92-88C80-82 88-74 80-68C88-62 78-56 70-56C72-48 58-48 52-50C44-44 30-48 22-52Z', '#fff', L(2.5))); });
    }
    if (st >= 4) s += path('M-26-66Q0-74 26-66L40-6Q0 4-40-6Z', holy ? '#ffcf4d' : '#e03131', L(2.5)); // マント
    // うしろ足
    s += both(function(d){ return ell(d * 25, -12, 15, 12, fur, L()); });
    // からだ
    s += ell(0, -40, 29, 34, fur, L()) + ell(0, -40, 16, 24, white);
    // まえ足
    s += both(function(d){ return rect(d * 11 - 7, -32, 14, 32, 7, fur, L()) + ell(d * 11, -3, 8, 5, white, L(2)); });
    if (st >= 2 && st < 4) s += path('M-20-68Q0-58 20-68', 'none', S(INK, 9)) + path('M-20-68Q0-58 20-68', 'none', S('#e64980', 6)) + circle(0, -61, 5.5, '#ffd23f', L(2));
    if (st >= 3 && st < 5) s += path('M-24-70Q0-58 24-70L4-44Z', '#2f80ed', L(2.5)) + circle(-8, -62, 2, '#fff') + circle(8, -64, 2, '#fff'); // バンダナ
    if (st === 4) s += star(0, -46, 8, '#ffd23f', L(2));
    // 頭
    var hy = -88;
    s += both(function(d){ return path('M' + (d * 12) + ' ' + (hy - 24) + 'L' + (d * 30) + ' ' + (hy - 44) + 'L' + (d * 34) + ' ' + (hy - 12) + 'Z', fur, L()) + path('M' + (d * 18) + ' ' + (hy - 24) + 'L' + (d * 28) + ' ' + (hy - 36) + 'L' + (d * 29) + ' ' + (hy - 18) + 'Z', '#ffc2a8'); });
    s += ell(0, hy, 36, 30, fur, L());
    s += path('M-28 ' + (hy + 6) + 'Q-26 ' + (hy - 8) + ' -12 ' + (hy - 6) + 'Q0 ' + (hy - 2) + ' 12 ' + (hy - 6) + 'Q26 ' + (hy - 8) + ' 28 ' + (hy + 6) + 'Q20 ' + (hy + 28) + ' 0 ' + (hy + 28) + 'Q-20 ' + (hy + 28) + ' -28 ' + (hy + 6) + 'Z', white);
    s += both(function(d){ return ell(d * 13, hy - 15, 5, 3, white); }); // まろまゆ
    if (holy) s += path('M-10 ' + (hy - 22) + 'Q0 ' + (hy - 32) + ' 10 ' + (hy - 22), 'none', S('#ff7a29', 3)) + circle(0, hy - 24, 3, '#ff7a29');
    s += eyesCute(0, hy - 4, 13, 1.05);
    s += ell(0, hy + 6, 5, 3.6, INK) + catMouth(-6 + 6, hy + 11, 1);
    if (st >= 2) s += path('M-3 ' + (hy + 15) + 'q3 7 6 0', '#ff6b81', L(1.6));
    s += blush(0, hy + 6, 22, 1);
    if (holy) s += ell(0, hy - 40, 26, 7, 'none', S('#ffd23f', 4));
    return s;
  }

  // ---------------------------------------------- 黒ねこ
  function drawNeko(st){
    var fur = '#3a3850', s = '', hy = -84;
    // しっぽ
    s += path('M22-14C52-16 58-50 42-70C36-78 44-90 52-84', 'none', S(INK, 15)) + path('M22-14C52-16 58-50 42-70C36-78 44-90 52-84', 'none', S(fur, 10));
    if (st >= 4) s += path('M-28-66Q0-76 28-66L46-2Q0 8-46-2Z', st === 5 ? '#24206b' : '#7b3fbf', L(2.5)) +
      (st === 5 ? [[-34,-20],[30,-30],[-20,-44],[38,-10],[-40,-6]].map(function(p){ return star(p[0], p[1], 3.5, '#ffe066'); }).join('') : '');
    s += ell(0, -36, 27, 34, fur, L()) + ell(0, -40, 11, 16, '#5a5876');
    s += both(function(d){ return ell(d * 12, -5, 10, 7, fur, L()); });
    if (st >= 2) s += path('M-18-62Q0-54 18-62', 'none', S(INK, 8)) + path('M-18-62Q0-54 18-62', 'none', S('#e8364e', 5)) + circle(0, -56, 5, '#ffd23f', L(1.8));
    // 魔法のつえ
    if (st === 3) s += path('M-30-30L-40-74', 'none', S('#8a5a2b', 5)) + star(-41, -78, 10, '#ffe066', L(2));
    if (st === 5) s += path('M-34-6L-46-110', 'none', S('#c9a2ff', 5)) + path('M-50-122A14 14 0 1 0-36-104A10 10 0 1 1-50-122Z', '#ffe066', L(2)) + sparkle(-28, -122, 6, '#fff');
    // 頭
    s += both(function(d){ return path('M' + (d * 8) + ' ' + (hy - 22) + 'L' + (d * 26) + ' ' + (hy - 46) + 'L' + (d * 32) + ' ' + (hy - 6) + 'Z', fur, L()) + path('M' + (d * 15) + ' ' + (hy - 20) + 'L' + (d * 24) + ' ' + (hy - 36) + 'L' + (d * 27) + ' ' + (hy - 12) + 'Z', '#ff9fc0'); });
    s += ell(0, hy, 34, 29, fur, L());
    s += both(function(d){
      var x = d * 13, y = hy - 2;
      return ell(x, y, 8, 9.5, '#c6f36b', L(2)) + ell(x, y + 1, 2.6, 7.5, '#16141f') + circle(x - 2.5, y - 4, 2.2, '#fff');
    });
    s += path('M-4 ' + (hy + 9) + 'H4L0 ' + (hy + 13) + 'Z', '#ff8fb1') + catMouth(0, hy + 14, 0.8);
    s += both(function(d){ return path('M' + (d * 20) + ' ' + (hy + 8) + 'l' + (d * 18) + ' -3M' + (d * 20) + ' ' + (hy + 13) + 'l' + (d * 18) + ' 2', 'none', S('#e9e6ff', 2)); });
    s += blush(0, hy + 10, 21, 1);
    // ぼうし
    if (st >= 4) {
      var tall = st === 5 ? 1.35 : 1;
      s += ell(0, hy - 22, 42, 9, st === 5 ? '#2c2680' : '#5b2a9e', L()) +
        path('M-24 ' + (hy - 24) + 'Q-10 ' + (hy - 50 * tall) + ' 8 ' + (hy - 76 * tall) + 'Q16 ' + (hy - 70 * tall) + ' 24 ' + (hy - 64 * tall) + 'Q16 ' + (hy - 50) + ' 24 ' + (hy - 24) + 'Z', st === 5 ? '#2c2680' : '#5b2a9e', L()) +
        rect(-24, hy - 34, 48, 9, 3, st === 5 ? '#ffd23f' : '#e8364e', L(2)) +
        (st === 5 ? star(4, hy - 48, 6, '#ffe066', L(1.5)) + path('M14 ' + (hy - 62) + 'A6 6 0 1 0 20 ' + (hy - 54) + 'A4 4 0 1 1 14 ' + (hy - 62) + 'Z', '#ffe066') : star(0, hy - 29, 4, '#ffe066'));
    }
    return s;
  }

  // ---------------------------------------------- うさぎ
  function drawUsagi(st){
    var fur = '#ffffff', s = '', hy = -86;
    if (st === 5) s += path('M-40-150A62 62 0 1 0 40-40A48 48 0 1 1-40-150Z', '#ffe9a8', L(2)); // 三日月
    s += circle(26, -26, 10, fur, L()); // しっぽ
    if (st >= 4) {
      var dress = st === 5 ? '#c7a6ff' : '#ffe680';
      s += path('M-18-56H18L36-10Q0 0-36-10Z', dress, L()) + path('M-30-16Q0-8 30-16', 'none', S('#fff', 3));
      if (st === 5) s += path('M-36-10Q0 0 36-10L30 0H-30Z', '#9b7bff', L(2));
    } else s += ell(0, -36, 25, 30, fur, L());
    s += both(function(d){ return ell(d * 14, -4, 15, 7, fur, L()); });
    s += both(function(d){ return ell(d * 22, -44, 7, 11, fur, L(), d * -20); });
    if (st >= 2 && st <= 3) s += g('translate(-22 -40) rotate(-30)', path('M0-14C5-14 7-8 6 0L0 18L-6 0C-7-8-5-14 0-14Z', '#ff8c2b', L(2)) + path('M0-14L-6-24M0-14L0-26M0-14L6-24', 'none', S('#3fae49', 3)));
    if (st === 5) s += path('M24-30L40-104', 'none', S('#fff', 4)) + star(41, -110, 9, '#ffe066', L(2));
    // 耳
    s += both(function(d){
      var tilt = st >= 3 && d === 1 ? 35 : d * 8;
      return g('rotate(' + tilt + ' ' + (d * 12) + ' ' + (hy - 20) + ')', ell(d * 12, hy - 52, 10, 30, fur, L()) + ell(d * 12, hy - 50, 5, 22, '#ffb3c8'));
    });
    s += circle(0, hy, 30, fur, L());
    s += eyesCute(0, hy - 2, 12, 1, '#a23b5c');
    s += path('M-3 ' + (hy + 7) + 'H3L0 ' + (hy + 10) + 'Z', '#ff8fb1') + catMouth(0, hy + 11, 0.7) + rect(-3, hy + 12, 6, 5, 1, '#fff', L(1.4));
    s += blush(0, hy + 8, 19, 1);
    if (st >= 3) s += flower(-18, hy - 26, 7, '#ff9cc0') + flower(0, hy - 30, 8, '#ffe066', '#ff8c2b') + flower(18, hy - 26, 7, '#b6e3ff');
    if (st === 5) s += path('M-14 ' + (hy - 34) + 'L-10 ' + (hy - 48) + 'L-4 ' + (hy - 38) + 'L0 ' + (hy - 52) + 'L4 ' + (hy - 38) + 'L10 ' + (hy - 48) + 'L14 ' + (hy - 34) + 'Z', '#ffd23f', L(2));
    return s;
  }

  // ---------------------------------------------- パンダ
  function drawPanda(st){
    var K2 = '#1c1c1c', W = '#ffffff', s = '', hy = -92;
    if (st === 5) s += path('M-44-70Q0-82 44-70L52-2Q0 8-52-2Z', '#d62828', L()) + path('M-44-70Q0-82 44-70', 'none', S('#ffd23f', 4));
    s += both(function(d){ return ell(d * 22, -10, 15, 12, K2, L()) + ell(d * 22, -8, 7, 5, '#555'); });
    s += ell(0, -40, 35, 36, W, L());
    if (st === 4) s += path('M-30-60Q0-44 30-60L26-14Q0-6-26-14Z', '#ff8c2b', L()) + rect(-30, -34, 60, 9, 3, '#1c1c1c');
    s += path('M-30-62Q0-48 30-62', 'none', S(K2, 12));
    // 竹
    if (st === 2 || st === 3) s += g('translate(30 -40) rotate(15)', rect(-5, -46, 10, 64, 4, '#6abf4b', L(2)) + path('M-5-20H5M-5 2H5', 'none', S(INK, 2)) +
      (st === 3 ? ell(10, -44, 12, 4, '#8fd36b', L(1.6), -30) + ell(12, -34, 10, 3.5, '#8fd36b', L(1.6), -10) : ''));
    if (st === 5) s += g('translate(34 -30) rotate(12)', rect(-5, -70, 10, 90, 4, '#ffd23f', L(2)) + path('M-5-40H5M-5-10H5', 'none', S(INK, 2)) + circle(0, -74, 8, '#d62828', L(2)));
    s += both(function(d){ return ell(d * 30, -46, 12, 17, K2, L(), d * (st === 4 ? 40 : -25)); });
    if (st === 4) s += both(function(d){ return circle(d * 40, -58, 9, K2, L()); });
    // 頭
    s += both(function(d){ return circle(d * 24, hy - 24, 11, K2, L()); });
    s += ell(0, hy, 36, 31, W, L());
    s += both(function(d){ return ell(d * 13, hy, 9, 12, K2, '', d * 25) + circle(d * 13, hy - 1, 4.2, '#fff') + circle(d * 13 - 1, hy - 2.5, 1.4, K2); });
    s += ell(0, hy + 11, 5, 3.4, K2) + catMouth(0, hy + 15, 0.8);
    s += blush(0, hy + 10, 22, 1);
    if (st === 3) s += ell(-6, hy - 30, 14, 5, '#8fd36b', L(1.6), -20);
    if (st === 4) s += path('M-34 ' + (hy - 10) + 'Q0 ' + (hy - 22) + ' 34 ' + (hy - 10), 'none', S(INK, 9)) + path('M-34 ' + (hy - 10) + 'Q0 ' + (hy - 22) + ' 34 ' + (hy - 10), 'none', S('#e03131', 6)) +
      path('M32 ' + (hy - 10) + 'q14 2 20 14M32 ' + (hy - 10) + 'q16-4 24 4', 'none', S('#e03131', 4));
    if (st === 5) s += g('translate(0 ' + (hy - 28) + ')', path('M-22 6L-26-18L-12-6L0-24L12-6L26-18L22 6Z', '#ffd23f', L(2)) + circle(0, -8, 4, '#d62828'));
    return s;
  }

  // ---------------------------------------------- ハムスター
  function drawHamu(st){
    var fur = '#f4b860', W = '#fff8ec', s = '';
    var cheek = st >= 3 ? 1.45 : st === 2 ? 1.2 : 1;
    if (st === 5) {
      for (var i = 0; i < 16; i++) s += petal(0, -58, 62, 10, 22, i * 22.5, '#ffd23f', L(2));
      s += circle(0, -58, 52, '#8a5a2b', L());
      s += path('M-44-80Q0-90 44-80L54-4Q0 6-54-4Z', '#e03131', L());
    }
    s += both(function(d){ return ell(d * 18, -4, 11, 6, '#ffb3a8', L(2)); });
    s += path('M0-104C40-104 50-70 50-48C50-18 30 0 0 0C-30 0-50-18-50-48C-50-70-40-104 0-104Z', fur, L());
    s += path('M-36-54C-36-36-24-6 0-6C24-6 36-36 36-54C26-46 14-44 0-44C-14-44-26-46-36-54Z', W);
    s += both(function(d){ return circle(d * 30, -96, 12, fur, L()) + circle(d * 30, -96, 6, '#ffb3a8'); });
    s += both(function(d){ return ell(d * 30, -54, 13 * cheek, 11 * cheek, W, L(2)); });
    s += eyesCute(0, -72, 15, 1.05);
    s += ell(0, -60, 3.5, 2.6, '#c25b4b') + catMouth(0, -56, 0.7);
    s += blush(0, -62, 28, 1);
    // ひまわりのたね
    if (st >= 2 && st <= 4) s += g('translate(0 -36)', ell(0, 0, 8, 12, '#333', L(2)) + path('M-3-8V8M3-8V8', 'none', S('#ddd', 1.6))) + both(function(d){ return ell(d * 9, -36, 6, 5, fur, L(2)); });
    if (st === 4) {
      s += g('translate(0 -104)', ell(0, 0, 26, 9, '#9a6a3a', L()) + path('M-22-2Q0-28 22-2Z', '#9a6a3a', L()) + path('M-18-6L18-6M-14-12L14-12', 'none', S('#7a4f25', 2)) + path('M0-16V-24', 'none', S('#5c3a1a', 3)));
      s += path('M-34-46Q0-34 34-46L30-36Q0-26-30-36Z', '#3fae49', L(2));
    }
    if (st === 5) s += g('translate(0 -104)', path('M-20 4L-24-18L-10-6L0-24L10-6L24-18L20 4Z', '#ffd23f', L(2)) + circle(0, -6, 4, '#e03131'));
    return s;
  }

  // ---------------------------------------------- ドラゴン
  function drawDragon(st){
    var gold = st === 5, body = '#e8432b', belly = '#ffd36b', mem = gold ? '#ffb02e' : '#ff8a3d', horn = gold ? '#ffd23f' : '#fff1c9', s = '', hy = -98;
    var wk = [0, 0.35, 0.55, 0.8, 1.0, 1.15][st];
    // つばさ
    s += both(function(d){
      return g('translate(' + (d * 14) + ' -70) scale(' + (d * wk) + ' ' + wk + ')',
        path('M0 0C16-44 58-62 92-52C84-38 86-26 92-14C78-18 70-12 68 0C60-8 48-6 44 6C36-2 24-2 18 10C12 4 6 4 0 8Z', mem, L(3 * wk)) +
        path('M4 2L60-46M20 6L78-30M38 6L88-18', 'none', S(INK, 2 * wk)));
    });
    // しっぽ
    s += path('M14-24C44-14 64-4 86-34C80-14 60 6 10-8Z', body, L());
    if (st >= 3) [[40,-18],[56,-16],[70,-22]].forEach(function(p){ s += path('M' + p[0] + ' ' + p[1] + 'l5-12 5 11Z', horn, L(1.8)); });
    if (st >= 4) s += flame(88, -34, 0.7, '#ff7a29', '#ffd23f');
    // 足
    s += both(function(d){ return ell(d * 18, -10, 14, 14, body, L()) + [-6, 0, 6].map(function(t){ return path('M' + (d * 18 + t - 2) + ' 1L' + (d * 18 + t) + ' 6L' + (d * 18 + t + 2) + ' 1Z', '#fff', L(1.4)); }).join(''); });
    // からだ
    s += ell(0, -46, 33, 36, body, L());
    s += ell(0, -42, 21, 28, belly, L(2)) + [-56, -46, -36, -26].map(function(y){ return path('M-17 ' + y + 'Q0 ' + (y + 4) + ' 17 ' + y, 'none', S(INK, 1.6)); }).join('');
    if (gold) s += path('M-24-70L0-60L24-70L22-28Q0-16-22-28Z', '#ffd23f', L()) + path('M0-60V-20', 'none', S('#c98a00', 2)) + circle(0, -48, 6, '#e8432b', L(2));
    s += both(function(d){ return ell(d * 31, -52, 8, 13, body, L(), d * -30); });
    // 頭
    s += both(function(d){
      var len = [0, 10, 16, 22, 28, 36][st];
      return path('M' + (d * 14) + ' ' + (hy - 22) + 'Q' + (d * (22 + len * 0.3)) + ' ' + (hy - 36 - len * 0.6) + ' ' + (d * (26 + len * 0.7)) + ' ' + (hy - 40 - len) + 'Q' + (d * 26) + ' ' + (hy - 30) + ' ' + (d * 26) + ' ' + (hy - 16) + 'Z', horn, L(2.5));
    });
    if (st >= 3) [[-8, -32], [0, -36], [8, -32]].forEach(function(p){ s += path('M' + (p[0] - 5) + ' ' + (hy - 26) + 'L' + p[0] + ' ' + (hy + p[1] - 2) + 'L' + (p[0] + 5) + ' ' + (hy - 26) + 'Z', mem, L(2)); });
    s += ell(0, hy, 36, 30, body, L());
    s += ell(0, hy + 14, 22, 13, '#f2664f', L(2)) + both(function(d){ return ell(d * 7, hy + 10, 2.4, 3, INK); });
    if (st <= 1) s += eyesCute(0, hy - 6, 14, 1.15, '#3d0f06');
    else s += both(function(d){
      var x = d * 15, y = hy - 6;
      return ell(x, y, 8, 8.5, '#fff', L(2)) + ell(x, y, 6, 7, '#ffcf3f') + ell(x, y, 1.8, 6, '#111') + circle(x - 2, y - 3, 1.5, '#fff') +
        path('M' + (x - d * 9) + ' ' + (y - 9) + 'L' + (x + d * 10) + ' ' + (y - 13), 'none', L(3.2));
    });
    s += path('M-12 ' + (hy + 22) + 'Q0 ' + (hy + 27) + ' 12 ' + (hy + 22), 'none', L(2.2)) + (st >= 2 ? path('M7 ' + (hy + 23) + 'l2 5 2-5.5', '#fff', L(1.4)) : '');
    if (st >= 4) s += flame(-48, hy + 30, 0.9, '#ff7a29', '#ffd23f') + flame(-66, hy + 24, 0.6, '#ff7a29', '#ffd23f');
    if (gold) s += g('translate(0 ' + (hy - 26) + ')', path('M-18 4L-20-14L-8-4L0-20L8-4L20-14L18 4Z', '#ffd23f', L(2)) + circle(0, -4, 3.5, '#3d7bf2'));
    return s;
  }

  // ---------------------------------------------- 人型（侍・騎士・忍者）の共通の体
  // o = { skin, top, bottom, shoes, back, body, arms, head, headBack, front, weapon, face, hair }
  function humanoid(o){
    var s = '', hy = -96;
    s += o.back || '';
    // 足
    s += both(function(d){ return rect(d * 10 - 8, -26, 16, 24, 6, o.bottom, L()) + ell(d * 10, -2, 11, 5.5, o.shoes, L(2)); });
    // 胴
    s += path('M-20-64H20L24-22H-24Z', o.top, L());
    s += o.body || '';
    // 腕（左手は前、右手は武器を持つ）
    s += rect(-34, -62, 13, 32, 6.5, o.sleeve || o.top, L(), null) + circle(-27, -30, 7, o.skin, L(2));
    s += rect(21, -62, 13, 30, 6.5, o.sleeve || o.top, L()) + circle(28, -32, 7, o.skin, L(2));
    s += o.arms || '';
    // 頭
    s += o.headBack || '';
    s += circle(0, hy, 32, o.skin, L());
    s += o.hair || '';
    s += o.face != null ? o.face : eyesHero(0, hy + 2, 12, 1, o.iris || '#3b2a1a') + grin(0, hy + 16, 1) + blush(0, hy + 12, 21, 0.9);
    s += o.head || '';
    s += o.weapon || '';
    s += o.front || '';
    return s;
  }
  function katana(x, y, rot, len, gold){
    return g('translate(' + x + ' ' + y + ') rotate(' + rot + ')',
      rect(-3, -len, 6, len, 2, '#e6edf5', L(2)) + path('M-1.5-' + (len - 4) + 'V-6', 'none', S('#ffffff', 1.5)) +
      ell(0, 0, 8, 3, gold ? '#ffd23f' : '#333', L(1.6)) + rect(-3, 1, 6, 18, 2, '#2a1f3d', L(1.6)) + path('M-3 6L3 10M-3 12L3 16', 'none', S('#e8e1ff', 1.4)));
  }

  // ---------------------------------------------- 侍
  function drawSamurai(st){
    var o = { skin:'#ffdcb8', top:'#3a4fa8', bottom:'#2c2c44', shoes:'#8a5a2b', iris:'#2b1d14' }, hy = -96;
    var hairTop = path('M-31 ' + (hy - 4) + 'Q-30 ' + (hy - 34) + ' 0 ' + (hy - 34) + 'Q30 ' + (hy - 34) + ' 31 ' + (hy - 4) + 'Q22 ' + (hy - 20) + ' 6 ' + (hy - 18) + 'L0 ' + (hy - 10) + 'L-6 ' + (hy - 18) + 'Q-22 ' + (hy - 20) + ' -31 ' + (hy - 4) + 'Z', '#2b2b3a', L());
    o.hair = st <= 3 ? hairTop + ell(0, hy - 38, 7, 9, '#2b2b3a', L(2)) + rect(-6, hy - 34, 12, 4, 1, '#e03131') : '';
    o.body = path('M-10-64L0-46L10-64', 'none', S('#ffffff', 4));
    if (st === 1) o.weapon = g('translate(28 -32) rotate(20)', rect(-3, -52, 6, 52, 3, '#c8925a', L(2)) + ell(0, -2, 6, 2.5, '#6d4523'));
    if (st === 2) {
      o.weapon = g('translate(28 -32) rotate(-15)', rect(-3, -56, 6, 56, 3, '#c8925a', L(2)) + ell(0, -2, 6, 2.5, '#6d4523'));
      o.head = path('M-32 ' + (hy - 10) + 'Q0 ' + (hy - 20) + ' 32 ' + (hy - 10), 'none', S(INK, 9)) + path('M-32 ' + (hy - 10) + 'Q0 ' + (hy - 20) + ' 32 ' + (hy - 10), 'none', S('#fff', 6)) +
        circle(0, hy - 15, 4, '#e03131') + path('M-30 ' + (hy - 8) + 'q-14 4-18 16M-30 ' + (hy - 8) + 'q-16-2-22 6', 'none', S('#fff', 4));
    }
    if (st >= 3) {
      o.sleeve = st >= 4 ? '#3a4fa8' : '#7fb3ff';
      o.weapon = katana(28, -32, st === 5 ? -35 : -20, st === 5 ? 70 : 58, st === 5);
      o.front = katana(-16, -26, 60, 40, st === 5).replace('#e6edf5', '#2a1f3d');
    }
    if (st === 3) o.body += path('M-24-22L-20-64H-8L-6-22Z', '#7fb3ff', L(2)) + path('M24-22L20-64H8L6-22Z', '#7fb3ff', L(2)) + path('M-22-30L-12-36L-8-28M22-30L12-36L8-28', 'none', S('#fff', 2));
    if (st >= 4) {
      var red = '#c0392b';
      o.body += path('M-22-64H22L25-30H-25Z', red, L()) + [-56, -48, -40].map(function(y){ return path('M-21 ' + y + 'H21', 'none', S('#ffd23f', 2)); }).join('') +
        path('M-26-30H26L30-16H-30Z', red, L(2)) + path('M-26-24H26', 'none', S('#ffd23f', 2));
      o.arms = both(function(d){ return path('M' + (d * 18) + ' -66L' + (d * 40) + ' -60L' + (d * 38) + ' -44L' + (d * 22) + ' -48Z', red, L(2)) + path('M' + (d * 22) + ' -58L' + (d * 38) + ' -53', 'none', S('#ffd23f', 2)); });
      var crest = st === 5 ? path('M-6 ' + (hy - 32) + 'C-20 ' + (hy - 50) + ' -34 ' + (hy - 70) + ' -30 ' + (hy - 86) + 'C-22 ' + (hy - 66) + ' -10 ' + (hy - 54) + ' 0 ' + (hy - 40) + 'C10 ' + (hy - 54) + ' 22 ' + (hy - 66) + ' 30 ' + (hy - 86) + 'C34 ' + (hy - 70) + ' 20 ' + (hy - 50) + ' 6 ' + (hy - 32) + 'Z', '#ffd23f', L(2.4)) + circle(0, hy - 34, 6, '#e03131', L(2))
        : path('M-4 ' + (hy - 32) + 'L-14 ' + (hy - 48) + 'L0 ' + (hy - 38) + 'L14 ' + (hy - 48) + 'L4 ' + (hy - 32) + 'Z', '#ffd23f', L(2));
      o.headBack = path('M-40 ' + (hy + 10) + 'L-34 ' + (hy - 6) + 'H34L40 ' + (hy + 10) + 'L30 ' + (hy + 6) + 'H-30Z', '#2c2c44', L(2));
      o.head = path('M-34 ' + (hy - 4) + 'Q-32 ' + (hy - 36) + ' 0 ' + (hy - 36) + 'Q32 ' + (hy - 36) + ' 34 ' + (hy - 4) + 'Z', '#2c2c44', L()) + path('M-34 ' + (hy - 6) + 'H34', 'none', S('#ffd23f', 3)) + crest;
    }
    if (st === 5) o.back = path('M-26-66L-46-4Q0 10 46-4L26-66Z', '#8e1b1b', L()) + path('M-30-50Q0-44 30-50', 'none', S('#ffd23f', 3)) +
      [[-60,-120],[56,-130],[-70,-60],[66,-70],[48,-24]].map(function(p){ return flower(p[0], p[1], 6, '#ffc9de', '#ff8fb1'); }).join('');
    return humanoid(o);
  }

  // ---------------------------------------------- 騎士
  function drawKnight(st){
    var gold = st === 5, metal = gold ? '#ffd86b' : '#cfd8e3', dark = gold ? '#c98a00' : '#8a98ab', hy = -96;
    var o = { skin:'#ffe0c4', top: st >= 3 ? metal : '#3f7be0', bottom: st >= 3 ? metal : '#7a5230', shoes: st >= 3 ? dark : '#5a3b20', iris:'#1f6feb' };
    o.hair = path('M-30 ' + (hy - 2) + 'Q-28 ' + (hy - 30) + ' 0 ' + (hy - 30) + 'Q28 ' + (hy - 30) + ' 30 ' + (hy - 2) + 'Q14 ' + (hy - 14) + ' 0 ' + (hy - 12) + 'Q-14 ' + (hy - 14) + ' -30 ' + (hy - 2) + 'Z', '#f2c14e', L());
    // かぶと
    var helm = path('M-34 ' + (hy - 2) + 'Q-34 ' + (hy - 40) + ' 0 ' + (hy - 40) + 'Q34 ' + (hy - 40) + ' 34 ' + (hy - 2) + 'L28 ' + (hy + 2) + 'Q0 ' + (hy - 12) + ' -28 ' + (hy + 2) + 'Z', metal, L()) +
      path('M0 ' + (hy - 40) + 'V' + (hy - 8), 'none', S(dark, 3));
    if (st === 1) o.head = path('M-32 ' + (hy - 6) + 'Q-32 ' + (hy - 40) + ' 0 ' + (hy - 40) + 'Q32 ' + (hy - 40) + ' 32 ' + (hy - 6) + 'Z', '#b8c2cc', L()) + rect(-34, hy - 10, 68, 7, 3, '#8a98ab', L(2));
    if (st >= 2) o.head = helm + (st >= 3 ? rect(-3, hy - 12, 6, 16, 2, metal, L(2)) : '');
    if (st >= 4) o.head += path('M0 ' + (hy - 40) + 'C10 ' + (hy - 66) + ' 30 ' + (hy - 66) + ' 40 ' + (hy - 50) + 'C26 ' + (hy - 54) + ' 16 ' + (hy - 48) + ' 6 ' + (hy - 38) + 'Z', gold ? '#ffffff' : '#e03131', L(2));
    if (gold) o.head += ell(0, hy - 54, 24, 6, 'none', S('#ffe066', 4));
    // 胴よろい
    if (st >= 3) o.body = path('M-20-64H20L22-34Q0-26-22-34Z', metal, L()) + path('M-12-58Q0-52 12-58M-14-46Q0-40 14-46', 'none', S(dark, 2)) + rect(-24, -34, 48, 7, 2, '#7a5230', L(2)) + circle(0, -30, 4, '#ffd23f', L(1.4));
    else o.body = rect(-24, -32, 48, 6, 2, '#7a5230', L(2));
    if (st >= 3) o.arms = both(function(d){ return circle(d * 26, -60, 12, metal, L()); });
    // 剣
    if (st === 1) o.weapon = g('translate(28 -32) rotate(-10)', rect(-3, -40, 6, 40, 2, '#c8925a', L(2)) + rect(-10, -4, 20, 5, 2, '#8a5a2b', L(1.6)));
    else {
      var len = [0, 0, 46, 60, 70, 82][st];
      o.weapon = g('translate(28 -32) rotate(-12)',
        (gold ? path('M0-' + (len + 8) + 'L-9-10H9Z', '#bff4ff', 'opacity=".55"') : '') +
        path('M-4-4V-' + (len - 6) + 'L0-' + len + 'L4-' + (len - 6) + 'V-4Z', gold ? '#e8fbff' : '#e6edf5', L(2)) + path('M0-' + (len - 8) + 'V-8', 'none', S(gold ? '#7fe0ff' : '#aab6c4', 1.6)) +
        rect(-14, -6, 28, 6, 3, '#ffd23f', L(1.8)) + rect(-3, 0, 6, 14, 2, '#5a3b20', L(1.6)) + circle(0, 16, 4, '#ffd23f', L(1.4)));
    }
    // 盾
    if (st === 2) o.front = circle(-30, -40, 16, '#a0703f', L()) + circle(-30, -40, 16, 'none', S('#b8c2cc', 4)) + circle(-30, -40, 4, '#b8c2cc', L(1.4));
    if (st >= 3) {
      var sc = gold ? '#ffffff' : '#2f6fd0';
      o.front = g('translate(-32 -42) scale(' + (st >= 4 ? 1.2 : 1) + ')',
        path('M-17-20H17V0C17 13 6 21 0 24C-6 21-17 13-17 0Z', sc, L()) + path('M-17-20H17V0C17 13 6 21 0 24C-6 21-17 13-17 0Z', 'none', S(gold ? '#ffd23f' : '#cfd8e3', 3)) +
        (st >= 4 ? path('M-8-2L-8-12L-3-6L0-14L3-6L8-12L8-2Z', '#ffd23f', L(1.4)) : path('M0-14V16M-10-3H10', 'none', S('#ffd23f', 4))));
    }
    if (st >= 4) o.back = path('M-22-66L-40-2Q0 8 40-2L22-66Z', gold ? '#ffffff' : '#c92a2a', L());
    if (gold) o.back = both(function(d){ return g('scale(' + d + ' 1)', path('M16-64C30-110 78-130 98-110C86-106 92-98 84-92C94-86 82-78 74-78C80-70 66-66 58-68C56-58 40-58 34-62C28-56 18-58 14-62Z', '#ffffff', L(2.5)) +
      path('M30-86Q60-100 84-104M34-74Q60-84 76-86', 'none', S('#d7e3f0', 2))); }) + o.back;
    return humanoid(o);
  }

  // ---------------------------------------------- 忍者
  function drawNinja(st){
    var suit = st === 5 ? '#1a1530' : '#2d2a4a', scarf = '#e03131', hy = -96;
    var o = { skin:'#ffdcb8', top:suit, bottom:suit, shoes:'#15131f', iris:'#8b5cf6' };
    if (st === 5) o.back = flame(-38, -10, 1.6, '#7b2ff7', '#c9a2ff') + flame(40, -6, 1.4, '#7b2ff7', '#c9a2ff') + flame(0, -110, 1.1, '#7b2ff7', '#c9a2ff');
    if (st >= 4) o.back = (o.back || '') + katana(18, -30, -40, 66, st === 5).replace(/#e6edf5/g, '#2a1f3d');
    if (st === 5) o.back += g('translate(-6 -70) rotate(20)', star(0, 0, 44, '#b8c2cc', L(), 4, 0.3) + circle(0, 0, 8, suit, L(2)));
    // 頭巾と口あて
    o.hair = '';
    o.face = path('M-32 ' + (hy + 2) + 'Q-34 ' + (hy - 34) + ' 0 ' + (hy - 34) + 'Q34 ' + (hy - 34) + ' 32 ' + (hy + 2) + 'Z', suit, L()) +
      path('M-32 ' + (hy + 6) + 'H32Q30 ' + (hy + 32) + ' 0 ' + (hy + 32) + 'Q-30 ' + (hy + 32) + ' -32 ' + (hy + 6) + 'Z', suit, L()) +
      eyesHero(0, hy - 2, 12, 1, '#8b5cf6', st <= 1);
    if (st >= 2) o.face += rect(-24, hy - 24, 48, 10, 3, '#b8c2cc', L(2)) + path('M-8 ' + (hy - 19) + 'H8', 'none', S('#556', 2));
    if (st === 5) o.face += rect(-24, hy - 24, 48, 10, 3, '#ffd23f', L(2)) + star(0, hy - 19, 4, '#7b2ff7');
    o.body = path('M-24-30H24', 'none', S(scarf === '#e03131' && st >= 3 ? '#b8c2cc' : '#4a4570', 6));
    // マフラー
    var sl = [0, 0, 26, 40, 58, 72][st];
    if (st >= 2) o.headBack = path('M18 ' + (hy + 28) + 'C' + (40 + sl * 0.3) + ' ' + (hy + 20) + ' ' + (50 + sl * 0.6) + ' ' + (hy + 40) + ' ' + (60 + sl * 0.5) + ' ' + (hy + 30) + 'L' + (56 + sl * 0.5) + ' ' + (hy + 44) + 'C' + (44 + sl * 0.4) + ' ' + (hy + 50) + ' ' + 34 + ' ' + (hy + 40) + ' 16 ' + (hy + 38) + 'Z', scarf, L(2));
    if (st >= 2) o.body += path('M-22-64Q0-56 22-64L20-56Q0-48-20-56Z', scarf, L(2));
    if (st === 3 || st === 4) o.weapon = g('translate(30 -34) rotate(15)', star(0, 0, 13, '#b8c2cc', L(2), 4, 0.32) + circle(0, 0, 3, suit));
    if (st >= 4) o.front = [[-58,-30],[-46,-12],[56,-14]].map(function(p){ return circle(p[0], p[1], 9, '#e9e6ff', 'opacity=".75"') + circle(p[0] + 8, p[1] + 2, 7, '#e9e6ff', 'opacity=".75"'); }).join('');
    return humanoid(o);
  }

  // ---------------------------------------------- ロボット
  function drawRobo(st){
    var W = '#f1f3f5', B = '#1c7ed6', R = '#e03131', Y = '#fcc419', D = '#495057', s = '';
    if (st === 1) {
      s += both(function(d){ return circle(d * 20, -8, 9, D, L()); });
      s += circle(0, -42, 34, W, L()) + path('M-34-42H34', 'none', S(B, 8)) + ell(0, -48, 14, 13, '#183049', L(2)) + circle(0, -48, 7, '#5ff2ff') + circle(-3, -51, 2.5, '#fff');
      s += path('M0-76V-90', 'none', L(3)) + circle(0, -92, 5, R, L(2));
      return s;
    }
    if (st === 2) {
      s += rect(-34, -16, 68, 16, 8, D, L()) + [-22, -8, 6, 20].map(function(x){ return circle(x, -8, 4, '#868e96'); }).join('');
      s += rect(-28, -62, 56, 48, 8, W, L()) + rect(-16, -52, 32, 22, 4, B, L(2)) + circle(-6, -41, 3, Y) + circle(6, -41, 3, R);
      s += both(function(d){ return rect(d * 30 - (d < 0 ? 10 : 0), -56, 10, 26, 5, '#adb5bd', L(2)); });
      s += rect(-24, -104, 48, 40, 10, W, L()) + rect(-18, -94, 36, 16, 8, '#183049', L(2)) + circle(-8, -86, 4, '#5ff2ff') + circle(8, -86, 4, '#5ff2ff');
      s += path('M-14-104L-20-120M14-104L20-120', 'none', L(3)) + circle(-20, -122, 4, Y, L(2)) + circle(20, -122, 4, Y, L(2));
      return s;
    }
    // 人型メカ（成熟期〜）
    var big = st >= 4, k = st === 5 ? 1 : 1, hy = -110;
    if (st === 5) s += both(function(d){ return g('scale(' + d + ' 1)',
      path('M18-90L84-128L96-108L60-84L92-78L88-60L40-64Z', W, L()) + path('M30-84L84-120M36-72L86-72', 'none', S(B, 5)) + flame(70, -52, 0.5, '#5ff2ff', '#ffffff')); });
    if (big) s += both(function(d){ return rect(d * 30 - 9, -96, 18, 30, 4, D, L(2)) + flame(d * 30, -62, 0.45, '#ff7a29', Y); });
    // 足
    s += both(function(d){ return rect(d * 13 - 10, -40, 20, 36, 5, W, L()) + rect(d * 13 - 13, -8, 26, 10, 3, B, L(2)) + rect(d * 13 - 6, -32, 12, 8, 2, '#adb5bd'); });
    s += rect(-24, -48, 48, 12, 4, R, L()) + rect(-6, -48, 12, 12, 2, Y, L(1.6));
    // 胴
    s += path('M-28-92H28L24-48H-24Z', B, L()) + rect(-20, -86, 14, 10, 2, Y, L(1.6)) + rect(6, -86, 14, 10, 2, Y, L(1.6)) +
      path('M-20-82H-6M6-82H20', 'none', S(D, 1.6)) + circle(0, -66, 7, '#5ff2ff', L(2));
    // 肩と腕
    s += both(function(d){ return rect(d * 36 - 13, -100, 26, 20, 6, W, L()) + rect(d * 36 - 8, -80, 16, 30, 5, '#dee2e6', L()) + circle(d * 36, -48, 8, '#adb5bd', L(2)); });
    // 武器：ビームの剣
    if (big) s += g('translate(40 -48) rotate(-25)', rect(-4, -4, 8, 16, 2, D, L(1.6)) + rect(-5, -70, 10, 66, 5, '#ff6bd6', 'opacity=".55"') + rect(-2.5, -68, 5, 64, 2.5, '#fff'));
    // 頭
    s += rect(-20, hy - 22, 40, 34, 9, W, L()) + rect(-15, hy - 12, 30, 12, 4, '#183049', L(2)) + both(function(d){ return circle(d * 7, hy - 6, 3.2, st === 5 ? '#ffe066' : '#5ff2ff'); });
    s += path('M-6 ' + (hy + 6) + 'H6', 'none', S(R, 3));
    var fin = st === 3 ? 10 : st === 4 ? 22 : 34;
    s += path('M0 ' + (hy - 20) + 'L' + (-fin) + ' ' + (hy - 20 - fin) + 'L-4 ' + (hy - 24) + 'L0 ' + (hy - 30) + 'L4 ' + (hy - 24) + 'L' + fin + ' ' + (hy - 20 - fin) + 'Z', Y, L(2)) + circle(0, hy - 22, 3.5, R, L(1.4));
    return s;
  }

  var DRAW = { inu:drawInu, neko:drawNeko, usagi:drawUsagi, panda:drawPanda, hamu:drawHamu,
    dragon:drawDragon, samurai:drawSamurai, knight:drawKnight, ninja:drawNinja, robo:drawRobo };
  var SCALE = [1, 0.58, 0.72, 0.85, 0.94, 1.0];
  // 幼年期（からの中）で顔がかくれないよう、背の低いキャラは少し持ち上げる
  var LIFT = { hamu:30, robo:44 };

  function creature(ch, st){
    var s = '', gid = 'p' + (++uid), k = SCALE[st];
    if (st === 5) {
      s += '<defs><radialGradient id="' + gid + 'a"><stop offset="0" stop-color="' + ch.aura + '" stop-opacity=".55"/><stop offset=".65" stop-color="' + ch.aura + '" stop-opacity=".25"/><stop offset="1" stop-color="' + ch.aura + '" stop-opacity="0"/></radialGradient></defs>';
      s += circle(100, 100, 99, 'url(#' + gid + 'a)');
      for (var i = 0; i < 12; i++) {
        var a = i * Math.PI / 6;
        s += path('M' + (100 + Math.cos(a) * 66).toFixed(1) + ' ' + (100 + Math.sin(a) * 66).toFixed(1) + 'L' + (100 + Math.cos(a) * 96).toFixed(1) + ' ' + (100 + Math.sin(a) * 96).toFixed(1), 'none', 'stroke="' + ch.aura + '" stroke-width="4" stroke-linecap="round" opacity=".5"');
      }
    }
    s += ell(100, 188, 30 + st * 8, 7, 'rgba(0,0,0,.13)');
    INK = ch.ink; K = k;
    s += '<g class="pet-bounce"><g transform="translate(100 ' + (184 - (st === 1 ? LIFT[ch.id] || 0 : 0)) + ') scale(' + k + ')">' + DRAW[ch.id](st) + '</g>';
    K = 1;
    if (st === 1) {
      // 生まれたて：タマゴのからに入っている
      s += path('M50 150L62 140L72 152L84 138L96 150L108 138L120 152L132 140L146 150C150 172 130 186 100 186C70 186 48 172 50 150Z', ch.egg[1], 'stroke="' + ch.egg[0] + '" stroke-width="3.5" stroke-linejoin="round"');
      s += '<g opacity=".7">' + (ch.type === 'cute' ? heart(80, 160, 0.7, ch.egg[0]) + heart(122, 164, 0.6, ch.egg[0]) : star(80, 166, 6, ch.egg[0]) + star(122, 168, 5, ch.egg[0])) + '</g>';
    }
    if (st >= 4) [[30,46,st === 5 ? 9 : 6],[172,58,st === 5 ? 8 : 5],[26,150,7],[174,140,8],[150,22,6]].slice(0, st === 5 ? 5 : 2).forEach(function(q){ s += sparkle(q[0], q[1], q[2], ch.aura); });
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
