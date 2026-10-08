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
};
// ==========================================================================

const TZ = 'Asia/Tokyo';
const PASS_KEY = 'TEACHER_PASSCODE';
const TRASH_NAME = '削除済み';

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
  try {
    sheet_().appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, date: row[1] };
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
