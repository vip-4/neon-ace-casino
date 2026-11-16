# Neon Ace static build
# Copies site/ to dist/, injects build placeholders, validates the output and
# prints a size report. Works with Windows PowerShell 5.1 and PowerShell 7+.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/build.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/build.ps1 -SiteUrl https://example.com
#   powershell -ExecutionPolicy Bypass -File scripts/build.ps1 -OutDir preview -BuildId test1

[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://neonace.example',
    [string]$OutDir = '',
    [string]$BuildId = '',
    [string]$BasePath = ''
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$siteRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'site'))
if (-not $OutDir) { $OutDir = Join-Path $projectRoot 'dist' }
$distRoot = [System.IO.Path]::GetFullPath($OutDir)
if (-not $BuildId) { $BuildId = [DateTime]::UtcNow.ToString('yyyyMMddHHmmss', [System.Globalization.CultureInfo]::InvariantCulture) }

$SiteUrl = $SiteUrl.Trim()
while ($SiteUrl.EndsWith('/')) { $SiteUrl = $SiteUrl.Substring(0, $SiteUrl.Length - 1) }

$parsedUrl = $null
if (-not [Uri]::TryCreate($SiteUrl, [UriKind]::Absolute, [ref]$parsedUrl)) {
    throw "SiteUrl must be an absolute URL, for example https://example.com"
}
if ($parsedUrl.Scheme -ne 'http' -and $parsedUrl.Scheme -ne 'https') {
    throw "SiteUrl must use http or https."
}
if ($parsedUrl.Query -or $parsedUrl.Fragment) {
    throw "SiteUrl must not contain a query string or fragment."
}
if ($BuildId -notmatch '^[A-Za-z0-9._-]+$') {
    throw "BuildId may only contain letters, digits, dots, underscores and hyphens."
}

# GitHub Pages project sites are published under /<repo>/ instead of the domain
# root. __BASE_PATH__ is injected into <base> so relative asset URLs stay correct
# for custom 404 pages served from arbitrary sub-paths. An empty value means the
# site is served from the domain root.
$BasePath = $BasePath.Trim()
while ($BasePath.EndsWith('/')) { $BasePath = $BasePath.Substring(0, $BasePath.Length - 1) }
if ($BasePath -and -not $BasePath.StartsWith('/')) {
    throw "BasePath must start with a slash, for example /neon-ace"
}
if ($BasePath -match '\.\.') {
    throw "BasePath must not contain '..'."
}
$baseHref = $BasePath + '/'

if (-not (Test-Path -LiteralPath $siteRoot -PathType Container)) {
    throw "Source directory not found: $siteRoot"
}
if ($distRoot -eq $projectRoot -or $distRoot -eq $siteRoot) {
    throw "Refusing to build into the project root or the source directory."
}

$now = [DateTime]::UtcNow
$buildDate = $now.ToString('yyyy-MM-dd', [System.Globalization.CultureInfo]::InvariantCulture)
$buildDatePretty = $now.ToString('MMMM d, yyyy', [System.Globalization.CultureInfo]::InvariantCulture)

$tokens = [ordered]@{
    '__SITE_URL__'         = $SiteUrl
    '__BUILD_DATE__'       = $buildDate
    '__BUILD_DATE_PRETTY__' = $buildDatePretty
    '__BUILD_ID__'         = $BuildId
    '__BASE_PATH__'        = $BasePath
}

$textExtensions = @('.html', '.css', '.js', '.mjs', '.json', '.webmanifest', '.xml', '.txt', '.svg', '.map')
$utf8 = New-Object System.Text.UTF8Encoding($false)
$errors = New-Object System.Collections.Generic.List[string]

function Read-Utf8Text([string]$path) {
    return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}

function Write-Utf8Text([string]$path, [string]$text) {
    [System.IO.File]::WriteAllText($path, $text, $utf8)
}

function Test-TextFile([System.IO.FileInfo]$file) {
    return ($textExtensions -contains $file.Extension.ToLowerInvariant()) -or ($file.Name -eq '_headers')
}

function Add-BuildError([string]$message) {
    $errors.Add($message) | Out-Null
}

function Get-GzipSize([string]$path) {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $memory = New-Object System.IO.MemoryStream
    $gzip = New-Object System.IO.Compression.GZipStream($memory, [System.IO.Compression.CompressionMode]::Compress, $true)
    try {
        $gzip.Write($bytes, 0, $bytes.Length)
    }
    finally {
        $gzip.Dispose()
    }
    $size = $memory.Length
    $memory.Dispose()
    return [int64]$size
}

