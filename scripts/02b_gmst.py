"""Global mean surface air temperature per model and window, for the
global warming level (GWL) view used in IPCC AR6.

Monthly tas (Amon), area-weighted by cos(latitude). Output:
data/raw/gmst.csv with columns model, scenario, window, gmst_c, and
warming_vs_1995_2014. AR6 puts 1995-2014 at 0.85 C above 1850-1900, so
warming above pre-industrial = warming_vs_1995_2014 + 0.85.
"""
from pathlib import Path
import numpy as np
import pandas as pd
import xarray as xr
import gcsfs

ROOT = Path(__file__).resolve().parents[1]
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

fs = gcsfs.GCSFileSystem(token="anon")
cat = pd.read_csv("https://storage.googleapis.com/cmip6/pangeo-cmip6.csv")
cat = cat[(cat.table_id == "Amon") & (cat.variable_id == "tas")]

OUTF = ROOT / "data" / "raw" / "gmst_partial.csv"
rows = pd.read_csv(OUTF).to_dict("records") if OUTF.exists() else []
done = {(r["model"], r["scenario"], r["window"]) for r in rows}
for m in MODELS:
    for exp, label, a, b in WINDOWS:
        if (m, exp, label) in done:
            continue
        q = cat[(cat.source_id == m) & (cat.experiment_id == exp) & cat.member_id.str.match(r"r1i1p1f\d")]
        if q.empty:
            print("missing", m, exp); continue
        # try members in order (f1 first, newest version first) until one covers the window;
        # some newer reruns stop early (NorESM2-LM ssp245 r1i1p1f2 ends in 2050)
        tas = None
        for _, row in q.sort_values(["member_id", "version"], ascending=[True, False]).iterrows():
            ds = xr.open_zarr(fs.get_mapper(row.zstore), consolidated=True)
            t = ds.tas.sortby("time")
            t = t.isel(time=~t.indexes["time"].duplicated()).sel(time=slice(a, b))
            if t.sizes["time"] >= 239:
                tas = t
                break
        if tas is None:
            print("no full window", m, exp, label); continue
        w = np.cos(np.deg2rad(tas.lat))
        g = float(tas.weighted(w).mean(("lat", "lon", "time")).load()) - 273.15
        rows.append({"model": m, "scenario": exp, "window": label, "gmst_c": round(g, 3)})
        print(m, exp, label, round(g, 2), flush=True)
        pd.DataFrame(rows).to_csv(OUTF, index=False)

df = pd.DataFrame(rows)
base = df[df.scenario == "historical"].set_index("model").gmst_c
df["warming_vs_1995_2014"] = (df.gmst_c - df.model.map(base)).round(3)
df.to_csv(ROOT / "data" / "raw" / "gmst.csv", index=False)
print(df)
