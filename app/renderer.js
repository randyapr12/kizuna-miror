const $ = (id) => document.getElementById(id);
const logEl = $('log');

function log(text) {
  const ts = new Date().toLocaleTimeString('id-ID');
  logEl.textContent += `[${ts}] ${text}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function currentAndroidSettings() {
  const conn = document.querySelector('#aConn .chip.active');
  const preset = document.querySelector('#aPresets .chip.active');
  const codec = document.querySelector('#aCodec .chip.active');
  return {
    conn: conn ? conn.dataset.conn : 'usb',
    preset: preset ? preset.dataset.apreset : '1080p60',
    codec: codec ? codec.dataset.codec : 'h264',
    audio: $('aAudio').checked,
    control: $('aControl').checked,
    fullscreen: $('aFullscreen').checked,
    screenOff: $('aScreenOff').checked,
    stayAwake: $('aStayAwake').checked,
    record: $('aRecord').checked,
    wifiIp: $('aWifiIp').value.trim(),
  };
}

function currentSettings() {
  const active = document.querySelector('#presets .chip.active');
  const modeActive = document.querySelector('#modes .chip.active');
  return {
    android: currentAndroidSettings(),
    receiverName: $('receiverName').value,
    preset: active ? active.dataset.preset : '1080p60',
    mode: modeActive ? modeActive.dataset.mode : 'window',
    fullscreen: $('optFullscreen').checked,
    hwDecode: $('optHw').checked,
    audio: $('optAudio').checked,
    fpsData: $('optFpsData').checked,
    pinEnabled: $('optPin').checked,
    pinCode: $('pinCode').value.trim(),
  };
}

function applyAndroidSettings(a) {
  if (!a) return;
  document.querySelectorAll('#aConn .chip').forEach((c) => c.classList.toggle('active', c.dataset.conn === a.conn));
  document.querySelectorAll('#aPresets .chip').forEach((c) => c.classList.toggle('active', c.dataset.apreset === a.preset));
  document.querySelectorAll('#aCodec .chip').forEach((c) => c.classList.toggle('active', c.dataset.codec === a.codec));
  $('aAudio').checked = !!a.audio;
  $('aControl').checked = !!a.control;
  $('aFullscreen').checked = !!a.fullscreen;
  $('aScreenOff').checked = !!a.screenOff;
  $('aStayAwake').checked = !!a.stayAwake;
  $('aRecord').checked = !!a.record;
  $('aWifiIp').value = a.wifiIp || '';
  $('wifiRow').classList.toggle('hidden', a.conn !== 'wifi');
}

function applySettings(s) {
  if (!s) return;
  applyAndroidSettings(s.android);
  $('receiverName').value = s.receiverName || 'Kizuna Mirror';
  document.querySelectorAll('#presets .chip').forEach((c) =>
    c.classList.toggle('active', c.dataset.preset === s.preset)
  );
  setMode(s.mode || 'window');
  $('optFullscreen').checked = !!s.fullscreen;
  $('optHw').checked = !!s.hwDecode;
  $('optAudio').checked = !!s.audio;
  $('optFpsData').checked = !!s.fpsData;
  $('optPin').checked = !!s.pinEnabled;
  $('pinCode').value = s.pinCode || '';
}

function setRunning(running) {
  $('statusPill').className = 'pill ' + (running ? 'on' : 'off');
  $('statusText').textContent = running ? 'Berjalan — siap mirroring' : 'Berhenti';
  $('btnStart').disabled = running;
  $('btnStop').disabled = !running;
}

document.querySelectorAll('#presets .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#presets .chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    window.mirror.saveSettings(currentSettings());
    refreshPipeline();
    log('Preset dipilih: ' + chip.textContent.trim().split('\n')[0] + ' (berlaku saat receiver dimulai ulang)');
  });
});

async function refreshPipeline() {
  try {
    const p = await window.mirror.obsPipelines(currentSettings());
    $('pipelineCombined').value = p.combined;
  } catch (_) {}
}

async function refreshObsStatus() {
  try {
    const st = await window.mirror.obsStatus();
    $('obsStatus').textContent =
      'OBS: ' + (st.obsFound ? 'ketemu' : 'tidak ditemukan') +
      ' · Plugin: ' + (st.pluginInstalled ? 'terpasang ✓' : 'belum terpasang');
    return st;
  } catch (_) {
    return null;
  }
}

function setMode(mode) {
  document.querySelectorAll('#modes .chip').forEach((c) =>
    c.classList.toggle('active', c.dataset.mode === mode)
  );
  const isObs = mode === 'obs';
  $('obsPanel').classList.toggle('hidden', !isObs);
  $('optFullscreen').disabled = isObs;
  if (isObs) {
    refreshPipeline();
    refreshObsStatus();
  }
}

document.querySelectorAll('#modes .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    setMode(chip.dataset.mode);
    window.mirror.saveSettings(currentSettings());
    log(
      chip.dataset.mode === 'obs'
        ? 'Mode OBS Langsung dipilih — receiver tidak menampilkan jendela, video+audio dikirim ke OBS (port UDP 5004/5006). Berlaku saat receiver dimulai.'
        : 'Mode Jendela dipilih — video tampil di jendela engine seperti biasa. Berlaku saat receiver dimulai.'
    );
  });
});

$('btnCopyPipeline').addEventListener('click', async () => {
  await refreshPipeline();
  $('pipelineCombined').select();
  try {
    await navigator.clipboard.writeText($('pipelineCombined').value);
    log('Pipeline OBS disalin. Tempel ke GStreamer Source di OBS.');
  } catch (_) {
    document.execCommand('copy');
    log('Pipeline OBS disalin (fallback). Tempel ke GStreamer Source di OBS.');
  }
});
$('btnInstallPlugin').addEventListener('click', async () => {
  const r = await window.mirror.installObsPlugin();
  log(r.msg);
  setTimeout(refreshObsStatus, 3000);
});
$('btnLaunchObs').addEventListener('click', async () => {
  const r = await window.mirror.launchObs();
  log(r.msg);
});

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.mirror.saveSettings(currentSettings()), 400);
}
['receiverName', 'pinCode'].forEach((id) => $(id).addEventListener('input', scheduleSave));
['optFullscreen', 'optHw', 'optAudio', 'optFpsData', 'optPin'].forEach((id) =>
  $(id).addEventListener('change', scheduleSave)
);

$('btnStart').addEventListener('click', async () => {
  const s = currentSettings();
  if (s.pinEnabled && !/^\d{4}$/.test(s.pinCode)) {
    log('PIN harus tepat 4 digit angka, atau matikan opsi PIN.');
    return;
  }
  log('Memulai receiver "' + s.receiverName + '" preset ' + s.preset + '...');
  const r = await window.mirror.start(s);
  log(r.msg);
  if (r.ok) setRunning(true);
});
$('btnStop').addEventListener('click', async () => {
  const r = await window.mirror.stop();
  log(r.msg);
  setRunning(false);
});
$('btnFirewall').addEventListener('click', async () => {
  const r = await window.mirror.openFirewall();
  log(r.msg);
});
$('btnDiag').addEventListener('click', async () => {
  log('Menjalankan diagnostik...');
  const out = await window.mirror.diagnostics();
  log(out);
});
$('btnNative').addEventListener('click', async () => {
  const r = await window.mirror.openEngineNative();
  log(r.msg);
});
$('btnFolder').addEventListener('click', () => window.mirror.openEngineFolder());
$('btnClear').addEventListener('click', () => (logEl.textContent = ''));

window.mirror.onLog((t) => log(t));
window.mirror.onStatus((r) => setRunning(r));

// ===================== Tabs + Android =====================

function setTab(which) {
  $('tabIphone').classList.toggle('active', which === 'iphone');
  $('tabAndroid').classList.toggle('active', which === 'android');
  $('panelIphone').classList.toggle('hidden', which !== 'iphone');
  $('panelAndroid').classList.toggle('hidden', which !== 'android');
}
$('tabIphone').addEventListener('click', () => setTab('iphone'));
$('tabAndroid').addEventListener('click', () => setTab('android'));

function wireChipGroup(selector, after) {
  document.querySelectorAll(selector + ' .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll(selector + ' .chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      window.mirror.saveSettings(currentSettings());
      if (after) after(chip);
    });
  });
}
wireChipGroup('#aConn', (chip) => {
  $('wifiRow').classList.toggle('hidden', chip.dataset.conn !== 'wifi');
  log('[Android] Koneksi: ' + chip.dataset.conn.toUpperCase());
});
wireChipGroup('#aPresets', (chip) => log('[Android] Preset: ' + chip.textContent.trim().split('\n')[0]));
wireChipGroup('#aCodec', (chip) => log('[Android] Codec: ' + chip.dataset.codec.toUpperCase()));
['aAudio', 'aControl', 'aFullscreen', 'aScreenOff', 'aStayAwake', 'aRecord'].forEach((id) =>
  $(id).addEventListener('change', scheduleSave)
);
$('aWifiIp').addEventListener('input', scheduleSave);

function setARunning(running) {
  $('aStatusPill').className = 'pill ' + (running ? 'on' : 'off');
  $('aStatusText').textContent = running ? 'Mirroring berjalan' : 'Berhenti';
  $('btnAStart').disabled = running;
  $('btnAStop').disabled = !running;
}

$('btnDevices').addEventListener('click', async () => {
  log('[Android] Mendeteksi perangkat...');
  const r = await window.mirror.androidDevices();
  if (!r.devices || r.devices.length === 0) {
    log('[Android] Tidak ada perangkat. Output adb: ' + (r.out || '(kosong)'));
  } else {
    r.devices.forEach((d) => log('[Android] Perangkat: ' + d.serial + ' (' + d.state + ')'));
  }
});
$('btnWifiEnable').addEventListener('click', async () => {
  log('[Android] Mengaktifkan mode Wi-Fi via USB...');
  const r = await window.mirror.androidWifiEnable();
  log('[Android] ' + r.msg);
  if (r.ok && r.ip) {
    $('aWifiIp').value = r.ip;
    window.mirror.saveSettings(currentSettings());
  }
});
$('btnAStart').addEventListener('click', async () => {
  log('[Android] Memulai mirroring...');
  const r = await window.mirror.androidStart(currentSettings());
  log('[Android] ' + r.msg);
  if (r.ok) setARunning(true);
});
$('btnAStop').addEventListener('click', async () => {
  const r = await window.mirror.androidStop();
  log('[Android] ' + r.msg);
  setARunning(false);
});
window.mirror.onAndroidLog((t) => log('[Android] ' + t));
window.mirror.onAndroidStatus((r) => setARunning(r));

(async () => {
  const s = await window.mirror.getSettings();
  applySettings(s);
  setRunning(await window.mirror.running());
  setARunning(await window.mirror.androidRunning());
  log('Kizuna Mirror siap. Klik "Mulai Receiver", lalu pilih nama di atas dari Screen Mirroring iPhone.');
})();