function Get-PngSize([string]$path) {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    if ($bytes.Length -lt 24) { return $null }
    if ($bytes[0] -ne 0x89 -or $bytes[1] -ne 0x50 -or $bytes[2] -ne 0x4E -or $bytes[3] -ne 0x47) { return $null }
    $width = ([int]$bytes[16] -shl 24) -bor ([int]$bytes[17] -shl 16) -bor ([int]$bytes[18] -shl 8) -bor [int]$bytes[19]
    $height = ([int]$bytes[20] -shl 24) -bor ([int]$bytes[21] -shl 16) -bor ([int]$bytes[22] -shl 8) -bor [int]$bytes[23]
    return [pscustomobject]@{ Width = $width; Height = $height }
}

function Test-DocumentLinks([string]$docPath, [string]$docHtml) {
    $docDir = Split-Path -Parent $docPath
    $docName = [System.IO.Path]::GetFileName($docPath)
    $ids = @{}
    foreach ($match in [regex]::Matches($docHtml, 'id="([^"]+)"')) {
        $ids[$match.Groups[1].Value] = $true
    }

    foreach ($match in [regex]::Matches($docHtml, '(?:href|src)="([^"]+)"')) {
        $raw = $match.Groups[1].Value.Trim()
        if (-not $raw) { continue }
        # Skip the injected <base href="..."> element; it is not a document link.
        if ($raw -eq $baseHref) { continue }
        if ($raw -match '^(?:https?:|mailto:|tel:|data:|javascript:)') { continue }

        if ($raw.StartsWith('#')) {
            $anchor = $raw.Substring(1)
            if ($anchor -and -not $ids.ContainsKey($anchor)) {
                Add-BuildError "Broken anchor in ${docName}: $raw"
            }
            continue
        }

        $pathOnly = $raw.Split('?')[0].Split('#')[0]
        if (-not $pathOnly) { continue }

        if ($pathOnly -eq '/') {
            $candidate = Join-Path $distRoot 'index.html'
        }
        elseif ($pathOnly.StartsWith('/')) {
            $candidate = Join-Path $distRoot $pathOnly.TrimStart('/')
        }
        else {
            $candidate = Join-Path $docDir $pathOnly
        }

        $candidate = [System.IO.Path]::GetFullPath($candidate)
        if (-not $candidate.StartsWith($distRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            Add-BuildError "Link escapes the build in ${docName}: $raw"
            continue
        }
        if (Test-Path -LiteralPath $candidate -PathType Container) {
            $candidate = Join-Path $candidate 'index.html'
        }
        # Clean URLs: Cloudflare Pages / Firebase Hosting serve /slots from slots.html,
        # so an extensionless link is valid if the matching .html file exists.
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf) -and
            (Test-Path -LiteralPath ($candidate + '.html') -PathType Leaf)) {
            $candidate = $candidate + '.html'
        }
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            Add-BuildError "Broken link in ${docName}: $raw"
        }
    }
}

Add-Type -AssemblyName System.IO.Compression -ErrorAction SilentlyContinue
Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue

Write-Host ''
Write-Host 'Neon Ace static build' -ForegroundColor Cyan
Write-Host "  Source:   $siteRoot"
Write-Host "  Output:   $distRoot"
Write-Host "  Site URL: $SiteUrl/"
Write-Host "  Base:     $baseHref"
Write-Host "  Build:    $buildDate ($BuildId)"

# Clean output -------------------------------------------------------------

