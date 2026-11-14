"""CMIP6 heat for each governance measure in Figure 6: the planned AI load the
measure covers and, on the fleet's shared heat days (at least a quarter of
planned US AI power in extreme heat at once), the GW of that covered load in
extreme heat. May to September, averaged over shared heat days, ten-model
median. Coverage is approximated from each measure's scope (see COVER).
Output: docs/data/govrules.json
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "cmip6"
WINDOWS = ["historical|1995-2014", "ssp245|2041-2060", "ssp585|2081-2100"]
sites = [s for s in json.loads((ROOT / "docs" / "data" / "sites.json").read_text())["sites"] if s["country"] == "United States"]
g = json.loads((ROOT / "data" / "raw" / "us_states.geojson").read_text())

def inside(pt, ring):
    x, y = pt; c = False; n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]; x2, y2 = ring[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c
def state_of(lon, lat):
    for f in g["features"]:
        gm = f["geometry"]; polys = gm["coordinates"] if gm["type"] == "MultiPolygon" else [gm["coordinates"]]
        if any(inside((lon, lat), p[0]) for p in polys): return f["properties"]["name"]
    return None
for s in sites: s["state"] = state_of(s["lon"], s["lat"])
FERC = {"PJM", "MISO", "SPP", "NYISO"}
COVER = {  # measure name -> which planned sites it covers
    "Georgia PSC large-load rule": lambda s: s["state"] == "Georgia",
    "Texas SB 6": lambda s: s["region"] == "ERCOT",
    "AEP Ohio data center tariff": lambda s: s["state"] == "Ohio",
    "Executive Order 14318": lambda s: True,
    "DOE federal AI sites": lambda s: False,
    "DOE 202(c) heat-wave order": lambda s: s["region"] == "PJM",
    "FERC large-load show-cause orders": lambda s: s["region"] in FERC,
    "FERC order on NERC standards": lambda s: True,
}
names = [s["name"] for s in sites]; mw = np.array([s["power"] for s in sites]); W = mw.sum()
masks = {k: np.array([f(s) for s in sites]) for k, f in COVER.items()}
acc = {k: {m: [] for m in COVER} for k in WINDOWS}
for f in sorted(RAW.glob("*_tasmax_daily.parquet")):
    d = pd.read_parquet(f); dk = (d.scenario + "|" + d.window).values; x = d[names].values; md = d.date.str[5:].values
    sp = np.quantile(x[dk == WINDOWS[0]], 0.99, axis=0)
    for k in WINDOWS:
        sel = (dk == k) & (md >= "05-01") & (md <= "09-30"); hot = x[sel] > sp
        shared = (hot.astype(float) @ mw) / W >= 0.25
        for m, msk in masks.items():
            acc[k][m].append(float(((hot[:, msk].astype(float) @ mw[msk]) / 1000)[shared].mean()) if shared.any() and msk.any() else 0.0)
out = {"cover_gw": {m: round(float(mw[msk].sum() / 1000), 1) for m, msk in masks.items()}, "states": {s["name"]: s["state"] for s in sites},
       "by": {k: {m: round(float(np.median(v)), 2) for m, v in acc[k].items()} for k in WINDOWS}}
(ROOT / "docs" / "data" / "govrules.json").write_text(json.dumps(out, separators=(",", ":")))
print("missing states:", [s["name"] for s in sites if not s["state"]])
for m in COVER: print(f"{m:36s} cover {out['cover_gw'][m]:5.1f} GW | hot on shared day:", [out['by'][k][m] for k in WINDOWS])
