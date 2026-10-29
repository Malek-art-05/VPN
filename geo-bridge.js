// Runs in the extension's isolated world: reads settings and hands the
// spoofed position (or null) to geo-main.js in the page's world.
let answer;
const reply = () => window.dispatchEvent(new CustomEvent("__simplevpn_geo", { detail: answer }));

chrome.storage.local.get({ connected: false, geo: null }).then(({ connected, geo }) => {
  const coords = connected && geo?.enabled ? { latitude: Number(geo.latitude), longitude: Number(geo.longitude) } : null;
  answer = JSON.stringify(coords);
  reply();
});

// In case geo-main.js started listening after we first replied.
window.addEventListener("__simplevpn_geo_request", () => answer !== undefined && reply());
