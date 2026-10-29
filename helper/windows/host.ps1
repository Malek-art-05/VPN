# Chrome starts this when you connect to "Tor Russia". It runs Tor with no
# window and stops it when Chrome closes the connection.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$config = Get-Content "$here\config.json" -Raw | ConvertFrom-Json
$pidFile = "$here\tor.pid"

# Clean up a Tor left behind by a crash.
if (Test-Path $pidFile) {
  $old = Get-Process -Id (Get-Content $pidFile) -ErrorAction SilentlyContinue
  if ($old -and $old.ProcessName -eq "tor") { Stop-Process -Id $old.Id -Force }
}

# __OwningControllerProcess makes Tor quit by itself if this script dies.
$tor = Start-Process -FilePath $config.tor -WorkingDirectory (Split-Path $config.tor) -WindowStyle Hidden -PassThru `
  -ArgumentList @("-f", "`"$here\torrc`"", "__OwningControllerProcess", "$PID")
Set-Content $pidFile $tor.Id

# Chrome keeps stdin open while connected; it closes when you disconnect.
$stdin = [Console]::OpenStandardInput()
$buf = New-Object byte[] 4096
try {
  while ($stdin.Read($buf, 0, $buf.Length) -gt 0) {}
} finally {
  if (-not $tor.HasExited) { Stop-Process -Id $tor.Id -Force }
  Remove-Item $pidFile -ErrorAction SilentlyContinue
}
