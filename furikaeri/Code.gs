/**
 * 授業ふりかえりアンケート（Google Apps Script Webアプリ）
 *
 * ・生徒用フォーム   …… WebアプリのURL
 * ・先生用閲覧ページ …… WebアプリのURL + ?page=teacher
 * ・回答はこのスクリプトを入れたスプレッドシートの「回答」シートに1行ずつ蓄積されます
 *
 * 設置方法は README.md を参照してください。
 */

// ===================== 設定（ここだけ書きかえてください） =====================
const CONFIG = {
  // 先生用ページのパスコード。必ず変更してください（生徒からは見えません）
  TEACHER_PASSCODE: 'change-me',
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
};
// ==========================================================================

const HEADERS = [
  '送信日時', '授業日', '時限', '学年', '組', '番号', '氏名',
  '理解度', '理解度の理由', '進捗度', '進捗度の理由', '質問・感想', 'アカウント',
];
const LEVELS = ['A', 'B', 'C'];
const MAX_TEXT = 1000;

function doGet(e) {
  const page = e && e.parameter && e.parameter.page === 'teacher' ? 'Teacher' : 'Form';
  const t = HtmlService.createTemplateFromFile(page);
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

/** 初回に1度だけエディタから実行すると、シートの作成と権限の許可が済みます */
function setup() {
  sheet_();
}

function today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
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
  try {
    sheet_().appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, date: row[1] };
}

function checkPass_(pass) {
  if (String(pass || '') !== String(CONFIG.TEACHER_PASSCODE)) {
    throw new Error('パスコードが違います。');
  }
}

/** 先生用ページ：パスコードの確認 */
function teacherLogin(pass) {
  checkPass_(pass);
  return true;
}

function cellDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v || '');
}

function cellStamp_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
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
    if (g && Number(v[3]) !== g) continue;
    if (c && Number(v[4]) !== c) continue;
    const d = cellDate_(v[1]);
    if (filter.from && d < filter.from) continue;
    if (filter.to && d > filter.to) continue;
    out.push([
      cellStamp_(v[0]), d, v[2] === '' ? '' : Number(v[2]), Number(v[3]), Number(v[4]), Number(v[5]),
      unquote_(v[6]), String(v[7]), unquote_(v[8]), String(v[9]), unquote_(v[10]), unquote_(v[11]), String(v[12] || ''),
    ]);
  }
  return out;
}
