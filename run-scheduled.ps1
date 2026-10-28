$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$taskLogDirectory = Join-Path $PSScriptRoot 'data'
[void][IO.Directory]::CreateDirectory($taskLogDirectory)
$taskLogPath = Join-Path $taskLogDirectory ('scheduler-' + (Get-Date -Format 'yyyy-MM') + '.log')
$taskPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
('--- ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz') + ' ---') |
    Out-File -LiteralPath $taskLogPath -Append -Encoding utf8
& $taskPowerShell -NoProfile -ExecutionPolicy RemoteSigned -File (Join-Path $PSScriptRoot 'run.ps1') -Send -Scheduled 2>&1 |
    Out-File -LiteralPath $taskLogPath -Append -Encoding utf8
$taskResult = $LASTEXITCODE
('Exit code: ' + $taskResult) | Out-File -LiteralPath $taskLogPath -Append -Encoding utf8
exit $taskResult
