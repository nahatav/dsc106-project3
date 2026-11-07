"""Where should the next gigawatt go?

For each climate window and model, take the fleet's shared-heat days: days when
at least a quarter of planned US AI power is at sites above their design day.
For every grid cell, compute the share of those days on which the cell is
above its own design day too ("co-exposure"). A new data center in a pale cell
would usually be cool when the rest of the fleet is hot; one in a dark cell
would add to the shared risk.

Fields are regridded to the same 1-degree grid as reach.json and averaged
across models. We also report the marginal change in shared-heat days per year
from adding a 1 GW campus at each cell.

Output: docs/data/coexposure.json
"""
import base64
import json
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.interpolate import RegularGridInterpolator

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "cmip6"
OUT = ROOT / "docs" / "data"
WINDOWS = [("historical", "1995-2014"), ("ssp245", "2041-2060"), ("ssp585", "2041-2060"),
           ("ssp245", "2081-2100"), ("ssp585", "2081-2100")]
LAT = np.arange(24.0, 50.01, 1.0)
LON = np.arange(-125.0, -65.99, 1.0)
CUT, ADD_MW = 0.25, 1000.0


def main():
    sites = pd.read_csv(ROOT / "data" / "sites.csv")
    us = sites[sites.country == "United States"].reset_index(drop=True)
    names, power = us.name.values, us.planned_power_mw.values
    total = power.sum()
    models = sorted(p.stem.replace("_usgrid", "") for p in RAW.glob("*_usgrid.npz"))
    G = np.stack(np.meshgrid(LAT, LON, indexing="ij"), -1).reshape(-1, 2)
    acc = {k: {"co": np.zeros(len(G)), "delta": np.zeros(len(G)), "n": 0} for k in WINDOWS}
    for m in models:
        z = np.load(RAW / f"{m}_usgrid.npz")
        t = z["t"].astype(np.float32) / 10
        keys = z["keys"]
        lat, lon = z["lat"], np.where(z["lon"] > 180, z["lon"] - 360, z["lon"])
        hist = np.char.startswith(keys, "historical|")
        hot_cell = t > np.quantile(t[hist], 0.99, axis=0)
        daily = pd.read_parquet(RAW / f"{m}_tasmax_daily.parquet")
        sx = daily[names].values
        hot_site = sx > np.quantile(sx[(daily.scenario == "historical").values], 0.99, axis=0)
        share = hot_site.astype(float) @ (power / total)
        for s, p in WINDOWS:
            idx = np.where(np.char.startswith(keys, f"{s}|{p}|"))[0]
            years = len(idx) / 365.25
            shared = share[idx] >= CUT
            hc = hot_cell[idx].reshape(len(idx), -1)
            co = hc[shared].mean(0) if shared.any() else np.zeros(hc.shape[1])
            # marginal effect of 1 GW at each cell on shared-heat days per year
            new = (share[idx, None] * total + ADD_MW * hc) / (total + ADD_MW)
            delta = ((new >= CUT).sum(0) - shared.sum()) / years
            ny, nx = len(lat), len(lon)
            f1 = RegularGridInterpolator((lat, lon), co.reshape(ny, nx), bounds_error=False, fill_value=None)
            f2 = RegularGridInterpolator((lat, lon), delta.reshape(ny, nx), bounds_error=False, fill_value=None)
            a = acc[(s, p)]
            a["co"] += np.clip(f1(G), 0, 1); a["delta"] += f2(G); a["n"] += 1
        print(m, flush=True)

    out = {"lat": LAT.tolist(), "lon": LON.tolist(), "add_mw": ADD_MW, "by": {}}
    for s, p in WINDOWS:
        a = acc[(s, p)]
        co, delta = a["co"] / a["n"], a["delta"] / a["n"]
        out["by"][f"{s}|{p}"] = {
            "co": base64.b64encode(np.round(co * 100).astype(np.uint8).tobytes()).decode(),
            "delta": [round(float(v), 2) for v in delta],
        }
        print(s, p, "co range", round(float(co.min()), 2), round(float(co.max()), 2), "delta range", round(float(delta.min()), 2), round(float(delta.max()), 2))
    (OUT / "coexposure.json").write_text(json.dumps(out, separators=(",", ":")))


if __name__ == "__main__":
    main()
