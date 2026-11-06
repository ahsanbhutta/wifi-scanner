#Requires -Version 5.1
<#
.SYNOPSIS
  Reclaim disk space from a build project WITHOUT breaking it.

.DESCRIPTION
  Deletes only things that are reproducible from source:
    - build output   (dist, build, out, coverage, ...)  -> npm run build
    - dependencies   (node_modules, .venv, ...)         -> npm ci
    - global caches  (npm, npx, ...)                    -> re-downloaded on demand

  It never touches source code, git history, lockfiles, env files, or data
  (SQLite history, downloaded vendor DB). Everything deleted is restorable
  with two commands; everything kept is not.

  Default mode is a DRY RUN: it only prints a size report. Pass -Yes to
  actually delete. This script has no dependencies and works in any folder -
  copy it into other projects and run it there too.

.PARAMETER Path
  Project folder to clean. Defaults to the current directory.

.PARAMETER Yes
  Actually delete (without it, the script only reports).

.PARAMETER Caches
  Also purge GLOBAL package caches (npm/npx/pip). These are shared by every
  project on the machine - cleaning them is safe, the next install just
  re-downloads what it needs.

.EXAMPLE
  .\scripts\clean.ps1
      Dry run: show what could be freed in this project.

.EXAMPLE
  .\scripts\clean.ps1 -Yes
      Delete build output + dependencies in this project.

.EXAMPLE
  .\scripts\clean.ps1 -Yes -Caches
      ...and also purge the global npm/npx/pip caches.

.EXAMPLE
  .\scripts\clean.ps1 -Path "D:\other\project" -Yes
      Clean a different project folder.
#>
[CmdletBinding()]
param(
    [string]$Path = (Get-Location).Path,
    [switch]$Yes,
    [switch]$Caches
)

$ErrorActionPreference = 'SilentlyContinue'

# ---------------------------------------------------------------- helpers ---

function Format-Size([double]$bytes) {
    if ($bytes -ge 1GB) { return ('{0:N2} GB' -f ($bytes / 1GB)) }
    if ($bytes -ge 1MB) { return ('{0:N1} MB' -f ($bytes / 1MB)) }
    if ($bytes -ge 1KB) { return ('{0:N1} KB' -f ($bytes / 1KB)) }
    return ('{0:N0} B' -f $bytes)
}

function Get-Size([string]$item) {
    if (-not (Test-Path -LiteralPath $item)) { return 0 }
    $sum = 0L
    if (Test-Path -LiteralPath $item -PathType Container) {
        Get-ChildItem -LiteralPath $item -Recurse -File -Force -ErrorAction SilentlyContinue |
            ForEach-Object { $sum += $_.Length }
    } else {
        $sum = (Get-Item -LiteralPath $item -Force).Length
    }
    return $sum
}

# ------------------------------------------------------- locate the target ---

$root = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
if ($root -match '^[A-Za-z]:\\?$') {
    throw "Refusing to clean a drive root ($root). Pass the project folder instead."
}

# Names that are NEVER deleted, even if a pattern would match them.
$protected = @(
    '.git', '.svn', '.hg', '.github', '.vscode', '.idea',
    'src', 'test', 'tests', 'scripts', 'public', 'docs', 'data',
    'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
    '.nvmrc', '.gitignore', 'README.md', 'LICENSE', 'CHANGELOG.md'
)

# Build outputs: unambiguous in any project.
$buildNames = @(
    'dist', 'coverage', 'out',
    '.next', '.nuxt', '.output', '.svelte-kit', '.turbo', '.cache',
    '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache',
    'target'      # Rust/Java build dir
)
# 'build' is output in most projects, but could be hand-written scripts -
# only treat it as output when the project is clearly a package (package.json).
if (Test-Path -LiteralPath (Join-Path $root 'package.json')) {
    $buildNames += 'build'
}

# Dependencies: deleted too (rebuild with `npm ci`), but listed separately
# because they need a reinstall rather than a rebuild.
$depNames = @('node_modules', '.venv', 'venv', '.tox', '.eggs')

function Test-Protected([string]$name) {
    foreach ($p in $protected) { if ($name -ieq $p) { return $true } }
    return $false
}

# Collect existing targets -----------------------------------------------------
$buildTargets = @()
$depTargets   = @()
foreach ($n in $buildNames) {
    $p = Join-Path $root $n
    if ((Test-Path -LiteralPath $p -PathType Container) -and -not (Test-Protected $n)) {
        $buildTargets += $p
    }
}
foreach ($n in $depNames) {
    $p = Join-Path $root $n
    if ((Test-Path -LiteralPath $p -PathType Container) -and -not (Test-Protected $n)) {
        $depTargets += $p
    }
}

# Protected items worth showing in the report ---------------------------------
$kept = @()
foreach ($k in @('data', '.git', 'package-lock.json', 'package.json', '.env')) {
    $p = Join-Path $root $k
    if (Test-Path -LiteralPath $p) { $kept += $p }
}
$db = Join-Path $root 'data\devices.db'
if (Test-Path -LiteralPath $db) { $kept += $db }

