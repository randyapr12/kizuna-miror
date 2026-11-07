// Kizuna Mirror - AirPlay receiver controller for Windows
// UI/launcher around the open-source UxPlay engine (GPLv3, FDH2/UxPlay,
// packaged for Windows by leapbtw/uxplay-windows 2.0.0.1736 / UxPlay 1.73.6).
// The engine renders the mirrored video itself in a D3D11/GStreamer window;
// this app configures it (via ~/.uxplayrc + CLI args), starts/stops it,
// and helps with firewall + diagnostics.
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let win = null;
let engineProc = null;
let androidProc = null;

const DEFAULT_SETTINGS = {
  receiverName: 'Kizuna Mirror',
  preset: '1080p60', // 720p60 | 1080p30 | 1080p60 | 4k60
  mode: 'window', // window | obs  (obs = -vrtp/-artp straight into OBS, no window capture)
  fullscreen: false,
  hwDecode: true, // -vs d3d11videosink
  audio: true,
  pinEnabled: false,
  pinCode: '',
  fpsData: true,
  android: {
    conn: 'usb', // usb | wifi
    preset: '1080p60', // a720p60 | 1080p60 | 1080p120 | native
    codec: 'h264', // h264 | h265
    audio: true,
    control: true,
    fullscreen: false,
    screenOff: false,
    stayAwake: true,
    record: false,
    wifiIp: '',
  },
};

const ANDROID_PRESETS = {
  a720p60: { maxSize: '1280', fps: '60', br: '8M', label: '720p 60fps' },
  '1080p60': { maxSize: '1920', fps: '60', br: '16M', label: '1080p 60fps' },
  '1080p120': { maxSize: '1920', fps: '120', br: '24M', label: '1080p 120fps' },
  native: { maxSize: null, fps: '120', br: '32M', label: 'Native (maks HP)' },
};

const OBS_VIDEO_PORT = 5004;
const OBS_AUDIO_PORT = 5006;

function obsPipelines(s) {
  const p = PRESETS[s.preset] || PRESETS['1080p60'];
  const enc = p.h265 ? 'H265' : 'H264';
  const depay = p.h265 ? 'rtph265depay' : 'rtph264depay';
  const video =
    'udpsrc port=' + OBS_VIDEO_PORT +
    ' ! application/x-rtp,media=video,encoding-name=' + enc + ',payload=96' +
    ' ! ' + depay + ' ! decodebin ! videoconvert ! video.';
  const audio =
    'udpsrc port=' + OBS_AUDIO_PORT +
    ' ! application/x-rtp,media=audio,encoding-name=L16,clock-rate=44100,channels=2,payload=96' +
    ' ! rtpL16depay ! audioconvert ! audio.';
  return { video, audio, combined: video + ' ' + audio };
}

function obsPluginDll() {
  const base = app.isPackaged ? process.resourcesPath : path.join(__dirname);
  return path.join(base, 'obs-plugin', 'obs-gstreamer.dll');
}
function obsExePath() {
  return 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe';
}
function obsPluginInstalled() {
  return fs.existsSync('C:\\Program Files\\obs-studio\\obs-plugins\\64bit\\obs-gstreamer.dll');
}

const PRESETS = {
  '720p60': { res: '1280x720@60', fps: '60', h265: false, label: '720p 60fps' },
  '1080p30': { res: '1920x1080@30', fps: '30', h265: false, label: '1080p 30fps' },
  '1080p60': { res: '1920x1080@60', fps: '60', h265: false, label: '1080p 60fps' },
  '4k60': { res: '3840x2160@60', fps: '60', h265: true, label: '4K 60fps (H.265)' },
};

function engineDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'engine');
  return path.join(__dirname, '..', 'engine');
}
function engineExe() {
  return path.join(engineDir(), 'uxplay-windows.exe');
}
function scriptsDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'scripts');
  return path.join(__dirname, 'scripts');
}
function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}
function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      android: { ...DEFAULT_SETTINGS.android, ...(saved.android || {}) },
    };
  } catch (_) {
    return { ...DEFAULT_SETTINGS, android: { ...DEFAULT_SETTINGS.android } };
  }
}
function saveSettings(s) {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
  } catch (_) {}
}

