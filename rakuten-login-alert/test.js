// ローカルでの判定ロジック確認用: node test.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = {};
vm.createContext(ctx);
const src = ['Main.gs', 'Logic.gs', 'Notify.gs', 'Test.gs'].map(f => fs.readFileSync(__dirname + '/' + f, 'utf8')).join('\n') + '\nthis.CONFIG = CONFIG;';
vm.runInContext(src, ctx);
const { extractIp_, isMyIp_, buildMessage_, isTrustedSender_ } = ctx;

// IP 抽出
assert.strictEqual(extractIp_('ログイン日時：2026/09/27 12:34:56\nIPアドレス：203.0.113.45\nブラウザ：Chrome'), '203.0.113.45');
assert.strictEqual(extractIp_('IPアドレス：１３３．１０６．５０．６４'), '133.106.50.64');
assert.strictEqual(extractIp_('IP Address: 2001:db8:85a3::8a2e:370:7334'), '2001:db8:85a3::8a2e:370:7334');
assert.strictEqual(extractIp_('接続元 198.51.100.7 から'), '198.51.100.7');
assert.strictEqual(extractIp_('日時 2026/09/27 12:34:56 のみ'), null);
assert.strictEqual(extractIp_('バージョン 1.2.3.4.5 と IPアドレス：192.0.2.10'), '192.0.2.10');

// 自分の IP 判定
assert.ok(isMyIp_('133.106.50.64', ['133.106.50.64']));
assert.ok(!isMyIp_('133.106.50.65', ['133.106.50.64']));
assert.ok(isMyIp_('133.106.99.1', ['133.106.0.0/16']));
assert.ok(!isMyIp_('133.107.0.1', ['133.106.0.0/16']));

// 通知文
const d = new Date('2026-09-27T03:34:00Z');
const self = buildMessage_('133.106.50.64', d);
assert.strictEqual(self.title, '楽天アカウントにログインあり');
assert.strictEqual(self.body, '自分の端末でログインしました\n日時：2026/09/27 12:34');
const other = buildMessage_('203.0.113.45', d);
assert.strictEqual(other.body, '他の端末からログインされました。\nIPアドレス：203.0.113.45\n日時：2026/09/27 12:34');
assert.ok(buildMessage_(null, d).body.includes('取得できませんでした'));

// DKIM
const ok = 'Authentication-Results: mx.google.com;\r\n       dkim=pass header.i=@mail.rakuten.co.jp header.s=x;\r\n       spf=pass\r\nSubject: x\r\n\r\nbody';
const ng = 'Authentication-Results: mx.google.com;\r\n       dkim=pass header.i=@rakuten-secure.example header.s=x\r\n\r\nbody dkim=pass header.i=@rakuten.co.jp';
assert.ok(isTrustedSender_(ok));
assert.ok(!isTrustedSender_(ng));


// ===== Gmail / メール送信を模擬して、定期実行の流れを確認 =====
function flowTest() {
  const sent = [], events = [], props = {};
  const raw = d => 'Authentication-Results: mx.google.com;\r\n dkim=pass header.i=@' + d + '\r\n\r\n';
  const mk = (id, subject, body, dkim) => ({
    getId: () => id, getSubject: () => subject, getDate: () => new Date('2026-09-27T03:34:00Z'),
    getPlainBody: () => body, getBody: () => body, getRawContent: () => raw(dkim), getFrom: () => 'x',
  });
  let inbox = [];
  const c = {
    Logger: { log: () => {} },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    GmailApp: { search: () => [{ getMessages: () => inbox }] },
    MailApp: { sendEmail: o => sent.push(o) },
    CalendarApp: { EventColor: { GREEN: 'g', RED: 'r' }, getDefaultCalendar: () => ({ createEvent: (t, st, en, o) => {
      events.push({ t, st, o });
      return { removeAllReminders() {}, addPopupReminder(m) { (events[events.length - 1].rem = events[events.length - 1].rem || []).push(m); }, setColor() {} };
    } }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'me@example.com' }) },
    ScriptApp: { AuthMode: { FULL: 'FULL' }, requireAllScopes() {}, getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }) }) }) },
  };
  vm.createContext(c);
  vm.runInContext(src, c);

  inbox = [mk('old', '【楽天】ログインのお知らせ', 'IPアドレス：198.51.100.1', 'mail.rakuten.co.jp')];
  c.setup();
  c.checkRakutenLogin();
  assert.strictEqual(sent.length, 0, 'setup 前からあるメールは通知しない');

  inbox.push(mk('a', '【楽天】ログインのお知らせ', 'IPアドレス：133.106.50.64', 'mail.rakuten.co.jp'));
  inbox.push(mk('b', 'ログインのお知らせ', 'IPアドレス：203.0.113.9', 'evil.example'));
  inbox.push(mk('c', 'ログインでポイント2倍！', '今すぐログイン', 'mail.rakuten.co.jp'));
  inbox.push(mk('d', '楽天会員 ご利用のお知らせ', 'ログイン日時 2026/09/27\nIPアドレス：203.0.113.45', 'rakuten.co.jp'));
  c.checkRakutenLogin();
  assert.deepStrictEqual(sent.map(o => o.subject), ['楽天アカウントにログインあり', '【要確認】楽天アカウントにログインあり']);
  assert.ok(sent[0].body.startsWith('自分の端末でログインしました'));
  assert.ok(sent[1].body.includes('IPアドレス：203.0.113.45'));
  assert.deepStrictEqual(events.map(e => e.t), ['楽天アカウントにログインあり', '【要確認】楽天アカウントにログインあり']);
  assert.ok(events.every(e => e.rem.join() === '14,12,10' && e.o.description));

  c.checkRakutenLogin();
  assert.strictEqual(sent.length, 2, '同じメールで二重通知しない');

  // 送信失敗はエラーとして表に出る
  c.MailApp.sendEmail = () => { throw new Error('quota'); };
  inbox.push(mk('e', 'ログインのお知らせ', 'IPアドレス：203.0.113.7', 'rakuten.co.jp'));
  assert.throws(() => c.checkRakutenLogin(), /通知に失敗/);
  console.log('flow test passed');
}
flowTest();

console.log('all tests passed');
console.log('---\n' + self.title + '\n' + self.body + '\n---\n' + other.title + '\n' + other.body);
