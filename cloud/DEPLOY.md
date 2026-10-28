# 在 Google 云端运行生日提醒

此版本使用 Google Apps Script + MailApp，由 Google 的时间触发器执行。无需电脑开机、无需 SMTP 授权码、无需租用服务器。你当前的 Gmail 账号作为发件人。

## 准备好的文件

- `ReadyToPaste.gs`：一次粘贴即可，含当前真实生日、收件人名单及本机已发送记录；不含 SMTP 密码。
- `Code.gs`：不含私人名单的程序。
- `appsscript.json`：可选的时区和权限配置，只需要发邮件、管理本脚本触发器及识别当前账号的权限。

如需从本机最新 CSV 重新导出，使用 Python 执行项目根目录的 `export_cloud.py`。**导出操作不部署、不启用，也不发邮件。**

## 部署步骤

1. 使用配置中的发件 Gmail 账号登录 <https://script.google.com/home/start>，点击“新建项目”，命名为“生日提醒 bot”。
2. 打开本机 `ReadyToPaste.gs`，复制全部内容；在 Google 编辑器的 `代码.gs`／`Code.gs` 中替换原有内容，然后保存。
3. 在编辑器顶部函数列表选择 **checkSetup**，点击“运行”，按 Google 页面提示完成账号授权。这个函数只校验账号、名单、额度，不发送邮件，也不创建触发器。应看到 `people: 7`、`recipients: 5`（以最新名单为准）。
4. 选择 **setupCloud**，点击“运行”。运行成功时日志会显示“云端提醒已启用”，`enabled: true`、`triggers: 1`。这一步创建每 15 分钟执行的时间触发器，不立即发送生日邮件。
5. 运行 **cloudStatus** 查看状态，并在左侧“触发器”中确认存在 `scheduledRun`。把成功结果告知当前 Codex 聊天，随后停用本机 `BirthdayEmailReminder` 任务，完成切换。

不要选择“部署为网络应用”：本项目使用时间触发器，无需公开 URL。无需在脚本中填写 Gmail 登录密码或应用专用密码。

如果 Google 对你自己创建的脚本显示未验证提示，请核对项目代码、发件账号及请求权限；预期不需要读取整个邮箱或访问 Google Drive 文件的权限。

可选：明确需要发送一封测试邮件时，手动运行 **sendTestToOwner**。它只给发件邮箱本人发送测试，不群发。

## 运行时间和额度

- 北京时间 09:00 后的首轮触发检查才会发邮件。每 15 分钟检查一次，具体运行时刻由 Google 调度，可能延迟，不保证 09:00 整点送达。
- 个人 Gmail 的 Apps Script 当前额度为每天 100 个邮件收件人。本名单一次通知 5 人，一般足够；代码实际查询剩余额度，额度不足时保留未发送状态以便重试。额度受 Google 政策及账号状态影响。
- 同日多人生日合并成一封邮件，逐个收件人发送。
- 使用 Script Properties 持久保存每个生日事件及每个收件人的发送状态，使用脚本锁避免并发任务重复处理。失败收件人在后续触发重试。
- 与 SMTP 类似，发送已提交而写入记录前中断仍可能导致重试重复，不承诺端到端恰好一次。

官方说明：[触发器](https://developers.google.com/apps-script/guides/triggers/installable)、[服务额度](https://developers.google.com/apps-script/guides/services/quotas)、[持久属性](https://developers.google.com/apps-script/guides/properties)。

## 以后怎样改名单

在 Google 编辑器文件最上方修改 `BIRTHDAY_DATA`：

- `people`：公历生日名单，birthday 为 `MM-DD`，修改姓名时保持 id 不变。
- `recipients`：收件人名单，修改后保存就会在下次触发时读取。
- `sendAt`：最早提醒时间，固定按北京时间解释。
- `remindDays`：`[0]` 为当天，`[3, 0]` 为提前三天和当天。

本机 CSV 与云端不会自动同步。迁移后以云端名单为准。更新代码、重新运行 setupCloud 均不会清空云端发送记录。

## 停用与迁移

运行 `disableCloud` 会关闭云端提醒并删除本项目的 scheduledRun 触发器，保留去重记录。

验证云端成功后，可在本机 PowerShell 中执行：

```powershell
Disable-ScheduledTask -TaskName 'BirthdayEmailReminder'
```

如需恢复本机任务，先停用云端，然后执行 `Enable-ScheduledTask -TaskName 'BirthdayEmailReminder'`。两套系统有各自的发送记录，切换当天应先核对记录，防止重复提醒。

Google 云端版不使用本机 Gmail SMTP 授权码；确认不再用本机版本后，可以在 Google 账号中撤销为本项目创建的应用专用密码。
