// ============================================================================
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

/**
 * 授業ふりかえりアンケート ガチャ版（Google Apps Script Webアプリ）
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
  // ガチャ：false にするとガチャの機能を止めます
  GACHA: true,
  // レア度ごとの出やすさ（合計が100でなくてもよい。割合で決まります）
  RATES: { N: 60, R: 28, SR: 10, SSR: 2 },
  // 1日にガチャを引ける回数の上限（2時間続きの授業でも2回まで）
  GACHA_MAX_PER_DAY: 2,
};
// ==========================================================================

const TZ = 'Asia/Tokyo';
const PASS_KEY = 'TEACHER_PASSCODE';
const TRASH_NAME = '削除済み';
const GACHA_SHEET = 'ガチャ';
const GACHA_LOG_SHEET = 'ガチャ履歴';
const GACHA_HEADERS = ['キー', '学年', '組', '番号', '氏名', '引いた回数', '持っているキャラ', '最後に引いた日', 'その日に数えた授業', '更新日時'];
const GACHA_LOG_HEADERS = ['引いた日時', '授業日', '時限', '学年', '組', '番号', '氏名', 'キャラID', 'キャラ名', 'レア度', 'はじめて'];

// コードの版（checkSetup で、公開中のコードが最新か確かめるため）
const CODE_VERSION = 'gacha-2026-10-22b';

const HEADERS = [
  '送信日時', '授業日', '時限', '学年', '組', '番号', '氏名',
  '理解度', '理解度の理由', '進捗度', '進捗度の理由', '質問・感想', 'アカウント',
];
const LEVELS = ['A', 'B', 'C'];
const MAX_TEXT = 1000;

function doGet(e) {
  const page = e && e.parameter && String(e.parameter.page || '').trim().toLowerCase() === 'teacher' ? 'Teacher' : 'Form';
  try {
    // テンプレート機能（<? ?>）は使わず、設定を直接はめこむ（大きなページでも確実に表示するため）
    // JSON を '…' の中に入れるので、\ と ' と < をエスケープしておく
    const json = JSON.stringify(publicSettings_())
      .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/</g, '\\u003c');
    const html = (page === 'Teacher' ? TEACHER_HTML : FORM_HTML).split('<?!= settings ?>').join(json);
    return HtmlService.createHtmlOutput(html)
      .setTitle(page === 'Teacher' ? 'ふりかえり 集計（先生用）' : CONFIG.SUBJECT + ' 授業ふりかえり')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (err) {
    // エラーの内容を画面に出す（「ファイルを開くことができません」だけでは原因がわからないため）
    const msg = String(err && err.stack || err).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;padding:1rem"><h2>ページを表示できませんでした</h2>' +
      '<p>この画面の内容を、設置した先生（または管理者）に伝えてください。</p>' +
      '<pre style="white-space:pre-wrap;background:#f4f4f4;padding:.8rem">' + page + '\n' + msg + '</pre></div>')
      .setTitle('エラー');
  }
}

/**
 * 点検用：Apps Script のエディタで関数「checkSetup」を選んで ▶実行 すると、
 * 先生用・生徒用ページが作れるかを確かめ、結果を「実行ログ」に表示する。
 */
function checkSetup() {
  const log = [];
  log.push('コードの版: ' + CODE_VERSION);
  log.push('先生用URL: ' + (webAppUrl_() ? webAppUrl_() + '?page=teacher' : '（取得できません）'));
  log.push('先生用パスコード: ' + (PropertiesService.getScriptProperties().getProperty(PASS_KEY) ? '設定済み' : '未設定'));
  log.push('FORM_HTML の長さ: ' + (typeof FORM_HTML === 'string' ? FORM_HTML.length : '（ありません）'));
  log.push('TEACHER_HTML の長さ: ' + (typeof TEACHER_HTML === 'string' ? TEACHER_HTML.length : '（ありません）'));
  [['先生用', { page: 'teacher' }], ['生徒用', {}]].forEach(function (t) {
    try {
      const out = doGet({ parameter: t[1] });
      const html = out.getContent();
      log.push(t[0] + 'ページ: ' + (out.getTitle() === 'エラー' ? 'エラー → ' + html.replace(/<[^>]+>/g, ' ').slice(0, 800) : 'OK（' + html.length + '文字）'));
    } catch (e) {
      log.push(t[0] + 'ページ: 例外 → ' + (e && e.stack || e));
    }
  });
  const text = log.join('\n');
  console.log(text);
  Logger.log(text);
  return text;
}

/**
 * 先生（スクリプトの持ち主）用の URL（…/dev）。取れなければ空
 * ScriptApp.getService().getUrl() はテスト用（/dev）の URL を返す。/dev は持ち主だけが開け、
 * いつも最後に保存したコードで動くので、先生用ページに向いている（/exec に書きかえると開けない）
 */
