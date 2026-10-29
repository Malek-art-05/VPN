// Shared helpers for reading and writing extension state.
export const DEFAULTS = {
  servers: [],            // [{ id, name, scheme, host, port, username, password }]
  activeId: null,
  connected: false,
  bypassList: ["localhost", "127.0.0.1", "<local>"],
  // Report this position to sites that ask for your location while connected.
  geo: { enabled: true, label: "Moscow, Russia", latitude: 55.7558, longitude: 37.6173, timezone: true }
};

// Tor listens on 9150 when Tor Browser is open, or 9050 when run as a service.
export const TOR_PRESETS = {
  browser: { name: "Tor (Russia) via Tor Browser", scheme: "socks5", host: "127.0.0.1", port: 9150 },
  service: { name: "Tor (Russia) via Tor service", scheme: "socks5", host: "127.0.0.1", port: 9050 }
};

export async function addTorPreset(kind) {
  const { servers, activeId } = await getState();
  const preset = TOR_PRESETS[kind];
  const existing = servers.find((s) => s.host === preset.host && s.port === preset.port);
  if (existing) return existing;
  const server = { id: newId(), username: "", password: "", ...preset };
  servers.push(server);
  await setState({ servers, activeId: activeId ?? server.id });
  return server;
}

export async function getState() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

export function setState(patch) {
  return chrome.storage.local.set(patch);
}

export function newId() {
  return crypto.randomUUID();
}
