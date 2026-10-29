import { getState, setState, AUTO_ID, TOR_ID } from "./storage.js";
import { findFreeProxy, isSearching as isFinding } from "./free-proxy.js";
import { startTor, stopTor, isTorStarting, isTorRunning, onTorExit } from "./tor.js";

const isSearching = () => isFinding() || isTorStarting();

// Requests we've already answered with credentials, so a wrong password
// fails instead of looping forever.
const authAttempts = new Set();

async function applyProxy() {
  const { servers, activeId, connected, bypassList, geo } = await getState();
  const server = servers.find((s) => s.id === activeId);
  await syncTimezone(Boolean(connected && server?.host && geo.timezone !== false));

  if (!(connected && server?.tor)) stopTor();
  else if (!isTorRunning() && !isTorStarting()) {
    // Chrome restarted or the worker woke up: bring Tor back first.
    startTor(() => setProxy(server, bypassList)).then((ok) => ok || applyProxy());
  }

  if (!connected || !server?.host) {
    await chrome.proxy.settings.clear({ scope: "regular" });
    await chrome.privacy.network.webRTCIPHandlingPolicy.clear({});
    await updateBadge(false);
    return;
  }

  await setProxy(server, bypassList);
  // Stop WebRTC from revealing your real IP around the proxy.
  await chrome.privacy.network.webRTCIPHandlingPolicy.set({ value: "disable_non_proxied_udp" });
  await updateBadge(true);
}

function setProxy(server, bypassList) {
  return chrome.proxy.settings.set({
    scope: "regular",
    value: {
      mode: "fixed_servers",
      rules: {
        singleProxy: { scheme: server.scheme, host: server.host, port: Number(server.port) },
        bypassList
      }
    }
  });
}

// The timezone override has to run before page scripts, so it is registered
// as a content script only while connected instead of checking state at runtime.
const TZ_SCRIPT = {
  id: "tz-spoof",
  js: ["tz-spoof.js"],
  matches: ["<all_urls>"],
  runAt: "document_start",
  allFrames: true,
  matchOriginAsFallback: true,
  world: "MAIN"
};

async function syncTimezone(on) {
  const registered = (await chrome.scripting.getRegisteredContentScripts({ ids: [TZ_SCRIPT.id] })).length > 0;
  if (on && !registered) await chrome.scripting.registerContentScripts([TZ_SCRIPT]);
  if (!on && registered) await chrome.scripting.unregisterContentScripts({ ids: [TZ_SCRIPT.id] });
}

async function updateBadge(on) {
  await chrome.action.setBadgeText({ text: on ? "ON" : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
}

async function controlLevel() {
  const { levelOfControl } = await chrome.proxy.settings.get({ incognito: false });
  return levelOfControl;
}

chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    if (!details.isProxy || authAttempts.has(details.requestId)) {
      callback({});
      return;
    }
    getState().then(({ servers, activeId }) => {
      const server = servers.find((s) => s.id === activeId);
      if (server?.username) {
        authAttempts.add(details.requestId);
        callback({ authCredentials: { username: server.username, password: server.password || "" } });
      } else {
        callback({});
      }
    });
  },
  { urls: ["<all_urls>"] },
  ["asyncBlocking"]
);

const forget = (details) => authAttempts.delete(details.requestId);
chrome.webRequest.onCompleted.addListener(forget, { urls: ["<all_urls>"] });
chrome.webRequest.onErrorOccurred.addListener(forget, { urls: ["<all_urls>"] });

chrome.proxy.onProxyError.addListener((err) => {
  console.warn("Proxy error:", err.error, err.details);
  if (isSearching()) return; // expected while testing free servers
  chrome.action.setBadgeText({ text: "ERR" });
  chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
});

onTorExit(async (error) => {
  console.warn("Tor exited:", error);
  await setState({ connected: false, autoStatus: "" });
  await applyProxy();
  chrome.action.setBadgeText({ text: "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
});

async function connect(id) {
  const { servers, bypassList } = await getState();
  const server = servers.find((s) => s.id === id);
  if (id === AUTO_ID) {
    await setState({ activeId: AUTO_ID });
    await findFreeProxy();
  } else if (server?.tor) {
    stopTor();
    await setState({ activeId: id, connected: true });
    await startTor(() => setProxy(server, bypassList));
  } else {
    await setState({ activeId: id, connected: true, autoStatus: "" });
  }
  await applyProxy();
}

chrome.runtime.onStartup.addListener(async () => {
  const { autoConnect, activeId } = await getState();
  await setState({ autoStatus: "" });
  if (autoConnect) await connect(activeId);
  else await applyProxy();
});

chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  const state = await getState();
  // Make Tor the default for anyone updating from before it existed.
  if (reason === "update" && previousVersion && previousVersion.localeCompare("0.5.0", undefined, { numeric: true }) < 0) {
    state.activeId = TOR_ID;
    state.connected = false;
  }
  // Persist defaults so content scripts can read them straight from storage.
  await setState({ ...state, autoStatus: "" });
  await applyProxy();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "connect":
        await connect(msg.id);
        break;
      case "newServer":
        await findFreeProxy(true);
        await applyProxy();
        break;
      case "disconnect":
        await setState({ connected: false, autoStatus: "" });
        await applyProxy();
        break;
      case "reapply":
        // Don't undo the test proxy while a free-server search is running.
        if (!isSearching()) await applyProxy();
        break;
    }
    sendResponse({ ...(await getState()), searching: isSearching(), levelOfControl: await controlLevel() });
  })().catch((e) => sendResponse({ error: e.message }));
  return true; // keep the channel open for the async response
});
