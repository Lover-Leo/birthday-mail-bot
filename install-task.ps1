param(
    [switch]$Apply,
    [string]$TaskName = 'BirthdayEmailReminder'
)

$ErrorActionPreference = 'Stop'
$taskPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$taskRunner = Join-Path $PSScriptRoot 'run-scheduled.ps1'
$taskArguments = '-NoProfile -ExecutionPolicy RemoteSigned -File "' + $taskRunner + '"'
$taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskDescription = 'Birthday email reminder for ' + $PSScriptRoot

Write-Output ('Task name: ' + $TaskName)
Write-Output ('Run as: ' + $taskIdentity + ' (while logged on)')
Write-Output 'Schedule: every 30 minutes, starting at the next local midnight.'
Write-Output 'The bot sends only after the configured Beijing send_at time.'
Write-Output ('Runner: ' + $taskRunner)
if (-not $Apply) {
    Write-Output 'Preview only. Add -Apply to register the task.'
    exit 0
}

if (-not (Test-Path -LiteralPath $taskRunner)) { throw 'Task runner not found.' }
$taskExisting = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($taskExisting -and $taskExisting.Description -ne $taskDescription) {
    throw 'This task name belongs to another task. Choose another -TaskName.'
}

$taskAction = New-ScheduledTaskAction -Execute $taskPowerShell -Argument $taskArguments -WorkingDirectory $PSScriptRoot
$taskTrigger = New-ScheduledTaskTrigger -Once -At ([datetime]::Today.AddDays(1)) -RepetitionInterval (New-TimeSpan -Minutes 30)
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $taskIdentity -LogonType Interactive -RunLevel Limited
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
Register-ScheduledTask -TaskName $TaskName -Description $taskDescription -Action $taskAction `
    -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Force | Out-Null
Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State
Get-ScheduledTaskInfo -TaskName $TaskName | Select-Object NextRunTime, LastTaskResult
