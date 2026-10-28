# 公历生日提醒与 AI 邮件聊天

支持 Google Apps Script 云端运行和 Python 本机运行。使用云端版时，名单在 Google 编辑器顶部的 `BIRTHDAY_DATA` 中维护，本机 CSV 不会自动同步；确认迁移完成后停用本机计划任务，避免重复提醒。私人迁移记录保留在本机，不上传仓库。

每天检查公历（新历）生日，并给收件人名单中的每个人发送提醒。默认生日当天通知；同一天多位寿星合并为一封邮件，每位收件人单独收到，不公开其他人的邮箱。只使用 Python 标准库，无需安装第三方依赖。

需要电脑关机后仍运行时，可使用 [Google Apps Script 云端版](cloud/DEPLOY.md)。云端代码和本机版分别维护名单与发送记录，验证云端成功后应停用本机计划任务。

如需通过邮件与 DeepSeek 聊天，参见 [AI 邮件聊天模块](cloud/AI_MAIL.md)。默认仅发件账号本人可用；向当前云端收件人开放并将回复密送给本人的更新，使用 [收件人聊天更新助手](cloud/收件人聊天更新助手.html)，保存新版 AIMail.gs 后运行 enableRecipientAiMail 生效。

已准备“小鲸鱼”聊天与生日祝福人格。现有云端项目请使用 [更新助手](cloud/小鲸鱼更新助手.html) 更新两个文件并保留最新名单，操作说明见 [人格设置](cloud/WHALE_PERSONA.md)。本机修改不会自动同步到 Google。

可在 Gmail 建立“生日bot”项目标签：生日提醒与运行通知保留收件箱、标为重要，聊天归档并标为已读，按需查看。先保存支持归档收信的新版 AIMail.gs，再配置邮箱过滤器，参见 [邮件聊天说明](cloud/AI_MAIL.md)。含私人邮箱与邮件记录的过滤器文件只保留在本机 gmail/ 目录。

DeepSeek 每日共享上限为 30 次；使用 [API 额度更新](cloud/API额度更新.html) 保存新版 AIMail.gs 并运行 aiMailStatus，可核验剩余次数和归档收信。云端代码需要在 Google 编辑器保存后生效。

## 1. 先预览

在 PowerShell 中打开本目录，执行：

```powershell
.\run.ps1 -Date 2026-10-27
```

本目录已放好示例配置和名单。如果从仓库重新获取项目后没有这些文件，先复制模板：

```powershell
Copy-Item config.example.json config.json
Copy-Item birthdays.example.csv birthdays.csv
Copy-Item recipients.example.csv recipients.csv
```

这会用示例名单预览“小明今天生日”的邮件。省略 `-Date` 时检查北京时间今天。预览不会连接 SMTP，也不会创建发送记录。

启动脚本会寻找已安装的 Python，再尝试本机 Codex 随附的 Python。独立运行推荐安装 Python 3.10 或更新版本，也可显式指定：

```powershell
.\run.ps1 -PythonPath 'C:\实际路径\python.exe'
```

## 2. 填写生日和收件人名单

编辑 `birthdays.csv`：

```csv
id,name,birthday
person-001,张三,05-12
person-002,李四,1998-11-08
```

- 支持 `MM-DD` 或 `YYYY-MM-DD`，年仅用于校验日期，不计算年龄。
- `id` 必须唯一且保持稳定；修改姓名时不要改 id，否则可能被当作新的生日事件。
- 不需要出生年份时只填月日即可。
- 用 Excel 编辑后请保存为 **CSV UTF-8（逗号分隔）**，不要保存为 xlsx。

编辑 `recipients.csv`，填写需要收到提醒的全体成员：

```csv
name,email
张三,zhangsan@你的邮箱域名
李四,lisi@你的邮箱域名
```

生日名单和收件人名单相互独立。寿星本人是否收到提醒由收件人名单决定；相同邮箱重复填写只发送一次。正式发送会拦截项目附带的 `example.com` 示例地址。

## 3. 配置发件邮箱

编辑 `config.json` 的 `smtp`：

- `host`：邮箱服务商提供的 SMTP 服务器地址。
- `port`、`security`：按服务商要求填写。通常 `465` 配 `ssl`，`587` 配 `starttls`。
- `username`：完整的发件邮箱。
- `password`：SMTP 密码／服务商要求的授权码，不一定是网页登录密码。
- `from_email`：留空时使用 username；修改时应使用发件服务商允许的地址。
- `sender_name`：收件人看到的发件人名称。

也可以将 SMTP 密码放在环境变量 `BIRTHDAY_SMTP_PASSWORD` 中，它优先于配置文件中的 password：

```powershell
$env:BIRTHDAY_SMTP_PASSWORD = '你的SMTP授权码'
```

此命令只对当前 PowerShell 及其子进程有效，计划任务不会继承此临时值。计划任务可读取本地 config.json 的 password，或使用为其运行账号配置的持久环境变量。

`config.json`、真实名单、数据库、邮箱分类文件和私人运行记录已列入 `.gitignore`。`config.example.json` 是无凭据模板，仓库仅提供示例名单；授权码和真实数据留在本机。

