[CmdletBinding()]
param([switch]$Plan, [switch]$CommitOnly)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$contextPath = Join-Path $projectRoot '.local\publish-context.json'
$statePath = Join-Path $projectRoot '.local\publish-state.json'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-Checked {
  param([string]$Executable, [string[]]$Arguments)
  $output = @(& $Executable @Arguments)
  if ($LASTEXITCODE -ne 0) { throw "$Executable failed (exit $LASTEXITCODE): $($Arguments -join ' ')" }
  return ($output -join "`n").Trim()
}

function Invoke-Checked {
  param([string]$Executable, [string[]]$Arguments)
  & $Executable @Arguments | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "$Executable failed (exit $LASTEXITCODE): $($Arguments -join ' ')" }
}

function Get-Head {
  param([string]$Root)
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = @(& git -C $Root rev-parse --verify HEAD 2>$null)
    if ($LASTEXITCODE -ne 0) { return '' }
    return ($output -join '').Trim()
  } finally { $ErrorActionPreference = $previous }
}

function Get-GitHubResource {
  param([string]$Endpoint)
  $previous = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = @(& gh api $Endpoint 2>$null)
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previous }
  $json = ($output -join "`n") | ConvertFrom-Json
  if ($code -eq 0) { return $json }
  # 只有明确的 404 才视为未创建，权限或网络错误不会触发重复创建。
  if ($json.PSObject.Properties.Name -contains 'status' -and [string]$json.status -eq '404') { return $null }
  throw "GitHub request failed: $Endpoint. Check authentication/network and rerun."
}

function Assert-Prepared {
  param([string]$Root, $Files, [string]$ExpectedHead)
  if ((Get-Head $Root) -ne $ExpectedHead) { throw "Git HEAD changed since preparation: $Root. Review and prepare again." }
  if ((Get-Checked git @('-C', $Root, 'branch', '--show-current')) -ne 'main') { throw "Expected main branch: $Root" }
  $allowed = @($Files | ForEach-Object { [string]$_.path })
  foreach ($file in $Files) {
    $target = [IO.Path]::GetFullPath((Join-Path $Root $file.path))
    if (-not $target.StartsWith($Root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Prepared path escapes workspace.' }
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "Prepared file is missing: $target" }
    $bytes = [IO.File]::ReadAllBytes($target)
    # .NET 摘要避免 Windows PowerShell 的模块自动加载差异影响双击发布。
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($algorithm.ComputeHash($bytes)).Replace('-', '') }
    finally { $algorithm.Dispose() }
    if ($hash -ne $file.sha256) { throw "Prepared file changed: $target. Review and prepare again." }
    $text = [Text.Encoding]::UTF8.GetString($bytes)
    if ($text -match '(?<!\r)\n|\r(?!\n)') { throw "Mixed or LF line endings: $target" }
  }
  $changes = @()
  foreach ($arguments in @(
    @('-C', $Root, 'diff', '--name-only'),
    @('-C', $Root, 'diff', '--cached', '--name-only'),
    @('-C', $Root, 'ls-files', '--others', '--exclude-standard')
  )) {
    $lines = Get-Checked git $arguments
    if ($lines) { $changes += $lines -split "`n" }
  }
  foreach ($change in $changes) {
    if ($change.Trim() -notin $allowed) { throw "Unrelated change found in ${Root}: $change. This script only publishes prepared files." }
  }
  Invoke-Checked git @('-C', $Root, 'diff', '--check')
  foreach ($identity in @('user.name', 'user.email')) {
    if (-not (Get-Checked git @('-C', $Root, 'config', $identity))) { throw "Missing Git $identity in $Root" }
  }
}

function Save-State {
  [IO.File]::WriteAllText($statePath, (($state | ConvertTo-Json) -replace "`r?`n", "`r`n") + "`r`n", $utf8)
}

