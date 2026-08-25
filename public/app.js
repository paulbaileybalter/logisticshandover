/**
 * BALTER BREWING — LOGISTICS DAILY HANDOVER
 * Application logic (no build step, no framework — plain JS)
 */
(function () {
  "use strict";

  /* ---------------------------------------------------------
     CONSTANTS
  --------------------------------------------------------- */
  var LS_PREFIX = "balterLogistics:";
  var LS_DAY = LS_PREFIX + "day:";
  var LS_INDEX = LS_PREFIX + "index";

  var LOCKUP_OPTIONS_LOGISTICS = ["Logistics", "Packaging", "Brewing", "Taproom", "Other"];

  var PLAN_STATUS_OPTIONS = ["Cleared", "Not cleared"];

  var STAFF_OPTIONS = ["Jules", "Jack", "Nigel", "Chris", "Reed", "Rick"];
  var ROSTER_TIME_OPTIONS = ["6am", "630am", "7am", "730am", "8am", "830am", "9am"];

  var DEFAULT_CHECKS = [
    "Daily forklift pre checks",
    "Double check product batches before picking",
    "Complete pick sheets before loading on trucks",
    "Drivers: empty keg pick ups whilst delivering (Cub kegs only)"
  ];

  // Safety messages sourced from the "Safety" tab of the original Excel
  // handover workbook, cleaned up (collapsed whitespace, straight quotes).
  // One is shown per day, rotating in order and looping back to the start —
  // deterministic by calendar date, so every device shows the same one.
  var SAFETY_MESSAGES = [
    "Forklift Awareness: DON'T RUSH. Stay alert and be aware of your surroundings. Look over both shoulders before reversing, and keep your eyes focused on the direction of travel. Be cautious of blind corners; sound the horn and check your surroundings before proceeding through roller doors or around corners.",
    "Forklift Operation: STAY FOCUSED. Never use your phone while operating a forklift. Keep both hands on the controls and your eyes on the path ahead. Distractions cause accidents, only check your picklist when safely parked in a designated area.",
    "Forklift Safety: KEEP SPEED UNDER CONTROL. Operate at a safe speed at all times, especially in high-traffic areas and around pedestrians. Slow down on corners, near doors, and when the floor surface is uneven or wet. Speed reduces reaction time and increases stopping distance.",
    "Forklift Stability: CARRY LOADS SAFELY. Always keep loads low and tilted back when travelling. Never lift or move unstable, damaged, or poorly wrapped pallets. If the load blocks your view, travel in reverse and ask for a spotter if required.",
    "Forklift Communication: SHARE THE SPACE. Make eye contact with pedestrians and other operators whenever possible. Use the horn to communicate your movement and follow site traffic rules and designated walkways. Never assume others have seen you.",
    "Ensure safe manual handling by checking the load and path for hazards, maintaining proper balance, and using correct lifting techniques. Bending your knees, keeping your back straight, and lifting with your legs.",
    "Stretching, staying hydrated, and checking in with teammates can help keep our minds and bodies strong. Take care of yourself so we can all keep moving forward together!",
    "If you're feeling overwhelmed, don't hesitate to ask for help. Likewise, if you see a teammate struggling, step in or check in. Supporting each other creates a positive environment where we all succeed together. A strong team isn't just about hard work; it's about having each other's backs.",
    "Encourage reporting of mistakes, near misses, or concerns without fear. Learning from issues strengthens compliance and prevents repeat incidents.",
    "With hotter days coming, hydration is just as important as PPE. Don't wait until you're thirsty, drink water regularly throughout the shift to stay ahead of dehydration. Keep a water bottle close by and refill it often, especially if you're working outside or doing physical tasks.",
    "Operate vehicles safely within the yard and expect the same from all drivers. Your behaviour directly influences the safety culture on site and sets the example.",
    "If you can't see, don't move. Whether it's due to a tall load, fogged windows, or blind corners, don't guess. Ask for a spotter if needed and never drive in reverse unless you have full vision.",
    "Rain means slower forklifts, cautious walking, and dry hands on gear. Let's stay off the phone while walking outside and keep eyes on the ground.",
    "We talk about physical safety all the time, but mental health matters just as much. If you notice someone's not themselves, quiet, flat, or off their game, check in. A quick 'you all good?' can go a long way."
  ];
  // Whole calendar-day number since the Unix epoch, computed in UTC so it's
  // stable regardless of the browser's local timezone/DST.
  function dayNumber(dateISO) {
    var p = dateISO.split("-").map(Number);
    return Math.floor(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);
  }
  function getSafetyMessageForDate(dateISO) {
    var n = SAFETY_MESSAGES.length;
    var idx = ((dayNumber(dateISO) % n) + n) % n;
    return SAFETY_MESSAGES[idx];
  }

  var LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 161 161" width="36" height="36"><path fill="#0d6a4d" d="M136.3,70.4l-9.4-9.4c-1.6-1.6-4.3-1.6-6,0-1.6,1.6-1.6,4.3,0,6l2.3,2.3c-9.6,13.2-25.2,21.7-42.7,21.7s-33.1-8.6-42.7-21.8l2.3-2.3c1.6-1.6,1.6-4.3,0-6-1.6-1.6-4.3-1.6-6,0l-9.4,9.4c-1.6,1.6-1.6,4.3,0,6,.8.8,1.9,1.2,3,1.2s2.2-.4,3-1.2l1.1-1.1c11.2,14.7,28.9,24.2,48.7,24.2s37.5-9.5,48.7-24.2l1.1,1.1c.8.8,1.9,1.2,3,1.2s2.2-.4,3-1.2c1.6-1.6,1.6-4.3,0-6"/><path fill="#0d6a4d" d="M152.5,8.5v144H8.5V8.5h144M161,0H0v161h161V0h0Z"/></svg>';

  var uidCounter = 0;
  function uid() { uidCounter += 1; return "r" + Date.now().toString(36) + uidCounter; }

  /* ---------------------------------------------------------
     DATE HELPERS
  --------------------------------------------------------- */
  function todayISO() { return toISO(new Date()); }
  function toISO(d) {
    var y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }
  function parseISO(iso) {
    var parts = iso.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  function addDays(iso, n) {
    var d = parseISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }
  function formatPretty(iso) {
    if (!iso) return "";
    var d = parseISO(iso);
    return d.toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  function formatBanner(iso) {
    if (!iso) return "";
    var d = parseISO(iso);
    var weekday = d.toLocaleDateString("en-AU", { weekday: "long" });
    var dd = String(d.getDate()).padStart(2, "0");
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var yy = String(d.getFullYear()).slice(-2);
    return weekday + ", " + dd + "/" + mm + "/" + yy;
  }

  /* ---------------------------------------------------------
     STATE FACTORIES
  --------------------------------------------------------- */
  function newDailyState(dateISO) {
    return {
      date: dateISO,
      wrapUp: [""],
      amPriorities: [""],
      lockups: { logistics: "", cr1: "" },
      outbounds: [newOutbound()],
      inbounds: [newInbound()],
      deliveries: [newDelivery()],
      packagingPlan: { cases: [newPlanRow(), newPlanRow()], kegs: [newPlanRow(), newPlanRow()] },
      checks: DEFAULT_CHECKS.map(function (t) { return { id: uid(), text: t, done: false }; }),
      roster: [newRoster(), newRoster(), newRoster()],
      whoOff: "",
      safety: getSafetyMessageForDate(dateISO),
      weather: { temp: "", uv: "", humidity: "", rain: "", source: "" },
      updatedAt: Date.now()
    };
  }
  function newOutbound() { return { id: uid(), destination: "", note: "", qty: "" }; }
  function newInbound() { return { id: uid(), item: "", qty: "" }; }
  function newDelivery() { return { id: uid(), name: "", note: "" }; }
  function newPlanRow() { return { id: uid(), sku: "", location: "", status: "" }; }
  function newRoster() { return { id: uid(), time: "", name: "" }; }
  function newCheck() { return { id: uid(), text: "", done: false }; }

  /* ---------------------------------------------------------
     SANITIZERS — repair/migrate any saved record (local or
     cloud) that predates a data-model change.
  --------------------------------------------------------- */
  function sanitizeStrList(arr) {
    var out = (Array.isArray(arr) ? arr : []).filter(function (v) { return typeof v === "string"; });
    return out.length ? out : [""];
  }
  function sanitizeOutbound(r) { r = r || {}; return { id: r.id || uid(), destination: r.destination || "", note: r.note || "", qty: r.qty != null ? r.qty : "" }; }
  function sanitizeInbound(r) { r = r || {}; return { id: r.id || uid(), item: r.item || "", qty: r.qty != null ? r.qty : "" }; }
  function sanitizeDelivery(r) { r = r || {}; return { id: r.id || uid(), name: r.name || "", note: r.note || "" }; }
  function sanitizePlanRow(r) { r = r || {}; return { id: r.id || uid(), sku: r.sku || "", location: r.location || "", status: r.status || "" }; }
  function sanitizeRoster(r) { r = r || {}; return { id: r.id || uid(), time: r.time || "", name: r.name || "" }; }
  function sanitizeCheck(r) { r = r || {}; return { id: r.id || uid(), text: typeof r.text === "string" ? r.text : "", done: r.done === true }; }

  function sanitizeDaily(d, dateISO) {
    var out = newDailyState(dateISO);
    if (!d || typeof d !== "object") return out;

    out.wrapUp = sanitizeStrList(d.wrapUp);
    out.amPriorities = sanitizeStrList(d.amPriorities);
    if (d.lockups) {
      out.lockups.logistics = typeof d.lockups.logistics === "string" ? d.lockups.logistics : "";
      out.lockups.cr1 = typeof d.lockups.cr1 === "string" ? d.lockups.cr1 : "";
    }
    out.outbounds = (Array.isArray(d.outbounds) && d.outbounds.length) ? d.outbounds.map(sanitizeOutbound) : out.outbounds;
    out.inbounds = (Array.isArray(d.inbounds) && d.inbounds.length) ? d.inbounds.map(sanitizeInbound) : out.inbounds;
    out.deliveries = (Array.isArray(d.deliveries) && d.deliveries.length) ? d.deliveries.map(sanitizeDelivery) : out.deliveries;

    if (d.packagingPlan) {
      out.packagingPlan.cases = (Array.isArray(d.packagingPlan.cases) && d.packagingPlan.cases.length) ? d.packagingPlan.cases.map(sanitizePlanRow) : out.packagingPlan.cases;
      out.packagingPlan.kegs = (Array.isArray(d.packagingPlan.kegs) && d.packagingPlan.kegs.length) ? d.packagingPlan.kegs.map(sanitizePlanRow) : out.packagingPlan.kegs;
    }

    out.checks = (Array.isArray(d.checks) && d.checks.length) ? d.checks.map(sanitizeCheck) : out.checks;
    out.roster = (Array.isArray(d.roster) && d.roster.length) ? d.roster.map(sanitizeRoster) : out.roster;
    out.whoOff = typeof d.whoOff === "string" ? d.whoOff : "";
    out.safety = typeof d.safety === "string" ? d.safety : out.safety;

    if (d.weather) {
      out.weather.temp = d.weather.temp != null ? d.weather.temp : "";
      out.weather.uv = d.weather.uv != null ? d.weather.uv : "";
      out.weather.humidity = d.weather.humidity != null ? d.weather.humidity : "";
      out.weather.rain = d.weather.rain != null ? d.weather.rain : "";
      out.weather.source = typeof d.weather.source === "string" ? d.weather.source : "";
    }

    out.updatedAt = typeof d.updatedAt === "number" ? d.updatedAt : Date.now();
    return out;
  }

  /* ---------------------------------------------------------
     LOCAL STORAGE
  --------------------------------------------------------- */
  function lsGet(key) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage full / unavailable */ }
  }
  function addToIndex(dateISO) {
    var idx = lsGet(LS_INDEX) || [];
    if (idx.indexOf(dateISO) === -1) { idx.push(dateISO); idx.sort().reverse(); lsSet(LS_INDEX, idx); }
  }

  /* ---------------------------------------------------------
     APP STATE
  --------------------------------------------------------- */
  var App = { date: todayISO(), daily: null, saveTimer: null, pollTimer: null, dirty: false };

  /* ---------------------------------------------------------
     LOAD / SWITCH DAY
  --------------------------------------------------------- */
  function loadDay(dateISO) {
    App.date = dateISO;
    var raw = lsGet(LS_DAY + dateISO);
    var daily;
    if (!raw) {
      daily = newDailyState(dateISO);
      // Carry the previous day's wrap-up over as a starting point for today,
      // since it doubles as "yesterday's handover notes" at the top of the sheet.
      var idx = lsGet(LS_INDEX) || [];
      var prevDate = idx.filter(function (d) { return d !== dateISO; })[0];
      if (prevDate) {
        var prevRaw = lsGet(LS_DAY + prevDate);
        if (prevRaw) {
          var prevClean = sanitizeDaily(prevRaw, prevDate);
          daily.wrapUp = JSON.parse(JSON.stringify(prevClean.wrapUp));
        }
      }
    } else {
      daily = sanitizeDaily(raw, dateISO);
    }
    App.daily = daily;
    addToIndex(dateISO);
    renderAll();
    document.getElementById("sheetDate").value = dateISO;
    autoFillWeatherIfBlank();
  }

  function saveNow(toastMsg) {
    if (!App.daily) return;
    App.daily.updatedAt = Date.now();
    lsSet(LS_DAY + App.date, App.daily);
    addToIndex(App.date);
    App.dirty = false;
    setSyncStatus("saved");
    if (toastMsg) showToast(toastMsg);
    pushToCloud();
  }

  function scheduleSave() {
    App.dirty = true;
    setSyncStatus("saving");
    clearTimeout(App.saveTimer);
    App.saveTimer = setTimeout(function () { saveNow(false); }, 600);
  }

  /* ---------------------------------------------------------
     CLOUD SYNC — proxied server-side through this site's own Worker
     at /api/sync. The real JSONBin API key lives only in the Worker's
     secrets and never reaches this file or the browser. Availability is
     discovered at runtime (the Worker returns 501 if it has no JSONBin
     secrets configured) rather than read from a client-side config value.
  --------------------------------------------------------- */
  var cloudCfg = (window.HANDOVER_CONFIG && window.HANDOVER_CONFIG.cloudSync) || {};
  var cloudState = "unknown"; // "unknown" | "available" | "unavailable"

  function cloudReady() { return cloudState === "available"; }

  function pushToCloud() {
    if (cloudState === "unavailable") return;
    fetchCloud().then(function (remote) {
      if (cloudState === "unavailable") return null;
      remote = remote || { days: {} };
      remote.days = remote.days || {};
      remote.days[App.date] = App.daily;
      remote.savedAt = Date.now();
      return fetch("/api/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(remote)
      });
    }).then(function (res) {
      if (!res) return;
      if (res.status === 501) { cloudState = "unavailable"; setSyncStatus("saved"); return; }
      if (res.ok) { cloudState = "available"; setSyncStatus("saved"); }
      else setSyncStatus("error");
    }).catch(function () { setSyncStatus("error"); });
  }

  // Resolves the current remote record, and — as a side effect — updates
  // cloudState based on what the Worker actually reports (501 = no
  // JSONBin secrets configured server-side, so sync is simply off).
  function fetchCloud() {
    return fetch("/api/sync").then(function (res) {
      if (res.status === 501) { cloudState = "unavailable"; return null; }
      if (!res.ok) return null;
      cloudState = "available";
      return res.json();
    }).then(function (json) { return json && json.record ? json.record : null; })
      .catch(function () { return null; });
  }

  function pullFromCloud(isBackground) {
    if (cloudState === "unavailable") return Promise.resolve();
    if (!isBackground) setSyncStatus("saving");
    return fetchCloud().then(function (remote) {
      if (cloudState === "unavailable") { setSyncStatus("saved"); return; }
      if (!remote) { if (!isBackground) setSyncStatus("saved"); return; }
      var remoteDayRaw = remote.days && remote.days[App.date];
      if (remoteDayRaw && (!App.daily.updatedAt || remoteDayRaw.updatedAt > App.daily.updatedAt)) {
        App.daily = sanitizeDaily(remoteDayRaw, App.date);
        renderAll();
        showToast("Updated from another device");
      }
      setSyncStatus("saved");
    }).catch(function () { setSyncStatus("error"); });
  }

  function setSyncStatus(state) {
    var dot = document.getElementById("syncDot");
    var text = document.getElementById("syncText");
    dot.className = "sync-dot";
    if (state === "checking") { dot.classList.add("is-saving"); text.textContent = "Checking sync…"; }
    else if (state === "saving") { dot.classList.add("is-saving"); text.textContent = "Saving…"; }
    else if (state === "error") { dot.classList.add("is-error"); text.textContent = cloudReady() ? "Sync error — saved locally" : "Saved to this device"; }
    else {
      dot.classList.add("is-saved");
      text.textContent = cloudReady() ? "Synced across devices" : "Saved to this device";
    }
  }

  /* ---------------------------------------------------------
     WEATHER AUTO-FILL (optional — Open-Meteo, configured in config.js)
  --------------------------------------------------------- */
  var weatherCfg = (window.HANDOVER_CONFIG && window.HANDOVER_CONFIG.weather) || { enabled: false };

  function weatherReady() { return !!(weatherCfg.enabled && weatherCfg.latitude != null && weatherCfg.longitude != null); }

  function weatherIsBlank(w) { return !w.temp && !w.uv && !w.humidity && !w.rain; }

  // Fetches day-aggregate forecast/observed values for the given date from
  // Open-Meteo's free, no-key API (CORS-enabled, safe to call directly from
  // the browser). Works for the current day, a few months of recent past,
  // and up to 16 days ahead, so it covers normal handover use whichever
  // date is open on the sheet.
  function fetchWeatherForDate(dateISO) {
    if (!weatherReady()) return Promise.resolve(null);
    var params = [
      "latitude=" + encodeURIComponent(weatherCfg.latitude),
      "longitude=" + encodeURIComponent(weatherCfg.longitude),
      "start_date=" + dateISO,
      "end_date=" + dateISO,
      "daily=temperature_2m_max,relative_humidity_2m_mean,uv_index_max,precipitation_sum",
      "timezone=" + encodeURIComponent(weatherCfg.timezone || "auto")
    ];
    var url = "https://api.open-meteo.com/v1/forecast?" + params.join("&");
    return fetch(url).then(function (res) { return res.ok ? res.json() : null; })
      .then(function (json) {
        if (!json || !json.daily || !Array.isArray(json.daily.time) || !json.daily.time.length) return null;
        var d = json.daily;
        var temp = d.temperature_2m_max ? d.temperature_2m_max[0] : null;
        var humidity = d.relative_humidity_2m_mean ? d.relative_humidity_2m_mean[0] : null;
        var uv = d.uv_index_max ? d.uv_index_max[0] : null;
        var rain = d.precipitation_sum ? d.precipitation_sum[0] : null;
        return {
          temp: (temp != null) ? String(Math.round(temp)) : "",
          humidity: (humidity != null) ? String(Math.round(humidity)) + "%" : "",
          uv: (uv != null) ? String(Math.round(uv * 10) / 10) : "",
          rain: (rain != null) ? (rain > 0 ? (Math.round(rain * 10) / 10) + " mm" : "-") : ""
        };
      }).catch(function () { return null; });
  }

  // Auto-fills weather for the day after the sheet date currently open
  // (i.e. tomorrow's forecast), but only when every field is still blank —
  // never overwrites something someone typed in.
  function autoFillWeatherIfBlank() {
    if (!weatherReady() || !App.daily) return;
    if (!weatherIsBlank(App.daily.weather)) return;
    var forDate = addDays(App.date, 1);
    fetchWeatherForDate(forDate).then(function (result) {
      if (!result || forDate !== addDays(App.date, 1)) return; // sheet may have moved on while this was in flight
      if (!weatherIsBlank(App.daily.weather)) return; // someone typed in the meantime
      App.daily.weather.temp = result.temp;
      App.daily.weather.humidity = result.humidity;
      App.daily.weather.uv = result.uv;
      App.daily.weather.rain = result.rain;
      App.daily.weather.source = "auto";
      scheduleSave();
      renderRosterForecast();
    });
  }

  // Manual "refresh weather" — always overwrites, used by the button in
  // the Tomorrow's Forecast panel.
  function refreshWeatherNow() {
    if (!weatherReady()) return;
    var forDate = addDays(App.date, 1);
    setWeatherStatus("loading");
    fetchWeatherForDate(forDate).then(function (result) {
      if (forDate !== addDays(App.date, 1)) return;
      if (!result) { setWeatherStatus("error"); return; }
      App.daily.weather.temp = result.temp;
      App.daily.weather.humidity = result.humidity;
      App.daily.weather.uv = result.uv;
      App.daily.weather.rain = result.rain;
      App.daily.weather.source = "auto";
      scheduleSave();
      renderRosterForecast();
    });
  }

  function setWeatherStatus(state) {
    var el = document.getElementById("weatherStatus");
    if (!el) return;
    if (state === "loading") el.textContent = "Fetching forecast…";
    else if (state === "error") el.textContent = "Couldn't fetch weather — enter manually.";
    else el.textContent = "";
  }

  /* ---------------------------------------------------------
     GENERIC ROW BINDING
  --------------------------------------------------------- */
  function bindRowInputs(el, collection, rerender) {
    el.querySelectorAll("[data-row] [data-f]").forEach(function (field) {
      var evt = (field.tagName === "SELECT" || field.type === "checkbox") ? "change" : "input";
      field.addEventListener(evt, function () {
        var wrap = field.closest("[data-row]");
        var row = collection.filter(function (r) { return r.id === wrap.dataset.row; })[0];
        if (!row) return;
        row[field.dataset.f] = field.type === "checkbox" ? field.checked : field.value;
        scheduleSave();
        if (field.type === "checkbox") rerender();
      });
    });
    el.querySelectorAll("[data-del]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var i = collection.findIndex(function (r) { return r.id === btn.dataset.del; });
        if (i > -1) collection.splice(i, 1);
        if (collection.length === 0) collection.push(newCheck());
        scheduleSave(); rerender();
      });
    });
  }

  function esc(v) {
    if (v === undefined || v === null) return "";
    return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---------------------------------------------------------
     RENDER: ALL
  --------------------------------------------------------- */
  function renderAll() {
    document.getElementById("dateBanner").innerHTML =
      '<span>' + esc(formatBanner(App.date)) + '</span><span class="date-banner__sub">Logistics team handover</span>';
    renderWrap();
    renderOutboundsInbounds();
    renderDeliveries();
    renderPackagingPlan();
    renderSafetyChecks();
    renderRosterForecast();
  }

  /* ---------------------------------------------------------
     RENDER: WRAP UP + AM PRIORITIES + LOCK UPS
  --------------------------------------------------------- */
  function renderWrap() {
    var el = document.getElementById("wrapSection");
    var d = App.daily;

    el.innerHTML =
      '<div class="card__head"><div class="card__head-left"><span class="tab" data-color="mint">01</span><div><h2 class="card__title">Today\u2019s wrap up</h2>' +
      '<p class="card-hint">What\u2019s done, ready for the next shift · ' + formatPretty(App.date) + '</p></div></div></div>' +
      '<div class="card__body wrap-grid">' +
        '<div>' +
          '<div class="wrap-list" id="wrapList">' + lineListHtml("wrapUp", "What got done…") + '</div>' +
          '<button class="add-row-btn" type="button" id="addWrapRow">+ Add line</button>' +
          '<p class="plan-sub" style="margin-top:18px;">AM Priorities</p>' +
          '<div class="wrap-list" id="amList">' + lineListHtml("amPriorities", "What needs doing first…") + '</div>' +
          '<button class="add-row-btn" type="button" id="addAmRow">+ Add line</button>' +
        '</div>' +
        '<div class="lockup-col">' +
          lockupTile("logistics", "Logistics lock up", LOCKUP_OPTIONS_LOGISTICS) +
          lockupTile("cr1", "CR1 lock up", LOCKUP_OPTIONS_LOGISTICS) +
        '</div>' +
      '</div>';

    function lineListHtml(field, placeholder) {
      return d[field].map(function (text, i) {
        return '<div class="wrap-row" data-idx="' + i + '"><span class="wrap-row__dot"></span>' +
          '<input type="text" placeholder="' + placeholder + '" value="' + esc(text) + '" data-line-field="' + field + '" data-line-idx="' + i + '">' +
          '<button class="icon-btn" type="button" data-line-del="' + field + '|' + i + '" title="Remove line">✕</button></div>';
      }).join("");
    }
    function lockupTile(key, label, options) {
      var val = d.lockups[key];
      return '<div class="lockup-tile"><div class="lockup-tile__label">' + label + '</div>' +
        '<select data-lockup="' + key + '"><option value="">— Select —</option>' +
        options.map(function (o) { return '<option value="' + esc(o) + '"' + (o === val ? " selected" : "") + '>' + esc(o) + '</option>'; }).join("") +
        '</select></div>';
    }

    el.querySelectorAll("[data-line-field]").forEach(function (input) {
      input.addEventListener("input", function () {
        d[input.dataset.lineField][Number(input.dataset.lineIdx)] = input.value;
        scheduleSave();
      });
    });
    el.querySelectorAll("[data-line-del]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var parts = btn.dataset.lineDel.split("|");
        var field = parts[0], idx = Number(parts[1]);
        d[field].splice(idx, 1);
        if (d[field].length === 0) d[field].push("");
        scheduleSave(); renderWrap();
      });
    });
    document.getElementById("addWrapRow").addEventListener("click", function () {
      d.wrapUp.push("");
      scheduleSave(); renderWrap();
    });
    document.getElementById("addAmRow").addEventListener("click", function () {
      d.amPriorities.push("");
      scheduleSave(); renderWrap();
    });
    el.querySelectorAll("[data-lockup]").forEach(function (select) {
      select.addEventListener("change", function () {
        d.lockups[select.dataset.lockup] = select.value;
        scheduleSave();
      });
    });
  }

  /* ---------------------------------------------------------
     RENDER: OUTBOUNDS + INBOUNDS
  --------------------------------------------------------- */
  function renderOutboundsInbounds() {
    var el = document.getElementById("odSection");
    var d = App.daily;
    var outQty = d.outbounds.reduce(function (s, r) { var v = parseFloat(r.qty); return s + (isNaN(v) ? 0 : v); }, 0);
    var inQty = d.inbounds.reduce(function (s, r) { var v = parseFloat(r.qty); return s + (isNaN(v) ? 0 : v); }, 0);

    el.innerHTML =
      '<div class="card__head"><div class="card__head-left"><span class="tab" data-color="purple">02</span><div><h2 class="card__title">Outbound &amp; inbound</h2>' +
      '<p class="card-hint">Trucks, transfers, and stock movements for ' + formatPretty(addDays(App.date, 1)) + '</p></div></div></div>' +
      '<div class="card__body od-grid">' +
        '<div class="od-pane">' +
          '<div class="od-pane__head"><span class="od-pane__title">Outbound</span><span class="od-pane__count">Qty ' + fmtNum(outQty) + '</span></div>' +
          '<div class="table-scroll"><table class="dtable"><thead><tr><th class="col-dest">Destination</th><th class="col-qty">Qty</th><th class="col-narrow"></th></tr></thead>' +
          '<tbody>' + d.outbounds.map(outRow).join("") + '</tbody></table></div>' +
          '<button class="add-row-btn" type="button" id="addOutbound">+ Add outbound</button>' +
        '</div>' +
        '<div class="od-pane">' +
          '<div class="od-pane__head"><span class="od-pane__title">Inbound</span><span class="od-pane__count">Qty ' + fmtNum(inQty) + '</span></div>' +
          '<div class="table-scroll"><table class="dtable"><thead><tr><th>Suppliers</th><th class="col-qty">Qty</th><th class="col-narrow"></th></tr></thead>' +
          '<tbody>' + d.inbounds.map(inRow).join("") + '</tbody></table></div>' +
          '<button class="add-row-btn" type="button" id="addInbound">+ Add inbound</button>' +
        '</div>' +
      '</div>';

    function outRow(r) {
      return '<tr data-row="' + r.id + '">' +
        '<td><input class="cell-input cell-input--strong cell-input--lg" data-f="destination" value="' + esc(r.destination) + '" placeholder="e.g. VW Melb (MUVE) — ready"></td>' +
        '<td><input class="cell-input cell-input--num" data-f="qty" value="' + esc(r.qty) + '"></td>' +
        '<td class="row-actions"><button class="icon-btn" type="button" data-del="' + r.id + '" title="Remove row">✕</button></td>' +
      '</tr>';
    }
    function inRow(r) {
      return '<tr data-row="' + r.id + '">' +
        '<td><input class="cell-input cell-input--strong" data-f="item" value="' + esc(r.item) + '" placeholder="e.g. Westrock"></td>' +
        '<td><input class="cell-input cell-input--num" data-f="qty" value="' + esc(r.qty) + '" placeholder="e.g. 1 pallet"></td>' +
        '<td class="row-actions"><button class="icon-btn" type="button" data-del="' + r.id + '" title="Remove row">✕</button></td>' +
      '</tr>';
    }

    bindRowInputsSafe(el.querySelector(".od-pane:nth-child(1)"), d.outbounds, renderOutboundsInbounds, sanitizeOutbound);
    bindRowInputsSafe(el.querySelector(".od-pane:nth-child(2)"), d.inbounds, renderOutboundsInbounds, sanitizeInbound);

    document.getElementById("addOutbound").addEventListener("click", function () { d.outbounds.push(newOutbound()); scheduleSave(); renderOutboundsInbounds(); });
    document.getElementById("addInbound").addEventListener("click", function () { d.inbounds.push(newInbound()); scheduleSave(); renderOutboundsInbounds(); });
  }
  // Like bindRowInputs, but re-fills a deleted-to-empty collection with a
  // fresh typed row (outbound/inbound) instead of an untyped {} placeholder.
  function bindRowInputsSafe(el, collection, rerender, freshFactory) {
    el.querySelectorAll("[data-row] [data-f]").forEach(function (field) {
      var evt = field.tagName === "SELECT" ? "change" : "input";
      field.addEventListener(evt, function () {
        var wrap = field.closest("[data-row]");
        var row = collection.filter(function (r) { return r.id === wrap.dataset.row; })[0];
        if (!row) return;
        row[field.dataset.f] = field.value;
        scheduleSave();
      });
    });
    el.querySelectorAll("[data-del]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var i = collection.findIndex(function (r) { return r.id === btn.dataset.del; });
        if (i > -1) collection.splice(i, 1);
        if (collection.length === 0) collection.push(sanitizeGeneric(freshFactory));
        scheduleSave(); rerender();
      });
    });
  }
  function sanitizeGeneric(factory) { return factory ? factory() : {}; }

  /* ---------------------------------------------------------
     RENDER: DELIVERIES
  --------------------------------------------------------- */
  function renderDeliveries() {
    var el = document.getElementById("deliveriesSection");
    var d = App.daily;

    el.innerHTML =
      '<div class="card__head"><div class="card__head-left"><span class="tab" data-color="orange">03</span><div><h2 class="card__title">Deliveries</h2>' +
      '<p class="card-hint">Who\u2019s dropping off today</p></div></div></div>' +
      '<div class="card__body">' +
        '<div id="deliveryRows">' + d.deliveries.map(deliveryRow).join("") + '</div>' +
        '<button class="add-row-btn" type="button" id="addDelivery">+ Add delivery</button>' +
      '</div>';

    function deliveryRow(r) {
      return '<div class="delivery-row" data-row="' + r.id + '">' +
        '<input type="text" class="delivery-name" data-f="name" value="' + esc(r.name) + '" placeholder="Who">' +
        '<input type="text" class="delivery-note" data-f="note" value="' + esc(r.note) + '" placeholder="Delivery detail — e.g. GC">' +
        '<button class="icon-btn" type="button" data-del="' + r.id + '" title="Remove">✕</button>' +
      '</div>';
    }

    bindRowInputsSafe(document.getElementById("deliveryRows"), d.deliveries, renderDeliveries, newDelivery);
    document.getElementById("addDelivery").addEventListener("click", function () { d.deliveries.push(newDelivery()); scheduleSave(); renderDeliveries(); });
  }

  /* ---------------------------------------------------------
     RENDER: PACKAGING PLAN
  --------------------------------------------------------- */
  function renderPackagingPlan() {
    var el = document.getElementById("packagingPlanSection");
    var d = App.daily;

    el.innerHTML =
      '<div class="card__head"><div class="card__head-left"><span class="tab" data-color="pale">04</span><div><h2 class="card__title">Packaging plan</h2>' +
      '<p class="card-hint">Where today\u2019s cases &amp; kegs are going, and whether the spot is cleared</p></div></div></div>' +
      '<div class="card__body plan-cols">' +
        planCol("cases", "Cases", "mint") +
        planCol("kegs", "Kegs", "sky") +
      '</div>';

    function planCol(key, label, tagColor) {
      var rows = d.packagingPlan[key];
      return '<div class="plan-col">' +
        '<div class="plan-col-head"><span class="tag tag--' + tagColor + '">' + label + '</span></div>' +
        '<div class="table-scroll"><table class="dtable"><thead><tr><th class="col-med">SKU</th><th class="col-location">Location</th><th class="col-med">Status</th><th class="col-narrow"></th></tr></thead>' +
        '<tbody id="planBody-' + key + '">' + rows.map(function (r) { return planRow(r); }).join("") + '</tbody></table></div>' +
        '<button class="add-row-btn" type="button" data-add-plan="' + key + '">+ Add row</button>' +
      '</div>';
    }
    function planRow(r) {
      return '<tr data-row="' + r.id + '">' +
        '<td><input class="cell-input cell-input--strong" data-f="sku" value="' + esc(r.sku) + '"></td>' +
        '<td><input class="cell-input cell-input--lg" data-f="location" value="' + esc(r.location) + '" placeholder="e.g. C05"></td>' +
        '<td><select class="cell-select" data-f="status">' + optionList(PLAN_STATUS_OPTIONS, r.status, "Status") + '</select></td>' +
        '<td class="row-actions"><button class="icon-btn" type="button" data-del="' + r.id + '" title="Remove row">✕</button></td>' +
      '</tr>';
    }
    function optionList(list, selected, placeholder) {
      var html = '<option value="">' + placeholder + '</option>';
      html += list.map(function (v) { return '<option value="' + esc(v) + '"' + (v === selected ? " selected" : "") + '>' + esc(v) + '</option>'; }).join("");
      return html;
    }

    ["cases", "kegs"].forEach(function (key) {
      var body = document.getElementById("planBody-" + key);
      bindRowInputsSafe(body, d.packagingPlan[key], renderPackagingPlan, newPlanRow);
    });
    el.querySelectorAll("[data-add-plan]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        d.packagingPlan[btn.dataset.addPlan].push(newPlanRow());
        scheduleSave(); renderPackagingPlan();
      });
    });
  }

  /* ---------------------------------------------------------
  /* ---------------------------------------------------------
     RENDER: SAFETY + DAILY CHECKS
  --------------------------------------------------------- */
  function renderSafetyChecks() {
    var el = document.getElementById("safetyChecksSection");
    var d = App.daily;

    el.innerHTML =
      '<div class="card__head"><div class="card__head-left"><span class="tab" data-color="gold">05</span><div><h2 class="card__title">Safety &amp; daily checks</h2>' +
      '<p class="card-hint">A quick reminder, and today\u2019s must-dos</p></div></div></div>' +
      '<div class="card__body safety-grid">' +
        '<div class="safety-box"><div class="safety-box__label">Safety</div>' +
        '<textarea id="safetyText" placeholder="Safety reminder…">' + esc(d.safety) + '</textarea>' +
        '<div class="safety-box__foot">' +
          '<span class="card-hint" style="margin:0;">Rotates daily from Balter\u2019s safety tips</span>' +
          '<button type="button" class="icon-btn" id="safetyResetBtn" title="Reset to today\u2019s scheduled tip">' +
            '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M10 4a6 6 0 0 1 5.2 3H13a1 1 0 1 0 0 2h4.5a1 1 0 0 0 1-1V3.5a1 1 0 1 0-2 0v1.6A8 8 0 1 0 18 10a1 1 0 1 0-2 0 6 6 0 1 1-6-6Z"/></svg>' +
          '</button>' +
        '</div></div>' +
        '<div>' +
          '<p class="plan-sub">Daily checks</p>' +
          '<div id="checkRows">' + d.checks.map(checkRow).join("") + '</div>' +
          '<button class="add-row-btn" type="button" id="addCheck">+ Add check</button>' +
        '</div>' +
      '</div>';

    function checkRow(c) {
      return '<div class="check-row" data-row="' + c.id + '">' +
        '<input type="text" data-f="text" value="' + esc(c.text) + '" placeholder="Check item">' +
        '<button class="icon-btn" type="button" data-del="' + c.id + '" title="Remove">✕</button>' +
      '</div>';
    }

    document.getElementById("safetyText").addEventListener("input", function (e) { d.safety = e.target.value; scheduleSave(); });
    document.getElementById("safetyResetBtn").addEventListener("click", function () {
      d.safety = getSafetyMessageForDate(App.date);
      scheduleSave();
      renderSafetyChecks();
      showToast("Reset to today's safety tip");
    });
    bindRowInputs(document.getElementById("checkRows"), d.checks, renderSafetyChecks);
    document.getElementById("addCheck").addEventListener("click", function () { d.checks.push(newCheck()); scheduleSave(); renderSafetyChecks(); });
  }

  /* ---------------------------------------------------------
     RENDER: ROSTER + TOMORROW'S FORECAST
  --------------------------------------------------------- */
  function renderRosterForecast() {
    var el = document.getElementById("rosterForecastSection");
    var d = App.daily;
    var w = d.weather;

    el.innerHTML =
      '<div class="card__head"><div class="card__head-left"><span class="tab" data-color="sky">06</span><div><h2 class="card__title">Roster &amp; tomorrow\u2019s forecast</h2>' +
      '<p class="card-hint">Who\u2019s on shift, and the outlook for tomorrow</p></div></div></div>' +
      '<div class="card__body safety-grid">' +
        '<div>' +
          '<div id="rosterRows">' + d.roster.map(rosterRow).join("") + '</div>' +
          '<datalist id="staffNamesList">' + STAFF_OPTIONS.map(function (s) { return '<option value="' + esc(s) + '">'; }).join("") + '</datalist>' +
          '<button class="add-row-btn" type="button" id="addRoster">+ Add rostered time</button>' +
          '<div class="lockup-tile" style="margin-top:12px;"><div class="lockup-tile__label">Absent staff</div>' +
          '<input type="text" id="whoOffInput" style="width:100%;border:1.5px solid var(--line);border-radius:8px;padding:8px 10px;font-size:13px;" value="' + esc(d.whoOff) + '" placeholder="Names"></div>' +
        '</div>' +
        '<div>' +
          '<div class="weather-head">' +
            '<span class="plan-sub" style="margin:0;">Tomorrow\u2019s forecast' + (weatherReady() ? ' · ' + esc(weatherCfg.label || "") : '') + '</span>' +
            (weatherReady() ?
              '<button type="button" class="icon-btn" id="weatherRefreshBtn" title="Fetch latest forecast">' +
                '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M10 4a6 6 0 0 1 5.2 3H13a1 1 0 1 0 0 2h4.5a1 1 0 0 0 1-1V3.5a1 1 0 1 0-2 0v1.6A8 8 0 1 0 18 10a1 1 0 1 0-2 0 6 6 0 1 1-6-6Z"/></svg>' +
              '</button>' : '') +
          '</div>' +
          '<table class="weather-table">' +
            weatherRow("temp", "Temp (°C)", w.temp) +
            weatherRow("uv", "UV index", w.uv) +
            weatherRow("humidity", "Humidity", w.humidity) +
            weatherRow("rain", "Rain", w.rain) +
          '</table>' +
          (weatherReady() ?
            '<div class="weather-foot">' +
              (w.source === "auto" ? '<span class="tag tag--sky">Auto-filled</span>' : '<span class="card-hint" style="margin:0;">Editing overrides auto-fill</span>') +
              '<span class="weather-status" id="weatherStatus"></span>' +
            '</div>' : '') +
        '</div>' +
      '</div>';

    function rosterRow(r) {
      return '<div class="roster-row" data-row="' + r.id + '">' +
        '<select class="roster-time" data-f="time">' + timeOptions(r.time) + '</select>' +
        '<input type="text" class="roster-name" list="staffNamesList" data-f="name" value="' + esc(r.name) + '" placeholder="Name">' +
        '<button class="icon-btn" type="button" data-del="' + r.id + '" title="Remove">✕</button>' +
      '</div>';
    }
    function timeOptions(selected) {
      var html = '<option value="">Time</option>';
      html += ROSTER_TIME_OPTIONS.map(function (t) { return '<option value="' + esc(t) + '"' + (t === selected ? " selected" : "") + '>' + esc(t) + '</option>'; }).join("");
      return html;
    }
    function weatherRow(key, label, val) {
      return '<tr><td>' + label + '</td><td><input data-weather="' + key + '" value="' + esc(val) + '" placeholder="—"></td></tr>';
    }

    bindRowInputsSafe(document.getElementById("rosterRows"), d.roster, renderRosterForecast, newRoster);
    document.getElementById("addRoster").addEventListener("click", function () { d.roster.push(newRoster()); scheduleSave(); renderRosterForecast(); });
    document.getElementById("whoOffInput").addEventListener("input", function (e) { d.whoOff = e.target.value; scheduleSave(); });

    el.querySelectorAll("[data-weather]").forEach(function (input) {
      input.addEventListener("input", function () { w[input.dataset.weather] = input.value; w.source = "manual"; scheduleSave(); });
    });
    var refreshBtn = document.getElementById("weatherRefreshBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        refreshBtn.classList.add("is-spinning");
        refreshWeatherNow();
        setTimeout(function () { refreshBtn.classList.remove("is-spinning"); }, 650);
      });
    }
  }

  function fmtNum(n) { if (!n) return "0"; var r = Math.round(n * 100) / 100; return String(r); }

  /* ---------------------------------------------------------
     EMAIL BUILDER
  --------------------------------------------------------- */
  var C = { mint: "#47D7AC", mintBg: "#eafcf5", apricot: "#FDAA63", purple: "#7566A0", sky: "#99D6EA", gold: "#FFD637", ink: "#14161a" };

  function td(content, style) { return '<td style="padding:8px 10px;border:1px solid #e6e6e2;font-size:13px;color:#14161a;' + (style || "") + '">' + content + '</td>'; }
  function th(content, style) { return '<th style="padding:8px 10px;border:1px solid #e6e6e2;background:#FBFBF9;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#55585F;text-align:left;' + (style || "") + '">' + content + '</th>'; }
  function sectionTitle(text, color) {
    return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 10px;"><tr>' +
      '<td style="background:' + color + ';width:8px;border-radius:3px;"></td>' +
      '<td style="width:8px;"></td>' +
      '<td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;letter-spacing:.04em;text-transform:uppercase;color:' + C.ink + ';">' + esc(text) + '</td>' +
    '</tr></table>';
  }
  var MONO = "'Courier New',monospace";
  function planStatusStyle(status) {
    if (status === "Cleared") return "background:#eafcf5;color:#0d6a4d;font-weight:bold;";
    if (status === "Not cleared") return "background:#fff3e6;color:#a05a1c;font-weight:bold;";
    return "";
  }

  function buildEmailHtml() {
    var d = App.daily;
    var html = '';
    html += '<table style="border-collapse:collapse;width:100%;max-width:900px;font-family:Arial,Helvetica,sans-serif;">';
    html += '<tr>' +
      '<td style="border:none;padding:4px 10px 14px 2px;width:44px;vertical-align:middle;">' + LOGO_SVG + '</td>' +
      td('<div style="font-size:20px;font-weight:bold;color:' + C.ink + ';">Logistics Daily Handover</div>' +
         '<div style="font-size:13px;color:#666;margin-top:2px;">' + formatBanner(d.date) + '</div>', "border:none;padding:4px 2px 14px 0;vertical-align:middle;") +
    '</tr></table>';

    // Wrap up
    html += sectionTitle("Today's wrap up", C.mint);
    html += '<table style="border-collapse:collapse;width:100%;max-width:900px;">';
    d.wrapUp.filter(function (t) { return t && t.trim(); }).forEach(function (t) { html += '<tr>' + td(esc(t)) + '</tr>'; });
    if (!d.wrapUp.some(function (t) { return t && t.trim(); })) html += '<tr>' + td("—") + '</tr>';
    html += '</table>';

    // AM Priorities
    html += '<div style="text-align:left;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:16px;color:' + C.ink + ';margin:22px 0 2px;">' + esc(formatBanner(addDays(d.date, 1))) + '</div>';
    html += sectionTitle("AM Priorities", C.mint);
    html += '<table style="border-collapse:collapse;width:100%;max-width:900px;">';
    d.amPriorities.filter(function (t) { return t && t.trim(); }).forEach(function (t) { html += '<tr>' + td(esc(t)) + '</tr>'; });
    if (!d.amPriorities.some(function (t) { return t && t.trim(); })) html += '<tr>' + td("—") + '</tr>';
    html += '</table>';

    html += '<table style="border-collapse:collapse;width:100%;max-width:900px;margin-top:14px;">';
    html += '<tr>' + th("Logistics lock up", "width:50%") + th("CR1 lock up") + '</tr>';
    html += '<tr>' + td(esc(d.lockups.logistics) || "—", "font-weight:bold;") + td(esc(d.lockups.cr1) || "—", "font-weight:bold;") + '</tr>';
    html += '</table>';

    // Outbounds / inbounds
    html += sectionTitle("Outbound", C.purple);
    html += '<table style="border-collapse:collapse;width:100%;max-width:900px;"><tr>' + th("Destination") + th("Qty", "width:15%") + '</tr>';
    d.outbounds.forEach(function (r) {
      if (!r.destination && !r.qty) return;
      html += '<tr>' + td(esc(r.destination) || "—", "font-weight:bold;") + td(esc(r.qty) || "—", "font-family:" + MONO + ";") + '</tr>';
    });
    html += '</table>';

    html += sectionTitle("Inbound", C.purple);
    html += '<table style="border-collapse:collapse;width:100%;max-width:900px;"><tr>' + th("Suppliers") + th("Qty", "width:20%") + '</tr>';
    d.inbounds.forEach(function (r) {
      if (!r.item && !r.qty) return;
      html += '<tr>' + td(esc(r.item) || "—", "font-weight:bold;") + td(esc(r.qty) || "—") + '</tr>';
    });
    html += '</table>';

    // Deliveries
    html += sectionTitle("Deliveries", C.apricot);
    html += '<table style="border-collapse:collapse;width:100%;max-width:900px;"><tr>' + th("Who") + th("Detail") + '</tr>';
    d.deliveries.forEach(function (r) {
      if (!r.name && !r.note) return;
      html += '<tr>' + td(esc(r.name) || "—", "font-weight:bold;") + td(esc(r.note) || "—") + '</tr>';
    });
    html += '</table>';

    // Packaging plan
    html += sectionTitle("Packaging plan — Cases", C.mint);
    html += '<table style="border-collapse:collapse;width:100%;max-width:900px;"><tr>' + th("SKU") + th("Location") + th("Status") + '</tr>';
    d.packagingPlan.cases.forEach(function (r) {
      if (!r.sku && !r.location && !r.status) return;
      html += '<tr>' + td(esc(r.sku) || "—", "font-weight:bold;") + td(esc(r.location) || "—") + td(esc(r.status) || "—", planStatusStyle(r.status)) + '</tr>';
    });
    html += '</table>';

    html += sectionTitle("Packaging plan — Kegs", C.sky);
    html += '<table style="border-collapse:collapse;width:100%;max-width:900px;"><tr>' + th("SKU") + th("Location") + th("Status") + '</tr>';
    d.packagingPlan.kegs.forEach(function (r) {
      if (!r.sku && !r.location && !r.status) return;
      html += '<tr>' + td(esc(r.sku) || "—", "font-weight:bold;") + td(esc(r.location) || "—") + td(esc(r.status) || "—", planStatusStyle(r.status)) + '</tr>';
    });
    html += '</table>';

    // Safety + daily checks
    html += sectionTitle("Safety", C.purple);
    html += '<table style="border-collapse:collapse;width:100%;max-width:900px;"><tr>' + td(esc(d.safety) || "—", "background:" + C.mintBg + ";text-align:center;font-weight:600;") + '</tr></table>';

    html += sectionTitle("Daily checks", C.gold);
    html += '<table style="border-collapse:collapse;width:100%;max-width:900px;">';
    d.checks.forEach(function (c) {
      if (!c.text) return;
      html += '<tr>' + td(esc(c.text)) + '</tr>';
    });
    html += '</table>';

    // Roster + tomorrow's forecast
    html += sectionTitle("Who is rostered", C.gold);
    html += '<table style="border-collapse:collapse;width:100%;max-width:900px;"><tr>' + th("Time", "width:20%") + th("Name") + '</tr>';
    d.roster.forEach(function (r) { if (!r.time && !r.name) return; html += '<tr>' + td(esc(r.time), "font-family:" + MONO + ";") + td(esc(r.name) || "—") + '</tr>'; });
    if (d.whoOff && d.whoOff.trim()) html += '<tr>' + td("Absent staff", "font-weight:bold;background:#f4f3ef") + td(esc(d.whoOff), "background:#f4f3ef;") + '</tr>';
    html += '</table>';

    html += sectionTitle("Tomorrow's forecast", C.sky);
    html += '<table style="border-collapse:collapse;width:100%;max-width:900px;">';
    html += '<tr>' + th("Temp") + th("UV") + th("Humidity") + th("Rain") + '</tr>';
    html += '<tr>' + td(esc(d.weather.temp) || "—") + td(esc(d.weather.uv) || "—") + td(esc(d.weather.humidity) || "—") + td(esc(d.weather.rain) || "—") + '</tr>';
    html += '</table>';

    html += '<div style="font-size:11px;color:#999;margin-top:14px;font-family:Arial,Helvetica,sans-serif;">Generated from the Balter Brewing Logistics Daily Handover sheet.</div>';
    return html;
  }

  function buildEmailPlain() {
    var d = App.daily;
    var lines = [];
    lines.push("LOGISTICS DAILY HANDOVER — BALTER BREWING");
    lines.push(formatBanner(d.date));
    lines.push("");
    lines.push("TODAY'S WRAP UP");
    d.wrapUp.filter(function (t) { return t && t.trim(); }).forEach(function (t) { lines.push("  - " + t); });
    lines.push("");
    lines.push("AM PRIORITIES — " + formatBanner(addDays(d.date, 1)));
    d.amPriorities.filter(function (t) { return t && t.trim(); }).forEach(function (t) { lines.push("  - " + t); });
    lines.push("  Logistics lock up: " + (d.lockups.logistics || "–"));
    lines.push("  CR1 lock up: " + (d.lockups.cr1 || "–"));
    lines.push("");
    lines.push("OUTBOUND");
    d.outbounds.forEach(function (r) { if (!r.destination && !r.qty) return; lines.push("  " + (r.destination || "–") + " (Qty " + (r.qty || "–") + ")"); });
    lines.push("");
    lines.push("INBOUND");
    d.inbounds.forEach(function (r) { if (!r.item && !r.qty) return; lines.push("  " + (r.item || "–") + " — " + (r.qty || "–")); });
    lines.push("");
    lines.push("DELIVERIES");
    d.deliveries.forEach(function (r) { if (!r.name && !r.note) return; lines.push("  " + (r.name || "–") + " — " + (r.note || "–")); });
    lines.push("");
    lines.push("PACKAGING PLAN — CASES");
    d.packagingPlan.cases.forEach(function (r) { if (!r.sku && !r.location && !r.status) return; lines.push("  " + (r.sku || "–") + " → " + (r.location || "–") + (r.status ? " [" + r.status + "]" : "")); });
    lines.push("PACKAGING PLAN — KEGS");
    d.packagingPlan.kegs.forEach(function (r) { if (!r.sku && !r.location && !r.status) return; lines.push("  " + (r.sku || "–") + " → " + (r.location || "–") + (r.status ? " [" + r.status + "]" : "")); });
    lines.push("");
    lines.push("");
    lines.push("SAFETY");
    lines.push("  " + (d.safety || "–"));
    lines.push("");
    lines.push("DAILY CHECKS");
    d.checks.forEach(function (c) { if (!c.text) return; lines.push("  - " + c.text); });
    lines.push("");
    lines.push("WHO IS ROSTERED");
    d.roster.forEach(function (r) { if (!r.time && !r.name) return; lines.push("  " + (r.time || "–") + " " + (r.name || "–")); });
    if (d.whoOff && d.whoOff.trim()) lines.push("  Absent staff: " + d.whoOff);
    lines.push("");
    lines.push("TOMORROW'S FORECAST");
    lines.push("  Temp " + (d.weather.temp || "–") + " | UV " + (d.weather.uv || "–") + " | Humidity " + (d.weather.humidity || "–") + " | Rain " + (d.weather.rain || "–"));
    return lines.join("\n");
  }

  /* ---------------------------------------------------------
     EMAIL PREVIEW MODAL
  --------------------------------------------------------- */
  var overlay, preview, copyStatus, currentHTML = "", currentPlain = "";

  function openEmailModal() {
    currentHTML = buildEmailHtml();
    currentPlain = buildEmailPlain();
    preview.innerHTML = currentHTML;
    copyStatus.textContent = "";
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeEmailModal() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }
  function copyRich() {
    if (navigator.clipboard && window.ClipboardItem) {
      try {
        var blobHtml = new Blob([currentHTML], { type: "text/html" });
        var blobText = new Blob([currentPlain], { type: "text/plain" });
        return navigator.clipboard.write([ new ClipboardItem({ "text/html": blobHtml, "text/plain": blobText }) ]);
      } catch (e) { /* fall through to selection-based copy */ }
    }
    return new Promise(function (resolve, reject) {
      try {
        var range = document.createRange();
        range.selectNodeContents(preview);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        var ok = document.execCommand("copy");
        sel.removeAllRanges();
        ok ? resolve() : reject();
      } catch (e) { reject(e); }
    });
  }

  /* ---------------------------------------------------------
     UTIL
  --------------------------------------------------------- */
  var toastTimer = null;
  function showToast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2400);
  }

  /* ---------------------------------------------------------
     INIT
  --------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", function () {
    try { initApp(); } catch (err) { showFatalError(err); }
  });

  function initApp() {
    loadDay(todayISO());

    document.getElementById("sheetDate").addEventListener("change", function (e) {
      if (App.dirty) saveNow(false);
      loadDay(e.target.value || todayISO());
    });
    document.getElementById("logoutBtn").addEventListener("click", function () {
      if (App.dirty) saveNow(false);
      fetch("/logout", { method: "POST" })
        .then(function () { window.location.href = "/login"; })
        .catch(function () { window.location.href = "/login"; });
    });
    document.getElementById("clearBtn").addEventListener("click", function () {
      var ok = window.confirm("Clear all fields on " + formatPretty(App.date) + "'s sheet?\n\nThis resets wrap-up, AM priorities, lock ups, outbound/inbound, deliveries, packaging plan, checks, roster, safety, and weather for this day. This can't be undone.");
      if (!ok) return;
      App.daily = newDailyState(App.date);
      saveNow(false);
      renderAll();
      showToast("Sheet cleared");
    });
    document.getElementById("printBtn").addEventListener("click", function () { window.print(); });

    overlay = document.getElementById("modalOverlay");
    preview = document.getElementById("emailPreview");
    copyStatus = document.getElementById("copyStatus");

    document.getElementById("copyEmailBtn").addEventListener("click", openEmailModal);
    document.getElementById("modalClose").addEventListener("click", closeEmailModal);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeEmailModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && overlay.classList.contains("open")) closeEmailModal(); });

    document.getElementById("copyRichBtn").addEventListener("click", function () {
      copyRich().then(function () { copyStatus.textContent = "Copied — paste it into your email."; })
        .catch(function () { copyStatus.textContent = "Couldn't copy automatically — select the preview and copy manually."; });
    });
    document.getElementById("copyPlainBtn").addEventListener("click", function () {
      (navigator.clipboard ? navigator.clipboard.writeText(currentPlain) : Promise.reject())
        .then(function () { copyStatus.textContent = "Plain text copied."; })
        .catch(function () { copyStatus.textContent = "Couldn't copy automatically — select the preview and copy manually."; });
    });
    document.getElementById("downloadImgBtn").addEventListener("click", function () {
      if (!window.html2canvas) { copyStatus.textContent = "Image tool unavailable offline."; return; }
      copyStatus.textContent = "Rendering image…";
      html2canvas(preview, { backgroundColor: "#ffffff", scale: 2 }).then(function (canvas) {
        var link = document.createElement("a");
        link.download = "balter-logistics-handover-" + (App.date || "draft") + ".png";
        link.href = canvas.toDataURL("image/png");
        link.click();
        copyStatus.textContent = "Image downloaded.";
      }).catch(function () { copyStatus.textContent = "Couldn't render image."; });
    });

    window.addEventListener("beforeunload", function () { if (App.dirty) saveNow(false); });

    var syncNowBtn = document.getElementById("syncNowBtn");
    syncNowBtn.addEventListener("click", function () {
      if (App.dirty) saveNow(false);
      syncNowBtn.classList.add("is-spinning");
      setTimeout(function () { syncNowBtn.classList.remove("is-spinning"); }, 650);
      pullFromCloud(false);
    });
    document.addEventListener("visibilitychange", function () { if (!document.hidden && !App.dirty && cloudReady()) pullFromCloud(true); });
    window.addEventListener("focus", function () { if (!App.dirty && cloudReady()) pullFromCloud(true); });

    // Discover whether the Worker has JSONBin sync configured, then adapt
    // the UI accordingly — cloudState is unknown until this first call
    // resolves.
    setSyncStatus("checking");
    pullFromCloud(true).then(function () {
      if (cloudState === "unavailable") {
        syncNowBtn.style.display = "none";
        setSyncStatus("saved");
      } else {
        App.pollTimer = setInterval(function () { if (!App.dirty && cloudReady()) pullFromCloud(true); }, Math.max(8, cloudCfg.pollSeconds || 20) * 1000);
      }
    });
  }

  function showFatalError(err) {
    try { console.error(err); } catch (e) {}
    var box = document.createElement("div");
    box.style.cssText = "max-width:1180px;margin:20px auto;padding:16px 20px;background:#fdeceb;border:1.5px solid #e56659;border-radius:12px;font-family:monospace;font-size:13px;color:#7a221a;white-space:pre-wrap;";
    box.textContent = "Something went wrong loading the sheet:\n\n" + (err && err.message ? err.message : String(err)) +
      "\n\nTry a hard refresh (Ctrl/Cmd+Shift+R). If that doesn't fix it, redeploy the site fresh — this usually means an old cached file is out of sync with a new one.";
    var main = document.getElementById("sheet");
    if (main && main.parentNode) main.parentNode.insertBefore(box, main);
    else document.body.appendChild(box);
  }
})();
