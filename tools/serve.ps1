# Sketchroom: tiny static file server for local testing.
# Google sign-in needs the page served over http://localhost, not opened from file://.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools/serve.ps1 [-Port 8000]
param([int]$Port = 8000)

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\') + '\'
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.ico' = 'image/x-icon'; '.json' = 'application/json'
  '.webmanifest' = 'application/manifest+json'
}
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Sketchroom running at http://localhost:$Port/ (close this window or press Ctrl+C to stop)"
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
      if ($path -eq '' -or $path.EndsWith('/')) { $path += 'index.html' }
      $file = [IO.Path]::GetFullPath((Join-Path $root $path))
      if ($file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file).ToLower()
        if ($types.ContainsKey($ext)) { $res.ContentType = $types[$ext] } else { $res.ContentType = 'application/octet-stream' }
        $res.Headers['Cache-Control'] = 'no-store'
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else { $res.StatusCode = 404 }
    } catch { $res.StatusCode = 500 }
    $res.Close()
  }
} finally { $listener.Stop() }