function buildArgs(s) {
  const p = PRESETS[s.preset] || PRESETS['1080p60'];
  const name = (s.receiverName || 'Kizuna Mirror').trim() || 'Kizuna Mirror';
  const args = ['-n', name, '-nh', '-s', p.res, '-fps', p.fps, '-p', '7000'];
  if (p.h265) args.push('-h265');
  if (s.mode === 'obs') {
    // OBS Direct: engine does not render a window at all. Decrypted video is
    // re-sent as RTP/H.264(5) to OBS (obs-gstreamer source), audio as RTP/L16.
    // This bypasses Window/Game Capture entirely (they show black for the
    // engine's fullscreen D3D11 window). Needs the rtp/udp GStreamer plugins
    // added to the engine bundle in v1.1 (matching GStreamer 1.28.1).
    args.push('-vrtp', 'config-interval=1 ! udpsink host=127.0.0.1 port=' + OBS_VIDEO_PORT);
    if (s.audio) {
      args.push('-artp', 'pt=96 ! udpsink host=127.0.0.1 port=' + OBS_AUDIO_PORT);
    } else {
      args.push('-as', '0');
    }
  } else {
    if (s.fullscreen) args.push('-fs');
    if (s.hwDecode) args.push('-vs', 'd3d11videosink');
    if (!s.audio) args.push('-as', '0');
  }
  if (s.pinEnabled && /^\d{4}$/.test(s.pinCode || '')) args.push('-pin' + s.pinCode);
  if (s.fpsData) args.push('-FPSdata');
  args.push('-nofreeze');
  return args;
}

// UxPlay also reads startup options from ~/.uxplayrc (one option per line,
// no leading "-"). Write it so the engine GUI path uses the same settings.
// A pre-existing foreign .uxplayrc is backed up once, never overwritten blindly.
function writeUxplayRc(s) {
  const home = os.homedir();
  const rcPath = path.join(home, '.uxplayrc');
  const args = buildArgs(s);
  const lines = ['# Kizuna Mirror'];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('-')) {
      const key = a.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        // Quote values containing spaces (e.g. -vrtp/-artp pipelines) so the
        // rc parser keeps them as one argument.
        lines.push(next.includes(' ') ? key + ' "' + next + '"' : key + ' ' + next);
        i++;
      } else {
        lines.push(key);
      }
    }
  }
  try {
    if (fs.existsSync(rcPath)) {
      const old = fs.readFileSync(rcPath, 'utf8');
      if (!old.startsWith('# Kizuna Mirror')) {
        const bak = rcPath + '.bak-kizuna';
        if (!fs.existsSync(bak)) fs.writeFileSync(bak, old);
      }
    }
    fs.writeFileSync(rcPath, lines.join('\r\n') + '\r\n');
    return rcPath;
  } catch (e) {
    return null;
  }
}

function sendLog(text) {
  if (win && !win.isDestroyed()) win.webContents.send('engine-log', String(text));
}
function sendStatus(running) {
  if (win && !win.isDestroyed()) win.webContents.send('engine-status', running);
}

function startEngine(s) {
  if (engineProc) return { ok: false, msg: 'Receiver sudah berjalan.' };
  const exe = engineExe();
  if (!fs.existsSync(exe)) {
    return { ok: false, msg: 'Engine tidak ditemukan: ' + exe };
  }
  const rc = writeUxplayRc(s);
  const args = buildArgs(s);
  sendLog('Menulis konfigurasi: ' + (rc || '(gagal, lanjut pakai argumen CLI)'));
  sendLog('Menjalankan engine: uxplay-windows.exe ' + args.join(' '));
  try {
    engineProc = spawn(exe, args, {
      cwd: engineDir(),
      windowsHide: false,
      detached: false,
    });
  } catch (e) {
    engineProc = null;
    return { ok: false, msg: 'Gagal menjalankan engine: ' + e.message };
  }
  engineProc.stdout && engineProc.stdout.on('data', (d) => sendLog(d.toString().trimEnd()));
  engineProc.stderr && engineProc.stderr.on('data', (d) => sendLog(d.toString().trimEnd()));
  engineProc.on('error', (e) => {
    sendLog('Engine error: ' + e.message);
    engineProc = null;
    sendStatus(false);
  });
  engineProc.on('exit', (code) => {
    sendLog('Engine berhenti (kode ' + code + ').');
    engineProc = null;
    sendStatus(false);
  });
  sendStatus(true);
  return { ok: true, msg: 'Receiver berjalan. Di iPhone: Control Center > Screen Mirroring > "' + s.receiverName + '".' };
}

