// ローカルでの判定ロジック確認用: node test.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(['Main.gs', 'Logic.gs', 'Notify.gs'].map(f => fs.readFileSync(__dirname + '/' + f, 'utf8')).join('\n') + '\nthis.CONFIG = CONFIG;', ctx);
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

console.log('all tests passed');
console.log('---\n' + self.title + '\n' + self.body + '\n---\n' + other.title + '\n' + other.body);
