Add-Type -AssemblyName System.Drawing

function Generate-EmojiIcon {
    param (
        [string]$Emoji,
        [string]$BgHex,
        [string]$OutputPath,
        [int]$Size = 512
    )

    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Background color with subtle gradient or solid
    $bgColor = [System.Drawing.ColorTranslator]::FromHtml($BgHex)
    $brushBg = New-Object System.Drawing.SolidBrush $bgColor
    $graphics.FillRectangle($brushBg, 0, 0, $Size, $Size)

    # Optional subtle ring around border
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(60, 255, 255, 255)), 8
    $graphics.DrawEllipse($pen, 16, 16, $Size - 32, $Size - 32)

    # Emoji font
    $fontSize = [int]($Size * 0.46)
    $font = New-Object System.Drawing.Font "Segoe UI Emoji", $fontSize, [System.Drawing.FontStyle]::Regular
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center

    $rect = New-Object System.Drawing.RectangleF 0, 0, $Size, $Size
    $brushText = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $graphics.DrawString($Emoji, $font, $brushText, $rect, $format)

    $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $graphics.Dispose()
    $bmp.Dispose()
    Write-Output "Created: $OutputPath"
}

# Create PNG icons for each tool (512x512 and 192x192)
$tools = @(
    @{ Name = "raiden_patcher"; Emoji = [char]::ConvertFromUtf32(0x26A1); Bg = "#020814" }, # ⚡
    @{ Name = "hog_extractor"; Emoji = [char]::ConvertFromUtf32(0x1F4E6); Bg = "#0d1117" }, # 📦
    @{ Name = "afs_station"; Emoji = [char]::ConvertFromUtf32(0x1F3B5); Bg = "#141922" }, # 🎵
    @{ Name = "ttxt"; Emoji = [char]::ConvertFromUtf32(0x1F4DD); Bg = "#0b0f16" } # 📝
)

foreach ($t in $tools) {
    Generate-EmojiIcon -Emoji $t.Emoji -BgHex $t.Bg -OutputPath "fav\$($t.Name)-512.png" -Size 512
    Generate-EmojiIcon -Emoji $t.Emoji -BgHex $t.Bg -OutputPath "fav\$($t.Name)-192.png" -Size 192
}
