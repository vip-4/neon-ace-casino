# Generates the PNG social card and app icons for Neon Ace.
# Uses System.Drawing from Windows PowerShell; no external dependencies.
# Source is ASCII-only so Windows PowerShell 5.1 parses it identically to PowerShell 7.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root 'site\assets'
New-Item -ItemType Directory -Force -Path $assets | Out-Null

$script:Spade = [string][char]0x2660
$script:Heart = [string][char]0x2665

function Get-Color {
    param([string]$Hex, [int]$Alpha = 255)
    $base = [System.Drawing.ColorTranslator]::FromHtml($Hex)
    return [System.Drawing.Color]::FromArgb($Alpha, $base.R, $base.G, $base.B)
}

function New-RoundedPath {
    param([float]$X, [float]$Y, [float]$Width, [float]$Height, [float]$Radius)
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $diameter = $Radius * 2
    $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
    $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
    $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-Brush {
    param([string]$Hex, [int]$Alpha = 255)
    return [System.Drawing.SolidBrush]::new((Get-Color $Hex $Alpha))
}

function New-Pen {
    param([string]$Hex, [float]$Width = 1, [int]$Alpha = 255)
    return [System.Drawing.Pen]::new((Get-Color $Hex $Alpha), $Width)
}

function New-Font {
    param(
        [string]$Family,
        [float]$Size,
        [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular
    )
    return [System.Drawing.Font]::new($Family, $Size, $Style, [System.Drawing.GraphicsUnit]::Pixel)
}

function Draw-Card {
    param(
        [System.Drawing.Graphics]$Graphics,
        [float]$CenterX,
        [float]$CenterY,
        [float]$Width,
        [float]$Height,
        [float]$Angle,
        [string]$Rank,
        [string]$Suit,
        [bool]$Red,
        [bool]$Court
    )

    $state = $Graphics.Save()
    $Graphics.TranslateTransform($CenterX, $CenterY)
    $Graphics.RotateTransform($Angle)

    $cardPath = New-RoundedPath (-$Width / 2) (-$Height / 2) $Width $Height 15
    $shadowPath = New-RoundedPath ((-$Width / 2) + 8) ((-$Height / 2) + 16) $Width $Height 15
    $shadowBrush = New-Brush '#000000' 105
    $Graphics.FillPath($shadowBrush, $shadowPath)

    $cardRect = [System.Drawing.RectangleF]::new((-$Width / 2), (-$Height / 2), $Width, $Height)
    $cardBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        $cardRect,
        (Get-Color '#fffdf8'),
        (Get-Color '#ece1cd'),
        [float]135
    )
    $Graphics.FillPath($cardBrush, $cardPath)
    $cardPen = New-Pen '#d3c5ae' 2.5
    $Graphics.DrawPath($cardPen, $cardPath)

    $innerPath = New-RoundedPath ((-$Width / 2) + 8) ((-$Height / 2) + 8) ($Width - 16) ($Height - 16) 9
    $inkHex = '#151a17'
    if ($Red) { $inkHex = '#b3202e' }
    $innerPen = New-Pen $inkHex 1 26
    $Graphics.DrawPath($innerPen, $innerPath)

    $inkBrush = [System.Drawing.SolidBrush]::new((Get-Color $inkHex))
    $rankFont = New-Font 'Georgia' 44 ([System.Drawing.FontStyle]::Bold)
    $suitFont = New-Font 'Segoe UI Symbol' 32 ([System.Drawing.FontStyle]::Regular)
    $bigFont = New-Font 'Georgia' 118 ([System.Drawing.FontStyle]::Bold)
    $centerSuitFont = New-Font 'Segoe UI Symbol' 96 ([System.Drawing.FontStyle]::Regular)

    $Graphics.DrawString($Rank, $rankFont, $inkBrush, [float]((-$Width / 2) + 16), [float]((-$Height / 2) + 10))
    $Graphics.DrawString($Suit, $suitFont, $inkBrush, [float]((-$Width / 2) + 18), [float]((-$Height / 2) + 60))

    $centerFormat = [System.Drawing.StringFormat]::new()
    $centerFormat.Alignment = [System.Drawing.StringAlignment]::Center
    $centerFormat.LineAlignment = [System.Drawing.StringAlignment]::Center

    if ($Court) {
        $courtPath = New-RoundedPath ((-$Width / 2) + 34) ((-$Height / 2) + 74) ($Width - 68) ($Height - 148) 4
        $courtPen = New-Pen $inkHex 1.5 45
        $Graphics.DrawPath($courtPen, $courtPath)
        $courtRect = [System.Drawing.RectangleF]::new((-$Width / 2), ((-$Height / 2) + 62), $Width, ($Height - 132))
        $Graphics.DrawString($Rank, $bigFont, $inkBrush, $courtRect, $centerFormat)
        $suitRect = [System.Drawing.RectangleF]::new((-$Width / 2), (($Height / 2) - 62), $Width, 40)
        $Graphics.DrawString($Suit, $suitFont, $inkBrush, $suitRect, $centerFormat)
        $courtPath.Dispose()
        $courtPen.Dispose()
    }
    else {
        $pipRect = [System.Drawing.RectangleF]::new((-$Width / 2), 8, $Width, ($Height - 20))
        $Graphics.DrawString($Suit, $centerSuitFont, $inkBrush, $pipRect, $centerFormat)
    }

    $Graphics.TranslateTransform(($Width / 2) - 34, ($Height / 2) - 18)
    $Graphics.RotateTransform(180)
    $Graphics.DrawString($Rank, $rankFont, $inkBrush, [float]0, [float]0)
    $Graphics.DrawString($Suit, $suitFont, $inkBrush, [float]2, [float]47)
    $Graphics.Restore($state)

    $cardPath.Dispose()
    $shadowPath.Dispose()
    $innerPath.Dispose()
    $shadowBrush.Dispose()
    $cardBrush.Dispose()
    $cardPen.Dispose()
    $innerPen.Dispose()
    $inkBrush.Dispose()
    $rankFont.Dispose()
    $suitFont.Dispose()
    $bigFont.Dispose()
    $centerSuitFont.Dispose()
    $centerFormat.Dispose()
}

# --------------------------------------------------------------------------
# Open Graph / Twitter card: 1200 x 630
# --------------------------------------------------------------------------
$og = [System.Drawing.Bitmap]::new(1200, 630)
$og.SetResolution(96, 96)
$graphics = [System.Drawing.Graphics]::FromImage($og)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$fullRect = [System.Drawing.Rectangle]::new(0, 0, 1200, 630)
$background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $fullRect,
    (Get-Color '#04100c'),
    (Get-Color '#0d3226'),
    [float]22
)
$graphics.FillRectangle($background, $fullRect)