if (Test-Path -LiteralPath $distRoot) {
    Remove-Item -LiteralPath $distRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $distRoot -Force | Out-Null

# Copy and inject ----------------------------------------------------------

$sourceFiles = @(Get-ChildItem -LiteralPath $siteRoot -Recurse -File)
foreach ($file in $sourceFiles) {
    $relative = $file.FullName.Substring($siteRoot.Length).TrimStart('\', '/')
    $target = Join-Path $distRoot $relative
    $parent = Split-Path -Parent $target
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }

    if (Test-TextFile $file) {
        $text = Read-Utf8Text $file.FullName
        foreach ($token in $tokens.Keys) {
            $text = $text.Replace($token, $tokens[$token])
        }
        Write-Utf8Text $target $text
    }
    else {
        Copy-Item -LiteralPath $file.FullName -Destination $target -Force
    }
}

# GitHub Pages: skip Jekyll processing.
Write-Utf8Text (Join-Path $distRoot '.nojekyll') ''

# Validate output ----------------------------------------------------------

$requiredFiles = @(
    'index.html', 'slots.html', 'baccarat.html', 'sicbo.html', 'roulette.html', 'videopoker.html', '404.html', 'robots.txt', 'sitemap.xml', 'llms.txt',
    'manifest.webmanifest', '_headers', '.nojekyll',
    'assets/styles.css', 'assets/app.js', 'assets/favicon.svg',
    'assets/slot-machine.js', 'assets/slot-demo.css',
    'assets/baccarat.js', 'assets/baccarat-demo.css',
    'assets/sicbo.js', 'assets/sicbo-demo.css',
    'assets/roulette.js', 'assets/roulette-demo.css',
    'assets/videopoker.js', 'assets/videopoker-demo.css',
    'assets/og-cover.png', 'assets/icon-512.png', 'assets/icon-192.png',
    'assets/apple-touch-icon.png'
)
foreach ($required in $requiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $distRoot $required) -PathType Leaf)) {
        Add-BuildError "Missing required file: $required"
    }
}

$distFiles = @(Get-ChildItem -LiteralPath $distRoot -Recurse -File)
$distTextFiles = @($distFiles | Where-Object { Test-TextFile $_ })

# No unresolved placeholders anywhere in the build.
foreach ($file in $distTextFiles) {
    $text = Read-Utf8Text $file.FullName
    foreach ($match in [regex]::Matches($text, '__[A-Z][A-Z0-9_]*__')) {
        Add-BuildError "Unreplaced placeholder $($match.Value) in $($file.Name)"
    }
}

# Homepage metadata, semantics and structured data.
$indexPath = Join-Path $distRoot 'index.html'
$html = Read-Utf8Text $indexPath
$canonical = '<link rel="canonical" href="' + $SiteUrl + '/">'

$htmlChecks = @(
    @{ Label = 'HTML doctype';        Ok = ($html -match '(?i)^<!doctype html>') },
    @{ Label = 'lang attribute';      Ok = ($html -match '<html lang="en">') },
    @{ Label = 'charset';             Ok = ($html -match '<meta charset="utf-8">') },
    @{ Label = 'viewport';            Ok = ($html -match '<meta name="viewport" content="width=device-width, initial-scale=1">') },
    @{ Label = 'title';               Ok = ($html -match '<title>[^<]{10,}</title>') },
    @{ Label = 'meta description';    Ok = ($html -match '<meta name="description" content="[^"]{60,}"') },
    @{ Label = 'meta keywords';       Ok = ($html -match '<meta name="keywords" content="[^"]{30,}"') },
    @{ Label = 'robots meta';         Ok = ($html -match '<meta name="robots" content="index, follow') },
    @{ Label = 'canonical URL';       Ok = $html.Contains($canonical) },
    @{ Label = 'og:type';             Ok = ($html -match 'property="og:type" content="website"') },
    @{ Label = 'og:title';            Ok = ($html -match 'property="og:title" content="[^"]+"') },
    @{ Label = 'og:description';      Ok = ($html -match 'property="og:description" content="[^"]+"') },
    @{ Label = 'og:url';              Ok = ($html -match ('property="og:url" content="' + [regex]::Escape($SiteUrl) + '/"')) },
    @{ Label = 'og:image';            Ok = ($html -match ('property="og:image" content="' + [regex]::Escape($SiteUrl) + '/assets/og-cover.png"')) },
    @{ Label = 'og:image dimensions'; Ok = ($html -match 'property="og:image:width" content="1200"' -and $html -match 'property="og:image:height" content="630"') },
    @{ Label = 'twitter:card';        Ok = ($html -match 'name="twitter:card" content="summary_large_image"') },
    @{ Label = 'twitter:title';       Ok = ($html -match 'name="twitter:title" content="[^"]+"') },
    @{ Label = 'twitter:image';       Ok = ($html -match ('name="twitter:image" content="' + [regex]::Escape($SiteUrl) + '/assets/og-cover.png"')) },
    @{ Label = 'single h1';           Ok = (([regex]::Matches($html, '<h1\b')).Count -eq 1) },
    @{ Label = 'main landmark';       Ok = ($html -match '<main id="main">') },
    @{ Label = 'skip link';           Ok = ($html -match 'class="skip-link" href="#main"') },
    @{ Label = 'game keyboard access'; Ok = ($html -match 'id="game"[^>]*tabindex="0"' -or $html -match 'tabindex="0"[^>]*id="game"') },
    @{ Label = 'live status region';  Ok = ($html -match 'id="table-message"[^>]*aria-live="polite"' -or $html -match 'aria-live="polite"[^>]*id="table-message"') }
)
foreach ($check in $htmlChecks) {
    if (-not $check.Ok) { Add-BuildError "Homepage check failed: $($check.Label)" }
}

