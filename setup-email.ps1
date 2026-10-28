param([string]$Config = 'config.json')

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$taskConfigPath = if ([IO.Path]::IsPathRooted($Config)) { $Config } else { Join-Path $PSScriptRoot $Config }
$taskSettings = Get-Content -LiteralPath $taskConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json

$taskForm = New-Object System.Windows.Forms.Form
$taskForm.Text = '生日提醒 bot：Gmail 授权码'
$taskForm.ClientSize = New-Object System.Drawing.Size(560, 320)
$taskForm.StartPosition = 'CenterScreen'
$taskForm.FormBorderStyle = 'FixedDialog'
$taskForm.MaximizeBox = $false
$taskForm.MinimizeBox = $false
$taskForm.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10)

$taskLabel = New-Object System.Windows.Forms.Label
$taskLabel.Location = New-Object System.Drawing.Point(20, 18)
$taskLabel.Size = New-Object System.Drawing.Size(520, 55)
$taskLabel.Text = "发件邮箱：$($taskSettings.smtp.username)`r`n请输入 Google 生成的 16 位应用专用密码："
$taskForm.Controls.Add($taskLabel)

$taskPasswordBox = New-Object System.Windows.Forms.TextBox
$taskPasswordBox.Location = New-Object System.Drawing.Point(20, 82)
$taskPasswordBox.Size = New-Object System.Drawing.Size(520, 30)
$taskPasswordBox.UseSystemPasswordChar = $true
$taskForm.Controls.Add($taskPasswordBox)

$taskLink = New-Object System.Windows.Forms.LinkLabel
$taskLink.Location = New-Object System.Drawing.Point(20, 125)
$taskLink.Size = New-Object System.Drawing.Size(520, 28)
$taskLink.Text = '打开 Google 应用专用密码页面'
$taskLink.Add_LinkClicked({ Start-Process 'https://myaccount.google.com/apppasswords' })
$taskForm.Controls.Add($taskLink)

$taskNote = New-Object System.Windows.Forms.Label
$taskNote.Location = New-Object System.Drawing.Point(20, 162)
$taskNote.Size = New-Object System.Drawing.Size(520, 66)
$taskNote.Text = "密码会保存到本机 config.json，不会写入聊天或控制台。`r`n保存操作不会发送邮件。可直接粘贴带分组空格的密码。"
$taskForm.Controls.Add($taskNote)

$taskSave = New-Object System.Windows.Forms.Button
$taskSave.Text = '保存到本机'
$taskSave.Location = New-Object System.Drawing.Point(305, 255)
$taskSave.Size = New-Object System.Drawing.Size(125, 38)
$taskSave.Add_Click({
    $taskSecret = $taskPasswordBox.Text -replace '\s', ''
    if ($taskSecret -notmatch '^[A-Za-z0-9]{16}$') {
        [void][System.Windows.Forms.MessageBox]::Show('请输入 Google 生成的 16 位应用专用密码。', '请检查密码')
        return
    }
    try {
        $taskCurrent = Get-Content -LiteralPath $taskConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($taskCurrent.smtp.username -ne $taskSettings.smtp.username) {
            throw '发件账号已修改，请重新打开本窗口。'
        }
        $taskCurrent.smtp.password = $taskSecret
        $taskJson = $taskCurrent | ConvertTo-Json -Depth 10
        [IO.File]::WriteAllText($taskConfigPath, $taskJson + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
        $taskPasswordBox.Clear()
        $taskSecret = $null
        $taskForm.DialogResult = [System.Windows.Forms.DialogResult]::OK
        $taskForm.Close()
    } catch {
        [void][System.Windows.Forms.MessageBox]::Show('保存失败，请检查 config.json 是否可写，然后重试。', '保存失败')
    }
})
$taskForm.Controls.Add($taskSave)
$taskForm.AcceptButton = $taskSave

$taskCancel = New-Object System.Windows.Forms.Button
$taskCancel.Text = '取消'
$taskCancel.Location = New-Object System.Drawing.Point(440, 255)
$taskCancel.Size = New-Object System.Drawing.Size(100, 38)
$taskCancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$taskForm.Controls.Add($taskCancel)
$taskForm.CancelButton = $taskCancel
$taskForm.Add_Shown({ $taskPasswordBox.Focus() })

[void]$taskForm.ShowDialog()
$taskPasswordBox.Clear()
$taskForm.Dispose()
