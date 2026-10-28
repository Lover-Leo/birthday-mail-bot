/** 只替换三处已知程序片段，不解析或重新导出 Google 上的私人名单。 */
const birthdayPersonaPatches = [
  {
    before: 'function message_(reminders, today) {',
    after: "function message_(reminders, today, allowAi) {\n  if (typeof whaleBirthdayMessage_ === 'function') return whaleBirthdayMessage_(reminders, today, allowAi);"
  },
  {
    before: 'const message = message_(pending, today);',
    after: 'const message = message_(pending, today, true);'
  },
  {
    before: "name: BIRTHDAY_DATA.senderName || '生日提醒小助手'});",
    after: "name: message.senderName || BIRTHDAY_DATA.senderName || '生日提醒小助手'});"
  }
];

function upgradeBirthdayPersona(input, patches = birthdayPersonaPatches) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('先把 Google 上「代码.gs」的全部内容粘贴进来。');
  let code = input.replace(/\r\n?/g, '\n');
  if (!/^\s*const BIRTHDAY_DATA\s*=/m.test(code) || !code.includes('function runAt_(now) {')) {
    throw new Error('这不像完整的生日代码。请复制含顶部 BIRTHDAY_DATA 名单的「代码.gs」，不是 AIMail.gs。');
  }
  let changes = 0;
  for (const patch of patches) {
    const oldCount = code.split(patch.before).length - 1;
    const newCount = code.split(patch.after).length - 1;
    if (newCount === 1 && oldCount === 0) continue;
    if (oldCount !== 1 || newCount !== 0) {
      throw new Error('生日程序与已知版本不同，已停止修改。原名单不会被覆盖；请把情况告诉我协助更新。');
    }
    code = code.replace(patch.before, patch.after);
    changes++;
  }
  return {code, changes};
}

module.exports = {birthdayPersonaPatches, upgradeBirthdayPersona};
