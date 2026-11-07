# Kizuna Mirror

Aplikasi Windows untuk **mirroring iPhone (AirPlay) dan Android (USB/Wi-Fi)** ke PC dalam satu UI — dengan target HD 1080p60, mode khusus OBS, dan kontrol dua arah untuk Android.

![version](https://img.shields.io/badge/version-1.2.0-blue) ![platform](https://img.shields.io/badge/platform-Windows%2010%2F11-lightgrey) [![download](https://img.shields.io/badge/download-v1.2.0-brightgreen)](https://github.com/randyapr12/kizuna-miror/releases/tag/v1.2.0)

## Fitur

**Tab iPhone (AirPlay — engine UxPlay)**
- Preset 720p60 / 1080p30 / 1080p60 / 4K60 H.265, decode hardware D3D11, PIN opsional
- **Mode OBS Langsung**: video + audio dikirim lurus ke OBS lewat RTP (`obs-gstreamer`) — mengatasi layar hitam pada Window/Game Capture
- Mode Jendela untuk nonton biasa, tombol firewall sekali klik

**Tab Android (engine scrcpy)**
- Preset 720p60 / **1080p60** / 1080p120 / Native, codec H.264 / H.265
- Koneksi **USB** (paling stabil) atau **Wi-Fi** (ada tombol "Aktifkan Wi-Fi via USB", IP terbaca otomatis)
- **Kontrol dua arah** pakai mouse & keyboard PC, audio ke PC (Android 11+), rekam MP4, matikan layar HP saat mirroring

## Download

### ⬇️ [Download KizunaMirror-1.2.0-win.zip (227 MB)](https://github.com/randyapr12/kizuna-miror/releases/download/v1.2.0/KizunaMirror-1.2.0-win.zip)

Semua versi ada di halaman [Releases](https://github.com/randyapr12/kizuna-miror/releases).

Ekstrak zip-nya, jalankan `KizunaMirror.exe` (SmartScreen: *More info → Run anyway*). Panduan lengkap ada di `CARA-PAKAI.txt` (ikut di dalam zip).

SHA-256 file zip: `0478132cd7b3e897babd072fdd49db8a46223f28d878e9ee9467dd925aa0b69f`

## Build dari source

Syarat: Node.js 20+, koneksi internet (script mengambil engine resmi + verifikasi SHA-256).

```bash
# 1. Ambil engine resmi (UxPlay + scrcpy) ke folder engine/ dan scrcpy/
./fetch-engines.sh        # di Windows: .\fetch-engines.ps1

# 2. Build
cd app
npm install
npx electron-builder --win zip
# hasil: app/dist/KizunaMirror-<versi>-win.zip
```

Repo ini hanya berisi kode sumber UI-nya. Engine besar (250 MB+) dan DLL biner pihak ketiga memang **tidak** disimpan di git — script `fetch-engines` di atas yang mengunduhnya dari rilis resmi upstream, lengkap dengan verifikasi SHA-256. Pengguna biasa tidak perlu build sendiri: pakai file jadi dari bagian **Download** di atas.

## Catatan jujur

- Konten DRM (Netflix, Apple TV+, dll) tampil hitam di mirroring iPhone — itu proteksi FairPlay Apple, berlaku untuk semua receiver non-Apple.
- Di Android, aplikasi yang melarang perekaman layar juga bisa tampil hitam — kebijakan aplikasinya.
- Mirroring Android butuh **USB Debugging** aktif (Opsi Pengembang). Di Xiaomi, kontrol mungkin butuh juga *USB debugging (Security settings)*.

## Lisensi & kredit

- Kode UI aplikasi ini: **MIT** (lihat `LICENSE`).
- Engine iPhone: [UxPlay 1.73.6](https://github.com/FDH2/UxPlay) (GPLv3), paket Windows [uxplay-windows](https://github.com/leapbtw/uxplay-windows) — tanpa modifikasi; script build menambahkan DLL GStreamer RTP/UDP dari paket resmi MSYS2 1.28.1 agar Mode OBS Langsung berfungsi (sumber persisnya di `ENGINE-NOTICE.txt`).
- Engine Android: [scrcpy 5.0.1](https://github.com/Genymobile/scrcpy) (Apache-2.0) — dibundel tanpa modifikasi.
- Plugin OBS: [obs-gstreamer](https://github.com/fzwoch/obs-gstreamer) (GPL-2.0).

Detail asal-usul, versi, dan hash setiap komponen: **`ENGINE-NOTICE.txt`**.
