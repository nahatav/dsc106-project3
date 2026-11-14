"""CMIP6 heat by who regulates grid connections (Figure 6). For each regulator
group and climate, on the fleet's shared heat days (at least a quarter of
planned US AI power in extreme heat at once): the GW of the group's planned AI
load in extreme heat, and that as a share of the group's capacity. May to
September, averaged over shared heat days, then the ten-model median.
Output: docs/data/govheat.json
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "cmip6"
WINDOWS = ["historical|1995-2014", "ssp245|2041-2060", "ssp585|2041-2060", "ssp245|2081-2100", "ssp585|2081-2100"]
GROUPS = {"FERC": ["PJM", "MISO", "SPP", "NYISO"], "TX": ["ERCOT"], "STATE": ["Southeast", "West"]}
sites = json.loads((ROOT / "docs" / "data" / "sites.json").read_text())["sites"]
us = [s for s in sites if s["country"] == "United States"]
names = [s["name"] for s in us]; mw = np.array([s["power"] for s in us]); W = mw.sum()
gmask = {g: np.array([s["region"] in rs for s in us]) for g, rs in GROUPS.items()}
acc = {k: {g: {"gw": [], "share": []} for g in GROUPS} for k in WINDOWS}; days = {k: [] for k in WINDOWS}
for f in sorted(RAW.glob("*_tasmax_daily.parquet")):
    d = pd.read_parquet(f); dk = (d.scenario + "|" + d.window).values; x = d[names].values; md = d.date.str[5:].values; yr = d.date.str[:4].values
    sp = np.quantile(x[dk == WINDOWS[0]], 0.99, axis=0)
    for k in WINDOWS:
        sel = (dk == k) & (md >= "05-01") & (md <= "09-30"); hot = x[sel] > sp
        shared = (hot.astype(float) @ mw) / W >= 0.25; days[k].append(shared.sum() / len(np.unique(yr[sel])))
        for g, m in gmask.items():
            gw = (hot[:, m].astype(float) @ mw[m]) / 1000
            acc[k][g]["gw"].append(float(gw[shared].mean()) if shared.any() else 0.0)
            acc[k][g]["share"].append(float(gw[shared].mean() / (mw[m].sum() / 1000)) if shared.any() else 0.0)
out = {"groups": GROUPS, "cap_gw": {g: round(float(mw[m].sum() / 1000), 1) for g, m in gmask.items()}, "by": {}}
for k in WINDOWS:
    out["by"][k] = {"shared_days": round(float(np.median(days[k])), 1), **{g: {q: round(float(np.median(v)), 3) for q, v in acc[k][g].items()} for g in GROUPS}}
    print(k, out["by"][k])
(ROOT / "docs" / "data" / "govheat.json").write_text(json.dumps(out, separators=(",", ":")))
