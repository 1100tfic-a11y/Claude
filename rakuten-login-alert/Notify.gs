// 楽天ログイン通知ウォッチャー：通知処理（Main.gs・Logic.gs と同じプロジェクトに入れる）

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


// ===== ここまで（Notify.gs の最終行）=====
