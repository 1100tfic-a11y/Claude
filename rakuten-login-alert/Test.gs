// 楽天ログイン通知ウォッチャー：テスト・調査用（Main.gs と同じプロジェクトに入れる）

/** 通知のテスト送信（自分の端末／他の端末の両パターン） */
function testNotify() {
  requireAuth_();
  notify_(buildMessage_(CONFIG.MY_IPS[0], new Date()));
  notify_(buildMessage_('203.0.113.45', new Date()));
  Logger.log('テスト通知を送信しました。届かない場合は diagnose を実行してください');
}

/** 直近の楽天ログイン通知メール 1 通を使って、実際と同じ通知を送る（処理済みでも送る） */
function testWithLatestMail() {
  requireAuth_();
  const q = CONFIG.SEARCH_QUERY.replace(/newer_than:\S+/, 'newer_than:90d');
  const msgs = [];
  GmailApp.search(q, 0, 20).forEach(th => th.getMessages().forEach(m => msgs.push(m)));
  const target = msgs.sort((a, b) => b.getDate() - a.getDate()).find(isLoginMail_);
  if (!target) {
    Logger.log('過去 90 日に楽天のログイン通知メールが見つかりません。diagnose を実行してください');
    return;
  }
  Logger.log('使用するメール：' + formatDate_(target.getDate()) + ' ' + target.getSubject());
  notify_(buildMessage_(extractIp_(bodyOf_(target)), target.getDate()));
}

/** うまく動かないときの調査用。結果は「実行ログ」に表示されます */
function diagnose() {
  requireAuth_();
  const log = s => Logger.log(s);
  const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'checkRakutenLogin');
  log('■ 定期実行トリガー：' + (triggers.length ? triggers.length + ' 件（OK）' : 'なし → setup を実行してください'));
  log('■ 通知先メール：' + Session.getEffectiveUser().getEmail());
  log('■ 今日あと送れるメール数：' + MailApp.getRemainingDailyQuota());
  log('■ 有効な通知方法：' + Object.keys(CONFIG.NOTIFY).filter(k => CONFIG.NOTIFY[k]).join(', '));
  log('■ 処理済みメール数：' + loadProcessedIds_().length);

  const hits = GmailApp.search(CONFIG.SEARCH_QUERY).length;
  log('■ 現在の検索条件「' + CONFIG.SEARCH_QUERY + '」に合うスレッド：' + hits + ' 件');

  // アンケートや広告に埋もれないよう、件名がログイン・パスワード関連のメールだけを探す
  const q = '(from:(rakuten.co.jp OR rakuten.com) OR subject:楽天) ' +
    'subject:(ログイン OR パスワード OR 本人確認 OR セキュリティ OR 不正 OR 認証 OR ロック) newer_than:180d';
  const msgs = [];
  GmailApp.search(q, 0, 20).forEach(th => th.getMessages().forEach(m => msgs.push(m)));
  msgs.sort((a, b) => b.getDate() - a.getDate());
  log('■ 過去 180 日のログイン・パスワード関連の楽天メール（新しい順・最大 10 通）');
  msgs.slice(0, 10).forEach(m => {
    const body = bodyOf_(m);
    const ip = extractIp_(body);
    log('・' + formatDate_(m.getDate()) + '｜' + m.getSubject() +
      '\n   差出人：' + m.getFrom() +
      '\n   ログイン通知と判定：' + (isLoginMail_(m) ? 'はい' : 'いいえ') +
      '｜DKIM：' + (isTrustedSender_(m.getRawContent()) ? 'OK' : 'NG（偽メールの可能性）') +
      '｜IP：' + (ip || 'なし') +
      '\n   本文の冒頭：' + body.replace(/\s+/g, ' ').slice(0, 250));
  });
  if (!msgs.length) log('  （なし。楽天からログイン・パスワード関連のメールは届いていません）');
}

// ===== ここまで（Test.gs の最終行）=====
