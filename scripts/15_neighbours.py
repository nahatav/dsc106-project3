"""For each grid region: on the summer days it is under region-wide heat, the
chance that at least one neighbouring region (sharing a state border) is too,
and the average share of its neighbours that are. Ten-model median, from the
daily region calendars written by 04_regions.py. Output: docs/data/neighbours.json
"""
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CAL = ROOT / "docs" / "data" / "calendar"
WINDOWS = ["historical|1995-2014", "ssp245|2041-2060", "ssp585|2041-2060", "ssp245|2081-2100", "ssp585|2081-2100"]
NB = {"West": ["ERCOT", "SPP", "MISO"], "ERCOT": ["West", "SPP", "MISO"], "SPP": ["West", "ERCOT", "MISO"],
      "MISO": ["West", "ERCOT", "SPP", "PJM", "Southeast"], "Southeast": ["MISO", "PJM"], "PJM": ["MISO", "Southeast", "NYISO"], "NYISO": ["PJM"]}
out = {"neighbours": NB, "by": {}}
for k in WINDOWS:
    s, p = k.split("|"); res = {g: {"any": [], "share": [], "days": []} for g in NB}
    for f in sorted(CAL.glob(f"*_{s}_{p}.json")):
        d = json.loads(f.read_text()); regs = d["regions"]
        F = np.concatenate([np.array([[c == "1" for c in fl] for fl in v["flags"]]) for v in d["years"].values()], axis=1)  # regions x days
        ny = len(d["years"])
        for g, nb in NB.items():
            a = F[regs.index(g)]; nbm = F[[regs.index(x) for x in nb]]
            if a.sum() == 0: continue
            res[g]["any"].append(float(nbm[:, a].any(0).mean())); res[g]["share"].append(float(nbm[:, a].mean())); res[g]["days"].append(float(a.sum() / ny))
    out["by"][k] = {g: {q: round(float(np.median(v[q])), 3) if v[q] else None for q in v} for g, v in res.items()}
    print(k, {g: out["by"][k][g]["any"] for g in NB})
(ROOT / "docs" / "data" / "neighbours.json").write_text(json.dumps(out, separators=(",", ":")))
