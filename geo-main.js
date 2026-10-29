// Runs in the page's world so it can replace navigator.geolocation.
// Waits for geo-bridge.js to say whether to spoof; falls back to the real API.
(() => {
  const geo = navigator.geolocation;
  if (!geo) return;
  const real = {
    get: geo.getCurrentPosition.bind(geo),
    watch: geo.watchPosition.bind(geo),
    clear: geo.clearWatch.bind(geo)
  };

  const ready = new Promise((resolve) => {
    window.addEventListener("__simplevpn_geo", (e) => resolve(JSON.parse(e.detail)), { once: true });
  });
  window.dispatchEvent(new Event("__simplevpn_geo_request"));

  const position = (c) => ({
    coords: { latitude: c.latitude, longitude: c.longitude, accuracy: 30, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
    timestamp: Date.now()
  });

  let nextId = 1;
  const watches = new Map();

  geo.getCurrentPosition = function (success, error, options) {
    ready.then((c) => (c ? success(position(c)) : real.get(success, error, options)));
  };

  geo.watchPosition = function (success, error, options) {
    const id = nextId++;
    ready.then((c) => {
      if (!watches.has(id)) return;
      if (c) success(position(c));
      else watches.set(id, real.watch(success, error, options));
    });
    watches.set(id, null);
    return id;
  };

  geo.clearWatch = function (id) {
    const realId = watches.get(id);
    if (realId != null) real.clear(realId);
    watches.delete(id);
  };
})();
