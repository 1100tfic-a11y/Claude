/**
 * 楽天ログイン通知ウォッチャー（Google Apps Script）
 *
 * Gmail に届く楽天のログイン通知メールを Google のクラウド上で定期チェックし、
 *   - 自分の端末（MY_IPS）からのログイン → 「自分の端末でログインしました」
 *   - それ以外                            → 「他の端末からログインされました。」＋ IP アドレス
 * を通知します。
 *
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

// ===== 判定ロジック（純粋関数） =====================================================

/** 通知タイトルと本文を組み立てる */
function buildMessage_(ip, date) {
  const when = formatDate_(date);
  const self = ip && isMyIp_(ip, CONFIG.MY_IPS);
  let body;
  if (self) {
    body = CONFIG.MSG_SELF;
  } else {
    body = CONFIG.MSG_OTHER + '\nIPアドレス：' + (ip || '（メールから取得できませんでした）');
  }
  return {
    title: CONFIG.TITLE,
    body: body + '\n日時：' + when,
    isSelf: !!self,
    ip: ip || null,
  };
}

/** メール本文からログイン元の IP アドレスを取り出す */
function extractIp_(text) {
  if (!text) return null;
  const ipv4 = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)){3}';
  // 時刻（12:34:56）と誤認しないよう、コロン 3 つ以上のものだけを IPv6 とみなす
  const ipv6 = '(?:[0-9A-Fa-f]{0,4}:){3,7}[0-9A-Fa-f]{1,4}';
  const normalized = toHalfWidth_(text);

  // 1) 「IPアドレス：xxx」のようにラベルの近くにあるものを優先
  const labeled = new RegExp('IP\\s*(?:アドレス|address)?\\s*[:：]?\\s*[\\s\\S]{0,20}?(' + ipv4 + '|' + ipv6 + ')(?![\\d.:A-Fa-f]*[\\dA-Fa-f])', 'i');
  let m = normalized.match(labeled);
  if (m) return m[1];

  // 2) 本文中の最初の IPv4
  m = normalized.match(new RegExp('(?:^|[^\\d.])(' + ipv4 + ')(?![\\d.]*\\d)'));
  return m ? m[1] : null;
}

/** ip が MY_IPS（単一 IP または IPv4 CIDR）のいずれかに一致するか */
function isMyIp_(ip, list) {
  return list.some(entry => {
    entry = String(entry).trim();
    if (entry.indexOf('/') < 0) return entry.toLowerCase() === String(ip).trim().toLowerCase();
    const [base, bitsStr] = entry.split('/');
    const bits = Number(bitsStr);
    const a = ipv4ToInt_(ip), b = ipv4ToInt_(base);
    if (a === null || b === null || !(bits >= 0 && bits <= 32)) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((a & mask) >>> 0) === ((b & mask) >>> 0);
  });
}

function ipv4ToInt_(ip) {
  const p = String(ip).trim().split('.');
  if (p.length !== 4 || p.some(x => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return null;
  return ((Number(p[0]) << 24) >>> 0) + (Number(p[1]) << 16) + (Number(p[2]) << 8) + Number(p[3]);
}

/** Authentication-Results ヘッダーで、楽天ドメインの DKIM 署名が pass しているか */
function isTrustedSender_(raw) {
  const header = String(raw).split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, ' ');
  const results = header.split(/\r?\n/).filter(l => /^Authentication-Results:/i.test(l)).join(' ');
  const re = /dkim=pass[^;]*?header\.(?:d|i)=@?([A-Za-z0-9.-]+)/gi;
  let m;
  while ((m = re.exec(results)) !== null) {
    const d = m[1].toLowerCase();
    if (CONFIG.TRUSTED_DOMAINS.some(t => d === t || d.endsWith('.' + t))) return true;
  }
  return false;
}

function toHalfWidth_(s) {
  return String(s)
    .replace(/[０-９Ａ-Ｚａ-ｚ．：]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ');
}

function stripHtml_(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
}

function formatDate_(date) {
  const d = new Date(date.getTime() + 9 * 60 * 60 * 1000); // JST
  const z = n => ('0' + n).slice(-2);
  return d.getUTCFullYear() + '/' + z(d.getUTCMonth() + 1) + '/' + z(d.getUTCDate()) + ' ' +
    z(d.getUTCHours()) + ':' + z(d.getUTCMinutes());
}

// ===== 通知 ======================================================================

function notify_(msg) {
  const props = PropertiesService.getScriptProperties();
  const text = msg.title + '\n' + msg.body;
  const errors = [];
  const tryRun = (name, fn) => { try { fn(); } catch (e) { errors.push(name + ': ' + e); } };

  if (CONFIG.NOTIFY.EMAIL) tryRun('EMAIL', () => {
    MailApp.sendEmail({
      to: Session.getEffectiveUser().getEmail(),
      subject: msg.isSelf ? msg.title : '【要確認】' + msg.title,
      body: msg.body + (msg.isSelf ? '' :
        '\n\n心当たりがない場合は、すぐに楽天会員情報管理からパスワードを変更し、' +
        '2段階認証の設定を確認してください。'),
    });
  });

  if (CONFIG.NOTIFY.NTFY) tryRun('NTFY', () => {
    postJson_('https://ntfy.sh/', {
      topic: props.getProperty('NTFY_TOPIC'),
      title: msg.title,
      message: msg.body,
      priority: msg.isSelf ? 3 : 5,
      tags: [msg.isSelf ? 'white_check_mark' : 'warning'],
    });
  });

  if (CONFIG.NOTIFY.DISCORD) tryRun('DISCORD', () => {
    postJson_(props.getProperty('DISCORD_WEBHOOK_URL'), { content: text });
  });

  if (CONFIG.NOTIFY.SLACK) tryRun('SLACK', () => {
    postJson_(props.getProperty('SLACK_WEBHOOK_URL'), { text: text });
  });

  if (CONFIG.NOTIFY.LINE) tryRun('LINE', () => {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + props.getProperty('LINE_CHANNEL_TOKEN') },
      payload: JSON.stringify({
        to: props.getProperty('LINE_USER_ID'),
        messages: [{ type: 'text', text: text }],
      }),
    });
  });

  if (errors.length) Logger.log('通知エラー：\n' + errors.join('\n'));
  Logger.log(text);
}

function postJson_(url, obj) {
  UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(obj) });
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
