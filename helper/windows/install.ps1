# Installs the helper that lets the Simple VPN extension start Tor (from your
# Tor Browser install) in the background. Run via install.bat.
param([switch]$Uninstall)
$ErrorActionPreference = "Stop"

$name = "com.simplevpn.tor"
$extensionId = "hfalpkaihojcpcnpfblcaojopgiffgnn"
$dest = "$env:LOCALAPPDATA\SimpleVPN"
$regKeys = @(
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$name",
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$name"
)

if ($Uninstall) {
  $regKeys | ForEach-Object { Remove-Item $_ -ErrorAction SilentlyContinue }
  Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "Simple VPN Tor helper removed."
  exit
}

# Find tor.exe inside Tor Browser.
$roots = @(
  "$env:USERPROFILE\Desktop", "$env:USERPROFILE\OneDrive\Desktop", "$env:USERPROFILE\Downloads",
  "$env:USERPROFILE\Documents", "$env:LOCALAPPDATA", "$env:ProgramFiles", "${env:ProgramFiles(x86)}"
) | Where-Object { $_ -and (Test-Path $_) }

$tor = $roots | ForEach-Object { Join-Path $_ "Tor Browser\Browser\TorBrowser\Tor\tor.exe" } |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $tor) {
  Write-Host "Looking for Tor Browser..."
  $tor = Get-ChildItem $roots -Filter tor.exe -Recurse -Depth 6 -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like "*TorBrowser*" } | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $tor) {
  Write-Host "Couldn't find Tor Browser. Install it from https://www.torproject.org/download/"
  $tor = (Read-Host "or paste the full path to tor.exe").Trim('"')
}
if (-not (Test-Path $tor)) { throw "tor.exe not found at $tor" }

# Tor needs its country database to pick Russian exits.
$torBrowserDir = Split-Path (Split-Path $tor)
$geoip = Get-ChildItem $torBrowserDir -Filter geoip -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
$geoip6 = Get-ChildItem $torBrowserDir -Filter geoip6 -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
if (-not $geoip) { throw "Couldn't find Tor's geoip file next to $tor" }

New-Item -ItemType Directory -Force -Path "$dest\data" | Out-Null
Copy-Item "$PSScriptRoot\host.ps1", "$PSScriptRoot\host.bat" $dest -Force

@"
SocksPort 127.0.0.1:9155
DataDirectory $dest\data
GeoIPFile $geoip
$(if ($geoip6) { "GeoIPv6File $geoip6" })
ExitNodes {ru}
StrictNodes 1
Log notice file $dest\tor.log
"@ | Set-Content "$dest\torrc" -Encoding ASCII

@{ tor = $tor } | ConvertTo-Json | Set-Content "$dest\config.json" -Encoding ASCII

@{
  name = $name
  description = "Starts Tor for the Simple VPN extension"
  path = "host.bat"
  type = "stdio"
  allowed_origins = @("chrome-extension://$extensionId/")
} | ConvertTo-Json | Set-Content "$dest\$name.json" -Encoding ASCII

foreach ($key in $regKeys) {
  New-Item -Path $key -Force | Out-Null
  Set-ItemProperty -Path $key -Name "(default)" -Value "$dest\$name.json"
}

Write-Host ""
Write-Host "Done. Tor found at: $tor"
Write-Host "Restart Chrome, then click Connect in Simple VPN with 'Tor Russia (automatic)' selected."
