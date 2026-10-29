#!/bin/bash
# Installs the helper that lets the Simple VPN extension start Tor in the
# background. Usage: bash install.sh   (or: bash install.sh --uninstall)
set -euo pipefail

NAME="com.simplevpn.tor"
EXTENSION_ID="hfalpkaihojcpcnpfblcaojopgiffgnn"
DEST="$HOME/.simplevpn"

if [[ "$(uname)" == "Darwin" ]]; then
  MANIFEST_DIRS=("$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
                 "$HOME/Library/Application Support/Chromium/NativeMessagingHosts")
  SEARCH=("/Applications/Tor Browser.app" "$HOME/Applications/Tor Browser.app")
else
  MANIFEST_DIRS=("$HOME/.config/google-chrome/NativeMessagingHosts"
                 "$HOME/.config/chromium/NativeMessagingHosts")
  SEARCH=("$HOME")
fi

if [[ "${1:-}" == "--uninstall" ]]; then
  for d in "${MANIFEST_DIRS[@]}"; do rm -f "$d/$NAME.json"; done
  rm -rf "$DEST"
  echo "Simple VPN Tor helper removed."
  exit 0
fi

# Prefer Tor Browser's own tor, then a system-installed tor.
TOR=""
for root in "${SEARCH[@]}"; do
  [[ -d "$root" ]] || continue
  TOR="$(find "$root" -maxdepth 7 -type f \( -name tor -o -name tor.real \) -path "*Tor*" -perm -u+x 2>/dev/null | head -n 1 || true)"
  [[ -n "$TOR" ]] && break
done
[[ -z "$TOR" ]] && TOR="$(command -v tor || true)"
if [[ -z "$TOR" ]]; then
  echo "Couldn't find Tor. Install Tor Browser from https://www.torproject.org/download/"
  read -r -p "or enter the full path to the tor program: " TOR
fi
[[ -x "$TOR" ]] || { echo "tor not found at $TOR"; exit 1; }

# Tor needs its country database to pick Russian exits.
GEO_ROOT="$(dirname "$(dirname "$TOR")")"
[[ "$(uname)" == "Darwin" ]] && GEO_ROOT="${TOR%%.app/*}.app"
GEOIP="$(find "$GEO_ROOT" -maxdepth 6 -type f -name geoip 2>/dev/null | head -n 1 || true)"
GEOIP6="$(find "$GEO_ROOT" -maxdepth 6 -type f -name geoip6 2>/dev/null | head -n 1 || true)"

mkdir -p "$DEST/data"
chmod 700 "$DEST/data"

{
  echo "SocksPort 127.0.0.1:9155"
  echo "DataDirectory $DEST/data"
  [[ -n "$GEOIP" ]] && echo "GeoIPFile $GEOIP"
  [[ -n "$GEOIP6" ]] && echo "GeoIPv6File $GEOIP6"
  echo "ExitNodes {ru}"
  echo "StrictNodes 1"
  echo "Log notice file $DEST/tor.log"
} > "$DEST/torrc"

cat > "$DEST/host.sh" <<HOST
#!/bin/bash
# Chrome starts this when you connect to "Tor Russia". It runs Tor in the
# background and stops it when Chrome closes the connection.
DIR="$DEST"
TOR="$TOR"
if [[ -f "\$DIR/tor.pid" ]]; then kill "\$(cat "\$DIR/tor.pid")" 2>/dev/null; fi
# __OwningControllerProcess makes Tor quit by itself if this script dies.
LD_LIBRARY_PATH="\$(dirname "\$TOR")" "\$TOR" -f "\$DIR/torrc" __OwningControllerProcess \$\$ \\
  >/dev/null 2>&1 </dev/null &
TORPID=\$!
echo \$TORPID > "\$DIR/tor.pid"
trap 'kill \$TORPID 2>/dev/null; rm -f "\$DIR/tor.pid"' EXIT
# Chrome keeps stdin open while connected; it closes when you disconnect.
cat >/dev/null
HOST
chmod +x "$DEST/host.sh"

for d in "${MANIFEST_DIRS[@]}"; do
  mkdir -p "$d"
  cat > "$d/$NAME.json" <<JSON
{
  "name": "$NAME",
  "description": "Starts Tor for the Simple VPN extension",
  "path": "$DEST/host.sh",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXTENSION_ID/"]
}
JSON
done

echo
echo "Done. Tor found at: $TOR"
echo "Restart Chrome, then click Connect in Simple VPN with 'Tor Russia (automatic)' selected."
