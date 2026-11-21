param([string]$OutputPath)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
if (!$OutputPath) { $OutputPath = Join-Path $root 'name-race-release.zip' }
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
if (!(Test-Path (Join-Path $root 'dist\server.js'))) { throw 'Run npm run build first.' }
$stage = Join-Path ([IO.Path]::GetTempPath()) ('name-race-release-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
  Copy-Item -LiteralPath (Join-Path $root 'dist'),(Join-Path $root 'public') -Destination $stage -Recurse
  $manifest = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
  $manifest.scripts = [pscustomobject]@{ start = 'node dist/server.js' }
  $manifest.PSObject.Properties.Remove('devDependencies')
  [IO.File]::WriteAllText((Join-Path $stage 'package.json'),($manifest | ConvertTo-Json -Depth 100),[Text.UTF8Encoding]::new($false))
  Push-Location $root
  try { $packages = @(npm ls --omit=dev --all --parseable); if ($LASTEXITCODE -ne 0) { throw 'Production dependency tree is incomplete.' } }
  finally { Pop-Location }
  $prefix = (Join-Path $root 'node_modules') + [IO.Path]::DirectorySeparatorChar
  foreach ($path in $packages | Select-Object -Unique) {
    if (!$path.StartsWith($prefix)) { continue }
    $target = Join-Path (Join-Path $stage 'node_modules') $path.Substring($prefix.Length)
    New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
    Copy-Item -LiteralPath $path -Destination $target -Recurse -Force
  }
  $native = Get-ChildItem -LiteralPath (Join-Path $stage 'node_modules') -Recurse -File |
    Where-Object { $_.Extension -in '.node','.dll','.so','.exe' }
  if ($native) { throw 'Native production dependencies require a Linux build; do not deploy Windows binaries.' }
  if (Test-Path -LiteralPath $OutputPath) { Remove-Item -LiteralPath $OutputPath }
  [IO.Compression.ZipFile]::CreateFromDirectory($stage,$OutputPath,[IO.Compression.CompressionLevel]::Optimal,$false)
  Write-Output $OutputPath
} finally {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
