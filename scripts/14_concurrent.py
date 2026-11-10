"""Days per summer (May to September) on which several grid regions are under
region-wide heat at once, from the daily region calendars written by
04_regions.py. Output: docs/data/concurrent.json
"""
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CAL = ROOT / "docs" / "data" / "calendar"
WINDOWS = ["historical|1995-2014", "ssp245|2041-2060", "ssp585|2041-2060", "ssp245|2081-2100", "ssp585|2081-2100"]
out = {"by": {}}
for k in WINDOWS:
    s, p = k.split("|")
    per_model = {}
    for f in sorted(CAL.glob(f"*_{s}_{p}.json")):
        m = f.stem[: -len(f"_{s}_{p}")]
        d = json.loads(f.read_text())
        rows = []
        for y, v in d["years"].items():
            n = np.sum([[c == "1" for c in fl] for fl in v["flags"]], axis=0)
            rows.append([int((n >= t).sum()) for t in (1, 2, 3, 4)])
        per_model[m] = np.mean(rows, axis=0)
    a = np.array(list(per_model.values()))
    out["by"][k] = {"mean": [round(float(x), 1) for x in a.mean(0)], "lo": [round(float(x), 1) for x in a.min(0)], "hi": [round(float(x), 1) for x in a.max(0)]}
    print(k, out["by"][k]["mean"], "range 3+", out["by"][k]["lo"][2], out["by"][k]["hi"][2])
(ROOT / "docs" / "data" / "concurrent.json").write_text(json.dumps(out, separators=(",", ":")))
