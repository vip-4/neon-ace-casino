# Build the Telegram Mini App deployment variant of Neon Ace.
#
# It starts from the normal production build, then adds:
#   - the official Telegram WebApp script in <head>,
#   - a same-origin bridge that calls ready()/expand() and matches Telegram's theme,
#   - framing-friendly, noindex headers (Telegram Web renders Mini Apps in an iframe).
# The main production sites keep their strict, non-embeddable headers unchanged.

[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://neon-ace.pages.dev',
    [string]$OutDir = ''
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) { $OutDir = Join-Path $projectRoot 'dist-tg' }
$OutDir = [System.IO.Path]::GetFullPath($OutDir)
$utf8 = New-Object System.Text.UTF8Encoding($false)

Write-Host 'Building Telegram Mini App variant...' -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build.ps1') -SiteUrl $SiteUrl -OutDir $OutDir
if ($LASTEXITCODE -ne 0) { throw "Base build failed with exit code $LASTEXITCODE" }

$indexPath = Join-Path $OutDir 'index.html'
$html = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)

$webAppScript = '  <script src="https://telegram.org/js/telegram-web-app.js" defer></script>'
$viewport = '  <meta name="viewport" content="width=device-width, initial-scale=1">'
if (-not $html.Contains('telegram-web-app.js')) {
    $html = $html.Replace($viewport, $viewport + "`n" + $webAppScript)
}

# Match the base build's cache-busting token so the bridge is never served stale
# from the immutable /assets/* cache.
$buildIdMatch = [regex]::Match($html, 'assets/app\.js\?v=([A-Za-z0-9._-]+)')
$buildId = if ($buildIdMatch.Success) { $buildIdMatch.Groups[1].Value } else { 'tg' }
$bridgeTag = '  <script src="assets/telegram.js?v=' + $buildId + '" defer></script>'
if (-not $html.Contains('assets/telegram.js')) {
    $html = [regex]::Replace(
        $html,
        '(<script src="assets/app\.js[^"]*" defer></script>)',
        '${1}' + "`n" + $bridgeTag
    )
}
[System.IO.File]::WriteAllText($indexPath, $html, $utf8)

$bridge = @'
(function () {
  'use strict';
  var app = window.Telegram && window.Telegram.WebApp;
  if (!app) { return; }
  var modern = typeof app.isVersionAtLeast === 'function' && app.isVersionAtLeast('6.1');
  try {
    if (typeof app.ready === 'function') { app.ready(); }
    if (typeof app.expand === 'function') { app.expand(); }
    if (modern) {
      if (typeof app.setHeaderColor === 'function') { app.setHeaderColor('#07120f'); }
      if (typeof app.setBackgroundColor === 'function') { app.setBackgroundColor('#06110e'); }
    }
  } catch (e) {
    /* The game remains fully playable when the Mini App bridge is unavailable. */
  }
})();
'@
[System.IO.File]::WriteAllText((Join-Path $OutDir 'assets/telegram.js'), $bridge, $utf8)

$headers = @'
# Telegram Mini App endpoint: embeddable, noindex, Telegram bridge allowed.
# The two public web endpoints keep their strict, non-embeddable headers.
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors *; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' https://telegram.org; font-src 'self'; connect-src 'self'; manifest-src 'self'
  X-Robots-Tag: noindex

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: public, max-age=0, must-revalidate

/robots.txt
  Cache-Control: public, max-age=3600

/sitemap.xml
  Cache-Control: public, max-age=3600

/llms.txt
  Cache-Control: public, max-age=3600

/manifest.webmanifest
  Cache-Control: public, max-age=86400
'@
[System.IO.File]::WriteAllText((Join-Path $OutDir '_headers'), $headers, $utf8)

if (-not (Test-Path -LiteralPath (Join-Path $OutDir 'assets/telegram.js') -PathType Leaf)) { throw 'Bridge script was not created.' }
if (-not $html.Contains('telegram-web-app.js') -or -not $html.Contains('assets/telegram.js')) { throw 'Telegram script tags were not injected.' }

$files = @(Get-ChildItem -LiteralPath $OutDir -Recurse -File -Force)
$total = ($files | Measure-Object -Property Length -Sum).Sum
Write-Host ''
Write-Host ("  Telegram Mini App build: {0} files, {1:N1} KB" -f $files.Count, ($total / 1KB))
Write-Host "  Output:  $OutDir"
Write-Host '  Added:   telegram-web-app.js + assets/telegram.js'
Write-Host '  Headers: frameable, noindex, no X-Frame-Options/COOP'
Write-Host ("  Canonical stays: {0}/" -f $SiteUrl)
