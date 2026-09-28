/**
 * 楽天ログイン通知ウォッチャー（Google Apps Script）
 *
 * Gmail に届く楽天のログイン通知メールを Google のクラウド上で定期チェックし、
 *   - 自分の端末（MY_IPS）からのログイン → 「自分の端末でログインしました」
 *   - それ以外                            → 「他の端末からログインされました。」＋ IP アドレス
 * を通知します。
 *
 * Main.gs / Logic.gs / Notify.gs / Test.gs の 4 ファイルで 1 セットです。
 * 使い方は README.md を参照。最初に setup() を 1 回実行してください。
 */

// ===== 設定 =====================================================================

const CONFIG = {
  // 自分の端末の IP アドレス（複数可）。"133.106.0.0/16" のような CIDR 表記も使えます。
  MY_IPS: ['133.106.50.64'],

  // 楽天のログイン通知メールを探す Gmail 検索条件
  SEARCH_QUERY: 'from:(rakuten.co.jp OR rakuten.com) ログイン newer_than:2d',
  // 上の検索で見つかったメールのうち、件名がこれに合うもの、または本文に IP アドレスがあるものを通知
  //（「ログインでポイント」のような広告メールを除くため）
  SUBJECT_PATTERN: /ログイン.*(お知らせ|通知|確認|検知)|新しい.*ログイン|ログインがありました/,

  // 何分おきにチェックするか（1, 5, 10, 15, 30 のいずれか）
  CHECK_INTERVAL_MINUTES: 5,

  // true: DKIM で楽天ドメインの署名が確認できたメールだけを通知（なりすましメール対策）
  REQUIRE_DKIM: true,
  TRUSTED_DOMAINS: ['rakuten.co.jp', 'rakuten.com'],

  // 通知方法。使うものを true にし、必要なキーはスクリプト プロパティに登録します（README 参照）
  NOTIFY: {
    EMAIL: true,    // 自分の Gmail 宛てに通知メール（記録用。自分宛てのため iPhone では鳴らないことがある）
    CALENDAR: true, // Google カレンダーの通知で知らせる（iPhone の Google カレンダー アプリで鳴る）
    NTFY: false,    // ntfy.sh（下の NTFY_TOPIC を設定）
    DISCORD: false, // Discord Webhook（DISCORD_WEBHOOK_URL）
    SLACK: false,   // Slack Incoming Webhook（SLACK_WEBHOOK_URL）
    LINE: false,    // LINE Messaging API（LINE_CHANNEL_TOKEN, LINE_USER_ID）
  },
  // ntfy のトピック名（iPhone の ntfy アプリで購読する名前）。他人に推測されない長い文字列に
  NTFY_TOPIC: '',

  TITLE: '楽天アカウントにログインあり',
  MSG_SELF: '自分の端末でログインしました',
  MSG_OTHER: '他の端末からログインされました。',

  PROCESSED_KEY: 'PROCESSED_MESSAGE_IDS',
  PROCESSED_MAX: 300,
};

// ===== セットアップ ================================================================

/** 最初に 1 回だけ手動実行：定期実行トリガーを作成し、既存メールを「処理済み」にする */
function setup() {
  requireAuth_();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'checkRakutenLogin')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkRakutenLogin')
    .timeBased()
    .everyMinutes(CONFIG.CHECK_INTERVAL_MINUTES)
    .create();

  // 既に届いているメールで通知が大量に飛ばないよう、現時点のメールは処理済み扱いにする
  const ids = [];
  GmailApp.search(CONFIG.SEARCH_QUERY).forEach(th => th.getMessages().forEach(m => ids.push(m.getId())));
  saveProcessedIds_(ids);
  Logger.log('セットアップ完了：' + CONFIG.CHECK_INTERVAL_MINUTES + '分ごとにチェックします（既存 ' + ids.length + ' 通は処理済み）');
}

/**
 * 必要な権限（Gmail の閲覧・メール送信など）がすべて許可されているか確認し、
 * 足りなければ許可画面を出す。許可画面では「すべて選択」にチェックを入れること
 */
function requireAuth_() {
  if (ScriptApp.requireAllScopes) ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
}

// ===== メイン処理 ================================================================

/** トリガーから定期実行される本体 */
function checkRakutenLogin() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10 * 1000)) return;
  try {
    const processed = loadProcessedIds_();
    const done = new Set(processed);

    const threads = GmailApp.search(CONFIG.SEARCH_QUERY, 0, 50);
    const messages = [];
    threads.forEach(th => th.getMessages().forEach(m => {
      if (!done.has(m.getId())) messages.push(m);
    }));
    messages.sort((a, b) => a.getDate() - b.getDate());

    // 先に処理済みとして保存（通知に失敗しても同じメールで何度も通知しないため）
    if (messages.length) saveProcessedIds_(processed.concat(messages.map(m => m.getId())));

    messages.forEach(m => {
      if (!isLoginMail_(m)) return;
      if (CONFIG.REQUIRE_DKIM && !isTrustedSender_(m.getRawContent())) {
        Logger.log('DKIM 検証に失敗したためスキップ（なりすましの可能性）：' + m.getSubject());
        return;
      }
      notify_(buildMessage_(extractIp_(bodyOf_(m)), m.getDate()));
    });
  } finally {
    lock.releaseLock();
  }
}

function bodyOf_(m) {
  return m.getPlainBody() || stripHtml_(m.getBody());
}

/** 楽天のログイン通知メールか（広告メールを除く） */
function isLoginMail_(m) {
  return CONFIG.SUBJECT_PATTERN.test(m.getSubject()) || /IP\s*(アドレス|address)/i.test(bodyOf_(m));
}

// ===== 処理済み管理 ================================================================

function loadProcessedIds_() {
  const v = PropertiesService.getScriptProperties().getProperty(CONFIG.PROCESSED_KEY);
  return v ? JSON.parse(v) : [];
}

function saveProcessedIds_(ids) {
  const uniq = Array.from(new Set(ids)).slice(-CONFIG.PROCESSED_MAX);
  PropertiesService.getScriptProperties().setProperty(CONFIG.PROCESSED_KEY, JSON.stringify(uniq));
}

// ===== ここまで（Main.gs の最終行）=====
