"""For each grid region, on its region-wide heat days (May to September), the
share of days on which 0, 1, 2, or 3+ bordering regions are also under
region-wide heat, pooled over ten models and 20 summers per period.
Output: docs/data/nbdist.json
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
    s, p = k.split("|"); cnt = {g: np.zeros(4) for g in NB}; days = {g: 0.0 for g in NB}; nyr = 0
    for f in sorted(CAL.glob(f"*_{s}_{p}.json")):
        d = json.loads(f.read_text()); regs = d["regions"]; nyr += len(d["years"])
        F = np.concatenate([np.array([[c == "1" for c in fl] for fl in v["flags"]]) for v in d["years"].values()], axis=1)
        for g, nb in NB.items():
            a = F[regs.index(g)]; n = F[[regs.index(x) for x in nb]][:, a].sum(0)
            for i in range(4): cnt[g][i] += (np.minimum(n, 3) == i).sum()
            days[g] += a.sum()
    out["by"][k] = {g: {"dist": [round(float(v / max(1, cnt[g].sum())), 3) for v in cnt[g]], "days": round(days[g] / nyr, 1)} for g in NB}
    print(k, {g: (out["by"][k][g]["days"], round(1 - out["by"][k][g]["dist"][0], 2)) for g in NB})
(ROOT / "docs" / "data" / "nbdist.json").write_text(json.dumps(out, separators=(",", ":")))
