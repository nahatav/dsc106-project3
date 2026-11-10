"""What if the next gigawatts of AI capacity went somewhere else?

For each model and climate window, the planned fleet's daily extreme heat flags
(site above its own 1995-2014 99th percentile) are combined with new capacity
added in equal 1/10 shares at ten locations:
  best:    Figure 1's ten lowest-risk areas (2050s, moderate emissions)
  random:  ten random lower-48 counties (mean over 60 draws)
  pattern: the same shares as today's fleet (fleet shares unchanged)
New sites take the extreme heat flags of their nearest climate-model grid cell.
A shared heat day has at least 25% of total power in extreme heat. Counted May
to September, averaged over the 20 years, then the ten-model median.
Output: docs/data/whatif.json
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "cmip6"
WINDOWS = ["historical|1995-2014", "ssp245|2041-2060", "ssp585|2041-2060", "ssp245|2081-2100", "ssp585|2081-2100"]
ADD = list(range(0, 41, 2))  # GW added
inp = json.loads((ROOT / "data" / "siting_inputs.json").read_text())
picks = np.array([[d["lon"], d["lat"]] for d in inp["picks"]]); counties = np.array(inp["counties"])
rng = np.random.default_rng(7); draws = [counties[rng.choice(len(counties), 10, replace=False)] for _ in range(60)]
sites = pd.read_csv(ROOT / "data" / "sites.csv"); us = sites[sites.country == "United States"]
names, mw = us.name.values, us.planned_power_mw.values; W = mw.sum()

def cells(z, pts):
    lat, lon = z["lat"], np.where(z["lon"] > 180, z["lon"] - 360, z["lon"])
    return [(int(np.abs(lat - b).argmin()), int(np.abs(lon - a).argmin())) for a, b in pts]

res = {k: {s: [] for s in ("best", "random", "pattern")} for k in WINDOWS}
for f in sorted(RAW.glob("*_usgrid.npz")):
    m = f.stem.replace("_usgrid", ""); z = np.load(f); t = z["t"]; keys = z["keys"]
    win = np.array(["|".join(k.split("|")[:2]) for k in keys]); md = np.array([k.split("|")[2][5:] for k in keys]); yr = np.array([k.split("|")[2][:4] for k in keys])
    p99 = np.percentile(t[win == WINDOWS[0]], 99, axis=0)
    d = pd.read_parquet(RAW / f"{m}_tasmax_daily.parquet"); dk = (d.scenario + "|" + d.window).values; x = d[names].values
    sp = np.quantile(x[dk == WINDOWS[0]], 0.99, axis=0)
    pc = cells(z, picks); rc = [cells(z, dr) for dr in draws]
    for k in WINDOWS:
        sel = (win == k) & (md >= "05-01") & (md <= "09-30"); ny = len(np.unique(yr[sel]))
        dsel = (dk == k) & (d.date.str[5:].values >= "05-01") & (d.date.str[5:].values <= "09-30")
        hotmw = (x[dsel] > sp).astype(float) @ mw                     # MW of today's fleet in extreme heat, per summer day
        n = min(len(hotmw), sel.sum()); hotmw = hotmw[:n]
        hot = t[sel][:n] > p99                                        # days x lat x lon
        flag = lambda cl: np.stack([hot[:, i, j] for i, j in cl], 1).mean(1)  # share of the 10 new sites in extreme heat
        fb = flag(pc); fr = [flag(c) for c in rc]
        cnt = lambda newfrac, g: ((hotmw + newfrac * g * 1000) / (W + g * 1000) >= 0.25).sum() / ny
        res[k]["best"].append([cnt(fb, g) for g in ADD])
        res[k]["random"].append([float(np.mean([cnt(f2, g) for f2 in fr])) for g in ADD])
        res[k]["pattern"].append([cnt(np.zeros(n), 0)] * len(ADD))
    print(m, "done")
out = {"add_gw": ADD, "fleet_gw": round(W / 1000, 1), "picks": inp["picks"], "by": {k: {s: [round(float(v), 1) for v in np.median(np.array(a), 0)] for s, a in r.items()} for k, r in res.items()}}
(ROOT / "docs" / "data" / "whatif.json").write_text(json.dumps(out, separators=(",", ":")))
for k in WINDOWS:
    b = out["by"][k]; print(k, "pattern", b["pattern"][0], "| +20 GW best", b["best"][10], "random", b["random"][10], "| +40 best", b["best"][-1], "random", b["random"][-1])