function webAppUrl_() {
  try { return String(ScriptApp.getService().getUrl() || ''); } catch (e) { return ''; }
}

function publicSettings_() {
  return {
    classes: CONFIG.CLASSES,
    maxNumber: CONFIG.MAX_NUMBER,
    maxPeriod: CONFIG.MAX_PERIOD,
    subject: CONFIG.SUBJECT,
    gacha: CONFIG.GACHA,
    rates: gachaRates_(),
    gachaMaxPerDay: CONFIG.GACHA_MAX_PER_DAY,
    version: CODE_VERSION,
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
  let gacha = null;
  try {
    sheet_().appendRow(row);
    if (CONFIG.GACHA) gacha = pullGacha_(row[3], row[4], row[5], row[6], row[1] + '#' + row[2]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, date: row[1], gacha: gacha };
}

// ===================== ガチャ =====================
// 「ガチャ」シートに、生徒1人につき1行で記録する（学年-組-番号がキー）
// 引いた結果は1回ごとに「ガチャ履歴」シートにも残す
// キャラの一覧（GACHA_LIST）は src/chars.js から node src/build.js で自動で入ります
function gachaSheet_() {
  return namedSheet_(GACHA_SHEET, GACHA_HEADERS, '#fff3d6');
}

function gachaLogSheet_() {
  return namedSheet_(GACHA_LOG_SHEET, GACHA_LOG_HEADERS, '#fff3d6');
}

function namedSheet_(name, headers, color) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground(color);
  }
  return sh;
}

function gachaKey_(g, c, n) { return g + '-' + c + '-' + n; }

/** 「c01:2,c05:1」⇔ { c01: 2, c05: 1 } */
function parseOwned_(s) {
  const o = {};
  String(s || '').split(',').forEach(function (x) {
    const kv = x.split(':');
    const n = Number(kv[1]);
    if (kv[0] && n > 0) o[kv[0]] = n;
  });
  return o;
}

function ownedText_(o) {
  return Object.keys(o).map(function (k) { return k + ':' + o[k]; }).join(',');
}

function loadPlayer_(sh, key) {
  const n = sh.getLastRow() - 1;
  if (n > 0) {
    const vals = sh.getRange(2, 1, n, GACHA_HEADERS.length).getValues();
    for (let i = 0; i < vals.length; i++) {
      if (String(vals[i][0]) === key) {
        const v = vals[i];
        return {
          row: i + 2, key: key, grade: v[1], cls: v[2], num: v[3], name: String(v[4]),
          pulls: Number(v[5]) || 0, owned: parseOwned_(v[6]), day: cellDate_(v[7]),
          lessons: String(v[8] || '').split(',').filter(String),
        };
      }
    }
  }
  return null;
}

function savePlayer_(sh, p) {
  const v = [p.key, p.grade, p.cls, p.num, p.name, p.pulls, ownedText_(p.owned), p.day, p.lessons.join(','), new Date()];
  if (p.row) sh.getRange(p.row, 1, 1, v.length).setValues([v]);
  else { sh.appendRow(v); p.row = sh.getLastRow(); }
}

/** キャラがいるレア度だけの出やすさ（例 { N: 60, R: 28, SR: 10, SSR: 2 }） */
function gachaRates_() {
  const out = {};
  Object.keys(CONFIG.RATES).forEach(function (r) {
    const w = Number(CONFIG.RATES[r]) || 0;
    if (w > 0 && GACHA_LIST.some(function (c) { return c.rarity === r; })) out[r] = w;
  });
  return out;
}

/** レア度を出やすさの割合で決め、そのレア度のキャラから1体を選ぶ */
function drawChar_() {
  const rates = gachaRates_();
  const keys = Object.keys(rates);
  if (!keys.length) return null;
  let total = 0;
  keys.forEach(function (k) { total += rates[k]; });
  let x = Math.random() * total;
  let rarity = keys[keys.length - 1];
  for (let i = 0; i < keys.length; i++) {
    x -= rates[keys[i]];
    if (x < 0) { rarity = keys[i]; break; }
  }
  const pool = GACHA_LIST.filter(function (c) { return c.rarity === rarity; });
  return pool[Math.floor(Math.random() * pool.length)];
}

/** この授業でガチャを引いてよいか（同じ授業は1回、1日の上限あり）。引けるなら記録する */
function countLesson_(p, lesson) {
  const day = lesson.split('#')[0];
  if (p.day !== day) { p.day = day; p.lessons = []; }
  if (p.lessons.indexOf(lesson) >= 0) return 'same';
  if (p.lessons.length >= CONFIG.GACHA_MAX_PER_DAY) return 'limit';
  p.lessons.push(lesson);
  return 'ok';
}

