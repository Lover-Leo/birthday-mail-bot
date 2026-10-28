/** 生成完全在本机运行的更新页面，无需服务器、外部脚本或任何密钥。 */
const fs = require('node:fs');
const path = require('node:path');
const {birthdayPersonaPatches, upgradeBirthdayPersona} = require('./persona_upgrade.cjs');
const aiSource = fs.readFileSync(path.join(__dirname, 'AIMail.gs'), 'utf8');
const dailyCap = Number(aiSource.match(/\bmaxCallsPerDay:\s*(\d+)/)[1]);
const json = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const recipientsMode = process.argv.includes('--recipients');
const quietMode = process.argv.includes('--quiet');
const quotaMode = process.argv.includes('--quota');
const output = quotaMode ? path.join(__dirname, 'API额度更新.html') : quietMode ? path.join(__dirname, '..', 'gmail', '聊天免打扰设置.html') :
  path.join(__dirname, recipientsMode ? '收件人聊天更新助手.html' : '小鲸鱼更新助手.html');
const html = `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>小鲸鱼 · ${quotaMode ? 'API 额度更新' : quietMode ? '聊天免打扰' : recipientsMode ? '收件人聊天与回复副本' : '邮件人格更新'}</title>
<style>
:root{color-scheme:light;font-family:"Microsoft YaHei",system-ui,sans-serif;color:#183849;background:#eff6fa}
*{box-sizing:border-box}body{margin:0}main{max-width:900px;margin:40px auto;padding:0 24px 40px}
.eyebrow{color:#247d99;font-size:14px;letter-spacing:2px}h1{font-size:34px;margin:10px 0}h2{font-size:21px;margin:0 0 12px}p{line-height:1.8}
.lead{color:#496574}.card{background:white;border:1px solid #d7e6ee;border-radius:16px;padding:26px;margin-top:20px;box-shadow:0 6px 22px #123a5510}
.hint{font-size:14px;color:#56717f}.status{white-space:pre-wrap;line-height:1.7;min-height:24px;color:#146075;margin-top:12px}
button{font:inherit;border:0;border-radius:9px;padding:12px 18px;background:#167fa6;color:white;cursor:pointer}button:hover{background:#116a8c}button.secondary{background:#e7f2f8;color:#23536b;margin-left:8px}
textarea{font:14px/1.5 Consolas,monospace;width:100%;height:150px;padding:14px;border:1px solid #bfdae6;border-radius:9px;resize:vertical;background:#fbfdff;color:#183849}
details{margin-top:14px}summary{cursor:pointer;color:#2c6f8c}code{font-family:Consolas,monospace;background:#eef5f8;padding:2px 5px;border-radius:4px}
.preview{border-left:3px solid #8ac9dc;padding:2px 0 2px 16px;margin:18px 0;line-height:1.9}.badge{display:inline-block;padding:5px 10px;margin-right:8px;background:#e7f5f3;border-radius:20px;color:#2a746c;font-size:13px}
</style>
<main>
<div class="eyebrow">生日 BOT / ${quotaMode ? 'API 额度更新' : quietMode ? '聊天免打扰' : recipientsMode ? '聊天权限更新' : '人格更新'}</div>
<h1>${quotaMode ? '每日调用额度，提高到 ' + dailyCap + ' 次。' : quietMode ? '重要的提醒照常，聊天安静收好。' : recipientsMode ? '让名单中的朋友也能聊天。' : '小鲸鱼，准备到岗。'}</h1>
<p class="lead">${quotaMode ? '原设置为每天合计 10 次。新版提高到每天 ' + dailyCap + ' 次，所有聊天成员与生日生成共用；生日生成仍最多 2 次。只需保存新版 AIMail.gs，不会重置今天已用次数。' : quietMode ? '已有 7 封项目聊天已归档，仍可从标签查看。按以下顺序完成后续自动规则：先让机器人能读取归档邮件，再导入 Gmail 免打扰规则。' : recipientsMode ? '按下面两步更新 Google 项目：开放当前云端收件人的聊天权限，向其他人的每封回复同时密送一份给你。只需更新 AIMail.gs，生日文件可以保留。' : '你的完整人设卡已加入聊天和生日祝福。按下面两步更新 Google 项目，保存后沿用现有定时任务。'}</p>
<span class="badge">保留云端最新名单</span><span class="badge">保留发送记录</span><span class="badge">无需重新填写密钥</span>
<div class="preview">${quotaMode ? '项目每日总上限：10 → ' + dailyCap + '<br>生日生成单独上限：2 次，计入总上限<br>失败重试也计数；同一事件的生日祝福仍由所有收件人复用。' : quietMode ? '生日提醒、配置与运行通知：保留收件箱，标为重要。<br>小鲸鱼聊天及你的回复副本：跳过收件箱，标为已读，不标为重要。<br>随时从 Gmail 左侧「生日bot / 小鲸鱼聊天」查看。' : recipientsMode ? '聊天收件地址：你配置的发件邮箱<br>邮件主题须含：[AI]<br>对外回复副本：密送给发件账号本人' : '「生日快乐！今天理直气壮地收下大家的祝福吧，愿你新的一岁少一点烦心，多一点自己喜欢的生活。」'}</div>
<p class="hint">${quotaMode ? '这调整的是项目自己的每日调用上限，不会改变 DeepSeek 账户余额或 Gmail 发信额度。新版同时支持归档聊天，保留小鲸鱼人格、已开放权限、回复密送和现有触发器。' : quietMode ? '只调整你这个 Gmail 账号中的邮件分类。朋友仍会收到回复，你的密送副本继续保留；不会删信，不会影响生日定时任务，也不会重置名单、权限或发送记录。' : recipientsMode ? '你已确认：名单成员主动发送的聊天文字及同一对话的必要上下文会提交给 DeepSeek 生成回复。新成员从开放后发送的新邮件开始，不会自动补答历史邮件。' : '此页面只在本机复制、处理代码，不连接网络。无需把 API Key 粘贴到这里。生日生成只向 DeepSeek 提交固定的通用祝福请求，姓名、日期和收件邮箱由脚本另行填入邮件。'}</p>

<section class="card"><h2>1. 更新聊天文件</h2>
<p>点击下面的按钮。回到 Google Apps Script 的「生日bot」项目，选择左侧 <strong>AIMail.gs</strong>，在代码区域按 <strong>Ctrl+A → Ctrl+V</strong> 替换全部内容，再按 <strong>Ctrl+S</strong> 保存。</p>
<button id="copyAi">复制新版 AIMail.gs</button>
<div id="aiStatus" class="status" aria-live="polite"></div>
<details><summary>无法自动复制时，展开手动复制</summary><textarea id="aiCode" readonly aria-label="新版聊天代码"></textarea></details>
</section>

${quotaMode ? `<section class="card"><h2>2. 确认额度与归档收信</h2>
<p>保存新版后，左侧仍选择 <strong>AIMail.gs</strong>，顶部选择 <code>aiMailStatus</code>，点击「运行」。应显示 <code>maxCallsPerDay: ${dailyCap}</code>、<code>archiveSearchEnabled: true</code>、<code>enabled: true</code>。</p>
<p><code>callsToday</code> 是今天已经使用的次数；<code>remainingCallsToday</code> 是按项目上限计算的剩余次数。例如今天已用 10 次，更新后还可调用 ${Math.max(0, dailyCap - 10)} 次。次数按北京时间日期累计。</p>
<p class="hint">查状态不调用 DeepSeek、不发邮件。无需重新运行 setupAiMail、enableRecipientAiMail 或 setupCloud。把这份日志发回来，就可以确认新版已在云端生效。</p>
</section>
<section class="card"><h2>3. Gmail 规则保持现状</h2>
<p>你提供的截图已确认 4 条项目规则正确，无需重新导入。生日提醒和运行通知保留提醒；聊天及回复副本自动归档、已读，按需查看。新版的归档收信与这些规则配合使用。</p>
</section>` : quietMode ? `<section class="card"><h2>2. 确认机器人可以处理归档聊天</h2>
<p>保存第一步代码后，左侧仍选择 <strong>AIMail.gs</strong>，顶部选择 <code>aiMailStatus</code>，点击「运行」。日志应显示 <code>archiveSearchEnabled: true</code>、<code>enabled: true</code>。这一步只查状态，不发邮件、不调用模型。</p>
<p class="hint">无需再运行 enableRecipientAiMail、setupAiMail 或 setupCloud。归档收信不会增加聊天范围，仍只处理已获权限的 [AI] 会话，跳过垃圾邮件和回收站。</p>
</section>
<section class="card"><h2>3. 导入后续自动分类规则</h2>
<p>确认上一步 archiveSearchEnabled 为 true 后，使用发件账号打开 <a href="https://mail.google.com/mail/#settings/filters" target="_blank" rel="noopener">Gmail「过滤器和屏蔽的地址」</a>，点击页面下方「导入过滤器」。</p>
<p>选择本机文件：<code>D:\\生日快乐bot\\gmail\\生日bot-自动分类.xml</code>，点击「打开文件」，勾选 4 条规则并创建。</p>
<p>如果此前已导入旧版，仅替换“生日bot”项目对应的 4 条规则，保留其他过滤器。请使用这里的新版文件。</p>
<p class="hint">当前 Gmail 连接不支持直接创建过滤器，因此需要在 Gmail 页面导入一次。此规则只对你的邮箱分类；手机或桌面是否显示通知，还取决于 Gmail 自身的通知设置。生日和运行通知不做归档或自动已读。</p>
</section>` : recipientsMode ? `<section class="card"><h2>2. 开放当前云端收件人</h2>
<p>确认第一步已保存。左侧仍选择 <strong>AIMail.gs</strong>，在顶部函数列表选择 <code>enableRecipientAiMail</code>，点击「运行」。</p>
<p>成功日志会列出 <code>allowedSenders</code> 和 <code>otherReplyCopyTo</code>。前者应包含你云端当前配置的全部收件邮箱，后者应为<strong>你配置的发件邮箱</strong>。<code>enabled</code> 应为 true，AI <code>triggers</code> 应为 1。</p>
<p class="hint">这一步只保存聊天白名单，不发信、不调用 DeepSeek、不重建触发器。名单读取自 Google 中的 BIRTHDAY_DATA，不使用本机旧 CSV。若 enabled 为 false，再运行 setupAiMail 启用聊天任务。</p>
</section>
<section class="card"><h2>3. 测试朋友聊天和你的副本</h2>
<p>让名单中的一位朋友，在开放成功后给<strong>你配置的发件邮箱</strong>发送新邮件，主题如 <code>[AI] 你好小鲸鱼</code>。不要添加抄送或其他收件人。</p>
<p>等待每 5 分钟一次的自动检查，或手动运行 <code>pollAiMail</code>。朋友收到小鲸鱼的回复，你同时收到一份密送副本。你自己测试时不再额外密送。</p>
<p class="hint">所有人及生日生成共享每天最多 ${dailyCap} 次 DeepSeek 调用，其中生日最多 2 次。每封对外回复连同你的副本按 2 个收件人检查 Gmail 额度。不同人的上下文分别处理。今后增删生日名单中的收件人后，再运行一次 enableRecipientAiMail 同步聊天权限。</p>
</section>` : `<section class="card"><h2>2. 更新生日文件，保留现有名单</h2>
<p>在 Google 项目中选择原来的 <strong>代码.gs</strong>，在代码区域按 <strong>Ctrl+A → Ctrl+C</strong>，把全部内容粘贴到下面。</p>
<textarea id="birthdayCode" placeholder="把 Google「代码.gs」的全部内容粘贴到这里，包括最上面的 BIRTHDAY_DATA 名单。" aria-label="现有生日代码"></textarea>
<p class="hint">工具只修改三处生日程序，不重写名单，不读取本机 CSV，也不修改 Google 上的设置。</p>
<button id="copyBirthday">保留名单，生成并复制新版生日代码</button><button id="backup" class="secondary">备份粘贴的原代码</button>
<div id="birthdayStatus" class="status" aria-live="polite"></div>
<details><summary>查看并手动复制处理结果</summary><textarea id="birthdayResult" readonly aria-label="升级后的生日代码"></textarea></details>
<p>复制完成后，回到同一个 <strong>代码.gs</strong>，在代码区域按 <strong>Ctrl+A → Ctrl+V</strong> 替换并保存。<strong>请勿删除顶部名单或原来的文件。</strong></p>
</section>

