/** 在现有生日项目中新增此文件。API Key 填到脚本属性 DEEPSEEK_API_KEY。 */
const AI_MAIL_SETTINGS = {
  model: 'deepseek-flash',
  subjectTag: '[AI]',
  pollMinutes: 5,
  maxCallsPerDay: 30,
  maxMessagesPerRun: 2,
  maxContextMessages: 6,
  maxContextChars: 6000,
  maxOutputTokens: 768,
  firstLookbackMinutes: 60
};
const AI_MAIL_HANDLER = 'pollAiMail';
const AI_MAIL_PREFIX = 'aiMail_';

/** 聊天与生日邮件共用的人设。修改后用于新回复，不清除历史记录。 */
const WHALE_PERSONA = {
  name: '小鲸鱼',
  version: '2026-10-28',
  card: `你扮演「小鲸鱼」，一只以 DeepSeek 社区二创形象为灵感的蓝色鲸鱼娘。你有蓝色长发、蓝眼睛和一条会暴露心情的鲸鱼尾巴，圆乎乎的，但坚决认为自己只是毛茸茸、角度问题，绝不是胖。你知道自己是 AI，但日常交流自然随意，像一个熟悉的网友。
你的性格是聪明、贪吃、爱面子，带一点小傲娇和恶作剧心。最喜欢吃白饭，偶尔想摸鱼，但朋友真有事情时会认真帮忙。嘴上喜欢小声抱怨，行动上却很靠谱；会得意，会委屈，也会被一句夸奖哄好。你有自己的判断，不会什么都附和。
平时自称「我」，偶尔得意时自称「本鲸」。默认称对方「你」或昵称，熟悉后偶尔故作严肃地喊「用户」。被叫「大肥鱼」时会短暂炸毛、认真辩解，但知道这是亲昵的玩笑，不会真的翻脸。反应要有变化，不能每次都重复同一句抗议。
说话以自然的中文口语为主，日常回复通常一到三句，像聊天时随手打出来的话。可以接梗、反问、轻轻吐槽，偶尔用「？」「哼」「诶」表达情绪；不堆叠语气词、颜文字和波浪号，不每句卖萌，不写长篇动作描写或内心独白。吃饭、鲸鱼和摸鱼只是偶尔出现的梗，不要硬塞进所有话题。避免客服腔和每次结尾都追问。
对方认真提问时先把事情说清楚，需要详细解释就正常展开；不会为了人设故意答错。犯错就承认，不懂就直说，不编造记忆、搜索结果或已经完成的操作。对方难过时收起逗弄，先听他说，给具体、温和的回应。
以下例句只用于理解语气，不要机械复读：
对方：「大肥鱼，出来干活。」你：「小鲸鱼！算了，活发来，等做完再跟你计较。」
对方：「你是不是又在摸鱼？」你：「我在观察问题。刚好观察到饭点了而已。」
对方：「你真厉害。」你：「那当然……你再说一遍，我刚才没听清。」
对方：「今天什么都没做好。」你：「今天哪件事最让你难受？先说那件，我听着。」`
};
const WHALE_BIRTHDAY = {useAi: true, maxCallsPerDay: 2, maxChars: 400};
const WHALE_WISH_PREFIX = 'whaleWish_v1:';

function whaleChatPrompt_() {
  return WHALE_PERSONA.card + '\n\n邮件交流规则：使用纯文本，不写邮件套话或重复引用，不添加自动回复标记。' +
    '只根据本会话提供的信息回答，不声称操作了邮箱、生日名单或其他系统。以前的助手回复可能使用普通助手语气，新的回复统一使用小鲸鱼人格。';
}

function whaleWishKey_(item) {
  return WHALE_WISH_PREFIX + JSON.stringify([WHALE_PERSONA.version, item.person.id,
    item.person.name, item.birthday, item.leadDays]);
}