/** 生徒の画面に返す情報（今のキャラ一覧にいるものだけ） */
function gachaView_(p) {
  const owned = {};
  GACHA_LIST.forEach(function (c) { if (p.owned[c.id]) owned[c.id] = p.owned[c.id]; });
  const used = p.day === today_() ? p.lessons.length : 0;
  return { owned: owned, pulls: p.pulls, left: Math.max(0, CONFIG.GACHA_MAX_PER_DAY - used) };
}

/** 送信のたびに呼ぶ。引ける授業なら、ここでガチャの結果を決めて記録する（画面では引く演出だけ） */
function pullGacha_(g, c, n, name, lesson) {
  const sh = gachaSheet_();
  const key = gachaKey_(g, c, n);
  const p = loadPlayer_(sh, key) || { key: key, grade: g, cls: c, num: n, pulls: 0, owned: {}, day: '', lessons: [] };
  p.name = name;
  const counted = countLesson_(p, lesson);
  let result = null;
  if (counted === 'ok') {
    const ch = drawChar_();
    if (ch) {
      const isNew = !p.owned[ch.id];
      p.owned[ch.id] = (p.owned[ch.id] || 0) + 1;
      p.pulls++;
      result = { id: ch.id, isNew: isNew, count: p.owned[ch.id] };
      const parts = lesson.split('#');
      gachaLogSheet_().appendRow([new Date(), parts[0], parts[1] === '' ? '' : Number(parts[1]), g, c, n, name,
        ch.id, ch.name, ch.rarity, isNew ? '○' : '']);
    }
  }
  savePlayer_(sh, p);
  const view = gachaView_(p);
  view.counted = counted;
  view.result = result;
  return view;
}

/** フォームを開いたときに、自分の図鑑を表示する */
function getCollection(g, c, n) {
  if (!CONFIG.GACHA) return null;
  g = toInt_(g); c = toInt_(c); n = toInt_(n);
  if (!CONFIG.CLASSES[g] || !(c >= 1 && c <= CONFIG.CLASSES[g]) || !(n >= 1 && n <= CONFIG.MAX_NUMBER)) return null;
  const p = loadPlayer_(gachaSheet_(), gachaKey_(g, c, n));
  return p ? gachaView_(p) : null;
}

// ===================== スプレッドシートのメニュー =====================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ふりかえり')
    .addItem('先生用ページを開く', 'openTeacherMenu')
    .addItem('先生用パスコードを設定する', 'setPasscodeMenu')
    .addToUi();
}

/** 公開中のウェブアプリの URL から、正しい先生用・生徒用のリンクを表示する（URLの打ちまちがい防止） */
function openTeacherMenu() {
  const ui = SpreadsheetApp.getUi();
  let url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; }
  if (!url) {
    ui.alert('まだウェブアプリとして公開（デプロイ）されていません。\nApps Script の「デプロイ」→「新しいデプロイ」→「ウェブアプリ」で公開してください。');
    return;
  }
  const esc = function (t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); };
  const t = url + '?page=teacher';
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;line-height:1.7">' +
    '<p><a href="' + esc(t) + '" target="_blank" style="font-size:1.2em;font-weight:bold">▶ 先生用ページを開く</a></p>' +
    '<p style="font-size:.85em">先生用（ブックマーク用）：<br><input style="width:100%" readonly value="' + esc(t) + '" onclick="this.select()"></p>' +
    '<p style="font-size:.8em;color:#555">※ この URL（最後が /dev）は持ち主の先生だけが開けるテスト用で、いつも最後に保存したコードで動きます。<br>' +
    '生徒に配るのは「デプロイを管理」の「ウェブアプリ」に表示される URL（最後が /exec）です。</p>' +
    '</div>').setWidth(560).setHeight(300);
  ui.showModalDialog(html, '先生用ページ');
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

