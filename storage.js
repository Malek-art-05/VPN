// Shared helpers for reading and writing extension state.
export const AUTO_ID = "auto-ru";
// Built-in entry whose host/port are filled in by free-proxy.js.
const AUTO_SERVER = { id: AUTO_ID, name: "Free Russian server (automatic)", auto: true, scheme: "http", host: "", port: 0 };

export const DEFAULTS = {
  servers: [AUTO_SERVER],  // [{ id, name, scheme, host, port, username, password, auto? }]
  activeId: AUTO_ID,
  autoStatus: "",          // progress text while searching for a free server
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
  const state = { ...DEFAULTS, ...stored };
  if (!state.servers.some((s) => s.id === AUTO_ID)) state.servers = [AUTO_SERVER, ...state.servers];
  return state;
}

export function setState(patch) {
  return chrome.storage.local.set(patch);
}

export function newId() {
  return crypto.randomUUID();
}
