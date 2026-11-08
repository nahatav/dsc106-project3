"""Every simulated summer, day by day, for the mosaic in Figure 3.

For each climate, model and year: a May-September string of flags, 1 where
the day is a shared heat day (at least a quarter of planned US AI power above
its sites' design days). Output: docs/data/mosaic.json
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "cmip6"
WINDOWS = ["historical|1995-2014", "ssp245|2041-2060", "ssp585|2041-2060", "ssp245|2081-2100", "ssp585|2081-2100"]
sites = pd.read_csv(ROOT / "data" / "sites.csv")
us = sites[sites.country == "United States"]
names, w = us.name.values, us.planned_power_mw.values / us.planned_power_mw.sum()

out = {"start": "05-01", "days": 153, "by": {k: [] for k in WINDOWS}}
for f in sorted(RAW.glob("*_tasmax_daily.parquet")):
    m = f.stem.replace("_tasmax_daily", "")
    d = pd.read_parquet(f)
    key = (d.scenario + "|" + d.window).values
    x = d[names].values
    shared = ((x > np.quantile(x[key == WINDOWS[0]], 0.99, axis=0)).astype(float) @ w) >= 0.25
    md = d.date.str[5:].values
    yr = d.date.str[:4].astype(int).values
    summer = (md >= "05-01") & (md <= "09-30")
    for k in WINDOWS:
        for y in np.unique(yr[key == k]):
            sel = (key == k) & (yr == y) & summer
            flags = "".join("1" if v else "0" for v in shared[sel])[:153].ljust(153, "0")
            out["by"][k].append({"m": m, "y": int(y), "f": flags})
for k in WINDOWS:
    n = np.mean([r["f"].count("1") for r in out["by"][k]])
    print(k, "summers", len(out["by"][k]), "mean shared days May-Sep", round(n, 1))
(ROOT / "docs" / "data" / "mosaic.json").write_text(json.dumps(out, separators=(",", ":")))
