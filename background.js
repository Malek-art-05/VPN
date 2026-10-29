import { getState, setState } from "./storage.js";

// Requests we've already answered with credentials, so a wrong password
// fails instead of looping forever.
const authAttempts = new Set();

async function applyProxy() {
  const { servers, activeId, connected, bypassList } = await getState();
  const server = servers.find((s) => s.id === activeId);

  if (!connected || !server) {
    await chrome.proxy.settings.clear({ scope: "regular" });
    await chrome.privacy.network.webRTCIPHandlingPolicy.clear({});
    await updateBadge(false);
    return;
  }

  await chrome.proxy.settings.set({
    scope: "regular",
    value: {
      mode: "fixed_servers",
      rules: {
        singleProxy: { scheme: server.scheme, host: server.host, port: Number(server.port) },
        bypassList
      }
    }
  });
  // Stop WebRTC from revealing your real IP around the proxy.
  await chrome.privacy.network.webRTCIPHandlingPolicy.set({ value: "disable_non_proxied_udp" });
  await updateBadge(true);
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
  chrome.action.setBadgeText({ text: "ERR" });
  chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
});

chrome.runtime.onStartup.addListener(applyProxy);
chrome.runtime.onInstalled.addListener(async () => {
  // Persist defaults so content scripts can read them straight from storage.
  await setState(await getState());
  await applyProxy();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "connect":
        await setState({ activeId: msg.id, connected: true });
        await applyProxy();
        break;
      case "disconnect":
        await setState({ connected: false });
        await applyProxy();
        break;
      case "reapply":
        await applyProxy();
        break;
    }
    sendResponse({ ...(await getState()), levelOfControl: await controlLevel() });
  })().catch((e) => sendResponse({ error: e.message }));
  return true; // keep the channel open for the async response
});
