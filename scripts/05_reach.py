"""Heat-wave reach: when one AI site is in extreme heat, where else is it hot?

For every model, climate window and US site we take the days that site is above
its design day (its own 1995-2014 99th percentile of daily max temperature)
and compute, for every grid cell, the share of those days the cell is above
its own design day too. Fields are regridded bilinearly to a common 1-degree
grid over the contiguous US and averaged across the ten models, so each map
pools roughly 10 models x 20 years of hot days.

We also compute, per site, the expected share of the rest of the planned
fleet's power in extreme heat on that site's hot days ("reach"), and the
site-to-site conditional probabilities used to colour the circles.

Output: docs/data/reach.json
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


def main():
    sites = pd.read_csv(ROOT / "data" / "sites.csv")
    us = sites[sites.country == "United States"].reset_index(drop=True)
    names = us.name.values
    power = us.planned_power_mw.values
    models = sorted(p.stem.replace("_usgrid", "") for p in RAW.glob("*_usgrid.npz"))
    G = np.stack(np.meshgrid(LAT, LON, indexing="ij"), -1).reshape(-1, 2)

    acc = {k: {"field": np.zeros((len(names), len(LAT) * len(LON))), "n": np.zeros(len(names)),
               "pair": np.zeros((len(names), len(names))), "reach": np.zeros(len(names)),
               "uncond": np.zeros(len(LAT) * len(LON))} for k in WINDOWS}
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
        skeys = (daily.scenario + "|" + daily.window + "|" + daily.date).values
        assert (skeys == keys).all(), m
        ny, nx = len(lat), len(lon)
        for s, p in WINDOWS:
            idx = np.where(np.char.startswith(keys, f"{s}|{p}|"))[0]
            hs = hot_site[idx].astype(np.float32)               # (T, S)
            hc = hot_cell[idx].reshape(len(idx), -1).astype(np.float32)  # (T, cells)
            cnt = hs.sum(0)
            joint = hs.T @ hc                                     # (S, cells)
            with np.errstate(invalid="ignore", divide="ignore"):
                cond = joint / cnt[:, None]
            # regrid each site's field to the common grid
            reg = np.zeros((len(names), len(G)))
            for i in range(len(names)):
                f = RegularGridInterpolator((lat, lon), np.nan_to_num(cond[i]).reshape(ny, nx), bounds_error=False, fill_value=None)
                reg[i] = np.clip(f(G), 0, 1)
            fu = RegularGridInterpolator((lat, lon), hc.mean(0).reshape(ny, nx), bounds_error=False, fill_value=None)
            a = acc[(s, p)]
            ok = cnt > 0
            a["field"][ok] += reg[ok]; a["n"][ok] += 1
            a["uncond"] += np.clip(fu(G), 0, 1)
            with np.errstate(invalid="ignore", divide="ignore"):
                a["pair"][ok] += ((hs.T @ hs) / cnt[:, None])[ok]
            share = hs * power[None, :]
            for i in np.where(ok)[0]:
                d = hs[:, i] > 0
                rest = (share[d].sum(1) - power[i]) / (power.sum() - power[i])
                a["reach"][i] += rest.mean()
        print(m, flush=True)

    out = {"lat": LAT.tolist(), "lon": LON.tolist(), "sites": list(names), "by": {}}
    for s, p in WINDOWS:
        a = acc[(s, p)]
        n = np.maximum(a["n"], 1)
        field = a["field"] / n[:, None]
        pair = a["pair"] / n[:, None]
        reach = a["reach"] / n
        out["by"][f"{s}|{p}"] = {
            "fields": [base64.b64encode(np.round(f * 100).astype(np.uint8).tobytes()).decode() for f in field],
            "uncond": base64.b64encode(np.round(a["uncond"] / len(models) * 100).astype(np.uint8).tobytes()).decode(),
            "reach": [round(float(x), 4) for x in reach],
            "pair": [[int(round(v * 100)) for v in row] for row in pair],
        }
        print(s, p, "median reach", round(float(np.median(reach)), 3), "max", names[int(np.argmax(reach))], round(float(reach.max()), 3))
    (OUT / "reach.json").write_text(json.dumps(out, separators=(",", ":")))


if __name__ == "__main__":
    main()
