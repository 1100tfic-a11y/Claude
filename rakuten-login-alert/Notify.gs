// 楽天ログイン通知ウォッチャー：通知処理（Main.gs ほかと同じプロジェクトに入れる）

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

  // Google カレンダーに予定を作り、その通知（ポップアップ）を今すぐ鳴らす。
  // Google の中だけで完結するので、外部サービスに接続できない問題が起きない
  if (CONFIG.NOTIFY.CALENDAR) tryRun('CALENDAR', () => {
    const start = new Date(Date.now() + 5 * 60 * 1000);   // 5 分後に始まる予定に
    const end = new Date(start.getTime() + 5 * 60 * 1000);
    const ev = CalendarApp.getDefaultCalendar().createEvent(
      msg.isSelf ? msg.title : '【要確認】' + msg.title, start, end, { description: msg.body });
    ev.removeAllReminders();
    ev.addPopupReminder(5);                                   // 5 分前 ＝ 今すぐ通知
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

  Logger.log(text);
  // 失敗を黙って見逃さないよう、エラーとして表示する（定期実行時は Google から失敗通知メールが届く）
  if (errors.length) throw new Error('通知に失敗しました：\n' + errors.join('\n'));
}

function postJson_(url, obj) {
  UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(obj) });
}


// ===== ここまで（Notify.gs の最終行）=====