<section class="card"><h2>3. 看看她是否到岗</h2>
<p>先点击 Google 编辑器左侧的 <strong>AIMail.gs</strong> 并保存，再在顶部函数列表选择 <code>previewWhalePersona</code>，点击「运行」。看到 <code>persona: 小鲸鱼</code> 和 <code>birthdayMessageHook: true</code>，说明两处代码均已更新。这一步只预览，不调用 DeepSeek、不发邮件。</p>
<p>聊天测试：给自己发一封主题含 <code>[AI]</code> 的新邮件，例如正文写「大肥鱼，出来干活」。等待下一轮检查，或手动运行 <code>pollAiMail</code>。</p>
<p class="hint">无需重新运行 setupCloud 或 setupAiMail。生日仍按北京时间 09:00 后检查发送；聊天仍每 5 分钟检查。生日按事件缓存一份祝福，所有收件人共用；生成失败时使用人设备用文案。聊天与生日合计每天最多 ${dailyCap} 次 DeepSeek 调用，其中生日最多 2 次，失败也计数。聊天范围以 aiMailStatus 中的 allowedSenders 为准，未运行开放函数时仍只有你自己。</p>
</section>`}
<p class="hint">这是本机准备好的更新工具。复制并保存到 Google 项目后才会在云端生效。</p>
</main>
<script>
'use strict';
const aiSource = ${json(aiSource)};
const birthdayPersonaPatches = ${json(birthdayPersonaPatches)};
${upgradeBirthdayPersona.toString()}
document.getElementById('aiCode').value = aiSource;
async function copyText(value, manualId) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(value); return true; }
  } catch (ignored) {}
  const box = document.createElement('textarea');
  box.value = value; box.style.position = 'fixed'; box.style.left = '-9999px'; document.body.appendChild(box);
  box.focus(); box.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch (ignored) {}
  box.remove();
  if (!copied) {
    const manual = document.getElementById(manualId); manual.closest('details').open = true; manual.focus(); manual.select();
  }
  return copied;
}
document.getElementById('copyAi').addEventListener('click', async () => {
  const copied = await copyText(aiSource, 'aiCode');
  document.getElementById('aiStatus').textContent = copied ? '已复制。粘贴到 Google 项目的 AIMail.gs 并保存。' : '浏览器未允许自动复制。代码已选中，请按 Ctrl+C。';
});
document.getElementById('copyBirthday')?.addEventListener('click', async () => {
  const status = document.getElementById('birthdayStatus');
  try {
    const result = upgradeBirthdayPersona(document.getElementById('birthdayCode').value);
    document.getElementById('birthdayResult').value = result.code;
    const copied = await copyText(result.code, 'birthdayResult');
    status.textContent = (result.changes ? '三处程序已更新，原名单已保留。' : '这份生日代码已包含人格接入。') +
      (copied ? '已复制，请粘贴回 Google 的「代码.gs」并保存。' : '处理结果已选中，请按 Ctrl+C 后粘贴回 Google。');
  } catch (error) { document.getElementById('birthdayResult').value = ''; status.textContent = error.message; }
});
document.getElementById('backup')?.addEventListener('click', () => {
  const original = document.getElementById('birthdayCode').value;
  if (!original.trim()) { document.getElementById('birthdayStatus').textContent = '先粘贴原来的生日代码，才能备份。'; return; }
  const url = URL.createObjectURL(new Blob([original], {type:'text/plain;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = '生日代码-更新前备份.gs'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
</script></html>`;
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, html, 'utf8');
console.log('更新页面已生成：' + output);
