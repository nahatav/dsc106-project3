"""How many grid regions are under region-wide heat at once?

Reads the May-September calendar files written by 04_regions.py and counts,
for every model and simulated year, the days with at least k regions under
region-wide heat (k = 1..4). Reports the ten-model median and range of the
per-model yearly mean. Region-wide heat outside May-September is rare and is
not counted.

Output: docs/data/simul.json
"""
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CAL = ROOT / "docs" / "data" / "calendar"
WINDOWS = ["historical|1995-2014", "ssp245|2041-2060", "ssp585|2041-2060", "ssp245|2081-2100", "ssp585|2081-2100"]
K = [1, 2, 3, 4]

out = {"k": K, "by": {}}
for key in WINDOWS:
    s, p = key.split("|")
    per_model = []
    for f in sorted(CAL.glob(f"*_{s}_{p}.json")):
        years = json.loads(f.read_text())["years"].values()
        rows = []
        for y in years:
            cnt = np.array([[c == "1" for c in fl] for fl in y["flags"]]).sum(0)
            rows.append([(cnt >= k).sum() for k in K])
        per_model.append(np.mean(rows, axis=0))
    pm = np.array(per_model)
    out["by"][key] = {"median": np.round(np.median(pm, 0), 1).tolist(), "lo": np.round(pm.min(0), 1).tolist(), "hi": np.round(pm.max(0), 1).tolist()}
    print(key, out["by"][key]["median"])
(ROOT / "docs" / "data" / "simul.json").write_text(json.dumps(out))
