"""Data for the story figures.

buildout.json  monthly planned power per US site, 2022-01 to 2030-12, from
               Epoch's construction timelines (step function between dates).
season.json    for each climate and day of year, the chance that the day is a
               shared heat day (a quarter of planned US power in extreme heat),
               pooled over ten models and 20 years.
streams.json   for each climate, grid region and day of year, the chance of
               region-wide heat (half the region above its design day).
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd
from matplotlib.path import Path as MPath

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "cmip6"
OUT = ROOT / "docs" / "data"
WINDOWS = ["historical|1995-2014", "ssp245|2041-2060", "ssp585|2041-2060", "ssp245|2081-2100", "ssp585|2081-2100"]
REGION_STATES = {
    "ERCOT": ["Texas"], "SPP": ["Kansas", "Oklahoma", "Nebraska", "South Dakota"],
    "MISO": ["North Dakota", "Minnesota", "Iowa", "Wisconsin", "Michigan", "Illinois", "Indiana", "Missouri", "Arkansas", "Louisiana", "Mississippi"],
    "PJM": ["Ohio", "Pennsylvania", "New Jersey", "Delaware", "Maryland", "District of Columbia", "Virginia", "West Virginia", "Kentucky"],
    "NYISO": ["New York"], "Southeast": ["Tennessee", "Alabama", "Georgia", "South Carolina", "North Carolina", "Florida"],
    "West": ["Washington", "Oregon", "California", "Nevada", "Arizona", "Utah", "Idaho", "Montana", "Wyoming", "Colorado", "New Mexico"],
}


def doy(dates):
    d = pd.to_datetime(pd.Series(dates).str.replace("-02-29", "-02-28"), errors="coerce")
    return d.dt.dayofyear.values - (d.dt.is_leap_year & (d.dt.dayofyear > 59)).values


def buildout():
    sites = pd.read_csv(ROOT / "data" / "sites.csv")
    us = sites[sites.country == "United States"]
    t = pd.read_csv(ROOT / "data" / "raw" / "dc_zip" / "data_center_timelines.csv")
    t["Date"] = pd.to_datetime(t["Date"], errors="coerce")
    months = pd.date_range("2022-01-01", "2030-12-01", freq="MS")
    rows = []
    for s in us.itertuples():
        tl = t[t["Data center"] == s.name].dropna(subset=["Date"]).sort_values("Date")
        pw = tl["Power (MW)"].fillna(0).values
        dts = tl["Date"].values
        ser = []
        for m in months:
            idx = np.searchsorted(dts, np.datetime64(m), side="right") - 1
            ser.append(round(float(pw[idx]), 1) if idx >= 0 else 0.0)
        if max(ser) == 0:
            ser[-1] = float(s.planned_power_mw)  # no dated timeline: show at end
        rows.append({"name": s.name, "s": ser})
    (OUT / "buildout.json").write_text(json.dumps({"months": [m.strftime("%Y-%m") for m in months], "sites": rows}, separators=(",", ":")))
    tot = np.array([r["s"] for r in rows]).sum(0)
    print("buildout total GW 2023-01, 2026-01, 2030-12:", round(tot[12] / 1000, 1), round(tot[48] / 1000, 1), round(tot[-1] / 1000, 1))


def season():
    sites = pd.read_csv(ROOT / "data" / "sites.csv")
    us = sites[sites.country == "United States"]
    names, w = us.name.values, us.planned_power_mw.values / us.planned_power_mw.sum()
    acc = {k: np.zeros(365) for k in WINDOWS}; cnt = {k: np.zeros(365) for k in WINDOWS}
    for f in sorted(RAW.glob("*_tasmax_daily.parquet")):
        d = pd.read_parquet(f); key = (d.scenario + "|" + d.window).values
        x = d[names].values; p99 = np.quantile(x[key == WINDOWS[0]], 0.99, axis=0)
        shared = ((x > p99).astype(float) @ w) >= 0.25
        dd = doy(d.date.values)
        for k in WINDOWS:
            sel = key == k
            np.add.at(acc[k], dd[sel] - 1, shared[sel]); np.add.at(cnt[k], dd[sel] - 1, 1)
    out = {k: [round(float(v), 3) for v in acc[k] / np.maximum(cnt[k], 1)] for k in WINDOWS}
    (OUT / "season.json").write_text(json.dumps(out, separators=(",", ":")))
    for k in WINDOWS:
        a = np.array(out[k]); print("season", k, "days/yr", round(a.sum(), 1), "days with p>0.25:", int((a > 0.25).sum()))


def streams():
    g = json.load(open(ROOT / "data" / "raw" / "us_states.geojson"))
    paths = {}
    for f in g["features"]:
        geom = f["geometry"]; rings = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
        paths[f["properties"]["name"]] = [MPath(np.array(p[0])) for p in rings]
    regions = list(REGION_STATES)
    acc = {k: np.zeros((len(regions), 365)) for k in WINDOWS}; cnt = {k: np.zeros(365) for k in WINDOWS}
    for f in sorted(RAW.glob("*_usgrid.npz")):
        z = np.load(f); t = z["t"].astype(np.float32) / 10; keys = z["keys"]
        lat, lon = z["lat"], np.where(z["lon"] > 180, z["lon"] - 360, z["lon"])
        LON, LAT = np.meshgrid(lon, lat); pts = np.column_stack([LON.ravel(), LAT.ravel()])
        wc = np.cos(np.deg2rad(LAT))
        hist = np.char.startswith(keys, "historical|"); hot = t > np.quantile(t[hist], 0.99, axis=0)
        dd = doy([k.split("|")[2] for k in keys]); win = np.array(["|".join(k.split("|")[:2]) for k in keys])
        for r, reg in enumerate(regions):
            mk = np.zeros(len(pts), bool)
            for s in REGION_STATES[reg]:
                for pth in paths[s]:
                    mk |= pth.contains_points(pts)
            mk = mk.reshape(LAT.shape); ww = wc * mk
            share = (hot * ww).sum((1, 2)) / ww.sum()
            for k in WINDOWS:
                sel = win == k
                np.add.at(acc[k][r], dd[sel] - 1, share[sel] >= 0.5)
        for k in WINDOWS:
            np.add.at(cnt[k], dd[win == k] - 1, 1)
        print("streams", f.stem, flush=True)
    out = {"regions": regions, "by": {k: [[round(float(v), 3) for v in acc[k][r] / np.maximum(cnt[k], 1)] for r in range(len(regions))] for k in WINDOWS}}
    (OUT / "streams.json").write_text(json.dumps(out, separators=(",", ":")))


if __name__ == "__main__":
    buildout(); season(); streams()