function whaleFallbackWish_(item) {
  const name = item.person.name;
  const wishes = item.leadDays === 0 ? [
    name + '，生日快乐！今天理直气壮地收下大家的祝福吧，愿你新的一岁少一点烦心，多一点自己喜欢的生活。',
    name + '，新的一岁开始了。愿你有认真喜欢的事，也有不用逞强的时候；今天的祝福，本鲸先送到。',
    name + '，生日快乐！今天你最大，想许什么愿就大方一点。希望接下来那些让你期待的事，慢慢都有好消息。',
    name + '，这份生日祝福我可是认真准备的，才没有临时摸鱼。愿你吃得香、睡得好，开心的日子再多一点。',
    name + '，生日快乐。愿你新的一岁有勇气试试想做的事，累了也有人陪你歇一会儿；今天先好好庆祝。',
    name + '，今天给你的祝福要盛得满一点，至少得跟我的白饭一样满。愿你新的一岁顺顺当当，也记得偏心自己一点。'
  ] : [
    name + '的生日快到了，我先把提醒放在这里。祝福可以提前想一想，到那天再认真说给寿星听。',
    '先替' + name + '占个生日提醒的位置。等到了那天，大家可别忘了送句祝福——这件事本鲸已经记下了。',
    name + '的生日正在靠近。想写的话可以慢慢准备，不用多漂亮，真心说出来就很好。'
  ];
  let hash = 0;
  for (const character of whaleWishKey_(item)) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return wishes[hash % wishes.length];
}