function stopEngine() {
  if (!engineProc) return { ok: true, msg: 'Receiver memang sedang berhenti.' };
  const pid = engineProc.pid;
  sendLog('Menghentikan engine (PID ' + pid + ')...');
  if (process.platform === 'win32' && pid) {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => {});
  } else {
    try { engineProc.kill(); } catch (_) {}
  }
  engineProc = null;
  sendStatus(false);
  return { ok: true, msg: 'Receiver dihentikan.' };
}

function runPowerShell(command, timeoutMs) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: timeoutMs || 20000, windowsHide: true },
      (err, stdout, stderr) => {
        resolve((stdout || '') + (stderr || '') + (err && !stdout ? '\n' + err.message : ''));
      }
    );
  });
}

async function diagnostics() {
  if (process.platform !== 'win32') {
    return 'Diagnostik lengkap hanya jalan di Windows.\nEngine: ' + engineExe() + ' -> ' + (fs.existsSync(engineExe()) ? 'ADA' : 'TIDAK ADA');
  }
  const exe = engineExe().replace(/'/g, "''");
  const cmd = [
    `Write-Output ('Engine: ' + (Test-Path '${exe}'))`,
    `Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254*' } | ForEach-Object { Write-Output ('IP lokal: ' + $_.IPAddress + ' (' + $_.InterfaceAlias + ')') }`,
    `Get-Process uxplay-windows,mDNSResponder -ErrorAction SilentlyContinue | ForEach-Object { Write-Output ('Proses: ' + $_.ProcessName + ' PID ' + $_.Id) }`,
    `Get-Service Bonjour -ErrorAction SilentlyContinue | ForEach-Object { Write-Output ('Bonjour Service: ' + $_.Status) }`,
    `Get-NetFirewallRule -DisplayName 'Kizuna Mirror*' -ErrorAction SilentlyContinue | ForEach-Object { Write-Output ('Firewall rule: ' + $_.DisplayName + ' ' + $_.Enabled) }`,
  ].join('; ');
  const out = await runPowerShell(cmd);
  return out.trim() || 'Tidak ada output diagnostik.';
}

function openFirewall() {
  const script = path.join(scriptsDir(), 'Open-Firewall.ps1');
  if (process.platform !== 'win32') return { ok: false, msg: 'Hanya untuk Windows.' };
  if (!fs.existsSync(script)) return { ok: false, msg: 'Script firewall tidak ditemukan: ' + script };
  const cmd = `Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "${script}" -EngineExe "${engineExe()}"'`;
  execFile('powershell.exe', ['-NoProfile', '-Command', cmd], { windowsHide: true }, (e) => {
    if (e) sendLog('Firewall: ' + e.message);
  });
  return { ok: true, msg: 'Jendela UAC akan muncul — klik Yes, script akan membuka port 7000-7002 (TCP/UDP) + 5353 (UDP) untuk jaringan Private.' };
}

function createWindow() {
  const opts = {
    width: 1020,
    height: 760,
    minWidth: 880,
    minHeight: 640,
    show: false,
    backgroundColor: '#0a0a16',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
  if (process.platform === 'win32') opts.backgroundMaterial = 'acrylic';
  win = new BrowserWindow(opts);
  win.setMenuBarVisibility(false);
  win.loadFile('index.html');
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => (win = null));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('save-settings', (_e, s) => {
  const merged = { ...DEFAULT_SETTINGS, ...s };
  saveSettings(merged);
  return merged;
});
ipcMain.handle('start-engine', (_e, s) => {
  const merged = { ...DEFAULT_SETTINGS, ...s };
  saveSettings(merged);
  return startEngine(merged);
});
ipcMain.handle('stop-engine', () => stopEngine());
ipcMain.handle('engine-running', () => !!engineProc);
ipcMain.handle('diagnostics', () => diagnostics());
ipcMain.handle('open-firewall', () => openFirewall());
ipcMain.handle('open-engine-folder', () => {
  shell.openPath(engineDir());
  return true;
});
ipcMain.handle('obs-pipelines', (_e, s) => obsPipelines({ ...DEFAULT_SETTINGS, ...s }));
ipcMain.handle('obs-status', () => ({
  obsFound: fs.existsSync(obsExePath()),
  pluginInstalled: obsPluginInstalled(),
  pluginDllBundled: fs.existsSync(obsPluginDll()),
}));
ipcMain.handle('install-obs-plugin', () => {
  if (process.platform !== 'win32') return { ok: false, msg: 'Hanya untuk Windows.' };
  const script = path.join(scriptsDir(), 'Install-ObsPlugin.ps1');
  if (!fs.existsSync(script)) return { ok: false, msg: 'Script plugin OBS tidak ditemukan: ' + script };
  if (!fs.existsSync(obsPluginDll())) return { ok: false, msg: 'File plugin tidak ditemukan: ' + obsPluginDll() };
  const cmd = `Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "${script}" -PluginDll "${obsPluginDll()}"'`;
  execFile('powershell.exe', ['-NoProfile', '-Command', cmd], { windowsHide: true }, (e) => {
    if (e) sendLog('Plugin OBS: ' + e.message);
  });
  return { ok: true, msg: 'Jendela UAC akan muncul — klik Yes. Plugin obs-gstreamer akan disalin ke folder OBS. Setelah itu WAJIB tutup OBS total, lalu buka lagi lewat tombol "Buka OBS (mode Kizuna)".' };
});
ipcMain.handle('launch-obs', () => {
  if (process.platform !== 'win32') return { ok: false, msg: 'Hanya untuk Windows.' };
  const exe = obsExePath();
  if (!fs.existsSync(exe)) return { ok: false, msg: 'OBS tidak ditemukan di ' + exe };
  if (!obsPluginInstalled()) {
    return { ok: false, msg: 'Plugin obs-gstreamer belum terpasang. Klik "Pasang Plugin OBS" dulu, ya.' };
  }
  const gstPlugins = path.join(engineDir(), 'lib', 'gstreamer-1.0');
  const env = {
    ...process.env,
    PATH: engineDir() + ';' + (process.env.PATH || ''),
    GST_PLUGIN_PATH: gstPlugins,
    GST_PLUGIN_SYSTEM_PATH: gstPlugins,
  };
  try {
    const p = spawn(exe, [], {
      cwd: path.dirname(exe),
      env,
      detached: true,
      windowsHide: false,
    });
    p.unref();
    sendLog('OBS dibuka dengan runtime GStreamer Kizuna Mirror (PATH + GST_PLUGIN_PATH mengarah ke folder engine).');
    return { ok: true, msg: 'OBS dibuka (mode Kizuna). Tambahkan source "GStreamer Source" lalu tempel pipeline dari panel Mode OBS.' };
  } catch (e) {
    return { ok: false, msg: 'Gagal membuka OBS: ' + e.message };
  }
});
// ===================== Android (scrcpy) =====================

function androidEngineDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'android-engine');
  return path.join(__dirname, '..', 'scrcpy');
}
function scrcpyExe() {
  return path.join(androidEngineDir(), 'scrcpy.exe');
}
function adbExe() {
  return path.join(androidEngineDir(), 'adb.exe');
}
function sendAndroidLog(text) {
  if (win && !win.isDestroyed()) win.webContents.send('android-log', String(text));
}
function sendAndroidStatus(running) {
  if (win && !win.isDestroyed()) win.webContents.send('android-status', running);
}

