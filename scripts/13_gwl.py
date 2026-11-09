"""Shared heat days per summer against global warming level, per model and window.

Global warming level is each model's warming relative to 1995-2014 plus 0.85 C
(AR6's estimate of 1995-2014 above 1850-1900). Shared heat days come from
docs/data/mosaic.json (mean over the 20 simulated summers).
Output: docs/data/gwl.json
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
g = pd.read_csv(ROOT / "data" / "raw" / "gmst.csv")
mos = json.loads((ROOT / "docs" / "data" / "mosaic.json").read_text())["by"]
pts = []
for _, r in g.iterrows():
    k = f"{r.scenario}|{r.window}"
    days = [row["f"].count("1") for row in mos[k] if row["m"] == r.model]
    if days:
        pts.append({"m": r.model, "k": k, "gwl": round(float(r.warming_vs_1995_2014) + 0.85, 2), "days": round(float(np.mean(days)), 1)})
x = np.array([p["gwl"] for p in pts]); y = np.array([p["days"] for p in pts])
# a quadratic in warming through the ensemble, plus the model spread of residuals
c = np.polyfit(x, y, 2); res = y - np.polyval(c, x); sd = float(np.std(res))
grid = np.round(np.arange(0.8, 6.01, 0.1), 2)
fit = [{"gwl": float(t), "days": round(float(np.polyval(c, t)), 1), "lo": round(float(np.polyval(c, t) - sd), 1), "hi": round(float(np.polyval(c, t) + sd), 1)} for t in grid]
at = {str(t): round(float(np.polyval(c, t)), 1) for t in [1.5, 2.0, 3.0, 4.0]}
(ROOT / "docs" / "data" / "gwl.json").write_text(json.dumps({"pts": pts, "fit": fit, "at": at, "sd": round(sd, 1)}, separators=(",", ":")))
print("points", len(pts), "at", at, "sd", round(sd, 1))
