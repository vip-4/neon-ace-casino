# Minimal static file server for local verification.
# Serves site/ (or dist/) with production-like headers.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/serve.ps1 [-Port 8080] [-Root dist]
param(
    [int]$Port = 8080,
    [string]$Root = ''
)

$ErrorActionPreference = 'Stop'

if (-not $Root) {
    $Root = Join-Path (Split-Path -Parent $PSScriptRoot) 'site'
}

$rootFull = [System.IO.Path]::GetFullPath($Root)
if (-not (Test-Path -LiteralPath $rootFull -PathType Container)) {
    throw "Document root not found: $rootFull"
}

$mime = @{
    '.html'        = 'text/html; charset=utf-8'
    '.css'         = 'text/css; charset=utf-8'
    '.js'          = 'text/javascript; charset=utf-8'
    '.json'        = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'
    '.svg'         = 'image/svg+xml'
    '.png'         = 'image/png'
    '.ico'         = 'image/x-icon'
    '.txt'         = 'text/plain; charset=utf-8'
    '.xml'         = 'application/xml; charset=utf-8'
    '.webp'        = 'image/webp'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "Neon Ace dev server: http://localhost:$Port/"
Write-Output "Document root: $rootFull"
Write-Output "Press Ctrl+C to stop."

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        try {
            $rawPath = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath)
            if ($rawPath -eq '/') { $rawPath = '/index.html' }

            $relative = $rawPath.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
            $candidate = [System.IO.Path]::GetFullPath((Join-Path $rootFull $relative))

            if (-not $candidate.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
                $response.StatusCode = 403
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
                $response.ContentType = 'text/plain; charset=utf-8'
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                continue
            }

            if (Test-Path -LiteralPath $candidate -PathType Container) {
                $candidate = Join-Path $candidate 'index.html'
            }

            if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
                $response.StatusCode = 404
                $fallback = Join-Path $rootFull '404.html'
                if (Test-Path -LiteralPath $fallback -PathType Leaf) {
                    $candidate = $fallback
                } else {
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
                    $response.ContentType = 'text/plain; charset=utf-8'
                    $response.ContentLength64 = $bytes.Length
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    continue
                }
            }

            $extension = [System.IO.Path]::GetExtension($candidate).ToLowerInvariant()
            $contentType = $mime[$extension]
            if (-not $contentType) { $contentType = 'application/octet-stream' }

            $cacheControl = 'no-store'
            if ($extension -eq '.html') {
                $cacheControl = 'public, max-age=0, must-revalidate'
            }
            elseif ($rawPath.StartsWith('/assets/')) {
                $cacheControl = 'public, max-age=31536000, immutable'
            }
            elseif ($extension -eq '.txt' -or $extension -eq '.xml') {
                $cacheControl = 'public, max-age=3600'
            }
            elseif ($extension -eq '.webmanifest') {
                $cacheControl = 'public, max-age=86400'
            }

            $bytes = [System.IO.File]::ReadAllBytes($candidate)
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.Headers['Cache-Control'] = $cacheControl
            $response.Headers['X-Content-Type-Options'] = 'nosniff'
            $response.Headers['X-Frame-Options'] = 'SAMEORIGIN'
            $response.Headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
            $response.Headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
            $response.Headers['Cross-Origin-Opener-Policy'] = 'same-origin'
            $response.Headers['Content-Security-Policy'] = "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; manifest-src 'self'"
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        catch {
            $response.StatusCode = 500
            $bytes = [System.Text.Encoding]::UTF8.GetBytes('Internal server error')
            $response.ContentType = 'text/plain; charset=utf-8'
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        finally {
            $response.OutputStream.Close()
        }
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}
