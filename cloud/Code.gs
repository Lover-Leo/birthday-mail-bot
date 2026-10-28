/** 公历生日提醒：Google Apps Script 云端版。名单在文件顶部的 BIRTHDAY_DATA 中。 */
const CLOUD_ZONE = 'Asia/Shanghai';
const CLOUD_HANDLER = 'scheduledRun';
const CLOUD_ENABLED = 'birthday_cloud_enabled';
const CLOUD_LAST_RUN = 'birthday_cloud_last_run';

function validEmail_(value) {
  return typeof value === 'string' && /^[\x21-\x7e]+$/.test(value) &&
    /^[^@\s<>;,]+@[^@\s<>;,]+\.[^@\s<>;,]+$/.test(value);
}

function parseDay_(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('日期必须为 YYYY-MM-DD：' + iso);
  const result = new Date(iso + 'T00:00:00.000Z');
  if (isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== iso) {
    throw new Error('无效公历日期：' + iso);
  }
  return result;
}

function addDays_(iso, days) {
  const result = parseDay_(iso);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function observedBirthday_(birthday, year, policy) {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (birthday === '02-29' && !leap) {
    if (policy === 'strict') return null;
    return year + (policy === 'feb28' ? '-02-28' : '-03-01');
  }
  return year + '-' + birthday;
}

function validateData_() {
  const data = BIRTHDAY_DATA;
  if (!validEmail_(data.ownerEmail)) throw new Error('ownerEmail 必须是你的完整 Gmail 地址');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.sendAt)) throw new Error('sendAt 必须为 HH:MM');
  if (!['feb28', 'mar01', 'strict'].includes(data.leapDayPolicy)) throw new Error('闰日策略无效');
  if (!Array.isArray(data.remindDays) || !data.remindDays.length ||
      data.remindDays.some(n => !Number.isInteger(n) || n < 0 || n > 365)) {
    throw new Error('remindDays 必须是 0 至 365 的整数列表');
  }
  if (!Array.isArray(data.people) || !Array.isArray(data.recipients) || !data.recipients.length) {
    throw new Error('请填写生日名单和收件人名单');
  }
  const ids = new Set();
  data.people.forEach(person => {
    if (!person.id || ids.has(person.id)) throw new Error('生日人员 id 为空或重复：' + person.id);
    if (!person.name || /[\r\n]/.test(person.name) || !/^\d{2}-\d{2}$/.test(person.birthday)) {
      throw new Error('生日格式错误：' + person.name);
    }
    parseDay_('2000-' + person.birthday);
    ids.add(person.id);
  });
  data.recipients.forEach(person => {
    if (!person.name || /[\r\n]/.test(person.name) || !validEmail_(person.email)) {
      throw new Error('收件人格式错误：' + person.name);
    }
  });
}

function assertOwner_() {
  const actual = Session.getEffectiveUser().getEmail();
  if (!actual || actual.toLowerCase() !== BIRTHDAY_DATA.ownerEmail.toLowerCase()) {
    throw new Error('请使用 ' + BIRTHDAY_DATA.ownerEmail + ' 运行并授权当前脚本，当前账号：' + (actual || '无法识别'));
  }
}