function runAdb(args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(adbExe(), args, { timeout: timeoutMs || 15000, windowsHide: true }, (err, stdout, stderr) => {
      resolve(((stdout || '') + (stderr || '')).trim());
    });
  });
}

function parseAdbDevices(out) {
  const devices = [];
  for (const line of String(out).split(/\r?\n/)) {
    const m = line.match(/^(\S+)\s+(device|unauthorized|offline)\b/);
    if (m) devices.push({ serial: m[1], state: m[2] });
  }
  return devices;
}

async function listUsableDevices() {
  const out = await runAdb(['devices']);
  return { out, devices: parseAdbDevices(out).filter((d) => d.state === 'device') };
}

async function resolveAndroidSerial(a) {
  let { devices } = await listUsableDevices();
  if (a.conn === 'wifi') {
    if (a.wifiIp && a.wifiIp.trim()) {
      const ip = a.wifiIp.trim();
      const target = ip.includes(':') ? ip : ip + ':5555';
      if (!devices.some((d) => d.serial === target)) {
        sendAndroidLog('Menghubungi ' + target + '...');
        const res = await runAdb(['connect', target]);
        sendAndroidLog(res);
        ({ devices } = await listUsableDevices());
      }
      const found = devices.find((d) => d.serial === target);
      if (found) return { serial: found.serial };
      return { error: 'HP tidak menjawab di ' + target + '. Pastikan Wi-Fi sama, Wireless debugging / mode TCP-IP aktif, dan IP benar. Cara termudah: colok USB dulu, klik "Aktifkan Wi-Fi via USB".' };
    }
    const net = devices.find((d) => d.serial.includes(':'));
    if (net) return { serial: net.serial };
    return { error: 'Belum ada perangkat Wi-Fi yang terhubung. Isi IP HP lalu Mulai, atau colok USB dan klik "Aktifkan Wi-Fi via USB" dulu.' };
  }
  const usb = devices.find((d) => !d.serial.includes(':'));
  if (usb) return { serial: usb.serial };
  const all = await runAdb(['devices']);
  if (/unauthorized/.test(all)) {
    return { error: 'HP terdeteksi tapi "unauthorized" — lihat layar HP, terima prompt "Izinkan USB debugging" (centang "Selalu izinkan"), lalu coba lagi.' };
  }
  return { error: 'HP Android tidak terdeteksi via USB. Cek: kabel data (bukan kabel cas saja), USB Debugging aktif di Opsi Pengembang, dan mode USB "Transfer file".' };
}

