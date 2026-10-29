// Runs in the page's world before its scripts, only while connected
// (background.js registers it). Makes Date and Intl report Moscow time.
// Moscow has been UTC+3 with no daylight saving since 2014.
(() => {
  const TZ = "Europe/Moscow";
  const OFFSET = -180; // getTimezoneOffset() value: minutes from local time to UTC
  const SHIFT = -OFFSET * 60000;

  const RealDate = Date;
  const proto = RealDate.prototype;
  const real = {
    getTime: proto.getTime,
    setTime: proto.setTime,
    offset: proto.getTimezoneOffset,
    toLocaleString: proto.toLocaleString,
    toLocaleDateString: proto.toLocaleDateString,
    toLocaleTimeString: proto.toLocaleTimeString,
    parse: RealDate.parse
  };

  // A Date whose UTC fields read as Moscow wall-clock time.
  const wall = (d) => new RealDate(real.getTime.call(d) + SHIFT);

  // Treat a wall-clock time the browser parsed as local as Moscow time instead.
  const fromRealLocal = (t) => t - (real.offset.call(new RealDate(t)) - OFFSET) * 60000;
  const hasZone = (s) => /(Z|[+-]\d\d:?\d\d|GMT|UTC)\s*(\(.*\))?\s*$/i.test(s) || /^\d{4}(-\d\d){0,2}$/.test(s.trim());
  const parse = (s) => {
    const t = real.parse(s);
    return Number.isNaN(t) || hasZone(String(s)) ? t : fromRealLocal(t);
  };

  function SpoofedDate(...args) {
    if (!new.target) return new SpoofedDate().toString();
    let d;
    if (args.length === 0) d = new RealDate();
    else if (args.length === 1 && typeof args[0] === "string") d = new RealDate(parse(args[0]));
    else if (args.length === 1) d = new RealDate(args[0]);
    else d = new RealDate(RealDate.UTC(...args) - SHIFT);
    return Reflect.construct(RealDate, [real.getTime.call(d)], new.target);
  }
  SpoofedDate.prototype = proto;
  SpoofedDate.now = RealDate.now;
  SpoofedDate.UTC = RealDate.UTC;
  SpoofedDate.parse = parse;
  Object.defineProperty(proto, "constructor", { value: SpoofedDate, writable: true, configurable: true });
  window.Date = SpoofedDate;

  const define = (name, fn) => Object.defineProperty(proto, name, { value: fn, writable: true, configurable: true });

  define("getTimezoneOffset", function () { return OFFSET; });

  for (const f of ["FullYear", "Month", "Date", "Day", "Hours", "Minutes", "Seconds", "Milliseconds"]) {
    define(`get${f}`, function () {
      return Number.isNaN(real.getTime.call(this)) ? NaN : wall(this)[`getUTC${f}`]();
    });
    if (f === "Day") continue;
    define(`set${f}`, function (...args) {
      const w = wall(this);
      w[`setUTC${f}`](...args);
      return real.setTime.call(this, real.getTime.call(w) - SHIFT);
    });
  }

  const pad = (n) => String(n).padStart(2, "0");
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dateString = (w) => `${DAYS[w.getUTCDay()]} ${MONTHS[w.getUTCMonth()]} ${pad(w.getUTCDate())} ${w.getUTCFullYear()}`;
  const timeString = (w) => `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}:${pad(w.getUTCSeconds())} GMT+0300 (Moscow Standard Time)`;
  const guard = (fn) => function () { return Number.isNaN(real.getTime.call(this)) ? "Invalid Date" : fn(wall(this)); };

  define("toString", guard((w) => `${dateString(w)} ${timeString(w)}`));
  define("toDateString", guard(dateString));
  define("toTimeString", guard(timeString));

  const withZone = (o) => (o && o.timeZone !== undefined ? o : { ...o, timeZone: TZ });
  for (const name of ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"]) {
    define(name, function (locales, options) { return real[name].call(this, locales, withZone(options)); });
  }

  const RealDTF = Intl.DateTimeFormat;
  function SpoofedDTF(locales, options) {
    return Reflect.construct(RealDTF, [locales, withZone(options)], new.target || RealDTF);
  }
  SpoofedDTF.prototype = RealDTF.prototype;
  SpoofedDTF.supportedLocalesOf = RealDTF.supportedLocalesOf;
  Object.defineProperty(RealDTF.prototype, "constructor", { value: SpoofedDTF, writable: true, configurable: true });
  Intl.DateTimeFormat = SpoofedDTF;
})();
