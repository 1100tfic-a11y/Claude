// 楽天ログイン通知ウォッチャー：通知処理（Main.gs ほかと同じプロジェクトに入れる）

// ===== 通知 ======================================================================

function notify_(msg) {
  const props = PropertiesService.getScriptProperties();
  const text = msg.title + '\n' + msg.body;
  const errors = [];
  const tryRun = (name, fn) => { try { fn(); } catch (e) { errors.push(name + ': ' + e); } };

  if (CONFIG.NOTIFY.EMAIL) tryRun('EMAIL', () => {
    MailApp.sendEmail({
      // CONFIG.EMAIL_TO（iCloud メールなど自分の別アドレス）があればそちらへ。
      // 自分の Gmail 宛てだと「自分が送ったメール」扱いで iPhone の Gmail アプリが鳴らないため
      to: CONFIG.EMAIL_TO || Session.getEffectiveUser().getEmail(),
      subject: msg.isSelf ? msg.title : '【要確認】' + msg.title,
      body: msg.body + (msg.isSelf ? '' :
        '\n\n心当たりがない場合は、すぐに楽天会員情報管理からパスワードを変更し、' +
        '2段階認証の設定を確認してください。'),
    });
  });

  // Google カレンダーに予定を作り、その通知（ポップアップ）を鳴らす。
  // Google の中だけで完結するので、外部サービスに接続できない問題が起きない
  if (CONFIG.NOTIFY.CALENDAR) tryRun('CALENDAR', () => {
    // 作成した瞬間に通知時刻を置くと、iPhone のアプリが予定を受け取る前に時刻が過ぎて鳴らないことがある。
    // そのため 15 分後に始まる予定にし、作成の 1・3・5 分後に通知が鳴るようにする
    const start = new Date(Date.now() + 15 * 60 * 1000);
    const end = new Date(start.getTime() + 5 * 60 * 1000);
    const ev = CalendarApp.getDefaultCalendar().createEvent(
      msg.isSelf ? msg.title : '【要確認】' + msg.title, start, end, { description: msg.body });
    ev.removeAllReminders();
    [14, 12, 10].forEach(m => ev.addPopupReminder(m));      // 開始 14・12・10 分前 ＝ 作成の 1・3・5 分後
    ev.setColor(msg.isSelf ? CalendarApp.EventColor.GREEN : CalendarApp.EventColor.RED);
  });

  if (CONFIG.NOTIFY.NTFY) tryRun('NTFY', () => {
    const topic = CONFIG.NTFY_TOPIC || props.getProperty('NTFY_TOPIC');
    if (!topic) throw new Error('Main.gs の NTFY_TOPIC にトピック名を書いてください');
    const payload = {
      topic: topic,
      title: msg.title,
      message: msg.body,
      priority: msg.isSelf ? 3 : 5,
      tags: [msg.isSelf ? 'white_check_mark' : 'warning'],
    };
    try {
      postJson_('https://ntfy.sh/', payload);
    } catch (e) {
      Utilities.sleep(3000);                                  // 一時的な接続失敗に備えて 1 回だけ再試行
      postJson_('https://ntfy.sh/', payload);
    }
  });

  if (CONFIG.NOTIFY.DISCORD) tryRun('DISCORD', () => {
    postJson_(props.getProperty('DISCORD_WEBHOOK_URL'), { content: text });
  });

  if (CONFIG.NOTIFY.SLACK) tryRun('SLACK', () => {
    postJson_(props.getProperty('SLACK_WEBHOOK_URL'), { text: text });
  });

  // LINE 公式アカウント（Messaging API）から通知。
  // LINE_USER_ID が空なら、その公式アカウントの友だち全員（＝自分だけ）に送る broadcast を使う
  if (CONFIG.NOTIFY.LINE) tryRun('LINE', () => {
    const token = CONFIG.LINE_CHANNEL_TOKEN || props.getProperty('LINE_CHANNEL_TOKEN');
    const userId = CONFIG.LINE_USER_ID || props.getProperty('LINE_USER_ID');
    if (!token) throw new Error('Main.gs の LINE_CHANNEL_TOKEN にチャネルアクセストークンを書いてください');
    const body = { messages: [{ type: 'text', text: (msg.isSelf ? '' : '⚠️') + text }] };
    if (userId) body.to = userId;
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/' + (userId ? 'push' : 'broadcast'), {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(body),
    });
  });

  Logger.log(text);
  // 失敗を黙って見逃さないよう、エラーとして表示する（定期実行時は Google から失敗通知メールが届く）
  if (errors.length) throw new Error('通知に失敗しました：\n' + errors.join('\n'));
}

function postJson_(url, obj) {
  UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(obj) });
}


// ===== ここまで（Notify.gs の最終行）=====
