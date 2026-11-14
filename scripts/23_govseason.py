"""CMIP6 heat season for each governance measure in Figure 6: for every day from
May 1 to September 30, the share of model summers (ten models x 20 years) in
which at least a quarter of the planned AI load the measure covers is in extreme
heat at once (above each site's own 1995-2014 99th percentile). 5-day smoothed.
Coverage follows scripts/22_govrules.py.
Output: docs/data/govseason.json
"""
import json, importlib.util
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("gr", ROOT / "scripts" / "22_govrules.py")
WINDOWS = ["historical|1995-2014", "ssp245|2041-2060", "ssp585|2081-2100"]
RAW = ROOT / "data" / "raw" / "cmip6"

# reuse site coverage from the govrules output (state per site) without rerunning it
gr = json.loads((ROOT / "docs" / "data" / "govrules.json").read_text())
sites = [s for s in json.loads((ROOT / "docs" / "data" / "sites.json").read_text())["sites"] if s["country"] == "United States"]
for s in sites: s["state"] = gr["states"].get(s["name"])
FERC = {"PJM", "MISO", "SPP", "NYISO"}
COVER = {
    "Georgia PSC large-load rule": lambda s: s["state"] == "Georgia",
    "Texas SB 6": lambda s: s["region"] == "ERCOT",
    "AEP Ohio data center tariff": lambda s: s["state"] == "Ohio",
    "Executive Order 14318": lambda s: True,
    "DOE 202(c) heat-wave order": lambda s: s["region"] == "PJM",
    "FERC large-load show-cause orders": lambda s: s["region"] in FERC,
    "FERC order on NERC standards": lambda s: True,
}
names = [s["name"] for s in sites]; mw = np.array([s["power"] for s in sites])
masks = {k: np.array([f(s) for s in sites]) for k, f in COVER.items()}
MD = [d.strftime("%m-%d") for d in pd.date_range("2001-05-01", "2001-09-30")]
pos = {m: i for i, m in enumerate(MD)}
hit = {k: {m: np.zeros(len(MD)) for m in COVER} for k in WINDOWS}; cnt = {k: np.zeros(len(MD)) for k in WINDOWS}
for f in sorted(RAW.glob("*_tasmax_daily.parquet")):
    d = pd.read_parquet(f); dk = (d.scenario + "|" + d.window).values; x = d[names].values; md = d.date.str[5:].values
    sp = np.quantile(x[dk == WINDOWS[0]], 0.99, axis=0)
    for k in WINDOWS:
        sel = (dk == k) & np.isin(md, MD); hot = x[sel] > sp; ix = np.array([pos[m] for m in md[sel]])
        np.add.at(cnt[k], ix, 1)
        for m, msk in masks.items():
            on = ((hot[:, msk].astype(float) @ mw[msk]) / mw[msk].sum()) >= 0.25
            np.add.at(hit[k][m], ix, on.astype(float))
def smooth(v, n=5):
    p = np.pad(v, n // 2, mode="edge"); return np.convolve(p, np.ones(n) / n, mode="valid")
out = {"days": MD, "by": {m: {k: [round(float(v), 3) for v in smooth(hit[k][m] / np.maximum(cnt[k], 1))] for k in WINDOWS} for m in COVER}}
(ROOT / "docs" / "data" / "govseason.json").write_text(json.dumps(out, separators=(",", ":")))
for m in COVER: print(f"{m:36s}", [round(float(np.max(out['by'][m][k])), 2) for k in WINDOWS], [round(float(np.sum(out['by'][m][k])), 1) for k in WINDOWS])
