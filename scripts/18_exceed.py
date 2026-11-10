"""Exceedance curves for Figure 5: days per summer (May to September) on which
at least X GW of planned US AI power is in extreme heat at once, for X from 0
to 43 GW. Ten-model median with the model range. Output: docs/data/exceed.json
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "cmip6"
WINDOWS = ["historical|1995-2014", "ssp245|2041-2060", "ssp585|2041-2060", "ssp245|2081-2100", "ssp585|2081-2100"]
X = np.round(np.arange(0, 43.01, 0.25), 2)
sites = pd.read_csv(ROOT / "data" / "sites.csv"); us = sites[sites.country == "United States"]
names, mw = us.name.values, us.planned_power_mw.values
acc = {k: [] for k in WINDOWS}; worst = {k: [] for k in WINDOWS}
for f in sorted(RAW.glob("*_tasmax_daily.parquet")):
    d = pd.read_parquet(f); dk = (d.scenario + "|" + d.window).values; x = d[names].values
    sp = np.quantile(x[dk == WINDOWS[0]], 0.99, axis=0); md = d.date.str[5:].values; yr = d.date.str[:4].values
    for k in WINDOWS:
        sel = (dk == k) & (md >= "05-01") & (md <= "09-30"); gw = ((x[sel] > sp).astype(float) @ mw) / 1000; ny = len(np.unique(yr[sel]))
        acc[k].append([(gw >= t).sum() / ny for t in X])
        worst[k].append(float(np.mean([gw[yr[sel] == y].max() for y in np.unique(yr[sel])])))
out = {"x": X.tolist(), "fleet_gw": round(mw.sum() / 1000, 1), "by": {}}
for k in WINDOWS:
    a = np.array(acc[k]); out["by"][k] = {"med": np.round(np.median(a, 0), 1).tolist(), "lo": np.round(np.percentile(a, 10, 0), 1).tolist(), "hi": np.round(np.percentile(a, 90, 0), 1).tolist(), "worst": round(float(np.median(worst[k])), 1)}
    i15, i109 = list(X).index(1.5), list(X).index(11.0)
    print(k, "days >=1.5 GW", out["by"][k]["med"][i15], "| >=11 GW", out["by"][k]["med"][i109], "| typical worst day GW", out["by"][k]["worst"])
(ROOT / "docs" / "data" / "exceed.json").write_text(json.dumps(out, separators=(",", ":")))