function buildAndroidArgs(a, serial, recordPath) {
  const p = ANDROID_PRESETS[a.preset] || ANDROID_PRESETS['1080p60'];
  const args = ['--window-title', 'Kizuna Mirror - Android', '-s', serial];
  if (p.maxSize) args.push('--max-size', p.maxSize);
  args.push('--max-fps', p.fps, '--video-bit-rate', p.br, '--video-codec', a.codec === 'h265' ? 'h265' : 'h264');
  if (!a.audio) args.push('--no-audio');
  if (!a.control) args.push('--no-control');
  if (a.fullscreen) args.push('--fullscreen');
  if (a.screenOff) args.push('--turn-screen-off');
  if (a.stayAwake) args.push('--stay-awake');
  if (a.record && recordPath) args.push('--record', recordPath);
  return args;
}

async function startAndroid(a) {
  if (androidProc) return { ok: false, msg: 'Mirroring Android sudah berjalan.' };
  if (!fs.existsSync(scrcpyExe())) return { ok: false, msg: 'Engine Android (scrcpy) tidak ditemukan: ' + scrcpyExe() };
  const resolved = await resolveAndroidSerial(a);
  if (resolved.error) return { ok: false, msg: resolved.error };
  let recordPath = null;
  if (a.record) {
    const dir = path.join(os.homedir(), 'Videos', 'KizunaMirror');
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    recordPath = path.join(dir, 'android-' + stamp + '.mp4');
  }
  const args = buildAndroidArgs(a, resolved.serial, recordPath);
  sendAndroidLog('Perangkat: ' + resolved.serial);
  sendAndroidLog('Menjalankan: scrcpy ' + args.join(' '));
  if (recordPath) sendAndroidLog('Rekaman disimpan ke: ' + recordPath);
  try {
    androidProc = spawn(scrcpyExe(), args, { cwd: androidEngineDir(), windowsHide: false });
  } catch (e) {
    androidProc = null;
    return { ok: false, msg: 'Gagal menjalankan scrcpy: ' + e.message };
  }
  androidProc.stdout && androidProc.stdout.on('data', (d) => sendAndroidLog(d.toString().trimEnd()));
  androidProc.stderr && androidProc.stderr.on('data', (d) => sendAndroidLog(d.toString().trimEnd()));
  androidProc.on('error', (e) => {
    sendAndroidLog('scrcpy error: ' + e.message);
    androidProc = null;
    sendAndroidStatus(false);
  });
  androidProc.on('exit', (code) => {
    sendAndroidLog('scrcpy berhenti (kode ' + code + ').');
    androidProc = null;
    sendAndroidStatus(false);
  });
  sendAndroidStatus(true);
  return { ok: true, msg: 'Mirroring Android berjalan (' + resolved.serial + '). Jendela "Kizuna Mirror - Android" bisa langsung ditangkap OBS via Window Capture.' };
}

