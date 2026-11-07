#!/usr/bin/env bash
# Mengunduh semua komponen resmi Kizuna Mirror + verifikasi SHA-256:
#   engine/           <- uxplay-windows 2.0.0.1736 (UxPlay 1.73.6) + DLL GStreamer RTP (MSYS2 1.28.1)
#   scrcpy/           <- scrcpy v5.0.1 win64 (Genymobile)
#   app/obs-plugin/   <- obs-gstreamer v0.4.2 (fzwoch)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p engine-src

dl() { # url file sha
  [ -f "$2" ] || curl -fL -o "$2" "$1"
  echo "$3  $2" | sha256sum -c - >/dev/null && echo "SHA-256 OK: $2" || { echo "SHA-256 TIDAK COCOK: $2"; exit 1; }
}
dl "https://github.com/leapbtw/uxplay-windows/releases/download/2.0.0.1736/uxplay-windows.zip" \
   engine-src/uxplay-windows.zip 9d3a51c15fc9db857351195e7eb7bbb21700d9ae25d936a54bcf8536b62cca18
dl "https://github.com/Genymobile/scrcpy/releases/download/v5.0.1/scrcpy-win64-v5.0.1.zip" \
   engine-src/scrcpy-win64-v5.0.1.zip b12a2c4ee8be317422451fc7dcf8ee20a71b5ea7ef9ad73ddd825a25316227a5
dl "https://github.com/fzwoch/obs-gstreamer/releases/download/v0.4.2/obs-gstreamer-mingw-x86_64.zip" \
   engine-src/obs-gstreamer-mingw-x86_64.zip 463313063b4ac543ad012c73c04e7347b75b2f9709590917647202fcf75d1437
dl "https://repo.msys2.org/mingw/ucrt64/mingw-w64-ucrt-x86_64-gstreamer-1.28.1-1-any.pkg.tar.zst" \
   engine-src/gstreamer.pkg.tar.zst e26993993966c35ae5cf586c56aa7dd383175318f5e72795e02ab461d49a49c2
dl "https://repo.msys2.org/mingw/ucrt64/mingw-w64-ucrt-x86_64-gst-plugins-base-1.28.1-1-any.pkg.tar.zst" \
   engine-src/gst-plugins-base.pkg.tar.zst 14879be17587d7ac01d1ff97c4dd26d7574d142ac80d3b2f44d4fb4cb26a4724
dl "https://repo.msys2.org/mingw/ucrt64/mingw-w64-ucrt-x86_64-gst-plugins-good-1.28.1-1-any.pkg.tar.zst" \
   engine-src/gst-plugins-good.pkg.tar.zst 1eb4b637c7b4f3b056e753ded2aa5e38a52d2414cd66f3f116b965a0085215cc

python3 - <<'PY'
import zipfile, io, os, tarfile, shutil
def zst_bytes(path):
    try:
        import zstandard
        with open(path, 'rb') as f:
            return zstandard.ZstdDecompressor().stream_reader(f).read()
    except ImportError:
        import subprocess
        return subprocess.run(['tar', '--zstd', '-xOf', path], capture_output=True, check=True).stdout \
            if False else subprocess.run(['zstd', '-dc', path], capture_output=True, check=True).stdout

# UxPlay
shutil.rmtree('engine', ignore_errors=True)
zipfile.ZipFile('engine-src/uxplay-windows.zip').extractall('engine')
# scrcpy (buang folder pembungkus)
shutil.rmtree('scrcpy', ignore_errors=True); shutil.rmtree('scrcpy-tmp', ignore_errors=True)
z = zipfile.ZipFile('engine-src/scrcpy-win64-v5.0.1.zip')
for i in z.infolist():
    name = i.filename.replace('scrcpy-win64-v5.0.1/', '')
    if name: z.extract(i, 'scrcpy-tmp')
shutil.copytree('scrcpy-tmp/scrcpy-win64-v5.0.1', 'scrcpy'); shutil.rmtree('scrcpy-tmp')
# obs-gstreamer
os.makedirs('app/obs-plugin', exist_ok=True)
z = zipfile.ZipFile('engine-src/obs-gstreamer-mingw-x86_64.zip')
with z.open('obs-gstreamer/bin/64bit/obs-gstreamer.dll') as src, open('app/obs-plugin/obs-gstreamer.dll', 'wb') as dst:
    shutil.copyfileobj(src, dst)
# DLL GStreamer RTP/UDP dari paket MSYS2 -> engine
want = {
 'engine-src/gstreamer.pkg.tar.zst': {'ucrt64/bin/libgstnet-1.0-0.dll': 'engine/libgstnet-1.0-0.dll'},
 'engine-src/gst-plugins-base.pkg.tar.zst': {'ucrt64/bin/libgstrtp-1.0-0.dll': 'engine/libgstrtp-1.0-0.dll',
                                             'ucrt64/bin/libgstsdp-1.0-0.dll': 'engine/libgstsdp-1.0-0.dll'},
 'engine-src/gst-plugins-good.pkg.tar.zst': {'ucrt64/lib/gstreamer-1.0/libgstrtp.dll': 'engine/lib/gstreamer-1.0/libgstrtp.dll',
                                             'ucrt64/lib/gstreamer-1.0/libgstudp.dll': 'engine/lib/gstreamer-1.0/libgstudp.dll',
                                             'ucrt64/lib/gstreamer-1.0/libgstrtpmanager.dll': 'engine/lib/gstreamer-1.0/libgstrtpmanager.dll'},
}
for pkg, mapping in want.items():
    tf = tarfile.open(fileobj=io.BytesIO(zst_bytes(pkg)))
    for member, dest in mapping.items():
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with tf.extractfile(member) as src, open(dest, 'wb') as dst:
            shutil.copyfileobj(src, dst)
        print('MSYS2 ->', dest)
print('Semua engine siap.')
PY
echo "Lanjut: cd app && npm install && npx electron-builder --win zip"
