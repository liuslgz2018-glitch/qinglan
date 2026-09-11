$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$fitnessNode = Get-Command node -ErrorAction SilentlyContinue
$fitnessNodePath = if ($fitnessNode) { $fitnessNode.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $fitnessNodePath)) { throw '请先安装 Node.js 24 LTS，再运行此文件。' }
& $fitnessNodePath --env-file-if-exists=.env server.mjs
