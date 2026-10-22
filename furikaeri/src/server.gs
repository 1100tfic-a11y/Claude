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
  // タマゴを選んだ後、何回提出すると孵化するか
  HATCH_AFTER: 1,
  // 1日に育成ポイントがもらえる回数の上限（2時間続きの授業でも2回まで）
  GROW_MAX_PER_DAY: 2,
};
// ==========================================================================

const TZ = 'Asia/Tokyo';
const PASS_KEY = 'TEACHER_PASSCODE';
const TRASH_NAME = '削除済み';
const PET_SHEET = 'キャラ';
// src/pets.js の list と同じ並び（id）
const PET_IDS = ['inu', 'neko', 'usagi', 'panda', 'hamu', 'dragon', 'samurai', 'ninja', 'robo', 'knight'];
// 段階：0 タマゴ / 1 成長期 / 2 成熟期 / 3 完全体 / 4 究極体
const ULT_STAGE = 4;
const PET_HEADERS = ['キー', '学年', '組', '番号', '氏名', '育成中のキャラ', '育成ポイント', '最後に育てた日', 'その日に数えた授業', '育て上げたキャラ', '更新日時'];

// コードの版（checkSetup で、公開中のコードが最新か確かめるため）
const CODE_VERSION = '2026-10-23c';

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
    pets: CONFIG.PETS,
    growPerStage: CONFIG.GROW_PER_STAGE,
    hatchAfter: CONFIG.HATCH_AFTER,
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

// 見出し（キー）は「1年3組12番」の形にする。
// 「1-3-12」の形だとスプレッドシートが日付（2012/1/3）に変換してしまい、行を探せなくなるため
function petKey_(g, c, n) { return Number(g) + '年' + Number(c) + '組' + Number(n) + '番'; }

/** キー（新しい形「1年3組12番」・古い形「1-3-12」のどちらでも）から学年・組・番号を取り出す */
function parseKey_(key) {
  const m = /^(\d+)\D+(\d+)\D+(\d+)/.exec(String(key));
  return m ? { g: Number(m[1]), c: Number(m[2]), n: Number(m[3]) } : null;
}

/**
 * 生徒の行を「学年・組・番号」の列で探す（見出しの列は日付に化けている可能性があるので使わない）
 * 不具合で同じ生徒の行が複数できている場合は、キャラを育てている行・ポイントが多い行・新しい行の順で選ぶ
 */
function loadPet_(sh, key) {
  const k = parseKey_(key);
  const n = sh.getLastRow() - 1;
  if (!k || n <= 0) return null;
  const vals = sh.getRange(2, 1, n, PET_HEADERS.length).getValues();
  let best = -1, bestScore = -1;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (Number(v[1]) !== k.g || Number(v[2]) !== k.c || Number(v[3]) !== k.n) continue;
    const cur = PET_IDS.indexOf(String(v[5] || '')) >= 0;
    const score = (cur ? 1e6 : 0) + (Number(v[6]) || 0) * 1000 + String(v[9] || '').length * 10 + 1;
    if (score >= bestScore) { best = i; bestScore = score; }
  }
  if (best < 0) return null;
  const v = vals[best];
  let current = String(v[5] || '');
  let points = Number(v[6]) || 0;
  // 昔のキャラ（今は無いもの）を育てていた場合は、タマゴ選びからやり直し
  if (current && PET_IDS.indexOf(current) < 0) { current = ''; points = 0; }
  return {
    row: best + 2, key: petKey_(k.g, k.c, k.n), grade: k.g, cls: k.c, num: k.n, name: String(v[4]),
    current: current, points: points, day: cellDate_(v[7]),
    lessons: String(v[8] || '').split(',').filter(String),
    done: String(v[9] || '').split(',').filter(function (x) { return PET_IDS.indexOf(x) >= 0; }),
  };
}

function savePet_(sh, p) {
  const v = [p.key, p.grade, p.cls, p.num, p.name, p.current, p.points, p.day, p.lessons.join(','), p.done.join(','), new Date()];
  if (p.row) sh.getRange(p.row, 1, 1, v.length).setValues([v]);
  else { sh.appendRow(v); p.row = sh.getLastRow(); }
}