function recipients_() {
  const seen = new Set();
  return BIRTHDAY_DATA.recipients.filter(person => {
    const key = person.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function remindersFor_(today) {
  const reminders = [];
  [...new Set(BIRTHDAY_DATA.remindDays)].sort((a, b) => a - b).forEach(lead => {
    const target = addDays_(today, lead);
    BIRTHDAY_DATA.people.forEach(person => {
      if (observedBirthday_(person.birthday, Number(target.slice(0, 4)), BIRTHDAY_DATA.leapDayPolicy) === target) {
        reminders.push({person: person, birthday: target, leadDays: lead});
      }
    });
  });
  return reminders;
}

function message_(reminders, today, allowAi) {
  if (typeof whaleBirthdayMessage_ === 'function') return whaleBirthdayMessage_(reminders, today, allowAi);
  const todayNames = reminders.filter(item => item.leadDays === 0).map(item => item.person.name);
  const subject = '[生日提醒] ' + today + (todayNames.length ? ' 今日生日：' + todayNames.join('、') : ' 即将到来的生日');
  const lines = ['大家好，', '', '今天的生日提醒：'];
  reminders.forEach(item => {
    const when = item.leadDays === 0 ? '今天' : '还有 ' + item.leadDays + ' 天（' + item.birthday + '）';
    lines.push('• ' + when + '是 ' + item.person.name + ' 的生日。');
  });
  lines.push('', '记得送上祝福！祝寿星生日快乐，新的一岁万事顺意。', '', '— 生日提醒小助手（公历生日，北京时间）');
  return {subject: subject, body: lines.join('\n')};
}

function deliveryKey_(personId, birthday, leadDays, email) {
  return 'sent_v1:' + JSON.stringify([personId, birthday, leadDays, email.toLowerCase()]);
}

/** 检查账号、名单和发信额度。不发邮件，不创建触发器。 */
function checkSetup() {
  validateData_();
  assertOwner_();
  const result = {
    account: BIRTHDAY_DATA.ownerEmail,
    people: BIRTHDAY_DATA.people.length,
    recipients: recipients_().length,
    remainingRecipientQuota: MailApp.getRemainingDailyQuota(),
    timeZone: CLOUD_ZONE,
    earliestSendTime: BIRTHDAY_DATA.sendAt,
    enabled: PropertiesService.getScriptProperties().getProperty(CLOUD_ENABLED) === '1',
    triggers: ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === CLOUD_HANDLER).length
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/** 预览今天的生日邮件，不发送。 */
function preview() {
  validateData_();
  const today = Utilities.formatDate(new Date(), CLOUD_ZONE, 'yyyy-MM-dd');
  const items = remindersFor_(today);
  const result = {date: today, birthdays: items.map(item => item.person.name), recipients: recipients_()};
  if (items.length) result.message = message_(items, today);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/** 将本机已接受的生日邮件记录迁移到云端；重复执行不会清空现有记录。 */
function importHistory_() {
  const store = PropertiesService.getScriptProperties();
  (BIRTHDAY_DATA.localHistory || []).forEach(row => {
    const key = deliveryKey_(row.personId, row.birthday, row.leadDays, row.recipient);
    if (!store.getProperty(key)) store.setProperty(key, row.sentAt);
  });
}

/** 保存代码并授权后，运行此函数启用云端定时提醒。不会立即发送生日邮件。 */
function setupCloud() {
  checkSetup();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    importHistory_();
    const previous = ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === CLOUD_HANDLER);
    const created = ScriptApp.newTrigger(CLOUD_HANDLER).timeBased().everyMinutes(15).create();
    try {
      PropertiesService.getScriptProperties().setProperty(CLOUD_ENABLED, '1');
    } catch (error) {
      ScriptApp.deleteTrigger(created);
      throw error;
    }
    previous.forEach(trigger => ScriptApp.deleteTrigger(trigger));
    console.log('云端提醒已启用：每 15 分钟检查，按北京时间 ' + BIRTHDAY_DATA.sendAt + ' 后的首轮检查发送。');
    return checkSetup();
  } finally {
    lock.releaseLock();
  }
}

/** 由 Google 时间触发器调用；不要为同一名单同时启用本机和云端任务。 */
function scheduledRun() {
  return runAt_(new Date());
}

function runAt_(now) {
  validateData_();
  const store = PropertiesService.getScriptProperties();
  if (store.getProperty(CLOUD_ENABLED) !== '1') return {reason: 'disabled'};
  const localTime = Utilities.formatDate(now, CLOUD_ZONE, 'HH:mm');
  if (localTime < BIRTHDAY_DATA.sendAt) return {reason: 'before_send_time'};
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {reason: 'another_run_is_active'};
  try {
    assertOwner_();
    const today = Utilities.formatDate(now, CLOUD_ZONE, 'yyyy-MM-dd');
    const reminders = remindersFor_(today);
    const result = {date: today, sent: 0, skipped: 0, failed: 0};
    if (reminders.length) {
      recipients_().forEach(recipient => {
        const pending = reminders.filter(item => !store.getProperty(
          deliveryKey_(item.person.id, item.birthday, item.leadDays, recipient.email)));
        if (!pending.length) {
          result.skipped++;
          return;
        }
        try {
          if (MailApp.getRemainingDailyQuota() < 1) throw new Error('今日发信额度不足，稍后重试');
          const message = message_(pending, today, true);
          MailApp.sendEmail({to: recipient.email, subject: message.subject, body: message.body,
                             name: message.senderName || BIRTHDAY_DATA.senderName || '生日提醒小助手'});
          pending.forEach(item => store.setProperty(
            deliveryKey_(item.person.id, item.birthday, item.leadDays, recipient.email), now.toISOString()));
          result.sent++;
          console.log('邮件已提交：' + recipient.name + ' <' + recipient.email + '>');
        } catch (error) {
          result.failed++;
          console.error('发送或记录失败：' + recipient.email + '，' + String(error));
        }
      });
    }
    store.setProperty(CLOUD_LAST_RUN, JSON.stringify(result));
    console.log(JSON.stringify(result));
    if (result.failed) throw new Error(result.failed + ' 位收件人未完成，后续触发会重试。');
    return result;
  } finally {
    lock.releaseLock();
  }
}

/** 仅在你明确选择运行此函数时，向发件账号自身发送一封测试邮件。 */
function sendTestToOwner() {
  validateData_();
  assertOwner_();
  if (MailApp.getRemainingDailyQuota() < 1) throw new Error('今日发信额度不足');
  MailApp.sendEmail({
    to: BIRTHDAY_DATA.ownerEmail,
    subject: '[生日提醒] Google 云端测试',
    body: '这封邮件来自 Google Apps Script 云端。\n\n云端通过 Google 账号授权发信，不依赖电脑开机。\n此测试不会更改生日发送记录。',
    name: BIRTHDAY_DATA.senderName || '生日提醒小助手'
  });
  console.log('测试邮件已提交给 ' + BIRTHDAY_DATA.ownerEmail);
}

/** 检查触发器和最近运行结果，不发送邮件。 */
function cloudStatus() {
  const result = checkSetup();
  const previous = PropertiesService.getScriptProperties().getProperty(CLOUD_LAST_RUN);
  result.lastRun = previous ? JSON.parse(previous) : null;
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/** 停用云端任务，保留发送去重记录。 */
function disableCloud() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    PropertiesService.getScriptProperties().setProperty(CLOUD_ENABLED, '0');
    ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === CLOUD_HANDLER)
      .forEach(trigger => ScriptApp.deleteTrigger(trigger));
    console.log('云端任务已停用，发送记录已保留。');
  } finally {
    lock.releaseLock();
  }
}
