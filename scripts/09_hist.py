"""Distribution of daily highs relative to each site's design day.

For every US site, model and climate window, subtract the model's own
1995-2014 99th percentile at that site from each daily max temperature, then
histogram in 0.5 C bins. Counts are pooled over the ten models and expressed
as days per year. Output: docs/data/hist.json
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "cmip6"
WINDOWS = ["historical|1995-2014", "ssp245|2041-2060", "ssp585|2041-2060", "ssp245|2081-2100", "ssp585|2081-2100"]
EDGES = np.arange(-24.0, 12.01, 0.5)

sites = pd.read_csv(ROOT / "data" / "sites.csv")
us = sites[sites.country == "United States"].name.values
acc = {k: np.zeros((len(us), len(EDGES) - 1)) for k in WINDOWS}
years = {k: 0.0 for k in WINDOWS}
models = sorted(p.stem.replace("_tasmax_daily", "") for p in RAW.glob("*_tasmax_daily.parquet"))
for m in models:
    d = pd.read_parquet(RAW / f"{m}_tasmax_daily.parquet")
    key = (d.scenario + "|" + d.window).values
    x = d[us].values
    p99 = np.quantile(x[key == WINDOWS[0]], 0.99, axis=0)
    a = x - p99
    for k in WINDOWS:
        sel = key == k
        years[k] += sel.sum() / 365.25
        for j in range(len(us)):
            acc[k][j] += np.histogram(np.clip(a[sel, j], EDGES[0], EDGES[-1] - 1e-6), EDGES)[0]
    print(m, flush=True)

out = {"edges": EDGES.tolist(), "sites": list(us), "by": {}}
for k in WINDOWS:
    per_year = acc[k] / years[k]
    out["by"][k] = [[round(float(v), 2) for v in row] for row in per_year]
    above = per_year[:, EDGES[:-1] >= 0].sum(1)
    print(k, "median days above design day", round(float(np.median(above)), 1))
(ROOT / "docs" / "data" / "hist.json").write_text(json.dumps(out, separators=(",", ":")))
