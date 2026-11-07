# Kizuna Mirror - buka Windows Firewall untuk engine UxPlay
# Dijalankan elevated (UAC) dari aplikasi, atau manual:
#   powershell -ExecutionPolicy Bypass -File Open-Firewall.ps1 -EngineExe "C:\...\uxplay-windows.exe"
param(
  [string]$EngineExe = ""
)

$ErrorActionPreference = "Continue"

function Add-Rule($name, $params) {
  if (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue) {
    Write-Host "Sudah ada: $name"
  } else {
    New-NetFirewallRule -DisplayName $name @params | Out-Null
    Write-Host "Ditambahkan: $name"
  }
}

if ($EngineExe -and (Test-Path $EngineExe)) {
  Add-Rule "Kizuna Mirror (Engine)" @{
    Direction = "Inbound"; Action = "Allow"; Program = $EngineExe; Profile = "Private"
  }
}

Add-Rule "Kizuna Mirror (Port 7000-7002 TCP)" @{
  Direction = "Inbound"; Action = "Allow"; Protocol = "TCP"; LocalPort = "7000-7002"; Profile = "Private"
}
Add-Rule "Kizuna Mirror (Port 7000-7002 UDP)" @{
  Direction = "Inbound"; Action = "Allow"; Protocol = "UDP"; LocalPort = "7000-7002"; Profile = "Private"
}
Add-Rule "Kizuna Mirror (mDNS 5353 UDP)" @{
  Direction = "Inbound"; Action = "Allow"; Protocol = "UDP"; LocalPort = "5353"; Profile = "Private"
}

Write-Host ""
Write-Host "Selesai. Firewall Kizuna Mirror sudah dibuka untuk jaringan Private."
Write-Host "Tekan Enter untuk menutup."
[void][System.Console]::ReadLine()