# ------------------------------------------------------------------ report ---

$projName = Split-Path $root -Leaf
$pkgJson  = Join-Path $root 'package.json'
if (Test-Path -LiteralPath $pkgJson) {
    try {
        $name = (Get-Content -LiteralPath $pkgJson -Raw | ConvertFrom-Json).name
        if ($name) { $projName = $name }
    } catch {}
}

$buildBytes = 0; foreach ($t in $buildTargets) { $buildBytes += Get-Size $t }
$depBytes   = 0; foreach ($t in $depTargets)   { $depBytes   += Get-Size $t }
$total      = $buildBytes + $depBytes

Write-Host ""
Write-Host ("=" * 68)
Write-Host "  CLEANER  $projName"
Write-Host "  root     $root"
Write-Host ("=" * 68)
Write-Host ""
Write-Host "  BUILD OUTPUT   (rebuild: npm run build)"
if ($buildTargets.Count -eq 0) { Write-Host "    (nothing found)" }
foreach ($t in $buildTargets) {
    $name = Split-Path $t -Leaf
    Write-Host ("    {0,-16} {1,10}" -f $name, (Format-Size (Get-Size $t)))
}
Write-Host ""
Write-Host "  DEPENDENCIES   (rebuild: npm ci)"
if ($depTargets.Count -eq 0) { Write-Host "    (nothing found)" }
foreach ($t in $depTargets) {
    $name = Split-Path $t -Leaf
    Write-Host ("    {0,-16} {1,10}" -f $name, (Format-Size (Get-Size $t)))
}
Write-Host ""
Write-Host "  KEPT FOREVER   (never deleted)"
foreach ($t in $kept) {
    $name = $t.Substring($root.Length).TrimStart('\')
    Write-Host ("    {0,-16} {1,10}" -f $name, (Format-Size (Get-Size $t)))
}
Write-Host ""
Write-Host ("  reclaimable: {0}" -f (Format-Size $total))
Write-Host ""

# ---------------------------------------------------------- global caches ---

$cacheBytes = 0
$cacheJobs  = @()
if ($Caches) {
    $npmCache = Join-Path $env:LOCALAPPDATA 'npm-cache'
    if (-not (Test-Path -LiteralPath $npmCache)) { $npmCache = Join-Path $env:APPDATA 'npm-cache' }
    $npxCache = Join-Path $env:LOCALAPPDATA 'npx'
    $pipCache = Join-Path $env:LOCALAPPDATA 'pip\cache'

    Write-Host "  GLOBAL CACHES  (safe: re-downloaded on demand)"
    foreach ($c in @(@('npm cache', $npmCache), @('npx cache', $npxCache), @('pip cache', $pipCache))) {
        if (Test-Path -LiteralPath $c[1]) {
            $s = Get-Size $c[1]
            $cacheBytes += $s
            Write-Host ("    {0,-16} {1,10}" -f $c[0], (Format-Size $s))
            $cacheJobs += ,$c   # comma: keep the pair as ONE array element
        }
    }
    Write-Host ""
    Write-Host ("  cache reclaimable: {0}" -f (Format-Size $cacheBytes))
    Write-Host ""
}

# ------------------------------------------------------------------ delete ---

if (-not $Yes) {
    Write-Host "  DRY RUN - nothing was deleted."
    Write-Host "  Re-run with -Yes to actually free the space:"
    $flag = ''
    if ($Caches) { $flag = ' -Caches' }
    Write-Host "      .\scripts\clean.ps1 -Yes$flag"
    Write-Host ""
    return
}

$before = 0; foreach ($t in ($buildTargets + $depTargets)) { $before += Get-Size $t }

foreach ($t in ($buildTargets + $depTargets)) {
    $name = Split-Path $t -Leaf
    Write-Host "  deleting $name ..."
    Remove-Item -LiteralPath $t -Recurse -Force -ErrorAction SilentlyContinue
}

$after = 0; foreach ($t in ($buildTargets + $depTargets)) { $after += Get-Size $t }
$freed = $before - $after

if ($Caches -and $cacheJobs.Count -gt 0) {
    foreach ($c in $cacheJobs) {
        Write-Host "  purging $($c[0]) ..."
        switch ($c[0]) {
            'npm cache' { & npm cache clean --force 2>$null }
            'npx cache' { Remove-Item -LiteralPath $c[1] -Recurse -Force -ErrorAction SilentlyContinue }
            'pip cache' { & pip cache purge 2>$null }
        }
    }
}

Write-Host ""
Write-Host ("=" * 68)
Write-Host ("  FREED: {0}" -f (Format-Size $freed))
if ($after -gt 0) {
    Write-Host ("  note:  {0} left behind (files in use - usually the app is still running)" -f (Format-Size $after))
}
Write-Host ""
Write-Host "  To bring the project back:"
Write-Host "      npm ci            # restore dependencies"
Write-Host "      npm run build     # restore dist\ (the exe)"
Write-Host ""
Write-Host ("=" * 68)
