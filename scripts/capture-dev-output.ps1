<#
  开发模式输出采集脚本
  用途：
  1. 启动当前项目的 `npm.cmd run dev`
  2. 将 stdout/stderr 重定向到临时日志文件
  3. 等待固定时间后输出日志尾部
  4. 若进程仍存活，则按 PID 安全结束
#>

param(
  [int]$WaitSeconds = 25
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:LANG = 'zh_CN.UTF-8'
$env:LC_ALL = 'zh_CN.UTF-8'
$env:PYTHONIOENCODING = 'utf-8'

$stdoutPath = Join-Path $PSScriptRoot '..\tmp-dev-stdout.log'
$stderrPath = Join-Path $PSScriptRoot '..\tmp-dev-stderr.log'
$stdoutPath = [System.IO.Path]::GetFullPath($stdoutPath)
$stderrPath = [System.IO.Path]::GetFullPath($stderrPath)
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

if (Test-Path $stdoutPath) {
  Remove-Item $stdoutPath -Force
}

if (Test-Path $stderrPath) {
  Remove-Item $stderrPath -Force
}

$process = Start-Process `
  -FilePath 'npm.cmd' `
  -ArgumentList 'run', 'dev' `
  -WorkingDirectory $projectRoot `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath `
  -PassThru

Start-Sleep -Seconds $WaitSeconds
$process.Refresh()

Write-Output "PID=$($process.Id)"
Write-Output '---STDOUT---'
if (Test-Path $stdoutPath) {
  Get-Content -Path $stdoutPath -Encoding UTF8 | Select-Object -Last 120
}

Write-Output '---STDERR---'
if (Test-Path $stderrPath) {
  Get-Content -Path $stderrPath -Encoding UTF8 | Select-Object -Last 120
}

if (-not $process.HasExited) {
  taskkill /f /t /pid $process.Id | Out-Null
  Write-Output "KILLED=$($process.Id)"
}
