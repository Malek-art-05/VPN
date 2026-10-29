import { getState, addTorPreset, AUTO_ID } from "./storage.js";

const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

function render(state) {
  const { servers, activeId, connected, levelOfControl, searching, autoStatus } = state;
  const active = servers.find((s) => s.id === activeId);

  $("server").innerHTML = "";
  for (const s of servers) {
    const opt = new Option(s.name || `${s.host}:${s.port}`, s.id, false, s.id === activeId);
    $("server").add(opt);
  }

  $("empty").hidden = servers.length > 0;
  $("toggle").disabled = servers.length === 0 || searching;
  $("server").disabled = searching;
  $("toggle").setAttribute("aria-pressed", String(connected && !searching));
  $("toggleLabel").textContent = searching ? "Connecting…" : connected ? "Disconnect" : "Connect";
  $("status").textContent =
    autoStatus || (connected && active ? `Connected via ${active.auto ? `free server ${active.host}` : active.tor ? "Tor (Russia)" : active.name || active.host}` : "Not connected");
  $("newServer").hidden = !(connected && activeId === AUTO_ID) || searching;

  const blocked = levelOfControl === "controlled_by_other_extensions" || levelOfControl === "not_controllable";
  $("warning").hidden = !blocked;
  $("warning").textContent = blocked ? "Another extension or policy controls Chrome's proxy settings. Disable it to use Simple VPN." : "";
}

// Shows the IP websites see, plus its country when the lookup service answers.
async function lookupIp() {
  try {
    const res = await fetch("https://ipwho.is/", { cache: "no-store" });
    const data = await res.json();
    if (data.success) return `${data.ip} · ${[data.city, data.country].filter(Boolean).join(", ")}`;
  } catch {}
  try {
    const res = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
    return (await res.json()).ip;
  } catch {
    return "Could not reach the internet through this server. Try another one.";
  }
}

async function init() {
  render(await send({ type: "reapply" }).catch(getState));

  $("toggle").addEventListener("click", async () => {
    const { connected } = await getState();
    $("ip").textContent = "";
    const msg = connected ? { type: "disconnect" } : { type: "connect", id: $("server").value };
    if (msg.type === "connect") render({ ...(await getState()), searching: msg.id === AUTO_ID });
    render(await send(msg));
  });

  $("newServer").addEventListener("click", async () => {
    $("ip").textContent = "";
    render({ ...(await getState()), searching: true });
    render(await send({ type: "newServer" }));
  });

  // Live progress while the background searches for a free server.
  chrome.storage.onChanged.addListener(async (changes) => {
    if (changes.autoStatus || changes.connected) render(await send({ type: "status" }));
  });

  $("server").addEventListener("change", async () => {
    const { connected } = await getState();
    if (connected) {
      if ($("server").value === AUTO_ID) render({ ...(await getState()), searching: true });
      render(await send({ type: "connect", id: $("server").value }));
    }
    else await chrome.storage.local.set({ activeId: $("server").value });
  });

  $("checkIp").addEventListener("click", async () => {
    $("ip").textContent = "Checking…";
    $("ip").textContent = await lookupIp();
  });

  $("addTor").addEventListener("click", async (e) => {
    e.preventDefault();
    await addTorPreset("browser");
    render(await send({ type: "reapply" }));
  });

  const openOptions = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
  $("settings").addEventListener("click", openOptions);
  $("addServer").addEventListener("click", openOptions);
}

init();
