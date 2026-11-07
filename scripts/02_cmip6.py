"""Extract CMIP6 daily max temperature at every AI data center, plus the
gridded field over the contiguous US for the animated heat map.

Source: Pangeo / Google Cloud public CMIP6 zarr store (gs://cmip6), the archive
the course notebook uses. For each model we read five 20-year windows of
daily tasmax (1995-2014 historical; 2041-2060 and 2081-2100 under SSP2-4.5 and
SSP5-8.5). Each window is read in one bulk request and indexed locally, which
is far faster than point indexing a remote store. Models run in separate
processes.

Outputs in data/raw/cmip6/:
  <model>_tasmax_daily.parquet  daily tasmax (C) at each site, all windows
  <model>_p99.parquet           each site's 1995-2014 99th percentile
  <model>.parquet               per-site yearly metrics
  <model>_usgrid.npz            daily tasmax over 22-52N, 128-64W (C x 10, int16)
"""
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "raw" / "cmip6"
OUT.mkdir(parents=True, exist_ok=True)

# Ten models spanning CMIP6 climate sensitivity (ECS ~1.8 C for INM to ~5.6 C
# for CanESM5).
MODELS = [
    "ACCESS-CM2", "CanESM5", "CNRM-CM6-1", "GFDL-ESM4", "INM-CM5-0",
    "IPSL-CM6A-LR", "MIROC6", "MPI-ESM1-2-LR", "MRI-ESM2-0", "NorESM2-LM",
]
WINDOWS = [
    ("historical", "1995-2014", "1995", "2014"),
    ("ssp245", "2041-2060", "2041", "2060"),
    ("ssp245", "2081-2100", "2081", "2100"),
    ("ssp585", "2041-2060", "2041", "2060"),
    ("ssp585", "2081-2100", "2081", "2100"),
]
US_LAT, US_LON = (22, 52), (232, 296)


def run_model(model):
    import xarray as xr
    import gcsfs
    if (OUT / f"{model}_usgrid.npz").exists() and (OUT / f"{model}.parquet").exists():
        return f"{model}: cached"
    fs = gcsfs.GCSFileSystem(token="anon")
    cat = pd.read_csv("https://storage.googleapis.com/cmip6/pangeo-cmip6.csv")
    cat = cat[(cat.table_id == "day") & (cat.variable_id == "tasmax") & (cat.source_id == model)]
    sites = pd.read_csv(ROOT / "data" / "sites.csv")

    daily, grid, grid_dates = [], [], []
    lat_g = lon_g = None
    for exp, label, a, b in WINDOWS:
        q = cat[(cat.experiment_id == exp) & cat.member_id.str.match(r"r1i1p1f\d")].sort_values("version")
        ds = xr.open_zarr(fs.get_mapper(q.iloc[-1].zstore), consolidated=True, chunks=None,
                          decode_times=xr.coders.CFDatetimeCoder(use_cftime=True))
        da = ds.tasmax.sortby("time")
        da = da.isel(time=~da.indexes["time"].duplicated()).sel(time=slice(a, b))
        arr = da.values - 273.15                       # (time, lat, lon), one bulk read
        lat, lon = da.lat.values, da.lon.values
        iy = np.abs(lat[None, :] - sites.lat.values[:, None]).argmin(1)
        ix = np.abs(((lon[None, :] - (sites.lon.values[:, None] % 360) + 180) % 360) - 180).argmin(1)
        dates = [f"{t.year:04d}-{t.month:02d}-{t.day:02d}" for t in da.time.values]
        d = pd.DataFrame(arr[:, iy, ix].astype("float32"), columns=sites.name.values)
        d.insert(0, "date", dates); d.insert(0, "window", label); d.insert(0, "scenario", exp)
        daily.append(d)

        my = (lat >= US_LAT[0]) & (lat <= US_LAT[1])
        mx = (lon >= US_LON[0]) & (lon <= US_LON[1])
        grid.append(np.round(arr[:, my][:, :, mx] * 10).astype(np.int16))
        grid_dates += [f"{exp}|{label}|{x}" for x in dates]
        lat_g, lon_g = lat[my], lon[mx]
        del arr

    daily = pd.concat(daily, ignore_index=True)
    daily.to_parquet(OUT / f"{model}_tasmax_daily.parquet")
    np.savez_compressed(OUT / f"{model}_usgrid.npz", t=np.concatenate(grid), lat=lat_g, lon=lon_g,
                        keys=np.array(grid_dates))

    hist = daily.scenario == "historical"
    tx = daily[sites.name.values].values
    p99 = np.quantile(tx[hist.values], 0.99, axis=0)
    pd.DataFrame({"site": sites.name.values, "p99": p99}).to_parquet(OUT / f"{model}_p99.parquet")

    year = daily.date.str[:4].astype(int).values
    rows = []
    for (exp, label), idx in daily.groupby(["scenario", "window"]).indices.items():
        for y in np.unique(year[idx]):
            t = tx[idx[year[idx] == y]]
            for i, name in enumerate(sites.name.values):
                rows.append({"model": model, "scenario": exp, "window": label, "year": int(y), "site": name,
                             "hot_days_p99": int((t[:, i] > p99[i]).sum()),
                             "hot_days_35": int((t[:, i] > 35.0).sum()),
                             "txx": float(t[:, i].max())})
    pd.DataFrame(rows).to_parquet(OUT / f"{model}.parquet")
    return f"{model}: done, grid {len(lat_g)}x{len(lon_g)}"


if __name__ == "__main__":
    models = sys.argv[1:] or MODELS
    with ProcessPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(run_model, m): m for m in models}
        for f in as_completed(futs):
            try:
                print(f.result(), flush=True)
            except Exception as e:
                print(f"{futs[f]}: FAILED {e!r}", flush=True)