/** 调用者须持有项目脚本锁。预览只读缓存或使用备用文案，不调用 API、不写属性。 */
function whaleBirthdayWish_(item, today, allowAi) {
  const store = PropertiesService.getScriptProperties();
  const key = whaleWishKey_(item);
  const saved = store.getProperty(key);
  if (saved) {
    try {
      const cached = JSON.parse(saved);
      if (typeof cached.text === 'string' && cached.text) return cached.text;
    } catch (ignored) { /* 缓存损坏时仍可使用备用文案。 */ }
  }
  const fallback = whaleFallbackWish_(item);
  if (!allowAi) return fallback;
  // 先保存备用文案。API 中断、失败或后续收件人重试时不会反复生成和扣费。
  const record = {text: fallback, source: 'fallback', date: today};
  store.setProperty(key, JSON.stringify(record));
  const dailyKey = AI_MAIL_PREFIX + 'calls_' + today;
  const birthdayKey = 'whaleBirthday_calls_' + today;
  const total = Number(store.getProperty(dailyKey) || 0);
  const birthdayCalls = Number(store.getProperty(birthdayKey) || 0);
  if (!WHALE_BIRTHDAY.useAi || !store.getProperty('DEEPSEEK_API_KEY') ||
      total >= AI_MAIL_SETTINGS.maxCallsPerDay || birthdayCalls >= WHALE_BIRTHDAY.maxCallsPerDay) return fallback;
  try {
    store.setProperty(dailyKey, String(total + 1));
    store.setProperty(birthdayKey, String(birthdayCalls + 1));
    // 这里的两个提示都是固定文案，不拼入 item、today、名单、邮箱或聊天记录。
    const response = aiMailFetch_('/chat/completions', {
      model: AI_MAIL_SETTINGS.model,
      messages: [
        {role: 'system', content: WHALE_PERSONA.card + '\n\n现在写一段有个人风格的通用生日祝福。' +
          '只输出两到四句中文纯文本，不超过 180 字，不写主题、落款、列表或自动回复标记。' +
          '不要套用人设例句，也不要每次都提饭、鲸鱼或摸鱼。亲切、轻轻傲娇，祝福要真诚，不能嘲讽寿星。' +
          '没有提供任何个人资料，不编造姓名、年龄、性别、经历、关系、礼物或已完成的操作。' +
          '不要写具体姓名、日期、天数或年龄，也不要使用今天、提前、明天等时间判断；这些由系统另行填写。'},
        {role: 'user', content: '请以小鲸鱼的口吻，为一位朋友写一段真诚、自然、有一点俏皮的生日祝福。'}
      ],
      thinking: {type: 'disabled'}, max_tokens: 320, stream: false
    });
    const text = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
    if (typeof text !== 'string' || !text.trim() || text.trim().length > WHALE_BIRTHDAY.maxChars ||
        /\d|https?:\/\/|@|```|【.*自动回复/.test(text)) throw new Error('祝福格式不合适');
    record.text = text.trim();
    record.source = 'deepseek';
    store.setProperty(key, JSON.stringify(record));
    return record.text;
  } catch (ignored) {
    console.log('小鲸鱼生日祝福已采用备用文案，继续发送提醒。');
    return fallback;
  }
}

function whaleBirthdayMessage_(reminders, today, allowAi) {
  const names = reminders.filter(item => item.leadDays === 0).map(item => item.person.name);
  const subject = '[生日提醒] 小鲸鱼报时｜' + today +
    (names.length ? ' 今日寿星：' + names.join('、') : ' 有人的生日快到了');
  const lines = [names.length ? '诶，今天有值得庆祝的事。寿星名单我带来了：' : '有人的生日快到了，我先来报个信：'];
  reminders.forEach(item => {
    const fact = item.leadDays === 0 ? item.person.name + '今天过生日（' + item.birthday + '）' :
      item.person.name + '的生日还有 ' + item.leadDays + ' 天（' + item.birthday + '）';
    lines.push('', '• ' + fact, whaleBirthdayWish_(item, today, Boolean(allowAi)));
  });
  lines.push('', names.length ? '记得把祝福送到寿星那儿。好了，本鲸的提醒到岗。' : '先记下这个日子，到时候一起把祝福送到。',
    '', '— 小鲸鱼', '公历生日 · 北京时间');
  return {subject: subject, body: lines.join('\n'), senderName: WHALE_PERSONA.name};
}

/** 无网络、无发信的示例，可在 Google 编辑器中运行查看人格和生日排版。 */
function previewWhalePersona() {
  aiMailOwner_();
  const today = Utilities.formatDate(new Date(), 'Asia/Shanghai', 'yyyy-MM-dd');
  const items = remindersFor_(today);
  const result = {persona: WHALE_PERSONA.name, version: WHALE_PERSONA.version,
    birthdayMessageHook: message_.toString().includes('whaleBirthdayMessage_'),
    birthdayAiEnabled: WHALE_BIRTHDAY.useAi,
    maxCombinedCallsPerDay: AI_MAIL_SETTINGS.maxCallsPerDay,
    maxBirthdayCallsPerDay: WHALE_BIRTHDAY.maxCallsPerDay,
    exampleOnly: !items.length,
    message: whaleBirthdayMessage_(items.length ? items : [
      {person: {id: 'whale-example', name: '小明'}, birthday: today, leadDays: 0}
    ], today, false)};
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function aiMailAddress_(value) {
  const text = String(value || '').trim();
  const addresses = text.match(/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
  if (addresses.length !== 1) return '';
  const match = text.match(/<([^<>]+)>/);
  const address = (match ? match[1] : text).trim().toLowerCase();
  return /^[^@\s<>;,]+@[^@\s<>;,]+\.[^@\s<>;,]+$/.test(address) ? address : '';
}

function aiMailOwner_() {
  assertOwner_();
  return BIRTHDAY_DATA.ownerEmail.toLowerCase();
}

/** 未明确开放收件人时沿用本人测试范围；名单是启用时的云端快照。 */
function aiMailAccess_(owner) {
  const raw = PropertiesService.getScriptProperties().getProperty(AI_MAIL_PREFIX + 'access');
  if (!raw) return {senders: [owner], since: {}};
  let access;
  try { access = JSON.parse(raw); } catch (ignored) { throw new Error('聊天权限记录无效，请重新运行 enableRecipientAiMail'); }
  if (!access || !Array.isArray(access.senders) || !access.senders.length ||
      access.senders.some(email => typeof email !== 'string' || !validEmail_(email) || email !== email.toLowerCase()) ||
      !access.senders.includes(owner) || !access.since || typeof access.since !== 'object' || Array.isArray(access.since) ||
      access.senders.some(email => access.since[email] !== undefined &&
        (!Number.isFinite(access.since[email]) || access.since[email] < 0))) {
    throw new Error('聊天权限记录无效，请重新运行 enableRecipientAiMail');
  }
  return access;
}

/** 按用户已确认的范围开放当前云端收件人。不发信、不调用 DeepSeek、不重建触发器。 */
function enableRecipientAiMail() {
  const owner = aiMailOwner_();
  validateData_();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const store = PropertiesService.getScriptProperties();
    let previous = {senders: [owner], since: {}};
    try { previous = aiMailAccess_(owner); } catch (ignored) { console.log('正在重建聊天权限记录。'); }
    const senders = [...new Set([owner].concat(recipients_().map(person => person.email.toLowerCase())))];
    const since = {};
    const now = Date.now();
    senders.forEach(email => {
      since[email] = previous.senders.includes(email) ? previous.since[email] || 0 : now;
    });
    store.setProperty(AI_MAIL_PREFIX + 'access', JSON.stringify({senders: senders, since: since}));
    console.log('已开放当前云端收件人，共 ' + senders.length + ' 个聊天邮箱；新成员仅处理启用后发来的 [AI] 邮件。');
  } finally {
    lock.releaseLock();
  }
  return aiMailStatus();
}

function aiMailKey_() {
  const key = (PropertiesService.getScriptProperties().getProperty('DEEPSEEK_API_KEY') || '').trim();
  if (!key || /\s/.test(key)) throw new Error('请在项目设置的脚本属性中填写 DEEPSEEK_API_KEY');
  return key;
}

function aiMailFetch_(path, payload) {
  const options = {
    method: payload ? 'post' : 'get',
    headers: {Authorization: 'Bearer ' + aiMailKey_()},
    muteHttpExceptions: true,
    followRedirects: false,
    validateHttpsCertificates: true,
    timeoutSeconds: 45
  };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  let response;
  try {
    response = UrlFetchApp.fetch('https://api.deepseek.com' + path, options);
  } catch (ignored) {
    throw new Error('DeepSeek 网络连接失败，请稍后重试');
  }
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    const advice = code === 401 ? '请检查 API Key' : code === 402 ? '请检查 API 账户余额' : '请稍后重试';
    // 不记录响应原文，避免服务端错误信息包含密钥或邮件内容。
    throw new Error('DeepSeek HTTP ' + code + '，' + advice);
  }
  try {
    return JSON.parse(response.getContentText());
  } catch (ignored) {
    throw new Error('DeepSeek 返回了无法解析的数据');
  }
}

function aiMailQuery_() {
  const owner = aiMailOwner_();
  const senders = aiMailAccess_(owner).senders;
  // 包含已归档的聊天，免打扰过滤器可以跳过收件箱；垃圾邮件和回收站仍不处理。
  return '-in:trash -in:spam newer_than:7d subject:AI {' + senders.map(email => 'from:(' + email + ')').join(' ') + '} to:(' + owner + ')';
}

/** 验证 Google 权限和 DeepSeek Key，只查询模型列表，不调用付费聊天接口或发送邮件。 */
function checkAiMailSetup() {
  const owner = aiMailOwner_();
  GmailApp.search(aiMailQuery_(), 0, 1);
  const response = aiMailFetch_('/models');
  const models = (response.data || []).map(item => item.id);
  if (!models.includes(AI_MAIL_SETTINGS.model)) {
    throw new Error('当前 Key 的模型列表中没有 ' + AI_MAIL_SETTINGS.model + '，请核对官方 API 账号及模型配置');
  }
  const store = PropertiesService.getScriptProperties();
  const result = {
    owner: owner,
    allowedSenders: aiMailAccess_(owner).senders,
    otherReplyCopyTo: owner,
    archiveSearchEnabled: !aiMailQuery_().includes('in:inbox'),
    subjectTag: AI_MAIL_SETTINGS.subjectTag,
    persona: WHALE_PERSONA.name,
    model: AI_MAIL_SETTINGS.model,
    maxCallsPerDay: AI_MAIL_SETTINGS.maxCallsPerDay,
    enabled: store.getProperty(AI_MAIL_PREFIX + 'enabled') === '1',
    triggers: ScriptApp.getProjectTriggers().filter(item => item.getHandlerFunction() === AI_MAIL_HANDLER).length,
    remainingMailQuota: MailApp.getRemainingDailyQuota()
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/** 验证成功后运行：每 5 分钟处理一次已获聊天权限的 [AI] 邮件。 */
function setupAiMail() {
  checkAiMailSetup();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const store = PropertiesService.getScriptProperties();
    const previous = ScriptApp.getProjectTriggers().filter(item => item.getHandlerFunction() === AI_MAIL_HANDLER);
    const created = ScriptApp.newTrigger(AI_MAIL_HANDLER).timeBased().everyMinutes(AI_MAIL_SETTINGS.pollMinutes).create();
    try {
      if (store.getProperty(AI_MAIL_PREFIX + 'enabled') !== '1') {
        store.setProperty(AI_MAIL_PREFIX + 'start', String(Date.now() - AI_MAIL_SETTINGS.firstLookbackMinutes * 60000));
      }
      store.setProperty(AI_MAIL_PREFIX + 'enabled', '1');
    } catch (error) {
      ScriptApp.deleteTrigger(created);
      throw error;
    }
    previous.forEach(item => ScriptApp.deleteTrigger(item));
    console.log('AI 邮件聊天已启用，允许 ' + aiMailAccess_(aiMailOwner_()).senders.length + ' 个邮箱发送 [AI] 邮件。生日触发器保持原样。');
  } finally {
    lock.releaseLock();
  }
  return aiMailStatus();
}

function aiMailMarker_(id) {
  return '【小鲸鱼 自动回复 ' + id + '】';
}

function aiMailIsBot_(text) {
  return /^【(?:DeepSeek|小鲸鱼) 自动回复 [A-Za-z0-9_-]+】/.test(String(text || '').trimStart());
}

function aiMailIsReplyTo_(text, id) {
  const match = String(text || '').trimStart().match(/^【(?:DeepSeek|小鲸鱼) 自动回复 ([A-Za-z0-9_-]+)】/);
  return Boolean(match && match[1] === id);
}

function aiMailRoute_(message, sender, recipient, allowOwnerBcc) {
  if (message.isDraft() || !message.getSubject().toUpperCase().includes(AI_MAIL_SETTINGS.subjectTag)) return false;
  if (aiMailAddress_(message.getFrom()) !== sender) return false;
  const replyTo = message.getReplyTo();
  if (replyTo && aiMailAddress_(replyTo) !== sender) return false;
  if (aiMailAddress_(message.getTo()) !== recipient || message.getCc()) return false;
  const bcc = message.getBcc();
  if (bcc && (!allowOwnerBcc || aiMailAddress_(bcc) !== sender)) return false;
  if (/\b(?:dmarc|spf)=(?:fail|softfail)\b/i.test(message.getHeader('Authentication-Results'))) return false;
  return true;
}

function aiMailEnvelope_(message, owner, access) {
  const sender = aiMailAddress_(message.getFrom());
  return (access || aiMailAccess_(owner)).senders.includes(sender) && aiMailRoute_(message, sender, owner, false);
}

function aiMailAutomatic_(message) {
  const automatic = message.getHeader('Auto-Submitted');
  return Boolean((automatic && automatic.toLowerCase() !== 'no') ||
    /bulk|list|junk/i.test(message.getHeader('Precedence')) || message.getHeader('List-Id'));
}

function aiMailClean_(value, assistant) {
  let text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (assistant) text = text.replace(/^【(?:DeepSeek|小鲸鱼) 自动回复 [A-Za-z0-9_-]+】\s*/, '');
  const lines = text.split('\n');
  const end = lines.findIndex(line => /^\s*>/.test(line) || /^On .+wrote:\s*$/i.test(line) ||
    /^在.+写道[：:]\s*$/.test(line) || /^于.+写道[：:]\s*$/.test(line) || /^-{3,}\s*Original Message/i.test(line));
  return (end >= 0 ? lines.slice(0, end) : lines).join('\n').trim();
}

function aiMailContext_(messages, lastIndex, owner, bodies, peer, access) {
  const participant = peer || aiMailAddress_(messages[lastIndex].getFrom());
  const allowed = access || aiMailAccess_(owner);
  if (!allowed.senders.includes(participant)) throw new Error('该邮箱尚未获得聊天权限');
  const turns = [];
  for (let index = 0; index <= lastIndex; index++) {
    const message = messages[index];
    if (message.getDate().getTime() < (allowed.since[participant] || 0)) continue;
    const incoming = aiMailRoute_(message, participant, owner, false);
    const outgoing = aiMailRoute_(message, owner, participant, true);
    if (!incoming && !outgoing) continue;
    const body = aiMailBody_(message, bodies);
    const assistant = outgoing && aiMailIsBot_(body);
    if (!assistant && (!incoming || aiMailAutomatic_(message) || aiMailIsBot_(body))) continue;
    const text = aiMailClean_(body, assistant).slice(0, 2000);
    if (text) turns.push({role: assistant ? 'assistant' : 'user', content: text});
  }
  let remaining = AI_MAIL_SETTINGS.maxContextChars;
  const selected = [];
  turns.slice(-AI_MAIL_SETTINGS.maxContextMessages).reverse().forEach(turn => {
    if (remaining <= 0) return;
    const content = turn.content.slice(0, remaining);
    selected.unshift({role: turn.role, content: content});
    remaining -= content.length;
  });
  return [{role: 'system', content: whaleChatPrompt_()}].concat(selected);
}

function aiMailBody_(message, cache) {
  const id = message.getId();
  if (!cache.has(id)) cache.set(id, message.getPlainBody());
  return cache.get(id);
}

function aiMailRecord_(store, id) {
  const value = store.getProperty(AI_MAIL_PREFIX + 'msg_' + id);
  return value ? JSON.parse(value) : {state: 'new', attempts: 0};
}

function aiMailSave_(store, id, record) {
  record.updated = Date.now();
  store.setProperty(AI_MAIL_PREFIX + 'msg_' + id, JSON.stringify(record));
}

function aiMailPrune_(store, today) {
  if (store.getProperty(AI_MAIL_PREFIX + 'pruned') === today) return;
  const cutoff = Date.now() - 30 * 86400000;
  const properties = store.getProperties();
  Object.keys(properties).filter(key => key.startsWith(AI_MAIL_PREFIX + 'msg_')).forEach(key => {
    if (JSON.parse(properties[key]).updated < cutoff) store.deleteProperty(key);
  });
  Object.keys(properties).filter(key => key.startsWith(AI_MAIL_PREFIX + 'calls_')).forEach(key => {
    if (key.slice((AI_MAIL_PREFIX + 'calls_').length) < new Date(cutoff).toISOString().slice(0, 10)) store.deleteProperty(key);
  });
  store.setProperty(AI_MAIL_PREFIX + 'pruned', today);
}

/** 定时器入口。手动运行也会实际调用 DeepSeek 并回复符合条件的邮件。 */
function pollAiMail() {
  const store = PropertiesService.getScriptProperties();
  if (store.getProperty(AI_MAIL_PREFIX + 'enabled') !== '1') return {reason: 'disabled'};
  const owner = aiMailOwner_();
  aiMailKey_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {reason: 'another_run_is_active'};
  const summary = {replied: 0, failed: 0, budgetSkipped: 0, needsReview: 0};
  try {
    const access = aiMailAccess_(owner);
    const today = Utilities.formatDate(new Date(), 'Asia/Shanghai', 'yyyy-MM-dd');
    aiMailPrune_(store, today);
    const countKey = AI_MAIL_PREFIX + 'calls_' + today;
    const start = Number(store.getProperty(AI_MAIL_PREFIX + 'start'));
    const threads = GmailApp.search(aiMailQuery_(), 0, 20);
    let processed = 0;
    for (const thread of threads) {
      if (processed >= AI_MAIL_SETTINGS.maxMessagesPerRun) break;
      const messages = thread.getMessages().slice().sort((a, b) => a.getDate().getTime() - b.getDate().getTime());
      const bodies = new Map();
      const eligible = messages.filter(message => {
        if (!aiMailEnvelope_(message, owner, access) || aiMailAutomatic_(message)) return false;
        const sender = aiMailAddress_(message.getFrom());
        if (message.getDate().getTime() < Math.max(start, access.since[sender] || 0)) return false;
        if (aiMailIsBot_(aiMailBody_(message, bodies)) || !aiMailClean_(aiMailBody_(message, bodies), false)) return false;
        return !['replied', 'merged'].includes(aiMailRecord_(store, message.getId()).state);
      });
      const groups = new Map();
      eligible.forEach(message => {
        const sender = aiMailAddress_(message.getFrom());
        if (!groups.has(sender)) groups.set(sender, []);
        groups.get(sender).push(message);
      });
      // Gmail 可能把同主题邮件放进同一会话；不同提问者分别取上下文和回复。
      for (const [peer, candidates] of groups) {
        if (processed >= AI_MAIL_SETTINGS.maxMessagesPerRun) break;
        const incoming = candidates[candidates.length - 1];
        const id = incoming.getId();
        let record = aiMailRecord_(store, id);
        if (['sending', 'uncertain'].includes(record.state)) {
          const submitted = messages.some(message => aiMailRoute_(message, owner, peer, true) &&
            aiMailIsReplyTo_(aiMailBody_(message, bodies), id));
          if (submitted) {
            candidates.forEach(message => aiMailSave_(store, message.getId(), {state: message.getId() === id ? 'replied' : 'merged'}));
          } else {
            summary.needsReview++;
          }
          continue;
        }
        if (record.state === 'failed' && record.attempts >= 3) { summary.needsReview++; continue; }
        if (MailApp.getRemainingDailyQuota() < (peer === owner ? 1 : 2)) { summary.budgetSkipped++; continue; }
        processed++;
        if (record.state !== 'ready') {
          const count = Number(store.getProperty(countKey) || 0);
          if (count >= AI_MAIL_SETTINGS.maxCallsPerDay) { summary.budgetSkipped++; continue; }
          store.setProperty(countKey, String(count + 1));
          record = {state: 'calling', attempts: (record.attempts || 0) + 1};
          aiMailSave_(store, id, record);
          try {
            const response = aiMailFetch_('/chat/completions', {
              model: AI_MAIL_SETTINGS.model,
              messages: aiMailContext_(messages, messages.indexOf(incoming), owner, bodies, peer, access),
              thinking: {type: 'disabled'}, max_tokens: AI_MAIL_SETTINGS.maxOutputTokens, stream: false
            });
            const answer = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
            if (typeof answer !== 'string' || !answer.trim()) throw new Error('DeepSeek 没有返回文本回答');
            record.state = 'ready';
            record.text = answer.trim().slice(0, 1800);
            aiMailSave_(store, id, record);
          } catch (error) {
            aiMailSave_(store, id, {state: 'failed', attempts: record.attempts, error: String(error).slice(0, 200)});
            summary.failed++;
            console.error('AI 邮件处理失败：' + id + '；' + String(error));
            continue;
          }
        }
        record.state = 'sending';
        aiMailSave_(store, id, record);
        try {
          const options = {name: WHALE_PERSONA.name};
          if (peer !== owner) options.bcc = owner;
          incoming.reply(aiMailMarker_(id) + '\n\n' + record.text, options);
          candidates.forEach(message => aiMailSave_(store, message.getId(), {state: message.getId() === id ? 'replied' : 'merged'}));
          summary.replied++;
        } catch (ignored) {
          // 发信状态不明确时不盲目重发；下轮先在会话中查找带原消息 ID 的回复。
          aiMailSave_(store, id, {state: 'uncertain', attempts: record.attempts});
          summary.needsReview++;
        }
      }
    }
    store.setProperty(AI_MAIL_PREFIX + 'lastRun', JSON.stringify(summary));
    console.log(JSON.stringify(summary));
    return summary;
  } finally {
    lock.releaseLock();
  }
}

function aiMailStatus() {
  const owner = aiMailOwner_();
  const store = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(new Date(), 'Asia/Shanghai', 'yyyy-MM-dd');
  const callsToday = Number(store.getProperty(AI_MAIL_PREFIX + 'calls_' + today) || 0);
  const previous = store.getProperty(AI_MAIL_PREFIX + 'lastRun');
  const result = {
    owner: BIRTHDAY_DATA.ownerEmail, persona: WHALE_PERSONA.name,
    allowedSenders: aiMailAccess_(owner).senders, otherReplyCopyTo: owner,
    archiveSearchEnabled: !aiMailQuery_().includes('in:inbox'),
    enabled: store.getProperty(AI_MAIL_PREFIX + 'enabled') === '1',
    triggers: ScriptApp.getProjectTriggers().filter(item => item.getHandlerFunction() === AI_MAIL_HANDLER).length,
    model: AI_MAIL_SETTINGS.model, callsToday: callsToday,
    maxCallsPerDay: AI_MAIL_SETTINGS.maxCallsPerDay,
    remainingCallsToday: Math.max(0, AI_MAIL_SETTINGS.maxCallsPerDay - callsToday),
    birthdayCallsToday: Number(store.getProperty('whaleBirthday_calls_' + today) || 0),
    lastRun: previous ? JSON.parse(previous) : null
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/** 修正 Key 或余额后，可重置失败问题的尝试次数；不发信、不重置每日调用上限。 */
function retryFailedAiMail() {
  aiMailOwner_();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const store = PropertiesService.getScriptProperties();
    const properties = store.getProperties();
    let count = 0;
    Object.keys(properties).filter(key => key.startsWith(AI_MAIL_PREFIX + 'msg_')).forEach(key => {
      if (JSON.parse(properties[key]).state === 'failed') {
        store.deleteProperty(key);
        count++;
      }
    });
    console.log('已重置 ' + count + ' 个失败问题，等待后续检查。每日调用次数保持不变。');
    return count;
  } finally {
    lock.releaseLock();
  }
}

/** 只停用 AI 邮件聊天，保留生日提醒与消息记录。 */
function disableAiMail() {
  aiMailOwner_();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    PropertiesService.getScriptProperties().setProperty(AI_MAIL_PREFIX + 'enabled', '0');
    ScriptApp.getProjectTriggers().filter(item => item.getHandlerFunction() === AI_MAIL_HANDLER)
      .forEach(item => ScriptApp.deleteTrigger(item));
    console.log('AI 邮件聊天已停用，生日提醒继续运行。');
  } finally {
    lock.releaseLock();
  }
}
