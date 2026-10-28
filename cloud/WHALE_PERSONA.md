# 小鲸鱼人格：聊天与生日提醒

2026-10-28 已更新到 Google 项目。用户提供的 previewWhalePersona 日志显示 persona 为“小鲸鱼”、birthdayMessageHook 为 true、birthdayAiEnabled 为 true，云端预览成功。exampleOnly 为 true，本次仅查看示例，没有发送邮件或调用 DeepSeek。下面的步骤保留供后续更新使用。

## 更新到现有项目

打开本目录的 `小鲸鱼更新助手.html`，按页面中的三个步骤操作：

1. 点击“复制新版 AIMail.gs”，用它完整替换 Google 项目同名文件，并保存。
2. 复制 Google 上现有的“代码.gs”全部内容到助手页面，点击“保留名单，生成并复制新版生日代码”，再粘贴回原文件并保存。工具仅替换三处程序，保留顶部最新的 BIRTHDAY_DATA、人员 id、日期、收件人、发送时间和迁移历史；不从本机 CSV 重新导出。旧代码可在页面下载备份。版本不匹配时会停止，不生成可能破坏名单的代码。
3. 在 Google 编辑器左侧先选择 `AIMail.gs`，保存，再从顶部函数列表选择并运行 `previewWhalePersona`。应看到 `persona: 小鲸鱼`、`birthdayMessageHook: true`。这一步只查看示例，不发邮件、不调用 DeepSeek、不写发送记录。

随后给自己发一封主题含 `[AI]` 的新测试邮件，或回复原会话继续聊。可手动运行 `pollAiMail` 处理；否则等待原来的 5 分钟检查。无需重建触发器、重新填写密钥或修改原授权。

不要使用本机旧名单重新导出 `ReadyToPaste.gs` 覆盖现有云端项目。不要删除脚本属性或已有发送记录。生日仍在北京时间 09:00 后的首轮 15 分钟检查中发送。

## 人格如何生效

完整人设卡保存在 `AIMail.gs` 顶部的 `WHALE_PERSONA.card`，聊天和生日文案共用。聊天自称“我”，偶尔“本鲸”；日常一到三句，认真提问可以正常展开，难过时温和回应，不为了人设答错、不编造已经完成的操作。人设例句保留为风格参考，不要求机械复读。

发件人显示为“小鲸鱼”。新的聊天回复使用 `【小鲸鱼 自动回复 消息ID】`；仍识别旧的 `【DeepSeek 自动回复 消息ID】`，保留旧会话上下文、去重及不明确投递的核对能力。

聊天默认仅本人可用。用户现已确认向当前云端生日收件人开放，并要求对外回复密送给本人；新版 AIMail.gs 保存后需运行 enableRecipientAiMail 才会开放，具体见 [AI_MAIL.md](AI_MAIL.md)。生日祝福仍按原计划发送。

## 有特色的生日邮件

- 程序准确填写寿星姓名、生日、提前天数，生成内容只负责祝福，不决定提醒日期。
- 使用同一人设让 DeepSeek 写一段通用的两到四句祝福。**生日生成的请求仅包含固定提示，不包含寿星姓名、日期、人员 id、收件邮箱或聊天记录。** 个性称呼和事实由脚本在生成后填入邮件。原有聊天功能仍按已授权范围把聊天会话正文交给 DeepSeek。
- 按生日事件缓存一次结果，所有收件人复用；部分发送失败、后续轮询不会重新生成。不同年份及不同事件可以有不同文案。
- 未配置 Key、额度用尽、接口失败或格式不合适时，自动使用多种小鲸鱼备用文案，继续发送生日提醒。失败也缓存，避免每轮反复请求。预览使用缓存或备用文案，无付费生成。
- 聊天与生日**合计每天最多 30 次** DeepSeek 调用，其中生日最多 2 次；失败计入次数。总上限按用户后续要求由 10 提高到 30，需保存新版 AIMail.gs 生效。生日生成使用一次请求，最多输出 320 token。
- `WHALE_BIRTHDAY.useAi = false` 可让生日仅使用备用文案；保留聊天人格。`disableAiMail` 关闭聊天轮询，生日仍可独立生成祝福；要停止所有 DeepSeek 调用，可将生日 useAi 也设为 false，或删除脚本属性中的 Key。

现有“同日多人合并、每位收件人单独发、持久记录去重”的行为保持。人格更新不会补发以前已完成的生日提醒，也不会修改生日名单。

## 本机验证

```powershell
node cloud/build_persona_update.cjs
node --test cloud/test_cloud.cjs cloud/test_ai_mail.cjs cloud/test_persona_upgrade.cjs
```

检查使用模拟邮箱和模拟模型响应，不发真实邮件、不调用付费接口。人设实际表达由模型生成，可通过主题含 `[AI]` 的新邮件验证。

接口依据：[DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[Google Script Properties](https://developers.google.com/apps-script/reference/properties/properties-service)。
