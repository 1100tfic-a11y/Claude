// 楽天ログイン通知ウォッチャー：判定ロジック（Main.gs ほかと同じプロジェクトに入れる）

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


// ===== ここまで（Logic.gs の最終行）=====