for ($i = 16; $i -ge 1; $i--) {
    $size = 170 + ($i * 58)
    $alpha = [int](3 + (($i - 1) * 1.1))
    $glowBrush = New-Brush '#2bbd92' $alpha
    $graphics.FillEllipse($glowBrush, 620 - ($size / 2), 315 - ($size / 2), $size, $size)
    $glowBrush.Dispose()
}

$arcPen = New-Pen '#e8c879' 1.5 26
$graphics.DrawEllipse($arcPen, 430, 420, 1000, 430)
$graphics.DrawEllipse($arcPen, 510, 465, 840, 340)
$arcPen.Dispose()

# Faint oversized spade watermark
$watermarkFont = New-Font 'Segoe UI Symbol' 520 ([System.Drawing.FontStyle]::Regular)
$watermarkBrush = New-Brush '#e8c879' 10
$graphics.DrawString($script:Spade, $watermarkFont, $watermarkBrush, [float]-30, [float]-120)
$watermarkFont.Dispose()
$watermarkBrush.Dispose()

$eyebrowFont = New-Font 'Segoe UI' 21 ([System.Drawing.FontStyle]::Bold)
$eyebrowBrush = New-Brush '#e8c879'
$graphics.DrawString('FREE BROWSER BLACKJACK', $eyebrowFont, $eyebrowBrush, [float]80, [float]84)

$titleFont = New-Font 'Georgia' 118 ([System.Drawing.FontStyle]::Bold)
$titleItalic = New-Font 'Georgia' 118 ([System.Drawing.FontStyle]::Italic)
$creamBrush = New-Brush '#f5efe2'
$graphics.DrawString('NEON', $titleFont, $creamBrush, [float]70, [float]136)
$graphics.DrawString('ACE', $titleItalic, $eyebrowBrush, [float]70, [float]248)

$subtitleFont = New-Font 'Georgia' 36 ([System.Drawing.FontStyle]::Italic)
$subtitleBrush = New-Brush '#dce7df'
$graphics.DrawString('Free blackjack, dealt in your browser.', $subtitleFont, $subtitleBrush, [float]80, [float]388)

$linePen = New-Pen '#e8c879' 1.5 110
$graphics.DrawLine($linePen, 80, 462, 612, 462)
$linePen.Dispose()

$detailFont = New-Font 'Segoe UI' 19 ([System.Drawing.FontStyle]::Bold)
$detailBrush = New-Brush '#b8c9c0'
$graphics.DrawString('6-DECK SHOE   /   3:2 PAYOUT   /   NO SIGN-UP', $detailFont, $detailBrush, [float]80, [float]492)
$legalFont = New-Font 'Segoe UI' 15 ([System.Drawing.FontStyle]::Regular)
$legalBrush = New-Brush '#8fa69b'
$graphics.DrawString('Virtual chips only. No real-money gambling.', $legalFont, $legalBrush, [float]80, [float]548)

