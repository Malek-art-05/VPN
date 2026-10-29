// Finds a working free public proxy in Russia by trying candidates one at a
// time as Chrome's proxy and checking which country the internet sees.
import { getState, setState, AUTO_ID } from "./storage.js";

const LISTS = [
  "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/countries/RU/data.txt",
  "https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&country=ru&protocol=http,socks4,socks5&proxy_format=protocolipport&format=text"
];
const MAX_TRIES = 25;
const TIMEOUT_MS = 7000;

// Proxies that failed this browser session, so retries skip them.
const failed = new Set();
let search = null;

const key = (p) => `${p.scheme}://${p.host}:${p.port}`;

async function fetchWithTimeout(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { cache: "no-store", signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loadCandidates() {
  const seen = new Map();
  for (const url of LISTS) {
    try {
      const text = await (await fetchWithTimeout(url)).text();
      for (const line of text.split(/\s+/)) {
        const m = line.match(/^(https?|socks[45]):\/\/(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/);
        // "https" in these lists means the proxy supports HTTPS sites; you still
        // talk to it in plain HTTP, which Chrome calls "http".
        if (m) {
          const p = { scheme: m[1] === "https" ? "http" : m[1], host: m[2], port: Number(m[3]) };
          seen.set(key(p), p);
        }
      }
    } catch (e) {
      console.warn("Proxy list failed:", url, e.message);
    }
  }
  const list = [...seen.values()].filter((p) => !failed.has(key(p)));
  // SOCKS5 first (it also tunnels DNS), then random order within each type.
  const rank = { socks5: 0, http: 1, socks4: 2 };
  return list.map((p) => [rank[p.scheme] + Math.random(), p]).sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}

function useProxy(p) {
  return chrome.proxy.settings.set({
    scope: "regular",
    value: { mode: "fixed_servers", rules: { singleProxy: { scheme: p.scheme, host: p.host, port: p.port } } }
  });
}

// True if traffic through the current proxy works and exits in Russia.
async function exitsInRussia() {
  try {
    const data = await (await fetchWithTimeout("https://ipwho.is/")).json();
    if (data.success) return data.country_code === "RU";
  } catch {
    return false;
  }
  // The country lookup refused us but the proxy works; trust the list.
  try {
    await fetchWithTimeout("https://api.ipify.org?format=json");
    return true;
  } catch {
    return false;
  }
}

const status = (autoStatus) => setState({ autoStatus });

async function run(skipCurrent) {
  const { servers } = await getState();
  const auto = servers.find((s) => s.id === AUTO_ID);
  if (skipCurrent && auto?.host) failed.add(key(auto));

  await status("Getting the list of free Russian servers…");
  await chrome.proxy.settings.clear({ scope: "regular" });
  const candidates = await loadCandidates();
  if (candidates.length === 0) {
    await status("Couldn't download the server list. Check your internet connection.");
    return false;
  }

  const tries = candidates.slice(0, MAX_TRIES);
  for (const [i, p] of tries.entries()) {
    await status(`Testing Russian server ${i + 1} of ${tries.length}…`);
    await useProxy(p);
    if (await exitsInRussia()) {
      const { servers } = await getState();
      Object.assign(servers.find((s) => s.id === AUTO_ID), p);
      await setState({ servers, activeId: AUTO_ID, connected: true, autoStatus: "" });
      return true;
    }
    failed.add(key(p));
  }

  await chrome.proxy.settings.clear({ scope: "regular" });
  await setState({ connected: false });
  await status("No working Russian server right now. Free servers come and go, so try again in a few minutes.");
  return false;
}

// Runs one search at a time; extra calls wait for the one in progress.
export function findFreeProxy(skipCurrent = false) {
  search ??= run(skipCurrent).finally(() => (search = null));
  return search;
}

export const isSearching = () => search !== null;