# JSON-LD graph must parse and carry the promised entities.
$jsonLdMatch = [regex]::Match($html, '(?s)<script type="application/ld\+json">(.*?)</script>')
if (-not $jsonLdMatch.Success) {
    Add-BuildError 'JSON-LD block not found.'
}
else {
    try {
        $graph = $jsonLdMatch.Groups[1].Value | ConvertFrom-Json
        if (-not $graph.'@graph') {
            Add-BuildError 'JSON-LD is missing an @graph array.'
        }
        else {
            $types = @($graph.'@graph' | ForEach-Object { $_.'@type' })
            foreach ($type in @('Organization', 'WebSite', 'WebPage', 'VideoGame', 'HowTo', 'FAQPage', 'BreadcrumbList')) {
                if ($types -notcontains $type) {
                    Add-BuildError "JSON-LD missing entity: $type"
                }
            }
            $faq = $graph.'@graph' | Where-Object { $_.'@type' -eq 'FAQPage' } | Select-Object -First 1
            if ($faq -and @($faq.mainEntity).Count -lt 8) {
                Add-BuildError 'JSON-LD FAQPage has fewer than 8 questions.'
            }
            $howTo = $graph.'@graph' | Where-Object { $_.'@type' -eq 'HowTo' } | Select-Object -First 1
            if ($howTo -and @($howTo.step).Count -ne 4) {
                Add-BuildError 'JSON-LD HowTo should have exactly 4 steps.'
            }
        }
    }
    catch {
        Add-BuildError "JSON-LD does not parse: $($_.Exception.Message)"
    }
}

Test-DocumentLinks $indexPath $html
$slotsPath = Join-Path $distRoot 'slots.html'
if (Test-Path -LiteralPath $slotsPath -PathType Leaf) {
    Test-DocumentLinks $slotsPath (Read-Utf8Text $slotsPath)
}
$baccaratPath = Join-Path $distRoot 'baccarat.html'
if (Test-Path -LiteralPath $baccaratPath -PathType Leaf) {
    Test-DocumentLinks $baccaratPath (Read-Utf8Text $baccaratPath)
}
$sicboPath = Join-Path $distRoot 'sicbo.html'
if (Test-Path -LiteralPath $sicboPath -PathType Leaf) {
    Test-DocumentLinks $sicboPath (Read-Utf8Text $sicboPath)
}
$roulettePath = Join-Path $distRoot 'roulette.html'
if (Test-Path -LiteralPath $roulettePath -PathType Leaf) {
    Test-DocumentLinks $roulettePath (Read-Utf8Text $roulettePath)
}
$videopokerPath = Join-Path $distRoot 'videopoker.html'
if (Test-Path -LiteralPath $videopokerPath -PathType Leaf) {
    Test-DocumentLinks $videopokerPath (Read-Utf8Text $videopokerPath)
}
$errorPath = Join-Path $distRoot '404.html'
if (Test-Path -LiteralPath $errorPath -PathType Leaf) {
    Test-DocumentLinks $errorPath (Read-Utf8Text $errorPath)
}

# Sitemap, robots and llms.txt.
$sitemapPath = Join-Path $distRoot 'sitemap.xml'
if (Test-Path -LiteralPath $sitemapPath -PathType Leaf) {
    try {
        [xml]$sitemap = Read-Utf8Text $sitemapPath
        $locs = @($sitemap.urlset.url | ForEach-Object { $_.loc })
        if ($locs -notcontains "$SiteUrl/") {
            Add-BuildError "Sitemap does not contain $SiteUrl/"
        }
    }
    catch {
        Add-BuildError "Sitemap XML does not parse: $($_.Exception.Message)"
    }
}

