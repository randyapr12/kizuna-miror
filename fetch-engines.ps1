# Mengunduh semua komponen resmi Kizuna Mirror + verifikasi SHA-256 (Windows PowerShell):
#   engine\           <- uxplay-windows 2.0.0.1736 (UxPlay 1.73.6) + DLL GStreamer RTP (MSYS2 1.28.1)
#   scrcpy\           <- scrcpy v5.0.1 win64 (Genymobile)
#   app\obs-plugin\   <- obs-gstreamer v0.4.2 (fzwoch)
# Catatan: ekstraksi paket .pkg.tar.zst memakai tar.exe bawaan Windows 11.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Get-Verified($url, $file, $sha) {
  if (-not (Test-Path $file)) { Invoke-WebRequest -Uri $url -OutFile $file }
  if ((Get-FileHash $file -Algorithm SHA256).Hash.ToLower() -ne $sha) { throw "SHA-256 TIDAK COCOK: $file" }
  Write-Host "SHA-256 OK: $file"
}
New-Item -ItemType Directory -Force engine-src | Out-Null
Get-Verified 'https://github.com/leapbtw/uxplay-windows/releases/download/2.0.0.1736/uxplay-windows.zip' 'engine-src\uxplay-windows.zip' '9d3a51c15fc9db857351195e7eb7bbb21700d9ae25d936a54bcf8536b62cca18'
Get-Verified 'https://github.com/Genymobile/scrcpy/releases/download/v5.0.1/scrcpy-win64-v5.0.1.zip' 'engine-src\scrcpy-win64-v5.0.1.zip' 'b12a2c4ee8be317422451fc7dcf8ee20a71b5ea7ef9ad73ddd825a25316227a5'
Get-Verified 'https://github.com/fzwoch/obs-gstreamer/releases/download/v0.4.2/obs-gstreamer-mingw-x86_64.zip' 'engine-src\obs-gstreamer-mingw-x86_64.zip' '463313063b4ac543ad012c73c04e7347b75b2f9709590917647202fcf75d1437'
Get-Verified 'https://repo.msys2.org/mingw/ucrt64/mingw-w64-ucrt-x86_64-gstreamer-1.28.1-1-any.pkg.tar.zst' 'engine-src\gstreamer.pkg.tar.zst' 'e26993993966c35ae5cf586c56aa7dd383175318f5e72795e02ab461d49a49c2'
Get-Verified 'https://repo.msys2.org/mingw/ucrt64/mingw-w64-ucrt-x86_64-gst-plugins-base-1.28.1-1-any.pkg.tar.zst' 'engine-src\gst-plugins-base.pkg.tar.zst' '14879be17587d7ac01d1ff97c4dd26d7574d142ac80d3b2f44d4fb4cb26a4724'
Get-Verified 'https://repo.msys2.org/mingw/ucrt64/mingw-w64-ucrt-x86_64-gst-plugins-good-1.28.1-1-any.pkg.tar.zst' 'engine-src\gst-plugins-good.pkg.tar.zst' '1eb4b637c7b4f3b056e753ded2aa5e38a52d2414cd66f3f116b965a0085215cc'

Remove-Item -Recurse -Force engine, scrcpy -ErrorAction SilentlyContinue
Expand-Archive 'engine-src\uxplay-windows.zip' -DestinationPath 'engine'
Expand-Archive 'engine-src\scrcpy-win64-v5.0.1.zip' -DestinationPath 'scrcpy-tmp'
New-Item -ItemType Directory -Force scrcpy | Out-Null
Copy-Item 'scrcpy-tmp\scrcpy-win64-v5.0.1\*' 'scrcpy\'
Remove-Item -Recurse -Force scrcpy-tmp

Expand-Archive 'engine-src\obs-gstreamer-mingw-x86_64.zip' -DestinationPath 'engine-src\obs-tmp'
New-Item -ItemType Directory -Force 'app\obs-plugin' | Out-Null
Copy-Item 'engine-src\obs-tmp\obs-gstreamer\bin\64bit\obs-gstreamer.dll' 'app\obs-plugin\'

New-Item -ItemType Directory -Force 'engine-src\msys2-tmp' | Out-Null
tar -xf 'engine-src\gstreamer.pkg.tar.zst' -C 'engine-src\msys2-tmp' 'ucrt64/bin/libgstnet-1.0-0.dll'
tar -xf 'engine-src\gst-plugins-base.pkg.tar.zst' -C 'engine-src\msys2-tmp' 'ucrt64/bin/libgstrtp-1.0-0.dll' 'ucrt64/bin/libgstsdp-1.0-0.dll'
tar -xf 'engine-src\gst-plugins-good.pkg.tar.zst' -C 'engine-src\msys2-tmp' 'ucrt64/lib/gstreamer-1.0/libgstrtp.dll' 'ucrt64/lib/gstreamer-1.0/libgstudp.dll' 'ucrt64/lib/gstreamer-1.0/libgstrtpmanager.dll'
Copy-Item 'engine-src\msys2-tmp\ucrt64\bin\*.dll' 'engine\'
Copy-Item 'engine-src\msys2-tmp\ucrt64\lib\gstreamer-1.0\*.dll' 'engine\lib\gstreamer-1.0\'
Write-Host 'Semua engine siap. Lanjut: cd app; npm install; npx electron-builder --win zip'
