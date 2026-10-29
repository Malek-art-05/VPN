import { getState, setState, newId, addTorPreset, AUTO_ID } from "./storage.js";

const $ = (id) => document.getElementById(id);
const fields = ["id", "name", "scheme", "host", "port", "username", "password"];

async function render() {
  const { servers, activeId, connected, bypassList } = await getState();
  const list = $("list");
  list.innerHTML = "";

  for (const s of servers) {
    const li = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "meta";
    const live = connected && s.id === activeId ? " · connected" : "";
    meta.innerHTML = `<div></div><div class="sub"></div>`;
    meta.children[0].textContent = s.name || s.host;
    meta.children[1].textContent = s.auto
      ? `Picks a free public proxy in Russia when you connect${s.host ? ` · last used ${s.host}` : ""}${live}`
      : `${s.scheme}://${s.host}:${s.port}${s.username ? " · auth" : ""}${live}`;
    if (s.tor) meta.children[1].textContent = `Starts Tor in the background and exits in Russia (needs the helper, see README)${live}`;
    if (s.auto || s.tor) {
      li.append(meta);
      list.append(li);
      continue;
    }

    const edit = Object.assign(document.createElement("button"), { textContent: "Edit" });
    edit.onclick = () => fillForm(s);
    const del = Object.assign(document.createElement("button"), { textContent: "Delete" });
    del.onclick = () => removeServer(s.id);

    li.append(meta, edit, del);
    list.append(li);
  }

  $("bypass").value = bypassList.join("\n");

  const { geo, autoConnect } = await getState();
  $("autoConnect").checked = autoConnect;
  $("geoEnabled").checked = geo.enabled;
  $("geoTimezone").checked = geo.timezone !== false;
  $("geoLabel").value = geo.label;
  $("geoLat").value = geo.latitude;
  $("geoLon").value = geo.longitude;
}

function fillForm(server) {
  for (const f of fields) $(f).value = server?.[f] ?? (f === "scheme" ? "http" : "");
  $("formTitle").textContent = server ? "Edit server" : "Add a server";
  $("save").textContent = server ? "Save changes" : "Add server";
  $("cancel").hidden = !server;
  updateSocksHint();
}

function updateSocksHint() {
  const socks = $("scheme").value.startsWith("socks");
  $("socksHint").hidden = !socks;
  $("authRow").hidden = socks;
}

async function removeServer(id) {
  const { servers, activeId } = await getState();
  const patch = { servers: servers.filter((s) => s.id !== id) };
  if (id === activeId) Object.assign(patch, { activeId: AUTO_ID, connected: false });
  await setState(patch);
  await chrome.runtime.sendMessage({ type: "reapply" });
  render();
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const server = Object.fromEntries(fields.map((f) => [f, $(f).value.trim()]));
  server.port = Number(server.port);
  if (server.scheme.startsWith("socks")) server.username = server.password = "";

  const { servers, activeId } = await getState();
  if (server.id) {
    const i = servers.findIndex((s) => s.id === server.id);
    servers[i] = server;
  } else {
    server.id = newId();
    servers.push(server);
  }
  await setState({ servers, activeId: activeId ?? server.id });
  await chrome.runtime.sendMessage({ type: "reapply" });
  fillForm(null);
  render();
});

for (const [button, kind] of [["torBrowser", "browser"], ["torService", "service"]]) {
  $(button).addEventListener("click", async () => {
    await addTorPreset(kind);
    await chrome.runtime.sendMessage({ type: "reapply" });
    render();
  });
}

$("autoConnect").addEventListener("change", () => setState({ autoConnect: $("autoConnect").checked }));

$("cancel").addEventListener("click", () => fillForm(null));
$("scheme").addEventListener("change", updateSocksHint);

$("saveBypass").addEventListener("click", async () => {
  const bypassList = $("bypass").value.split("\n").map((l) => l.trim()).filter(Boolean);
  await setState({ bypassList });
  await chrome.runtime.sendMessage({ type: "reapply" });
  $("saved").textContent = "Saved";
  setTimeout(() => ($("saved").textContent = ""), 1500);
});

$("geoForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await setState({
    geo: {
      enabled: $("geoEnabled").checked,
      timezone: $("geoTimezone").checked,
      label: $("geoLabel").value.trim(),
      latitude: Number($("geoLat").value),
      longitude: Number($("geoLon").value)
    }
  });
  await chrome.runtime.sendMessage({ type: "reapply" });
  $("geoSaved").textContent = "Saved";
  setTimeout(() => ($("geoSaved").textContent = ""), 1500);
});

render();
fillForm(null);
