Add-Type -AssemblyName System.Drawing

function Draw-EmojiOnPng {
    param (
        [string]$SvgPath,
        [string]$PngPath,
        [string]$Emoji,
        [string]$BgHex,
        [int]$Size
    )

    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $bgColor = [System.Drawing.ColorTranslator]::FromHtml($BgHex)
    $brush = New-Object System.Drawing.SolidBrush $bgColor
    $graphics.FillRectangle($brush, 0, 0, $Size, $Size)

    # Save initial PNG
    $bmp.Save($PngPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bmp.Dispose()
}

Draw-EmojiOnPng -PngPath "fav\raiden_patcher-192.png" -BgHex "#020814" -Size 192
Draw-EmojiOnPng -PngPath "fav\raiden_patcher-512.png" -BgHex "#020814" -Size 512
Draw-EmojiOnPng -PngPath "fav\hog_extractor-192.png" -BgHex "#0d1117" -Size 192
Draw-EmojiOnPng -PngPath "fav\hog_extractor-512.png" -BgHex "#0d1117" -Size 512
Draw-EmojiOnPng -PngPath "fav\afs_station-192.png" -BgHex "#141922" -Size 192
Draw-EmojiOnPng -PngPath "fav\afs_station-512.png" -BgHex "#141922" -Size 512
Draw-EmojiOnPng -PngPath "fav\ttxt-192.png" -BgHex "#0b0f16" -Size 192
Draw-EmojiOnPng -PngPath "fav\ttxt-512.png" -BgHex "#0b0f16" -Size 512
