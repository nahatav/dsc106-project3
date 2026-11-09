"""Fields for the siting explorer and one simulated heat wave for the replay figure.

For each model and climate window, from daily maximum temperature on the model's
own grid:
  hot35  days per year above 35 C (absolute heat, a proxy for cooling burden)
  ext    days per year above the cell's own 1995-2014 99th percentile
Both are regridded to the common 1-degree grid used by reach.json and
coexposure.json, then the ten-model median is taken.

Replay: in the 2050s under SSP2-4.5, find the longest run of consecutive shared
heat days (at least a quarter of planned US AI power above design day) across
all models, and export each day's exceedance field (tasmax minus the cell's
design day) plus the fleet share and per-site flags.

Outputs: docs/data/siting.json, docs/data/replay.json
"""
import base64
import json
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.interpolate import RegularGridInterpolator

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "cmip6"
OUT = ROOT / "docs" / "data"
WINDOWS = ["historical|1995-2014", "ssp245|2041-2060", "ssp585|2041-2060", "ssp245|2081-2100", "ssp585|2081-2100"]
LAT = np.arange(24.0, 50.01, 1.0)
LON = np.arange(-125.0, -65.99, 1.0)
GY, GX = np.meshgrid(LAT, LON, indexing="ij")
PTS = np.stack([GY.ravel(), GX.ravel()], -1)
CUT = 0.25
REPLAY_WINDOW = "ssp245|2041-2060"

sites = pd.read_csv(ROOT / "data" / "sites.csv")
us = sites[sites.country == "United States"]
names, w = us.name.values, us.planned_power_mw.values / us.planned_power_mw.sum()


def regrid(field, lat, lon):
    lon = np.where(lon > 180, lon - 360, lon)
    f = RegularGridInterpolator((lat, lon), field, bounds_error=False, fill_value=None)
    return f(PTS).reshape(len(LAT), len(LON))


def b64u8(a):
    return base64.b64encode(np.clip(np.round(a), 0, 255).astype(np.uint8).tobytes()).decode()


acc = {k: {"hot35": [], "ext": []} for k in WINDOWS}
best = None  # (run length, peak share, model, dates)
models = sorted(p.stem.replace("_usgrid", "") for p in RAW.glob("*_usgrid.npz"))
for m in models:
    z = np.load(RAW / f"{m}_usgrid.npz")
    t, lat, lon, keys = z["t"], z["lat"], z["lon"], z["keys"]
    win = np.array(["|".join(k.split("|")[:2]) for k in keys])
    hist = win == WINDOWS[0]
    p99 = np.percentile(t[hist], 99, axis=0)
    for k in WINDOWS:
        sel = win == k
        acc[k]["hot35"].append(regrid((t[sel] > 350).mean(0) * 365.25, lat, lon))
        acc[k]["ext"].append(regrid((t[sel] > p99).mean(0) * 365.25, lat, lon))
    # fleet shared heat days from the site series, as in 11_mosaic.py
    d = pd.read_parquet(RAW / f"{m}_tasmax_daily.parquet")
    key = (d.scenario + "|" + d.window).values
    x = d[names].values
    sp99 = np.quantile(x[key == WINDOWS[0]], 0.99, axis=0)
    share = (x > sp99).astype(float) @ w
    sel = key == REPLAY_WINDOW
    dates, sh = d.date.values[sel], share[sel]
    run, start = 0, 0
    for i, v in enumerate(sh >= CUT):
        if v:
            run = run + 1 if i and pd.Timestamp(dates[i]) - pd.Timestamp(dates[i - 1]) == pd.Timedelta(days=1) and sh[i - 1] >= CUT else 1
            if run == 1:
                start = i
            peak = sh[start:i + 1].max()
            if best is None or (run, peak) > (best[0], best[1]):
                best = (run, peak, m, dates[start], dates[i])
    print(m, "done", "best so far", best[:5] if best else None)

out = {"lat": LAT.tolist(), "lon": LON.tolist(), "n_models": len(models), "by": {}}
for k in WINDOWS:
    h = np.median(np.stack(acc[k]["hot35"]), 0)
    e = np.median(np.stack(acc[k]["ext"]), 0)
    out["by"][k] = {"hot35": b64u8(h), "ext": b64u8(e)}
    print(k, "hot35 median", round(float(np.median(h)), 1), "max", round(float(h.max()), 1), "| ext median", round(float(np.median(e)), 1))
(OUT / "siting.json").write_text(json.dumps(out, separators=(",", ":")))

# replay: the longest run, padded by four days either side
run, peak, m, d0, d1 = best
z = np.load(RAW / f"{m}_usgrid.npz")
t, lat, lon, keys = z["t"], z["lat"], z["lon"], z["keys"]
win = np.array(["|".join(k.split("|")[:2]) for k in keys])
day = np.array([k.split("|")[2] for k in keys])
p99 = np.percentile(t[win == WINDOWS[0]], 99, axis=0)
d = pd.read_parquet(RAW / f"{m}_tasmax_daily.parquet")
key = (d.scenario + "|" + d.window).values
x = d[names].values
sp99 = np.quantile(x[key == WINDOWS[0]], 0.99, axis=0)
rng = pd.date_range(pd.Timestamp(d0) - pd.Timedelta(days=4), pd.Timestamp(d1) + pd.Timedelta(days=4)).strftime("%Y-%m-%d")
frames = []
for ds in rng:
    i = np.where((win == REPLAY_WINDOW) & (day == ds))[0]
    j = np.where((key == REPLAY_WINDOW) & (d.date.values == ds))[0]
    if not len(i) or not len(j):
        continue
    ex = regrid((t[i[0]] - p99) / 10.0, lat, lon)  # degrees C above design day
    hot = (x[j[0]] > sp99)
    frames.append({"date": ds, "share": round(float(hot.astype(float) @ w), 3),
                   "ex": b64u8((np.clip(ex, -10, 15.5) + 10) * 10), "hot": "".join("1" if v else "0" for v in hot)})
rep = {"model": m, "window": REPLAY_WINDOW, "run_days": int(run), "peak": round(float(peak), 3), "lat": LAT.tolist(), "lon": LON.tolist(),
       "sites": names.tolist(), "enc": "ex = byte / 10 - 10 (C above design day)", "frames": frames}
(OUT / "replay.json").write_text(json.dumps(rep, separators=(",", ":")))
print("replay", m, d0, d1, "run", run, "peak", round(float(peak), 2), "frames", len(frames))
