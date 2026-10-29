# Simple VPN (Chrome extension)

Routes Chrome's traffic through a proxy server you choose, so websites see the
server's IP and country instead of yours. While connected it also:

- stops WebRTC from leaking your real IP, and
- reports a fake GPS location (Moscow by default) to sites that ask the browser for it, and
- makes websites see Moscow time (UTC+3) instead of your computer's timezone.

It only covers Chrome. Other apps on your computer keep using your normal connection.

## Install

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and pick this `vpn-extension` folder.
3. Pin the extension and click its icon.

## Quick start (nothing else to install)

Click the extension icon, leave **Free Russian server (automatic)** selected and
click **Connect**. It downloads a list of free public proxies in Russia, tests
them one by one, and connects to the first one whose traffic really exits in
Russia. That usually takes a few seconds to a minute.

Free public proxies are run by strangers. They come and go, can be slow, and
could read any page that isn't HTTPS (the padlock sites are still encrypted).
If one gets slow, click **Try another server** in the popup. For something
steadier, use Tor (below) or your own server.

## Add a server

Click the gear in the popup (or right-click the icon → Options) and enter:

- **Type**: HTTP, HTTPS, SOCKS5 or SOCKS4
- **Host** and **Port** of the proxy
- **Username / Password** if the proxy needs a login (HTTP/HTTPS only; Chrome
  can't send a login to SOCKS proxies)

To appear in Russia, use a proxy server located in Russia. Paid residential or
datacenter proxy providers sell these with a host, port, username and password,
which is exactly what this form takes. Free public proxy lists work
occasionally but are slow, short-lived, and can read or alter unencrypted traffic.

Then hit **Connect** in the popup and use **Check my IP** to confirm.

## Free Russian IP with Tor

Tor is free. By default it picks a random country, so you tell it to exit
only through Russia, then point the extension at it.

### Option A: Tor Browser (easiest)

1. Download and install Tor Browser from https://www.torproject.org/download/
   and open it once, click **Connect**, then close it.
2. Open its config file, `torrc`, in a text editor (Notepad, TextEdit):
   - **Windows:** `Tor Browser\Browser\TorBrowser\Data\Tor\torrc` inside the
     folder you installed it to (often on the Desktop)
   - **Mac:** `~/Library/Application Support/TorBrowser-Data/Tor/torrc`
     (in Finder: Go → Go to Folder, paste the path)
   - **Linux:** `tor-browser/Browser/TorBrowser/Data/Tor/torrc`
3. Add these two lines at the end and save:
   ```
   ExitNodes {ru}
   StrictNodes 1
   ```
4. Open Tor Browser again and click **Connect**. Leave it running (minimized
   is fine) whenever you want Chrome to appear in Russia.
5. In the extension popup click **Use Tor Browser (free)** (or in Options,
   **Add Tor Browser preset**), then **Connect**.
6. Click **Check my IP**. It should show a Russian city.

### Option B: Tor as a background service

Use this if you don't want a Tor Browser window open. Add the same two lines
to the service's `torrc`, restart it, then add the **Tor service preset (port 9050)**
in Options.

- **Mac:** `brew install tor`, then
  `cp /opt/homebrew/etc/tor/torrc.sample /opt/homebrew/etc/tor/torrc`, edit it,
  and run `brew services restart tor`
- **Linux:** `sudo apt install tor`, edit `/etc/tor/torrc`, then
  `sudo systemctl restart tor`
- **Windows:** download the "Tor Expert Bundle" from the Tor download page,
  create a `torrc` next to `tor.exe` with the two lines, and run
  `tor.exe -f torrc` in a terminal (keep it open)

### Things to expect

- Tor is slower than a normal connection.
- Russia only has a few Tor exit servers. If none are up, pages won't load.
  Remove `StrictNodes 1` to let Tor fall back to other countries.
- Some sites, including some Russian ones, block or add CAPTCHAs for Tor users.
- Tor Browser on its own will also appear to be in Russia after step 3. The
  extension lets your normal Chrome, with your logins and bookmarks, use it.

## Location

The Location section in Options controls the fake GPS position. Sites mostly
judge location by IP (from the proxy), but this covers map and weather sites
that ask the browser directly. Reload open tabs after connecting or changing it.

The Moscow time option makes JavaScript dates and `Intl` report Europe/Moscow,
so a site comparing your clock to your IP's country sees a match. It doesn't
reach Web Workers, and a determined fingerprinting script can still spot the
override.

## Files

| File | What it does |
| --- | --- |
| `manifest.json` | Extension definition (Manifest V3) |
| `background.js` | Applies proxy settings, answers proxy logins, WebRTC protection, badge |
| `popup.*` | Connect/disconnect button, server picker, IP check |
| `options.*` | Manage servers, location and bypass list |
| `geo-main.js`, `geo-bridge.js` | Replace `navigator.geolocation` while connected |
| `tz-spoof.js` | Moscow timezone for pages, registered only while connected |
| `free-proxy.js` | Finds and tests free Russian proxies for the automatic server |
| `storage.js` | Shared settings helpers |
