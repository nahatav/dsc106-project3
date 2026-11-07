"""Global field of extreme heat days per year, for the world map.

For each model: read the five daily tasmax windows over the whole globe, take
each grid cell's 1995-2014 99th percentile, and count days per year above it in
each window. Regrid to a common 2-degree global grid and take the ten-model
median. Output: docs/data/global.json (uint8 days per year, capped at 255).
"""
import base64
import json
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
TMP = ROOT / "data" / "raw" / "global"
TMP.mkdir(parents=True, exist_ok=True)
MODELS = ["ACCESS-CM2", "CanESM5", "CNRM-CM6-1", "GFDL-ESM4", "INM-CM5-0",
          "IPSL-CM6A-LR", "MIROC6", "MPI-ESM1-2-LR", "MRI-ESM2-0", "NorESM2-LM"]
WINDOWS = [("historical", "1995-2014", "1995", "2014"), ("ssp245", "2041-2060", "2041", "2060"),
           ("ssp585", "2041-2060", "2041", "2060"), ("ssp245", "2081-2100", "2081", "2100"),
           ("ssp585", "2081-2100", "2081", "2100")]
LAT = np.arange(-89.0, 90.0, 2.0)
LON = np.arange(-179.0, 180.0, 2.0)


def run(model):
    import xarray as xr, gcsfs
    from scipy.interpolate import RegularGridInterpolator
    out = TMP / f"{model}.npz"
    if out.exists():
        return f"{model}: cached"
    fs = gcsfs.GCSFileSystem(token="anon")
    cat = pd.read_csv("https://storage.googleapis.com/cmip6/pangeo-cmip6.csv")
    cat = cat[(cat.table_id == "day") & (cat.variable_id == "tasmax") & (cat.source_id == model)]
    p99, res = None, {}
    for exp, label, a, b in WINDOWS:
        q = cat[(cat.experiment_id == exp) & cat.member_id.str.match(r"r1i1p1f\d")].sort_values("version")
        ds = xr.open_zarr(fs.get_mapper(q.iloc[-1].zstore), consolidated=True, chunks=None,
                          decode_times=xr.coders.CFDatetimeCoder(use_cftime=True))
        da = ds.tasmax.sortby("time")
        da = da.isel(time=~da.indexes["time"].duplicated()).sel(time=slice(a, b))
        arr = da.values.astype(np.float32)
        lat, lon = da.lat.values, da.lon.values
        if p99 is None:
            p99 = np.quantile(arr, 0.99, axis=0)
        days = (arr > p99).sum(0) / (arr.shape[0] / 365.25)
        # regrid with longitude wrap
        lon180 = np.where(lon > 180, lon - 360, lon); order = np.argsort(lon180)
        lo, f = lon180[order], days[:, order]
        lo = np.concatenate([lo[-1:] - 360, lo, lo[:1] + 360]); f = np.concatenate([f[:, -1:], f, f[:, :1]], axis=1)
        if lat[0] > lat[-1]:
            lat, f = lat[::-1], f[::-1]
        interp = RegularGridInterpolator((lat, lo), f, bounds_error=False, fill_value=None)
        G = np.stack(np.meshgrid(LAT, LON, indexing="ij"), -1).reshape(-1, 2)
        res[f"{exp}|{label}"] = interp(G).reshape(len(LAT), len(LON)).astype(np.float32)
        del arr
    np.savez_compressed(out, **{k.replace("|", "__"): v for k, v in res.items()})
    return f"{model}: done"


if __name__ == "__main__":
    models = sys.argv[1:] or MODELS
    with ProcessPoolExecutor(max_workers=3) as ex:
        for f in as_completed({ex.submit(run, m): m for m in models}):
            try:
                print(f.result(), flush=True)
            except Exception as e:
                print("FAILED", repr(e), flush=True)
    files = [np.load(p) for p in sorted(TMP.glob("*.npz"))]
    out = {"lat": LAT.tolist(), "lon": LON.tolist(), "n_models": len(files), "by": {}}
    for exp, label, _, _ in WINDOWS:
        k = f"{exp}__{label}"
        med = np.median(np.stack([f[k] for f in files]), axis=0)
        out["by"][f"{exp}|{label}"] = base64.b64encode(np.clip(np.round(med), 0, 255).astype(np.uint8).tobytes()).decode()
        print(exp, label, "median days range", float(med.min()), float(med.max()))
    (ROOT / "docs" / "data" / "global.json").write_text(json.dumps(out, separators=(",", ":")))
