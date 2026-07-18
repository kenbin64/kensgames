<#
  build-portable-win.ps1
  Builds a portable Windows FastTrack (Electron) build for itch.io, with NO npm.
  It downloads the Electron prebuilt binary directly from GitHub, drops the
  FastTrack app into it, renames the exe, and zips the result.

  Run (in PowerShell, in this folder):
      powershell -ExecutionPolicy Bypass -File build-portable-win.ps1
  Optional pinned version:
      powershell -ExecutionPolicy Bypass -File build-portable-win.ps1 -Version v37.2.0
#>
param(
  [string]$Version = ""   # empty = auto-detect the latest stable Electron
)
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.IO.Compression.FileSystem

$elecDir = $PSScriptRoot
$repo    = (Resolve-Path (Join-Path $elecDir "..\..")).Path
$work    = Join-Path $elecDir "dist-portable"
$appName = "FastTrack"
$stage   = Join-Path $work $appName

function RoboCopyDir($src, $dst, $extraArgs) {
  $args = @($src, $dst, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NP") + $extraArgs
  robocopy @args | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE) for $src" }
  $global:LASTEXITCODE = 0
}

Write-Host ">> repo root : $repo"
Write-Host ">> work dir  : $work"

# 1. resolve Electron version
if (-not $Version) {
  Write-Host ">> querying latest stable Electron version..."
  $rel = Invoke-RestMethod "https://api.github.com/repos/electron/electron/releases/latest" -Headers @{ "User-Agent" = "fasttrack-build" }
  $Version = $rel.tag_name
}
Write-Host ">> Electron version: $Version"

$zipName = "electron-$Version-win32-x64.zip"
$url     = "https://github.com/electron/electron/releases/download/$Version/$zipName"

# 2. fresh workspace
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
$zipPath = Join-Path $work $zipName

# 3. download Electron
Write-Host ">> downloading $url"
(New-Object System.Net.WebClient).DownloadFile($url, $zipPath)
Write-Host ">> downloaded $([math]::Round((Get-Item $zipPath).Length/1MB)) MB"

# 4. extract the Electron runtime into the stage folder
Write-Host ">> extracting Electron runtime..."
Expand-Archive -Path $zipPath -DestinationPath $stage -Force

# 5. resources/app = the wrapper code that main.js needs
$appDir = Join-Path $stage "resources\app"
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
Copy-Item (Join-Path $elecDir "main.js")           $appDir
Copy-Item (Join-Path $elecDir "preload.js")        $appDir
Copy-Item (Join-Path $elecDir "loopback-server.js") $appDir
if (Test-Path (Join-Path $elecDir "assets")) {
  Copy-Item (Join-Path $elecDir "assets") (Join-Path $appDir "assets") -Recurse
}
@'
{
  "name": "fasttrack-desktop",
  "productName": "FastTrack",
  "version": "1.0.0",
  "main": "main.js"
}
'@ | Set-Content -Encoding UTF8 (Join-Path $appDir "package.json")

# 6. resources/app-root = the served web content (main.js reads this when packaged)
$rootDir = Join-Path $stage "resources\app-root"
New-Item -ItemType Directory -Force -Path $rootDir | Out-Null
foreach ($d in @("js","lib","assets")) {
  RoboCopyDir (Join-Path $repo $d) (Join-Path $rootDir $d) @()
}
# fasttrack content, minus dev-only folders/files
RoboCopyDir (Join-Path $repo "fasttrack") (Join-Path $rootDir "fasttrack") `
  @("/XD", "electron", "node_modules", "_archive", "_backups", "/XF", "*.test.js", "test_*.js", "*.sh")

# 7. rename electron.exe -> FastTrack.exe (this also makes app.isPackaged true), drop default app
Rename-Item (Join-Path $stage "electron.exe") "$appName.exe"
$defAsar = Join-Path $stage "resources\default_app.asar"
if (Test-Path $defAsar) { Remove-Item $defAsar -Force }

# 8. zip the whole portable folder for itch.io
$zipOut = Join-Path $work "$appName-win-x64.zip"
if (Test-Path $zipOut) { Remove-Item $zipOut -Force }
Write-Host ">> zipping portable build (this can take a minute)..."
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $zipOut)

Write-Host ""
Write-Host ">> DONE"
Write-Host (">> test it:        " + (Join-Path $stage "$appName.exe"))
Write-Host (">> upload to itch: " + $zipOut)