$robots = Read-Utf8Text (Join-Path $distRoot 'robots.txt')
if (-not $robots.Contains("Sitemap: $SiteUrl/sitemap.xml")) {
    Add-BuildError 'robots.txt does not point at the sitemap.'
}
if ($robots -match '(?m)^Host:') {
    Add-BuildError 'robots.txt still contains the obsolete Host directive.'
}

$llms = Read-Utf8Text (Join-Path $distRoot 'llms.txt')
if (-not $llms.Contains("Canonical: $SiteUrl/")) {
    Add-BuildError 'llms.txt does not contain the canonical URL.'
}

# Manifest icons and parsed metadata.
$manifestPath = Join-Path $distRoot 'manifest.webmanifest'
try {
    $manifest = (Read-Utf8Text $manifestPath) | ConvertFrom-Json
    if (-not $manifest.name -or -not $manifest.start_url) {
        Add-BuildError 'manifest.webmanifest is missing name or start_url.'
    }
    foreach ($icon in @($manifest.icons)) {
        if ($icon.src -and -not (Test-Path -LiteralPath (Join-Path $distRoot $icon.src) -PathType Leaf)) {
            Add-BuildError "Manifest icon not found: $($icon.src)"
        }
    }
}
catch {
    Add-BuildError "manifest.webmanifest does not parse: $($_.Exception.Message)"
}

# Image dimensions used by social cards and install surfaces.
$ogSize = Get-PngSize (Join-Path $distRoot 'assets/og-cover.png')
if (-not $ogSize -or $ogSize.Width -ne 1200 -or $ogSize.Height -ne 630) {
    Add-BuildError 'og-cover.png must be 1200x630.'
}
$iconSize = Get-PngSize (Join-Path $distRoot 'assets/icon-512.png')
if (-not $iconSize -or $iconSize.Width -ne 512 -or $iconSize.Height -ne 512) {
    Add-BuildError 'icon-512.png must be 512x512.'
}

# Header policy must stay strict.
$headers = Read-Utf8Text (Join-Path $distRoot '_headers')
if (-not $headers.Contains('Content-Security-Policy:')) {
    Add-BuildError '_headers is missing a Content-Security-Policy.'
}
if ($headers -match "script-src[^;]*'unsafe-(inline|eval)'") {
    Add-BuildError 'CSP script-src contains unsafe-inline or unsafe-eval.'
}

# Report ------------------------------------------------------------------

$totalBytes = ($distFiles | Measure-Object -Property Length -Sum).Sum
$corePaths = @('index.html', 'assets/styles.css', 'assets/app.js')
$coreRaw = 0
$coreGzip = 0
foreach ($core in $corePaths) {
    $corePath = Join-Path $distRoot $core
    if (Test-Path -LiteralPath $corePath -PathType Leaf) {
        $coreRaw += (Get-Item -LiteralPath $corePath).Length
        $coreGzip += Get-GzipSize $corePath
    }
}

Write-Host ''
Write-Host '  Files     Raw        Gzip      Path' -ForegroundColor DarkGray
foreach ($file in ($distFiles | Sort-Object Length -Descending)) {
    $relative = $file.FullName.Substring($distRoot.Length).TrimStart('\', '/')
    if (Test-TextFile $file) {
        $gzipLabel = '{0,8:N1} KB' -f ((Get-GzipSize $file.FullName) / 1KB)
    }
    else {
        $gzipLabel = '        -'
    }
    Write-Host ('  {0,-8:N1} KB {1}  {2}' -f ($file.Length / 1KB), $gzipLabel, $relative)
}
Write-Host ''
Write-Host ('  {0} files, {1:N1} KB total' -f $distFiles.Count, ($totalBytes / 1KB))
Write-Host ('  Critical path (HTML + CSS + JS): {0:N1} KB raw, {1:N1} KB gzip' -f ($coreRaw / 1KB), ($coreGzip / 1KB))

if ($errors.Count -gt 0) {
    Write-Host ''
    Write-Host "  Validation failed with $($errors.Count) issue(s):" -ForegroundColor Red
    foreach ($message in $errors) {
        Write-Host "   - $message" -ForegroundColor Red
    }
    Write-Host ''
    exit 1
}

Write-Host ''
Write-Host '  Validation passed: metadata, JSON-LD, links, sitemap, manifest, icons, CSP.' -ForegroundColor Green
Write-Host ''