// 育成ポイント → 段階。タマゴを選んだ回で1ポイント、そこから HATCH_AFTER 回で孵化、
// その後は GROW_PER_STAGE 回ごとに進化する
function petStage_(points) {
  const hatch = 1 + CONFIG.HATCH_AFTER;
  if (points < hatch) return 0;
  return Math.min(ULT_STAGE, 1 + Math.floor((points - hatch) / CONFIG.GROW_PER_STAGE));
}

/** 生徒の画面に返す情報 */
function petView_(p) {
  const stage = p.current ? petStage_(p.points) : 0;
  return {
    current: p.current, points: p.points, stage: stage, done: p.done,
    needEgg: !p.current || stage === ULT_STAGE,
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
  if (p.current && before < ULT_STAGE) {
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
  PropertiesService.getScriptProperties().deleteProperty(PASS_FAIL_KEY); // ロックも解除
  sheet_();
  ui.alert('パスコードを設定しました。\n「回答」シートも作成しました。\n\n次は Apps Script の画面で「デプロイ」をしてください。');
}

// 先生用パスコードを PASS_MAX_FAIL 回まちがえると、PASS_LOCK_MIN 分間ロックする（正しくても入れない）
// ロックは、スプレッドシートのメニューでパスコードを設定し直すと解除される
const PASS_FAIL_KEY = 'TEACHER_PASS_FAIL';
const PASS_MAX_FAIL = 5;
const PASS_LOCK_MIN = 30;
const LOCK_MSG = 'これ以上は入力できません。';

function passFail_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(PASS_FAIL_KEY) || 'null') || { n: 0, until: 0 }; }
  catch (e) { return { n: 0, until: 0 }; }
}

function checkPass_(pass) {
  const props = PropertiesService.getScriptProperties();
  const want = props.getProperty(PASS_KEY);
  if (!want) {
    throw new Error('先生用パスコードがまだ設定されていません。スプレッドシートのメニュー「ふりかえり」→「先生用パスコードを設定する」で設定してください。');
  }
  const f = passFail_();
  const now = Date.now();
  if (f.until > now) {
    const min = Math.ceil((f.until - now) / 60000);
    throw new Error(LOCK_MSG + 'パスコードを' + PASS_MAX_FAIL + '回まちがえたため、あと' + min + '分間ロックしています。' +
      'すぐに解除するには、スプレッドシートのメニュー「ふりかえり」→「先生用パスコードを設定する」で設定し直してください。');
  }
  if (String(pass || '') !== want) {
    const n = (f.until && f.until <= now ? 0 : f.n) + 1;
    if (n >= PASS_MAX_FAIL) {
      props.setProperty(PASS_FAIL_KEY, JSON.stringify({ n: n, until: now + PASS_LOCK_MIN * 60000 }));
      throw new Error(LOCK_MSG + 'パスコードを' + PASS_MAX_FAIL + '回まちがえたため、' + PASS_LOCK_MIN + '分間ロックしました。' +
        'すぐに解除するには、スプレッドシートのメニュー「ふりかえり」→「先生用パスコードを設定する」で設定し直してください。');
    }
    props.setProperty(PASS_FAIL_KEY, JSON.stringify({ n: n, until: 0 }));
    throw new Error('パスコードが違います。（あと' + (PASS_MAX_FAIL - n) + '回まちがえると、' + PASS_LOCK_MIN + '分間入力できなくなります）');
  }
  if (f.n || f.until) props.deleteProperty(PASS_FAIL_KEY);
}

// ===================== 合言葉 =====================
// 設定はスクリプトプロパティに保存し、先生用ページから変更する（コードの書きかえ・再デプロイ不要）
//   mode: 'daily'（毎日自動でかわる6けたの数字）/ 'fixed'（先生が決めた言葉）/ 'off'（使わない）
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

/** その日の合言葉（6けた）。日付と秘密の値から計算するので、日付が変わると自動で変わる */
function dailyWord_(secret, day) {
  const sig = Utilities.computeHmacSha256Signature(day, secret);
  let n = 0;
  for (let i = 0; i < 4; i++) n = n * 256 + (sig[i] & 255);
  return ('00000' + (n % 1000000)).slice(-6);
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
