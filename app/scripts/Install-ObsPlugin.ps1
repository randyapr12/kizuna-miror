# Kizuna Mirror - pasang plugin obs-gstreamer ke OBS Studio (elevated/UAC)
# Plugin: obs-gstreamer v0.4.2 oleh fzwoch (GPL-2.0), https://github.com/fzwoch/obs-gstreamer
param(
  [Parameter(Mandatory = $true)][string]$PluginDll
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $PluginDll)) {
  Write-Host "File plugin tidak ditemukan: $PluginDll"
} else {
  $candidates = @(
    "C:\Program Files\obs-studio",
    "C:\Program Files (x86)\obs-studio",
    "$env:LOCALAPPDATA\Programs\obs-studio"
  )
  $done = $false
  foreach ($base in $candidates) {
    $targetDir = Join-Path $base "obs-plugins\64bit"
    if (Test-Path $targetDir) {
      Copy-Item $PluginDll (Join-Path $targetDir "obs-gstreamer.dll") -Force
      Write-Host "Plugin terpasang: $targetDir\obs-gstreamer.dll"
      $done = $true
    }
  }
  if (-not $done) {
    Write-Host "Folder OBS tidak ditemukan di lokasi standar. Salin manual obs-gstreamer.dll ke obs-studio\obs-plugins\64bit\"
  }
}

Write-Host ""
Write-Host "Selesai. Tekan Enter untuk menutup."
[void][System.Console]::ReadLine()