Draw-Card -Graphics $graphics -CenterX 858 -CenterY 310 -Width 238 -Height 333 -Angle -9 -Rank 'A' -Suit $script:Spade -Red $false -Court $false
Draw-Card -Graphics $graphics -CenterX 1005 -CenterY 330 -Width 238 -Height 333 -Angle 8 -Rank 'K' -Suit $script:Heart -Red $true -Court $true

# A single gold chip
$chipX = 700
$chipY = 540
$chipRect = [System.Drawing.Rectangle]::new(($chipX - 38), ($chipY - 38), 76, 76)
$chipBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $chipRect,
    (Get-Color '#f6e3ad'),
    (Get-Color '#c79f4a'),
    [float]45
)
$chipPen = New-Pen '#fff4ce' 3
$graphics.FillEllipse($chipBrush, ($chipX - 38), ($chipY - 38), 76, 76)
$graphics.DrawEllipse($chipPen, ($chipX - 38), ($chipY - 38), 76, 76)
$dashPen = New-Pen '#1b1507' 2 180
$graphics.DrawEllipse($dashPen, ($chipX - 27), ($chipY - 27), 54, 54)
$chipFont = New-Font 'Segoe UI' 20 ([System.Drawing.FontStyle]::Bold)
$chipInk = New-Brush '#1b1507'
$chipFormat = [System.Drawing.StringFormat]::new()
$chipFormat.Alignment = [System.Drawing.StringAlignment]::Center
$chipFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
$chipLabelRect = [System.Drawing.RectangleF]::new(($chipX - 30), ($chipY - 30), 60, 60)
$graphics.DrawString('25', $chipFont, $chipInk, $chipLabelRect, $chipFormat)

$og.Save((Join-Path $assets 'og-cover.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$og.Dispose()
$background.Dispose()
$eyebrowFont.Dispose()
$eyebrowBrush.Dispose()
$titleFont.Dispose()
$titleItalic.Dispose()
$creamBrush.Dispose()
$subtitleFont.Dispose()
$subtitleBrush.Dispose()
$detailFont.Dispose()
$detailBrush.Dispose()
$legalFont.Dispose()
$legalBrush.Dispose()
$chipBrush.Dispose()
$chipPen.Dispose()
$dashPen.Dispose()
$chipFont.Dispose()
$chipInk.Dispose()
$chipFormat.Dispose()

# --------------------------------------------------------------------------
# App icons: 512, 192, 180
# --------------------------------------------------------------------------
function New-Icon {
    param([int]$Size, [string]$FileName)
    $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
    $bitmap.SetResolution(96, 96)
    $g = [System.Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $rect = [System.Drawing.Rectangle]::new(0, 0, $Size, $Size)
    $bg = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        $rect,
        (Get-Color '#123b2e'),
        (Get-Color '#06110e'),
        [float]45
    )
    $g.FillRectangle($bg, $rect)

    $inset = [float]($Size * 0.055)
    $border = New-RoundedPath $inset $inset ($Size - ($inset * 2)) ($Size - ($inset * 2)) ([float]($Size * 0.19))
    $borderPen = New-Pen '#e8c879' ([float]($Size * 0.035))
    $g.DrawPath($borderPen, $border)

    $spadeFont = New-Font 'Segoe UI Symbol' ([float]($Size * 0.56)) ([System.Drawing.FontStyle]::Regular)
    $letterFont = New-Font 'Georgia' ([float]($Size * 0.2)) ([System.Drawing.FontStyle]::Bold)
    $cream = New-Brush '#f5efe2'
    $gold = New-Brush '#e8c879'
    $format = [System.Drawing.StringFormat]::new()
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center

    $spadeRect = [System.Drawing.RectangleF]::new(0, (-$Size * 0.11), $Size, $Size)
    $letterRect = [System.Drawing.RectangleF]::new(0, ($Size * 0.655), $Size, ($Size * 0.26))
    $g.DrawString($script:Spade, $spadeFont, $cream, $spadeRect, $format)
    $g.DrawString('N', $letterFont, $gold, $letterRect, $format)

    $bitmap.Save((Join-Path $assets $FileName), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bitmap.Dispose()
    $bg.Dispose()
    $border.Dispose()
    $borderPen.Dispose()
    $spadeFont.Dispose()
    $letterFont.Dispose()
    $cream.Dispose()
    $gold.Dispose()
    $format.Dispose()
}

New-Icon -Size 512 -FileName 'icon-512.png'
New-Icon -Size 192 -FileName 'icon-192.png'
New-Icon -Size 180 -FileName 'apple-touch-icon.png'

$files = Get-ChildItem $assets -File | Sort-Object Name
foreach ($file in $files) {
    Write-Output ("{0,-24} {1,8:N1} KB" -f $file.Name, ($file.Length / 1KB))
}