function stopAndroid() {
  if (!androidProc) return { ok: true, msg: 'Mirroring Android memang sedang berhenti.' };
  const pid = androidProc.pid;
  sendAndroidLog('Menghentikan scrcpy (PID ' + pid + ')...');
  if (process.platform === 'win32' && pid) {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => {});
  } else {
    try { androidProc.kill(); } catch (_) {}
  }
  androidProc = null;
  sendAndroidStatus(false);
  return { ok: true, msg: 'Mirroring Android dihentikan.' };
}

async function androidWifiEnable() {
  const { devices } = await listUsableDevices();
  const usb = devices.find((d) => !d.serial.includes(':'));
  if (!usb) return { ok: false, msg: 'Tidak ada HP via USB. Colok HP dengan kabel + USB Debugging aktif dulu, baru klik tombol ini.' };
  sendAndroidLog('Mengaktifkan mode TCP/IP di ' + usb.serial + '...');
  let out = await runAdb(['-s', usb.serial, 'tcpip', '5555']);
  sendAndroidLog(out || 'tcpip 5555 OK');
  await new Promise((r) => setTimeout(r, 1500));
  let ip = '';
  const addr = await runAdb(['-s', usb.serial, 'shell', 'ip -f inet addr show wlan0']);
  const m = addr.match(/inet\s+(\d+\.\d+\.\d+\.\d+)\//);
  if (m) ip = m[1];
  if (!ip) {
    const route = await runAdb(['-s', usb.serial, 'shell', 'ip route']);
    const m2 = route.match(/src\s+(\d+\.\d+\.\d+\.\d+)/);
    if (m2) ip = m2[1];
  }
  if (!ip) return { ok: false, msg: 'Mode TCP/IP aktif, tapi IP Wi-Fi HP tidak terbaca. Cek IP di Pengaturan > Tentang ponsel / status Wi-Fi, isi manual di kolom IP.' };
  const conn = await runAdb(['connect', ip + ':5555']);
  sendAndroidLog(conn);
  return { ok: true, ip, msg: 'Wi-Fi aktif di ' + ip + ':5555. Kabel USB sekarang boleh dicabut. Pilih koneksi Wi-Fi lalu klik Mulai.' };
}

ipcMain.handle('android-devices', async () => {
  const out = await runAdb(['devices']);
  const devices = parseAdbDevices(out);
  return { out, devices };
});
ipcMain.handle('android-wifi-enable', () => androidWifiEnable());
ipcMain.handle('start-android', async (_e, fullSettings) => {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...fullSettings,
    android: { ...DEFAULT_SETTINGS.android, ...((fullSettings && fullSettings.android) || {}) },
  };
  saveSettings(merged);
  return startAndroid(merged.android);
});
ipcMain.handle('stop-android', () => stopAndroid());
ipcMain.handle('android-running', () => !!androidProc);

ipcMain.handle('open-engine-native', () => {
  // Fallback: engine's own built-in Qt UI, without our arguments.
  const exe = engineExe();
  if (!fs.existsSync(exe)) return { ok: false, msg: 'Engine tidak ditemukan.' };
  const p = spawn(exe, [], { cwd: engineDir(), detached: true, windowsHide: false });
  p.unref();
  return { ok: true, msg: 'UI bawaan engine dibuka. Nama default-nya "uxplay-windows" — atur argumen lewat menu Edit UxPlay Arguments di sana bila perlu.' };
});

app.on('window-all-closed', () => {
  stopEngine();
  stopAndroid();
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => {
  stopEngine();
  stopAndroid();
});
