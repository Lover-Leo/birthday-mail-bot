param(
    [switch]$Send,
    [switch]$Scheduled,
    [switch]$CheckSmtp,
    [string]$Date = '',
    [string]$Config = 'config.json',
    [string]$PythonPath = ''
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$taskPython = $PythonPath
if (-not $taskPython) {
    $taskCommand = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($taskCommand -and $taskCommand.Source -notlike '*\Microsoft\WindowsApps\*') {
        $taskPython = $taskCommand.Source
    }
}
if (-not $taskPython) {
    $taskPythonRoot = Join-Path $env:LOCALAPPDATA 'Programs\Python'
    if (Test-Path -LiteralPath $taskPythonRoot) {
        $taskInstalled = Get-ChildItem -Path (Join-Path $taskPythonRoot 'Python*\python.exe') -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | Select-Object -First 1
        if ($taskInstalled) { $taskPython = $taskInstalled.FullName }
    }
}
if (-not $taskPython) {
    $taskBundled = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
    if (Test-Path -LiteralPath $taskBundled) { $taskPython = $taskBundled }
}
if (-not $taskPython -or -not (Test-Path -LiteralPath $taskPython)) {
    throw 'Python 3.10+ is required. Pass its full path using -PythonPath.'
}

$taskConfig = if ([IO.Path]::IsPathRooted($Config)) { $Config } else { Join-Path $PSScriptRoot $Config }
$taskArguments = @((Join-Path $PSScriptRoot 'birthday_bot.py'), '--config', $taskConfig)
if ($Send) { $taskArguments += '--send' }
if ($Scheduled) { $taskArguments += '--scheduled' }
if ($CheckSmtp) { $taskArguments += '--check-smtp' }
if ($Date) { $taskArguments += @('--date', $Date) }
$env:PYTHONIOENCODING = 'utf-8'
& $taskPython @taskArguments
exit $LASTEXITCODE
