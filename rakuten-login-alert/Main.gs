/**
 * 楽天ログイン通知ウォッチャー（Google Apps Script）
 *
 * Gmail に届く楽天のログイン通知メールを Google のクラウド上で定期チェックし、
 *   - 自分の端末（MY_IPS）からのログイン → 「自分の端末でログインしました」
 *   - それ以外                            → 「他の端末からログインされました。」＋ IP アドレス
 * を通知します。
 *
 * Main.gs / Logic.gs / Notify.gs の 3 ファイルで 1 セットです。
 * 使い方は README.md を参照。最初に setup() を 1 回実行してください。
 */

// ===== 設定 =====================================================================

const CONFIG = {
  // 自分の端末の IP アドレス（複数可）。"133.106.0.0/16" のような CIDR 表記も使えます。
  MY_IPS: ['133.106.50.64'],

  // 楽天のログイン通知メールを探す Gmail 検索条件
  SEARCH_QUERY: 'from:rakuten.co.jp subject:ログイン newer_than:2d',

  // 何分おきにチェックするか（1, 5, 10, 15, 30 のいずれか）
  CHECK_INTERVAL_MINUTES: 5,

  // true: DKIM で楽天ドメインの署名が確認できたメールだけを通知（なりすましメール対策）
  REQUIRE_DKIM: true,
  TRUSTED_DOMAINS: ['rakuten.co.jp', 'rakuten.com'],

  // 通知方法。使うものを true にし、必要なキーはスクリプト プロパティに登録します（README 参照）
  NOTIFY: {
    EMAIL: true,    // 自分の Gmail 宛てに通知メール（iPhone の Gmail アプリでプッシュ通知）
    NTFY: false,    // ntfy.sh（スクリプト プロパティ NTFY_TOPIC）
    DISCORD: false, // Discord Webhook（DISCORD_WEBHOOK_URL）
    SLACK: false,   // Slack Incoming Webhook（SLACK_WEBHOOK_URL）
    LINE: false,    // LINE Messaging API（LINE_CHANNEL_TOKEN, LINE_USER_ID）
  },

  TITLE: '楽天アカウントにログインあり',
  MSG_SELF: '自分の端末でログインしました',
  MSG_OTHER: '他の端末からログインされました。',

  PROCESSED_KEY: 'PROCESSED_MESSAGE_IDS',
  PROCESSED_MAX: 300,
};

// ===== セットアップ ================================================================

/** 最初に 1 回だけ手動実行：定期実行トリガーを作成し、既存メールを「処理済み」にする */
function setup() {
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

/** 通知のテスト送信（自分の端末／他の端末の両パターン） */
function testNotify() {
  notify_(buildMessage_(CONFIG.MY_IPS[0], new Date()));
  notify_(buildMessage_('203.0.113.45', new Date()));
}

// ===== メイン処理 ================================================================

/** トリガーから定期実行される本体 */
function checkRakutenLogin() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10 * 1000)) return;
  try {
    const processed = loadProcessedIds_();
    const done = new Set(processed);
    const newIds = [];

    const threads = GmailApp.search(CONFIG.SEARCH_QUERY, 0, 50);
    const messages = [];
    threads.forEach(th => th.getMessages().forEach(m => {
      if (!done.has(m.getId())) messages.push(m);
    }));
    messages.sort((a, b) => a.getDate() - b.getDate());

    messages.forEach(m => {
      newIds.push(m.getId());
      if (CONFIG.REQUIRE_DKIM && !isTrustedSender_(m.getRawContent())) {
        Logger.log('DKIM 検証に失敗したためスキップ（なりすましの可能性）：' + m.getSubject());
        return;
      }
      const body = m.getPlainBody() || stripHtml_(m.getBody());
      const ip = extractIp_(body);
      notify_(buildMessage_(ip, m.getDate()));
    });

    if (newIds.length) saveProcessedIds_(processed.concat(newIds));
  } finally {
    lock.releaseLock();
  }
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
