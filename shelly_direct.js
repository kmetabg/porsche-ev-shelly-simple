/**
 * Porsche EV — Shelly Direct Script (No server required)
 * ─────────────────────────────────────────────────────────────────────────────
 * Run get_token.py ONCE to get your REFRESH_TOKEN and VIN.
 * After that, this script runs forever — no server, no maintenance.
 *
 * Virtual components to create (Components → Add virtual component):
 *   Number  id=200  label="Battery %"        view: label
 *   Number  id=201  label="Climate temp °C"  view: slider, min:10, max:30
 *   Number  id=202  label="Charging kW"      view: label
 *   Boolean id=200  label="Climate"          view: toggle
 *   Boolean id=201  label="Locked"           view: label
 *   Boolean id=202  label="Doors"            view: label
 *   Boolean id=203  label="Charging"         view: label
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── CONFIGURE THESE (from get_token.py output) ────────────────────────────────
var REFRESH_TOKEN = "PASTE_REFRESH_TOKEN_HERE";   // from get_token.py
var VIN           = "PASTE_VIN_HERE";             // from get_token.py
// ─────────────────────────────────────────────────────────────────────────────

var CLIENT_ID   = "XhygisuebbrqQ80byOuU5VncxLIm8E6H";
var X_CLIENT_ID = "41843fb4-691d-4970-85c7-2673e8ecef40";
var TOKEN_URL   = "https://identity.porsche.com/oauth/token";
var API_BASE    = "https://api.ppa.porsche.com/app/connect/v1/vehicles";

var MF = [
  "BATTERY_LEVEL", "CHARGING_SUMMARY", "CHARGING_RATE", "CLIMATIZER_STATE",
  "LOCK_STATE_VEHICLE", "E_RANGE", "MILEAGE",
  "OPEN_STATE_DOOR_FRONT_LEFT", "OPEN_STATE_DOOR_FRONT_RIGHT",
  "OPEN_STATE_DOOR_REAR_LEFT",  "OPEN_STATE_DOOR_REAR_RIGHT",
  "OPEN_STATE_LID_FRONT", "OPEN_STATE_LID_REAR"
].join("&mf=");

var POLL_MS    = 600000;   // 10 min
var REFRESH_MS = 3000000;  // 50 min

// Runtime state (lost on restart → re-fetched via KVS)
var _accessToken = "";
var _climateUpdating = false;

// Virtual component handles
var vBattery   = Virtual.getHandle("number:200");
var vTempSet   = Virtual.getHandle("number:201");
var vChargingKw= Virtual.getHandle("number:202");
var vClimate   = Virtual.getHandle("boolean:200");
var vLocked    = Virtual.getHandle("boolean:201");
var vDoors     = Virtual.getHandle("boolean:202");
var vCharging  = Virtual.getHandle("boolean:203");

// ── TOKEN MANAGEMENT (KVS) ────────────────────────────────────────────────────

function saveRefreshToken(token) {
  Shelly.call("KVS.Set", { key: "pc_refresh", value: token }, null);
}

function doTokenRefresh(cb) {
  Shelly.call("KVS.Get", { key: "pc_refresh" }, function(r, e) {
    var storedRefresh = (r && r.value) ? r.value : REFRESH_TOKEN;

    Shelly.call("HTTP.POST", {
      url:     TOKEN_URL,
      body:    "grant_type=refresh_token&client_id=" + CLIENT_ID + "&refresh_token=" + storedRefresh,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 30,
      ssl_ca:  "*"
    }, function(res, err) {
      if (err || !res || res.code !== 200) {
        print("[Porsche] Token refresh failed: " + (err || res.code));
        if (cb) { cb(null); }
        return;
      }
      try {
        var tok = JSON.parse(res.body);
        _accessToken = tok.access_token;
        // Save new refresh token if rotated
        if (tok.refresh_token) { saveRefreshToken(tok.refresh_token); }
        print("[Porsche] Token OK, expires in " + tok.expires_in + "s");
        if (cb) { cb(_accessToken); }
      } catch(ex) {
        print("[Porsche] Token parse error: " + ex);
        if (cb) { cb(null); }
      }
    });
  });
}

function getToken(cb) {
  if (_accessToken) { cb(_accessToken); return; }
  doTokenRefresh(cb);
}

// ── PORSCHE API ───────────────────────────────────────────────────────────────

function porscheGet(path, cb) {
  getToken(function(token) {
    if (!token) { if (cb) { cb(null); } return; }
    Shelly.call("HTTP.GET", {
      url:     API_BASE + path,
      headers: { "Authorization": "Bearer " + token, "X-Client-ID": X_CLIENT_ID },
      timeout: 30,
      ssl_ca:  "*"
    }, function(res, err) {
      if (err || !res || res.code !== 200) {
        print("[Porsche] GET failed (" + (err || res.code) + "): " + path);
        if (res && res.code === 401) { _accessToken = ""; }
        if (cb) { cb(null); }
        return;
      }
      try { cb(JSON.parse(res.body)); }
      catch(ex) { print("[Porsche] JSON err: " + ex); if (cb) { cb(null); } }
    });
  });
}

function porschePost(path, body, cb) {
  getToken(function(token) {
    if (!token) { if (cb) { cb(null); } return; }
    Shelly.call("HTTP.POST", {
      url:     API_BASE + path,
      headers: {
        "Authorization": "Bearer " + token,
        "X-Client-ID":   X_CLIENT_ID,
        "Content-Type":  "application/json"
      },
      body:    JSON.stringify(body),
      timeout: 90,
      ssl_ca:  "*"
    }, function(res, err) {
      if (err || !res || res.code !== 200) {
        print("[Porsche] POST failed (" + (err || res.code) + "): " + path);
        if (res && res.code === 401) { _accessToken = ""; }
        if (cb) { cb(null); }
        return;
      }
      try { cb(JSON.parse(res.body)); }
      catch(ex) { print("[Porsche] JSON err: " + ex); if (cb) { cb(null); } }
    });
  });
}

// ── PARSE PORSCHE API RESPONSE ────────────────────────────────────────────────

function parseMeasurements(data) {
  var m = {};
  if (!data || !data.measurements) { return m; }
  for (var i = 0; i < data.measurements.length; i++) {
    var item = data.measurements[i];
    if (item.status && item.status.isEnabled) {
      m[item.key] = item.value;
    }
  }
  return m;
}

function updateComponents(data) {
  var m       = parseMeasurements(data);
  var batt    = m.BATTERY_LEVEL    ? m.BATTERY_LEVEL.percent      : null;
  var chgSum  = m.CHARGING_SUMMARY ? m.CHARGING_SUMMARY            : {};
  var chgRate = m.CHARGING_RATE    ? m.CHARGING_RATE               : {};
  var climate = m.CLIMATIZER_STATE ? m.CLIMATIZER_STATE            : {};
  var lock    = m.LOCK_STATE_VEHICLE ? m.LOCK_STATE_VEHICLE        : {};

  var chgKw  = chgRate.chargingPower || 0;
  var climOn = climate.isOn === true;
  var locked = lock.isLocked === true;

  // Doors: check all OPEN_STATE_ keys
  var allClosed = true;
  for (var key in m) {
    if (key.indexOf("OPEN_STATE_") === 0 && m[key].isOpen === true) {
      allClosed = false;
      break;
    }
  }

  // Step 1: Battery
  if (typeof batt === "number" && vBattery) {
    vBattery.setValue(batt);
    print("[Porsche] Battery: " + batt + "%");
  }

  // Step 2-6: chained timers to avoid "too many calls"
  Timer.set(250, false, function() {
    _climateUpdating = true;
    if (vClimate) {
      vClimate.setValue(climOn);
      if (climOn) { setClimateLabels("OFF", "Started ✓"); }
      else        { setClimateLabels("OFF", "ON"); }
    }
    print("[Porsche] Climate: " + climOn);

    Timer.set(250, false, function() {
      if (vLocked) { vLocked.setValue(locked); }
      print("[Porsche] Locked: " + locked);

      Timer.set(250, false, function() {
        if (vDoors) { vDoors.setValue(allClosed); }
        print("[Porsche] Doors closed: " + allClosed);

        Timer.set(250, false, function() {
          if (vChargingKw) { vChargingKw.setValue(chgKw); }

          Timer.set(250, false, function() {
            if (vCharging) { vCharging.setValue(chgKw > 0); }
            print("[Porsche] Charging: " + chgKw + " kW");
            _climateUpdating = false;
          });
        });
      });
    });
  });
}

// ── POLL VEHICLE ──────────────────────────────────────────────────────────────

function pollVehicle() {
  print("[Porsche] Polling...");
  porscheGet("/" + VIN + "?mf=" + MF, function(data) {
    if (!data) { return; }
    updateComponents(data);
  });
}

// ── CLIMATE CONTROL ───────────────────────────────────────────────────────────

function setClimateLabels(falseLabel, trueLabel) {
  if (!vClimate) { return; }
  vClimate.setConfig({ meta: { ui: { view: "toggle", titles: [falseLabel, trueLabel] } } });
}

function waitForClimateChange(expectedOn, attemptsLeft) {
  if (attemptsLeft <= 0) { pollVehicle(); return; }
  porscheGet("/" + VIN + "?mf=CLIMATIZER_STATE", function(data) {
    if (!data) {
      Timer.set(5000, false, function() { waitForClimateChange(expectedOn, attemptsLeft - 1); });
      return;
    }
    var m = parseMeasurements(data);
    var current = m.CLIMATIZER_STATE ? m.CLIMATIZER_STATE.isOn === true : null;
    print("[Porsche] Climate poll: " + current + " (want " + expectedOn + ")");
    if (current === expectedOn) {
      _climateUpdating = true;
      if (vClimate) {
        vClimate.setValue(current);
        if (current) { setClimateLabels("OFF", "Started ✓"); }
        else         { setClimateLabels("OFF", "ON"); }
      }
      Timer.set(300, false, function() { _climateUpdating = false; });
    } else {
      if (expectedOn) { setClimateLabels("OFF", "Pending..."); }
      else            { setClimateLabels("Stopping...", "Started"); }
      Timer.set(5000, false, function() { waitForClimateChange(expectedOn, attemptsLeft - 1); });
    }
  });
}

function sendClimateCommand(start, temp) {
  var payload;
  if (start) {
    payload = {
      key: "REMOTE_CLIMATIZER_START",
      payload: {
        targetTemperature: temp + 273.15,
        climateZonesEnabled: { frontLeft: false, frontRight: false, rearLeft: false, rearRight: false }
      }
    };
    setClimateLabels("OFF", "Pending...");
    print("[Porsche] → START climate at " + temp + "°C");
  } else {
    payload = { key: "REMOTE_CLIMATIZER_STOP", payload: {} };
    setClimateLabels("Stopping...", "Started");
    print("[Porsche] → STOP climate");
  }

  porschePost("/" + VIN + "/commands", payload, function(data) {
    if (!data) { return; }
    print("[Porsche] Command: " + (data.status ? data.status.result : "sent"));
    Timer.set(5000, false, function() { waitForClimateChange(start, 14); });
  });
}

// ── VIRTUAL COMPONENT EVENTS ──────────────────────────────────────────────────

if (vClimate) {
  // Reset config on startup
  vClimate.setConfig({
    name: "Climate",
    persisted: false,
    default_value: false,
    meta: { ui: { view: "toggle", titles: ["OFF", "ON"] } }
  });

  vClimate.on("change", function(ev) {
    if (_climateUpdating) {
      print("[Porsche] Skip script-triggered climate event");
      return;
    }
    var newVal = null;
    if (ev.info && ev.info.value !== undefined) { newVal = ev.info.value; }
    else if (ev.data && ev.data.value !== undefined) { newVal = ev.data.value; }
    else if (ev.value !== undefined) { newVal = ev.value; }
    else if (ev.state !== undefined) { newVal = ev.state; }

    if (newVal === null) { print("[Porsche] Cannot read toggle value"); return; }

    print("[Porsche] User toggled climate → " + newVal);
    var temp = 20;
    if (vTempSet) {
      var v = vTempSet.getValue();
      if (typeof v === "number" && v >= 10 && v <= 30) { temp = v; }
    }
    sendClimateCommand(newVal === true, temp);
  });
}

// ── STARTUP & TIMERS ──────────────────────────────────────────────────────────

// Save the hardcoded refresh token to KVS on first run
// (subsequent runs will use the KVS value which gets auto-rotated)
if (REFRESH_TOKEN !== "PASTE_REFRESH_TOKEN_HERE") {
  saveRefreshToken(REFRESH_TOKEN);
}

// Refresh access token on startup
Timer.set(2000, false, function() {
  doTokenRefresh(function(token) {
    if (token) { pollVehicle(); }
    else { print("[Porsche] ERROR: Check your REFRESH_TOKEN!"); }
  });
});

// Refresh access token every 50 min (keeps refresh_token alive too)
Timer.set(REFRESH_MS, true, function() {
  doTokenRefresh(null);
});

// Poll vehicle data every 10 min
Timer.set(POLL_MS, true, function() { pollVehicle(); });

print("[Porsche] Direct script started. VIN=" + VIN + " poll=" + (POLL_MS/60000) + "min");
