// Starts and stops Tor through the native helper (see helper/). The helper
// runs Tor with no window for as long as this port stays open, and stops it
// when the port closes, including when Chrome quits.
import { getState, setState } from "./storage.js";

const HOST = "com.simplevpn.tor";
const READY_TIMEOUT_MS = 120000;

let port = null;
let starting = null;
let onUnexpectedExit = () => {};

export const isTorStarting = () => starting !== null;
export const isTorRunning = () => port !== null;
export const onTorExit = (fn) => (onUnexpectedExit = fn);

const status = (autoStatus) => setState({ autoStatus });

async function reachable() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    await fetch("https://api.ipify.org?format=json", { cache: "no-store", signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function run(useProxy) {
  let exitError = null;
  port = chrome.runtime.connectNative(HOST);
  port.onDisconnect.addListener(() => {
    exitError = chrome.runtime.lastError?.message || "Tor stopped";
    port = null;
    if (!starting) onUnexpectedExit(exitError);
  });

  await status("Starting Tor…");
  await useProxy();
  const started = Date.now();
  while (Date.now() - started < READY_TIMEOUT_MS) {
    if (exitError) break;
    if (await reachable()) {
      await status("");
      return true;
    }
    const secs = Math.round((Date.now() - started) / 1000);
    await status(`Starting Tor and finding a Russian route… ${secs}s`);
    await new Promise((r) => setTimeout(r, 2000));
  }

  stopTor();
  await setState({ connected: false });
  await status(
    exitError?.includes("not found")
      ? "The Tor helper isn't installed yet. Run the installer in the helper folder (see README), then try again."
      : exitError
        ? `Tor couldn't start: ${exitError}`
        : "Tor couldn't reach a Russian exit in time. Try again, or use the free Russian server."
  );
  return false;
}

// useProxy points Chrome at Tor; called once the helper is launched.
export function startTor(useProxy) {
  if (port && !starting) return Promise.resolve(true);
  starting ??= run(useProxy).finally(() => (starting = null));
  return starting;
}

export function stopTor() {
  if (port) {
    port.disconnect();
    port = null;
  }
}