// ガチャのキャラ一覧（src/chars.js から自動で作っています）
const GACHA_LIST = [ { "id": "c01", "name": "サンプル1", "rarity": "N" }, { "id": "c02", "name": "サンプル2", "rarity": "N" }, { "id": "c03", "name": "サンプル3", "rarity": "N" }, { "id": "c04", "name": "サンプル4", "rarity": "N" }, { "id": "c05", "name": "サンプル5", "rarity": "N" }, { "id": "c06", "name": "サンプル6", "rarity": "N" }, { "id": "c07", "name": "サンプル7", "rarity": "R" }, { "id": "c08", "name": "サンプル8", "rarity": "R" }, { "id": "c09", "name": "サンプル9", "rarity": "R" }, { "id": "c10", "name": "サンプル10", "rarity": "SR" }, { "id": "c11", "name": "サンプル11", "rarity": "SR" }, { "id": "c12", "name": "サンプル12", "rarity": "SSR" } ];

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
/* ---- ガチャ ---- */
.gtop{background:linear-gradient(135deg,#fff,#fff8e6 55%,#f1f7ff)}
.gtop-head{display:flex;gap:.8rem;align-items:center}
.gtop-head .info{flex:1;min-width:0}
.gtitle{font-size:1.15rem;font-weight:800;margin:0}
.gbar{height:.7rem;background:#e3e9f2;border-radius:99px;overflow:hidden;margin:.3rem 0}
.gbar i{display:block;height:100%;background:linear-gradient(90deg,#ffcc33,#ff8a3d);border-radius:99px}
.gsub{font-size:.85rem;color:var(--ink2)}
.gthumbs{display:flex;flex-wrap:wrap;gap:.25rem;margin-top:.4rem}
.btn.mini{width:auto;display:inline-block;font-size:.85rem;padding:.35rem .9rem;margin-top:.5rem}
.zukan-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:.45rem;margin-top:.7rem}
.zk{background:#fff;border:2px solid var(--line);border-radius:12px;padding:.35rem .2rem .3rem;text-align:center;font-size:.72rem;position:relative}
.zk .nm{display:block;font-weight:700;margin-top:.15rem;word-break:break-all}
.zk .st{display:block;font-size:.68rem;letter-spacing:-.05em}
.zk .ct{position:absolute;top:.15rem;right:.25rem;font-size:.66rem;font-weight:700;color:var(--ink2)}
.zk.no .nm{color:#b6c0cf}
.rates{font-size:.78rem;color:var(--ink2);margin-top:.6rem}
.gdone{margin-top:.6rem}
.gmsg{font-weight:700;color:#d9480f;margin:.4rem 0;min-height:1.4em}
.gstage{position:relative;width:220px;height:250px;margin:.4rem auto 0}
.gmachine{position:absolute;left:0;top:0;width:220px;height:250px}
.gstage.turn .ghandle{animation:gTurn .9s ease-in-out}
@keyframes gTurn{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}
.gstage.turn .gdome{animation:gShake .15s linear 6}
@keyframes gShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
.capsule{position:absolute;left:50%;top:190px;width:56px;height:56px;margin-left:-28px;opacity:0}
.capsule .top,.capsule .bot{position:absolute;left:0;width:56px;height:28px;box-sizing:border-box;border:3px solid rgba(0,0,0,.25)}
.capsule .top{top:0;border-radius:28px 28px 0 0;background:var(--cc);border-bottom-width:1px}
.capsule .bot{bottom:0;border-radius:0 0 28px 28px;background:#fff;border-top-width:1px}
.capsule.drop{animation:gDrop .7s cubic-bezier(.3,1.4,.5,1) forwards}
@keyframes gDrop{0%{opacity:1;transform:translateY(-30px) scale(.6)}100%{opacity:1;transform:translateY(0) scale(1)}}
.capsule.wobble{opacity:1;animation:gWob .18s linear infinite}
@keyframes gWob{0%,100%{transform:rotate(0)}25%{transform:rotate(-12deg)}75%{transform:rotate(12deg)}}
.capsule.open{opacity:1}
.capsule.open .top{animation:gOpenT .45s ease-out forwards}
.capsule.open .bot{animation:gOpenB .45s ease-out forwards}
@keyframes gOpenT{to{transform:translate(-26px,-36px) rotate(-40deg);opacity:0}}
@keyframes gOpenB{to{transform:translate(26px,30px) rotate(30deg);opacity:0}}
.greveal{position:relative;display:inline-block;margin:.6rem auto 0;padding:1rem}
.greveal .gc-pic{position:relative;z-index:1;animation:gPop .6s cubic-bezier(.2,1.6,.4,1)}
@keyframes gPop{0%{transform:scale(.2)}100%{transform:scale(1)}}
.greveal::before{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(var(--rl) 30%,rgba(255,255,255,0) 70%)}
.greveal.r-SR::before{background:radial-gradient(#e9c8ff 25%,rgba(255,255,255,0) 70%)}
.greveal.r-SSR::before{inset:-25%;background:conic-gradient(#ff6b6b,#ffd93d,#6bcB77,#4d96ff,#c77dff,#ff6b6b);border-radius:50%;opacity:.45;animation:gSpin 4s linear infinite;
  -webkit-mask:radial-gradient(transparent 20%,#000 21%,transparent 70%);mask:radial-gradient(transparent 20%,#000 21%,transparent 70%)}
@keyframes gSpin{to{transform:rotate(360deg)}}
.gflash{position:fixed;inset:0;background:#fff;pointer-events:none;z-index:50;animation:gFlash .6s ease-out forwards}
@keyframes gFlash{0%{opacity:.95}100%{opacity:0}}
.grar{display:inline-block;font-weight:800;color:#fff;border-radius:99px;padding:.05rem .7rem;font-size:.85rem}
.gname{font-size:1.35rem;font-weight:800;margin:.2rem 0}
.gnew{display:inline-block;background:#ff3b6b;color:#fff;font-weight:800;border-radius:6px;padding:0 .45rem;margin-left:.3rem;font-size:.85rem;vertical-align:middle;animation:gPop .5s .3s both}
.btn.gacha{background:linear-gradient(90deg,#ff8a3d,#ff3b6b,#c77dff);font-size:1.2rem}
.btn.gacha:disabled{opacity:.6}
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

  <section class="panel gtop hidden" id="gTop" aria-live="polite"></section>

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
    <div id="gDone" class="gdone hidden"></div>
    <details class="sent" id="sentBox"><summary>送信した内容を見る</summary><dl id="summary"></dl></details>
    <button type="button" class="btn sub" id="again" style="margin-top:1rem">まちがえたので、もう一度送る</button>
  </section>
  <p id="verNote" class="hint" style="text-align:center;opacity:.6;margin-top:2rem"></p>
</main>

<script>
// キャラの画像（tools/add_chars.py で art/ から自動で作っています。手で書きかえないでください）
var CHAR_IMAGES = {

};
</script>
<script>
/* =========================================================================
 * ガチャから出るキャラクターの一覧
 *   GACHA.list          … キャラクターの一覧（この順で図鑑に並びます）
 *   GACHA.get(id)       … 1体の情報
 *   GACHA.rarity(r)     … レア度の情報（名前・色・★の数）
 *   GACHA.pic(id, size) … キャラの絵（HTML文字列）
 *
 * 絵は char-images.js（tools/add_chars.py で art/ の画像から自動作成）に入っています。
 * 絵がまだ無いキャラは、レア度の色のカードに emoji を描いて代わりにします。
 *
 * ★ キャラを足す・変えるときは、下の LIST を書きかえます。
 *   id     … 半角英数字（art/ に置く画像のファイル名と同じにする。例：c01 → art/c01.png）
 *   name   … 表示する名前
 *   rarity … 'N'（ノーマル）/ 'R'（レア）/ 'SR'（スーパーレア）/ 'SSR'（ウルトラレア）
 *   emoji  … 絵が無いときの代わりの絵（なくてもよい）
 *   sample … true のキャラは仮のキャラです（本物の絵がそろったら消します）
 * ========================================================================= */
var GACHA = (function(){
  // weight の初期値は Apps Script 側の CONFIG.RATES で上書きされます
  var RARITIES = [
    { id:'N',   name:'ノーマル',       stars:1, color:'#8a96a8', light:'#eef1f5' },
    { id:'R',   name:'レア',           stars:2, color:'#2f8fd0', light:'#e3f2fc' },
    { id:'SR',  name:'スーパーレア',   stars:3, color:'#b05ce0', light:'#f4e8fc' },
    { id:'SSR', name:'ウルトラレア',   stars:4, color:'#e0a800', light:'#fff6d6' }
  ];

  var LIST = [
    { id:'c01', name:'サンプル1',  rarity:'N',   emoji:'🐣', sample:true },
    { id:'c02', name:'サンプル2',  rarity:'N',   emoji:'🐸', sample:true },
    { id:'c03', name:'サンプル3',  rarity:'N',   emoji:'🐟', sample:true },
    { id:'c04', name:'サンプル4',  rarity:'N',   emoji:'🐌', sample:true },
    { id:'c05', name:'サンプル5',  rarity:'N',   emoji:'🐝', sample:true },
    { id:'c06', name:'サンプル6',  rarity:'N',   emoji:'🐢', sample:true },
    { id:'c07', name:'サンプル7',  rarity:'R',   emoji:'🦊', sample:true },
    { id:'c08', name:'サンプル8',  rarity:'R',   emoji:'🐧', sample:true },
    { id:'c09', name:'サンプル9',  rarity:'R',   emoji:'🦉', sample:true },
    { id:'c10', name:'サンプル10', rarity:'SR',  emoji:'🦁', sample:true },
    { id:'c11', name:'サンプル11', rarity:'SR',  emoji:'🦄', sample:true },
    { id:'c12', name:'サンプル12', rarity:'SSR', emoji:'🐉', sample:true }
  ];

  var BY = {}, RBY = {};
  LIST.forEach(function(c){ BY[c.id] = c; });
  RARITIES.forEach(function(r){ RBY[r.id] = r; });

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  /** キャラの絵。hidden=true なら影（まだ持っていないキャラ） */
  function pic(id, size, hidden){
    var c = BY[id], r = RBY[c ? c.rarity : 'N'];
    size = size || 120;
    var img = typeof CHAR_IMAGES !== 'undefined' && CHAR_IMAGES[id];
    var cls = 'gc-pic' + (hidden ? ' gc-hidden' : '');
    var box = 'width:' + size + 'px;height:' + size + 'px';
    if (img) {
      return '<span class="' + cls + '" style="' + box + '"><img src="' + img + '" alt="' + esc(hidden ? '？' : c.name) + '"></span>';
    }
    // 絵が無いキャラ：レア度の色のカード
    return '<span class="' + cls + ' gc-card" style="' + box + ';--rc:' + r.color + ';--rl:' + r.light + ';font-size:' + Math.round(size * 0.5) + 'px">' +
      (hidden ? '？' : esc((c && c.emoji) || '★')) + '</span>';
  }

  function stars(r){
    var n = (RBY[r] || RBY.N).stars, s = '';
    for (var i = 0; i < n; i++) s += '★';
    return s;
  }

  var css = [
    '.gc-pic{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;line-height:1;border-radius:14px;overflow:hidden;flex:0 0 auto}',
    '.gc-pic img{width:100%;height:100%;object-fit:contain;display:block}',
    '.gc-card{background:radial-gradient(circle at 50% 40%,#fff 0,var(--rl) 70%);border:3px solid var(--rc);box-sizing:border-box}',
    '.gc-hidden img{filter:brightness(0);opacity:.18}',
    '.gc-hidden.gc-card{background:#eef1f5;border-color:#d7dee9;color:#b6c0cf;font-weight:900}'
  ].join('\\n');

  return {
    list: LIST,
    RARITIES: RARITIES,
    get: function(id){ return BY[id] || null; },
    rarity: function(r){ return RBY[r] || RBY.N; },
    stars: stars,
    pic: pic,
    css: css
  };
})();
</script>
<script>
var SETTINGS = (function(){
  try { return JSON.parse('<?!= settings ?>'); } catch(e) {
    // Apps Script の外で開いたとき（体験モード）
    var w = null;
    try { w = JSON.parse(localStorage.getItem('furikaeri_demo_word') || 'null'); } catch(x) {}
    return { classes:{1:6,2:6,3:7}, maxNumber:35, maxPeriod:6, subject:'技術', needWord: !w || w.mode !== 'off', gacha:true, gachaMaxPerDay:2, rates:demoRates({ N:60, R:28, SR:10, SSR:2 }) };
  }
})();
// 体験モード用：キャラがいるレア度だけの出やすさ（Apps Script 側の gachaRates_ と同じ）
function demoRates(r){
  var out = {};
  Object.keys(r).forEach(function(k){ if (r[k] > 0 && GACHA.list.some(function(c){ return c.rarity === k; })) out[k] = r[k]; });
  return out;
}
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
  if (SETTINGS.version) $('verNote').textContent = 'ver ' + SETTINGS.version;

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
  if (SETTINGS.gacha) {
    document.head.insertAdjacentHTML('beforeend', '<style>' + GACHA.css + '</style>');
    ['grade','cls','num'].forEach(function(id){ $(id).addEventListener('change', loadTop); });
    loadTop();
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
    if (SETTINGS.gacha) loadTop();
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
    if (SETTINGS.gacha && res.gacha) showGachaAfterSend(res.gacha);
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
    var gacha = demoGacha.pull(r, day + '#' + (r.period || ''));
    setTimeout(function(){ cb({ ok:true, gacha:gacha }); }, 300);
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

// ======================= ガチャ =======================
function serverCall(fn, args, ok, ng){
  if (DEMO) {
    setTimeout(function(){ try { ok(demoGacha[fn].apply(null, args)); } catch(e) { ng(e); } }, 200);
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

function ownedCount(v){ return GACHA.list.filter(function(c){ return v && v.owned && v.owned[c.id]; }).length; }

function rarityTag(r){
  var R = GACHA.rarity(r);
  return '<span class="grar" style="background:' + R.color + '">' + R.id + ' ' + GACHA.stars(r) + '</span>';
}

function ratesHtml(){
  var rates = SETTINGS.rates || {}, keys = Object.keys(rates), total = 0;
  keys.forEach(function(k){ total += rates[k]; });
  if (!total) return '';
  return '<div class="rates">出る確率：' + keys.map(function(k){
    return k + ' ' + (Math.round(rates[k] / total * 1000) / 10) + '%';
  }).join('　') + '</div>';
}

function zukanGridHtml(v){
  var owned = (v && v.owned) || {};
  return '<div class="zukan-grid">' + GACHA.list.map(function(c, i){
    var have = owned[c.id];
    return '<div class="zk' + (have ? '' : ' no') + '">' + (have > 1 ? '<span class="ct">×' + have + '</span>' : '') +
      GACHA.pic(c.id, 72, !have) +
      '<span class="nm">' + (have ? esc(c.name) : 'No.' + (i + 1)) + '</span>' +
      '<span class="st" style="color:' + GACHA.rarity(c.rarity).color + '">' + GACHA.stars(c.rarity) + '</span></div>';
  }).join('') + '</div>' + ratesHtml();
}

function collectionHead(v){
  var have = ownedCount(v), all = GACHA.list.length;
  return '<p class="gtitle">🎰 ガチャ図鑑 <b>' + have + '</b> / ' + all + '</p>' +
    '<div class="gbar"><i style="width:' + (all ? Math.round(have / all * 100) : 0) + '%"></i></div>';
}

// フォーム上の「わたしの図鑑」
var topReq = 0;
function loadTop(){
  var g = $('grade').value, c = $('cls').value, n = $('num').value, box = $('gTop');
  if (!g || !c || !n) { box.classList.add('hidden'); return; }
  var my = ++topReq;
  serverCall('getCollection', [g, c, n], function(v){
    if (my !== topReq) return; // 選びなおしたあとの古い返事は使わない
    box.classList.remove('hidden');
    var left = v ? v.left : SETTINGS.gachaMaxPerDay;
    var owned = (v && v.owned) || {};
    var thumbs = GACHA.list.filter(function(ch){ return owned[ch.id]; }).map(function(ch){
      return '<span title="' + esc(ch.name) + '">' + GACHA.pic(ch.id, 40) + '</span>';
    }).join('');
    box.innerHTML = '<div class="gtop-head"><div class="info">' + collectionHead(v) +
      '<div class="gsub">' + (left > 0 ? 'ふりかえりを送信すると、ガチャを<b>1回</b>引けます（今日はあと' + left + '回）' : '今日のガチャはおしまい。続きは次の授業で！') + '</div></div></div>' +
      (thumbs ? '<div class="gthumbs">' + thumbs + '</div>' : '') +
      '<button type="button" class="btn sub mini" id="zkBtn">図鑑を見る</button><div id="zkBox" class="hidden"></div>';
    $('zkBtn').addEventListener('click', function(){
      var z = $('zkBox'), open = z.classList.toggle('hidden') === false;
      if (open && !z.innerHTML) z.innerHTML = zukanGridHtml(v);
      $('zkBtn').textContent = open ? '図鑑をとじる' : '図鑑を見る';
    });
  }, function(){ box.classList.add('hidden'); });
}

var COUNT_MSG = {
  same: '同じ授業の2回目の送信なので、ガチャは引けません。',
  limit: '今日はもうガチャを引いたので、続きは次の授業で！'
};

// ガチャのマシン（SVG）。カプセルの色はレア度の色
function machineSvg(){
  var caps = [[78,62,'#ff6b6b'],[110,52,'#4d96ff'],[142,64,'#ffd93d'],[92,90,'#6bcb77'],[128,92,'#c77dff'],[66,96,'#ff9f43'],[156,98,'#4dd2ff'],[110,78,'#ff7eb6']];
  return '<svg class="gmachine" viewBox="0 0 220 250" aria-hidden="true">' +
    '<g class="gdome" style="transform-origin:110px 80px">' +
    '<circle cx="110" cy="80" r="68" fill="#e9f6ff" stroke="#2b3a55" stroke-width="5"/>' +
    caps.map(function(c){ return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="15" fill="' + c[2] + '" stroke="#2b3a55" stroke-width="2.5"/><path d="M' + (c[0]-15) + ' ' + c[1] + 'h30" stroke="#2b3a55" stroke-width="2"/>'; }).join('') +
    '<ellipse cx="88" cy="50" rx="16" ry="9" fill="#fff" opacity=".7"/></g>' +
    '<path d="M38 140h144l10 100H28z" fill="#ff3b6b" stroke="#2b3a55" stroke-width="5" stroke-linejoin="round"/>' +
    '<rect x="44" y="132" width="132" height="16" rx="6" fill="#ff8a3d" stroke="#2b3a55" stroke-width="5"/>' +
    '<rect x="82" y="196" width="56" height="38" rx="8" fill="#2b3a55"/>' +
    '<g class="ghandle" style="transform-origin:150px 172px"><circle cx="150" cy="172" r="17" fill="#ffd93d" stroke="#2b3a55" stroke-width="4"/><rect x="146" y="158" width="8" height="28" rx="3" fill="#2b3a55"/></g>' +
    '<text x="72" y="180" font-size="20" font-weight="900" fill="#fff" text-anchor="middle" font-family="sans-serif">GO!</text>' +
    '</svg>';
}

function showGachaAfterSend(v){
  var box = $('gDone');
  box.classList.remove('hidden');
  $('sentBox').open = false;
  if (!v.result) {
    box.innerHTML = '<p class="gmsg">' + esc(COUNT_MSG[v.counted] || 'ガチャのキャラがまだ登録されていません。') + '</p>' + collectionHead(v);
    return;
  }
  box.innerHTML = '<div class="gstage" id="gStage">' + machineSvg() +
    '<div class="capsule" id="gCap" style="--cc:' + GACHA.rarity(GACHA.get(v.result.id).rarity).color + '"><div class="top"></div><div class="bot"></div></div></div>' +
    '<button type="button" class="btn gacha" id="gGo">🎰 ガチャを回す！</button><div id="gOut"></div>';
  $('gGo').addEventListener('click', function(){
    $('gGo').disabled = true;
    $('gGo').textContent = 'ガラガラ…';
    runGacha(v);
  });
}

// 演出：ハンドルが回る → カプセルが落ちる → ぶるぶる → パカッ → キャラ
function runGacha(v){
  var st = $('gStage'), cap = $('gCap'), ch = GACHA.get(v.result.id), R = GACHA.rarity(ch.rarity);
  st.classList.add('turn');
  setTimeout(function(){
    cap.classList.add('drop');
    setTimeout(function(){
      cap.classList.remove('drop');
      cap.classList.add('wobble');
      setTimeout(function(){
        cap.classList.remove('wobble');
        cap.classList.add('open');
        if (ch.rarity === 'SR' || ch.rarity === 'SSR') {
          var f = document.createElement('div'); f.className = 'gflash'; document.body.appendChild(f);
          setTimeout(function(){ f.remove(); }, 700);
        }
        setTimeout(function(){
          st.classList.add('hidden');
          $('gGo').classList.add('hidden');
          $('gOut').innerHTML = '<div class="greveal r-' + ch.rarity + '" style="--rl:' + R.light + '">' + GACHA.pic(ch.id, 170) + '</div>' +
            '<div>' + rarityTag(ch.rarity) + '</div>' +
            '<p class="gname">' + esc(ch.name) + (v.result.isNew ? '<span class="gnew">NEW!</span>' : '') + '</p>' +
            '<p class="gsub">' + (v.result.isNew ? '図鑑に登録された！' : 'もう持っているキャラ（' + v.result.count + '体目）') + '</p>' +
            collectionHead(v) +
            '<button type="button" class="btn sub mini" id="zkBtn2">図鑑を見る</button><div id="zkBox2" class="hidden"></div>';
          $('zkBtn2').addEventListener('click', function(){
            var z = $('zkBox2'), open = z.classList.toggle('hidden') === false;
            if (open && !z.innerHTML) z.innerHTML = zukanGridHtml(v);
            $('zkBtn2').textContent = open ? '図鑑をとじる' : '図鑑を見る';
          });
        }, 420);
      }, ch.rarity === 'SSR' ? 1500 : 900);
    }, 700);
  }, 900);
}

// 体験モード用（本番では Apps Script 側で同じことをします）
var demoGacha = (function(){
  var KEY = 'gacha_demo_players';
  function all(){ return store(KEY) || {}; }
  function today(){ var d = new Date(), p = function(n){ return ('0' + n).slice(-2); }; return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()); }
  function view(p){
    var owned = {};
    GACHA.list.forEach(function(c){ if (p.owned[c.id]) owned[c.id] = p.owned[c.id]; });
    return { owned:owned, pulls:p.pulls, left: Math.max(0, SETTINGS.gachaMaxPerDay - (p.day === today() ? p.lessons.length : 0)) };
  }
  function count(p, lesson){
    var day = lesson.split('#')[0];
    if (p.day !== day) { p.day = day; p.lessons = []; }
    if (p.lessons.indexOf(lesson) >= 0) return 'same';
    if (p.lessons.length >= SETTINGS.gachaMaxPerDay) return 'limit';
    p.lessons.push(lesson); return 'ok';
  }
  function draw(){
    var rates = SETTINGS.rates, keys = Object.keys(rates), total = 0, x, r;
    keys.forEach(function(k){ total += rates[k]; });
    if (!total) return null;
    x = Math.random() * total; r = keys[keys.length - 1];
    for (var i = 0; i < keys.length; i++) { x -= rates[keys[i]]; if (x < 0) { r = keys[i]; break; } }
    var pool = GACHA.list.filter(function(c){ return c.rarity === r; });
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return {
    pull: function(r, lesson){
      var db = all(), key = r.grade + '-' + r.cls + '-' + r.num;
      var p = db[key] || { pulls:0, owned:{}, day:'', lessons:[] };
      var counted = count(p, lesson), result = null;
      if (counted === 'ok') {
        var ch = draw();
        if (ch) {
          var isNew = !p.owned[ch.id];
          p.owned[ch.id] = (p.owned[ch.id] || 0) + 1; p.pulls++;
          result = { id:ch.id, isNew:isNew, count:p.owned[ch.id] };
        }
      }
      db[key] = p; store(KEY, db);
      var v = view(p); v.counted = counted; v.result = result; return v;
    },
    getCollection: function(g, c, n){ var p = all()[g + '-' + c + '-' + n]; return p ? view(p) : null; }
  };
})();

function showDone(r){
  var items = [
    ['クラス', r.grade + '年' + r.cls + '組 ' + r.num + '番 ' + r.name + (r.period ? '（' + r.period + '時間目）' : '')],
    ['理解度', r.understand + '　' + r.understandReason],
    ['進捗度', r.progress + '　' + r.progressReason]
  ];
  if (r.question) items.push(['質問など', r.question]);
  $('gDone').classList.add('hidden');
  $('gTop').classList.add('hidden'); // 送信後は下の結果にガチャを出す
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
