# Porsche EV — Shelly Direct (Simple Version)

Connect your Porsche EV to Shelly **without any server** — just a one-time Python script to get your token, then Shelly handles everything forever.

> ⚠️ Uses the unofficial Porsche Connect API. Requires an active Porsche Connect subscription.

---

## How it works

```
┌─────────────────────────────────────────┐
│  Run get_token.py  (once, on any PC)    │
│  → outputs REFRESH_TOKEN + VIN          │
└────────────────┬────────────────────────┘
                 │ paste into script
                 ▼
┌─────────────────────────────────────────┐
│  Shelly script  (forever, no server)    │
│  • Renews token every 50 min            │
│  • Polls Porsche API every 10 min       │
│  • Updates virtual components           │
│  • Climate start/stop via toggle        │
└─────────────────────────────────────────┘
```

The token renews itself on every refresh — it **never expires** as long as Shelly is running.

---

## Step 1 — Get your token (one time only)

On any computer with Python:

```bash
pip install pyporscheconnectapi
python get_token.py
```

Enter your My Porsche email and password. Output:

```
var REFRESH_TOKEN = "eyJhbGciOi...";

// Taycan 4 Cross Turismo 2025
var VIN = "WP0ZZZY15SSA59196";
```

Copy these two lines — you'll need them in the next step.

> ⚠️ Keep the refresh token private. It gives full access to your vehicle's remote features.

---

## Step 2 — Create Shelly virtual components

In Shelly web UI → **Components** → **Add virtual component**:

| Type | ID | Label | View |
|---|---|---|---|
| Number | 200 | Battery % | label |
| Number | 201 | Climate temp °C | slider (min: 10, max: 30) |
| Number | 202 | Charging kW | label |
| Boolean | 200 | Climate | toggle |
| Boolean | 201 | Locked | label |
| Boolean | 202 | Doors | label |
| Boolean | 203 | Charging | label |

---

## Step 3 — Install the Shelly script

1. Shelly web UI → **Scripts** → **Create script**
2. Name: `Porsche Direct`
3. Paste the contents of [`shelly_direct.js`](./shelly_direct.js)
4. Edit the top 2 lines with your values from Step 1:

```javascript
var REFRESH_TOKEN = "eyJhbGciOi...";   // from get_token.py
var VIN           = "WP0ZZZY15SSA59196"; // from get_token.py
```

5. **Save** → **Start**

---

## Expected log output

```
[Porsche] Direct script started. VIN=WP0ZZZY... poll=10min
[Porsche] Token OK, expires in 3600s
[Porsche] Polling...
[Porsche] Battery: 86%
[Porsche] Climate: false
[Porsche] Locked: true
[Porsche] Doors closed: true
[Porsche] Charging: 10.25 kW
```

---

## Supported vehicles

Any vehicle with an active **Porsche Connect** subscription:
Taycan · Macan EV · Panamera PHEV · Cayenne E-Hybrid · 911 (992) · Boxster/Cayman 718

---

## Troubleshooting

**`[Porsche] Token refresh failed: 403`**
→ Refresh token expired (30 days without use, or password changed). Run `get_token.py` again.

**`[Porsche] GET failed (401)`**
→ Access token expired mid-session. Script will auto-retry on next cycle.

**`[Porsche] ERROR: Check your REFRESH_TOKEN!`**
→ You forgot to replace `PASTE_REFRESH_TOKEN_HERE` in the script.

---

## vs. Full version

| | Simple (this repo) | Full ([porsche-ev-shelly-connector](https://github.com/kmetabg/porsche-ev-shelly-connector)) |
|---|---|---|
| Server required | ❌ No | ✅ Yes (Render/Docker) |
| Setup | Python one-liner | Fork + Deploy |
| Dashboard UI | ❌ | ✅ Web dashboard |
| Captcha handling | Manual | Automatic |
| Maintenance | None | None |

---

## Credits

[pyporscheconnectapi](https://github.com/CJNE/pyporscheconnectapi) by Johan Isaksson.
Porsche Connect API reverse-engineered by the community.

**Not affiliated with Porsche AG. Use at your own risk.**