function Get-ActualModel {
  # 独立终端也从来源会话读取实际生效模型，不依赖配置默认值。
  $modelOutput = @( & powershell.exe -NoProfile -File $context.modelScript -ThreadId $context.threadId )
  if ($LASTEXITCODE -ne 0 -or $modelOutput.Count -ne 1) { throw 'Actual model lookup failed. No commit was created; do not guess the model.' }
  $model = ([string]$modelOutput[0]).Trim()
  if ($model -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$' -or $model -ne $context.preparedModel) { throw 'Actual model differs from preparation. Review and prepare again before committing.' }
  return $model
}

function Commit-Prepared {
  param([string]$Root, $Files, $Message)
  $dirty = Get-Checked git @('-C', $Root, 'status', '--porcelain')
  if (-not $dirty) { Write-Host "Prepared commit already exists: $Root"; return (Get-Head $Root) }
  Get-Content -LiteralPath (Join-Path $Root 'AGENTS.md') -Encoding UTF8 | Out-Host
  if (Get-Head $Root) { Invoke-Checked git @('-C', $Root, 'log', '-5', '--oneline') }
  $model = Get-ActualModel
  $body = ($Message.body | ForEach-Object { '- ' + $_ }) -join "`n"
  $messageText = $Message.title + "`n`n" + $body + "`n`nCo-Authored-By: Codex $model <noreply@openai.com>`n"
  $messageFile = Join-Path ([IO.Path]::GetTempPath()) ('bestools-commit-' + [Guid]::NewGuid().ToString('N') + '.txt')
  try {
    [IO.File]::WriteAllText($messageFile, ($messageText -replace "`r?`n", "`r`n"), $utf8)
    $paths = @($Files | ForEach-Object { [string]$_.path })
    Invoke-Checked git (@('-C', $Root, 'add', '--') + $paths)
    Invoke-Checked git @('-C', $Root, 'diff', '--cached', '--check')
    # 不设置 author/committer 时间，使用用户手动执行此脚本时的实际时间。
    Invoke-Checked git @('-C', $Root, 'commit', '--file', $messageFile)
  } finally { if (Test-Path -LiteralPath $messageFile) { Remove-Item -LiteralPath $messageFile } }
  return (Get-Head $Root)
}

function Assert-Origin {
  param([string]$Root, [string]$Expected, [switch]$Optional)
  $remotes = Get-Checked git @('-C', $Root, 'remote')
  if ('origin' -notin ($remotes -split "`n")) {
    if ($Optional) { return }
    throw "Missing origin: $Root"
  }
  $actual = Get-Checked git @('-C', $Root, 'remote', 'get-url', 'origin')
  if ($actual.TrimEnd('/') -ne $Expected -and $actual.TrimEnd('/') -ne ($Expected -replace '\.git$', '')) { throw "Unexpected origin: $actual" }
}

function Wait-Pages {
  param([string]$Repository, [string]$Head)
  $since = [DateTime]::UtcNow.AddSeconds(-3)
  Invoke-Checked gh @('workflow', 'run', 'pages.yml', '--repo', $Repository, '--ref', 'main')
  $runId = $null
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    $runs = (Get-Checked gh @('run', 'list', '--repo', $Repository, '--workflow', 'pages.yml', '--event', 'workflow_dispatch', '--limit', '10', '--json', 'databaseId,headSha,createdAt')) | ConvertFrom-Json
    $run = @($runs | Where-Object { $_.headSha -eq $Head -and [DateTime]::Parse($_.createdAt).ToUniversalTime() -ge $since } | Select-Object -First 1)
    if ($run.Count -gt 0) { $runId = [string]$run[0].databaseId; break }
    Start-Sleep -Seconds 2
  }
  if (-not $runId) { throw "Workflow not visible yet. Check GitHub Actions in $Repository and rerun this script." }
  Invoke-Checked gh @('run', 'watch', $runId, '--repo', $Repository, '--exit-status', '--interval', '5')
  $pages = Get-GitHubResource "repos/$Repository/pages"
  if (-not $pages) { throw "Pages is missing for $Repository" }
  return [string]$pages.html_url
}

if (-not (Test-Path -LiteralPath $contextPath)) { throw 'Local preparation context is missing. Ask Codex to review and prepare publishing again.' }
$context = Get-Content -LiteralPath $contextPath -Encoding UTF8 -Raw | ConvertFrom-Json
$metadata = Get-Content -LiteralPath (Join-Path $projectRoot 'docs\github.json') -Encoding UTF8 -Raw | ConvertFrom-Json
$state = [pscustomobject]@{ toolsHead = ''; portfolioHead = '' }
if (Test-Path -LiteralPath $statePath) { $state = Get-Content -LiteralPath $statePath -Encoding UTF8 -Raw | ConvertFrom-Json }
$portfolioRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '..\BesSoftware'))
$repository = $metadata.owner + '/' + $metadata.name
$repositoryUrl = "https://github.com/$repository.git"
foreach ($command in @('node', 'npm.cmd', 'git', 'gh', 'powershell.exe', 'curl.exe')) { Get-Command $command -ErrorAction Stop | Out-Null }
foreach ($variable in @('GIT_AUTHOR_DATE', 'GIT_COMMITTER_DATE')) {
  if (Test-Path "Env:$variable") { throw "$variable is set. Remove the timestamp override before running this script." }
}
$expectedToolsHead = if ($state.toolsHead) { $state.toolsHead } else { $context.toolsBaseHead }
$expectedPortfolioHead = if ($state.portfolioHead) { $state.portfolioHead } else { $context.portfolioBaseHead }
Assert-Prepared $projectRoot $context.toolsFiles $expectedToolsHead
Assert-Prepared $portfolioRoot $context.portfolioFiles $expectedPortfolioHead
Assert-Origin $projectRoot $repositoryUrl -Optional
Assert-Origin $portfolioRoot 'https://github.com/BensonLaur/BesSoftware.git'
if ((Get-Checked gh @('api', 'user', '--jq', '.login')) -ne $metadata.owner) { throw 'GitHub CLI is authenticated to a different account.' }
Write-Host "Repository: $repository (public)"
Write-Host "Description: $($metadata.description)"
Write-Host "Website: $($metadata.homepage)"
Write-Host ('Verified model from source session: ' + (Get-ActualModel))
Write-Host 'Prepared files and Git state match. No timestamp override will be used.'
if ($Plan) { Write-Host 'PLAN ONLY: test -> real-time commits -> create repository -> push -> enable Pages -> deploy -> set Website -> publish BesSoftware entry.'; exit 0 }

