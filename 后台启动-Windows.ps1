$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
try {
  $fitnessHealth = Invoke-RestMethod -Uri 'http://localhost:4177/api/health' -TimeoutSec 2
  if ($fitnessHealth.ok) { Write-Output '健身服务正在运行：http://localhost:4177'; return }
} catch { }
$fitnessNode = Get-Command node -ErrorAction SilentlyContinue
$fitnessNodePath = if ($fitnessNode) { $fitnessNode.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $fitnessNodePath)) { throw '请安装Node.js 24 LTS。' }
New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'data') | Out-Null
Start-Process -FilePath $fitnessNodePath -ArgumentList @('--env-file-if-exists=.env','server.mjs') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'data/service.log') -RedirectStandardError (Join-Path $PSScriptRoot 'data/error.log')
Write-Output '已在后台启动：http://localhost:4177。运行日志位于data目录。'