### Gmail 本地输入和登录验证

Gmail 使用 `smtp.gmail.com`、端口 `465`、`ssl`。在 Google 账号开启两步验证后，通过 <https://myaccount.google.com/apppasswords> 创建一个名为“生日提醒 bot”的应用专用密码。

可运行本地输入窗口，粘贴密码后保存到本机配置：

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy RemoteSigned -File .\setup-email.ps1
```

输入框会遮挡密码，并自动删除分组空格。接着验证加密连接和登录：

```powershell
.\run.ps1 -CheckSmtp
```

此命令不读取收件人名单，不发送邮件，也不写入生日发送记录。

## 4. 正式运行

完成配置后执行：

```powershell
.\run.ps1 -Send
```

只检查今天符合条件的生日。如果没有生日就退出；发送失败的收件人会在下一次运行时重试。默认只发送生日当天的提醒，历史日期不会补发。

其他配置：

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `remind_days` | `[0]` | 当天提醒；改为 `[3, 0]` 表示提前 3 天及当天各提醒一次 |
| `send_at` | `09:00` | 北京时间；只在 `-Send -Scheduled` 模式下限制最早发送时间 |
| `leap_day_policy` | `feb28` | 2 月 29 日生日在非闰年按 2 月 28 日提醒 |

`leap_day_policy` 也可填 `mar01`（非闰年 3 月 1 日）或 `strict`（仅闰年提醒）。提前提醒支持跨年。

## 5. Windows 自动运行

可先预览自动运行配置：

```powershell
.\install-task.ps1
```

确认后加 `-Apply` 注册任务：

```powershell
.\install-task.ps1 -Apply
```

任务名为 `BirthdayEmailReminder`，从下一个本地时间零点起每 30 分钟检查一次，脚本仍按北京时间 send_at 控制最早发送时间。启动任务的 Windows 账号需要保持登录，电脑需要开机联网。生日邮件按历史记录去重；计划任务输出保存在 `data/scheduler-年-月.log`。此脚本不会立即发送今天的提醒。

如需当天立即检查并发送，单独运行 `.\run.ps1 -Send`。

也可以手动配置：

在“任务计划程序”中创建任务，使用以下操作：

- 程序：`powershell.exe`
- 参数：`-NoProfile -ExecutionPolicy RemoteSigned -File "D:\生日快乐bot\run.ps1" -Send -Scheduled`
- 起始于：`D:\生日快乐bot`
- 触发器：每天一次；高级设置中每隔 **30 分钟**重复，持续 **1 天**。推荐从本地时间 00:00 开始；脚本自己按北京时间判断是否已到 send_at。
- 设置：启用“错过计划开始时间后尽快启动任务”；任务已运行时选择“不启动新实例”。

这样每天北京时间 09:00 后的首轮检查会发送，当日后续检查跳过已成功提交的提醒，并重试失败收件人。电脑需要开机联网。可选择“无论用户是否登录都运行”，并确保运行账号能读取项目和邮箱配置。

如果改了目录，请同步修改路径。启动脚本也支持 `-PythonPath "C:\实际路径\python.exe"`，长期运行建议固定 Python 路径。

也可在 Linux 云服务器上运行 `python3 /path/birthday_bot.py --send --scheduled`，用定时器每 30 分钟调用。配置和数据文件默认相对于配置文件所在目录解析，时区固定为北京时间，不依赖服务器的本地时区。

仅创建脚本不会自动注册任务；必须运行 `install-task.ps1 -Apply` 或手动创建任务后才会自动执行。

## 6. 发送记录和实际送达

发送记录保存在 `data/deliveries.sqlite3`：

- `deliveries`：按人员 id、生日发生日期、提前天数及收件邮箱去重。
- `attempts`：记录每个收件人的 SMTP 接受／失败结果。

保留数据库，重复运行就会跳过已成功提交的提醒。数据库中的 `accepted` 表示邮件服务器接受投递，不代表邮件已经进入收件箱；首次正式使用时请确认垃圾邮件和收件情况。

SMTP 不提供端到端的“恰好一次”保证。如果服务器已接受邮件，而进程在写入数据库前中断，或接受响应在网络中丢失，重试仍可能重复发送。程序避免通常的重复执行和并发任务重复，但无法消除这个窗口。

## 验证

使用实际 Python 路径运行：

```powershell
python -m unittest discover -s tests -v
```

测试使用临时 CSV、临时数据库和模拟 SMTP，不发送真实邮件。

Google 云端逻辑使用 Node.js 内置测试工具验证，不需要安装 npm 依赖：

```powershell
node --test cloud/test_cloud.cjs cloud/test_ai_mail.cjs cloud/test_persona_upgrade.cjs
```

仓库提供不含真实数据的 `cloud/Data.example.gs`。部署时可将它与 `cloud/Code.gs` 合并后填写自己的信息，或先配置本机再运行 `export_cloud.py` 生成私人部署文件。`ReadyToPaste.gs`、私人运行记录与真实邮箱过滤器不会上传到仓库。