Push-Location $projectRoot
try {
  if (-not (Test-Path -LiteralPath 'node_modules\playwright\package.json')) { Invoke-Checked npm.cmd @('ci') }
  Invoke-Checked npm.cmd @('test')
} finally { Pop-Location }
Push-Location $portfolioRoot
try {
  if (-not (Test-Path -LiteralPath 'node_modules\playwright\package.json')) { Invoke-Checked npm.cmd @('ci') }
  Invoke-Checked npm.cmd @('test')
} finally { Pop-Location }
Assert-Prepared $projectRoot $context.toolsFiles $expectedToolsHead
Assert-Prepared $portfolioRoot $context.portfolioFiles $expectedPortfolioHead
$state.toolsHead = Commit-Prepared $projectRoot $context.toolsFiles $metadata.toolsCommit
Save-State
if ($CommitOnly) {
  $state.portfolioHead = Commit-Prepared $portfolioRoot $context.portfolioFiles $metadata.portfolioCommit
  Save-State
  Write-Host 'Local commits ready. No GitHub mutation was performed.'
  exit 0
}

$remoteRepository = Get-GitHubResource "repos/$repository"
if (-not $remoteRepository) {
  Invoke-Checked gh @('repo', 'create', $repository, '--public', '--description', $metadata.description, '--homepage', $metadata.homepage, '--source', $projectRoot, '--remote', 'origin')
} else {
  if ($remoteRepository.private) { throw 'Existing repository is private; review visibility before deploying.' }
  if ('origin' -notin ((Get-Checked git @('-C', $projectRoot, 'remote')) -split "`n")) { Invoke-Checked git @('-C', $projectRoot, 'remote', 'add', 'origin', $repositoryUrl) }
}
Assert-Origin $projectRoot $repositoryUrl
Invoke-Checked gh @('repo', 'edit', $repository, '--description', $metadata.description, '--homepage', $metadata.homepage)
foreach ($topic in $metadata.topics) { Invoke-Checked gh @('repo', 'edit', $repository, '--add-topic', $topic) }
Invoke-Checked git @('-C', $projectRoot, 'push', '-u', 'origin', 'main')
$pages = Get-GitHubResource "repos/$repository/pages"
if (-not $pages) { Invoke-Checked gh @('api', '--method', 'POST', "repos/$repository/pages", '-f', 'build_type=workflow') }
elseif ($pages.build_type -ne 'workflow') { Invoke-Checked gh @('api', '--method', 'PUT', "repos/$repository/pages", '-f', 'build_type=workflow') }
# 首次 push 可能早于 Pages 启用；明确触发并等待已配置好的工作流。
$toolsUrl = Wait-Pages $repository $state.toolsHead
$homepageHtml = Get-Checked curl.exe @('--fail', '--silent', '--show-error', '--location', '--retry', '3', '--retry-delay', '3', $toolsUrl)
$passwordHtml = Get-Checked curl.exe @('--fail', '--silent', '--show-error', '--location', '--retry', '3', '--retry-delay', '3', ($toolsUrl.TrimEnd('/') + '/tools/password/'))
if ($homepageHtml -notmatch '<title>BesTools' -or $passwordHtml -notmatch 'id="password-form"') { throw 'Published pages did not contain the expected site. BesSoftware has not been published.' }
Invoke-Checked gh @('repo', 'edit', $repository, '--homepage', $toolsUrl)
Assert-Prepared $portfolioRoot $context.portfolioFiles $expectedPortfolioHead
$state.portfolioHead = Commit-Prepared $portfolioRoot $context.portfolioFiles $metadata.portfolioCommit
Save-State
Invoke-Checked git @('-C', $portfolioRoot, 'push', 'origin', 'main')
$portfolioUrl = Wait-Pages 'BensonLaur/BesSoftware' $state.portfolioHead
Write-Host "Published: $toolsUrl"
Write-Host "Password tool: $($toolsUrl.TrimEnd('/'))/tools/password/"
Write-Host "Portfolio: $portfolioUrl"
