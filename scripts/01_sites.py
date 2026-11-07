"""Build data/sites.csv from the Epoch AI Frontier Data Centers dataset (CC BY 4.0).

Epoch gives street addresses but no coordinates, so we geocode with OpenStreetMap
Nominatim (1 request/s, cached). CMIP6 grid cells are ~100-250 km wide, so
city-level accuracy is plenty; sites with no address use hand-checked city
coordinates below.
"""
import json, re, time
from pathlib import Path
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "dc_zip"
CACHE = ROOT / "data" / "raw" / "geocode_cache.json"

# Sites with no usable address in Epoch; located from Epoch's cited sources.
FALLBACK = {
    "Anthropic Barber Lake": (32.39, -100.86),       # Cipher Barber Lake, Colorado City TX
    "Google Mesa": (33.31, -111.63),                 # east Mesa AZ
    "OpenAI Stargate Michigan": (42.15, -83.82),     # Saline Township MI
    "OpenAI Stargate Milam": (30.66, -97.00),        # Milam County TX
    "OpenAI Stargate New Mexico": (31.86, -106.70),  # Project Jupiter, Dona Ana County NM
    "OpenAI Stargate Wisconsin": (43.39, -87.88),    # Port Washington WI
    "Microsoft Narvik Norway": (68.44, 17.43),
    "Southgate Melbourne": (-37.82, 144.85),         # CDC Brooklyn VIC
    "Envision Galaxy Ulanqab": (41.00, 113.13),
    "Nebius Mantsala": (60.63, 25.32),
    "Oracle Batam": (1.08, 104.03),
    "Google Storey County": (39.53, -119.47),        # Tahoe Reno Industrial Center NV
    "Google Kansas City East": (39.16, -94.43),      # Hunt Midwest Business Center MO
    "DayOne Nusajaya": (1.43, 103.63),
    # Nominatim failed or matched the wrong place for these (e.g. "MN 55068, USA"
    # resolved to the US Virgin Islands); set to the town named in the address.
    "Meta Rosemount": (44.74, -93.13),
    "Amazon Madison Mega Site": (32.61, -90.04),     # Canton MS
    "Meta Jeffersonville": (38.30, -85.70),
    "Meta Montgomery": (32.37, -86.30),
    "Meta Kuna": (43.49, -116.42),
    "Meta Cheyenne": (41.14, -104.82),
    "Meta Aiken": (33.74, -81.85),                   # Trenton SC
    "Google Papillion": (41.13, -96.07),
    "Meta Sarpy": (41.08, -96.13),                   # Springfield NE
    "CoreWeave Muskogee OK": (35.71, -95.38),
    "VNET Bayin Ulanqab": (41.03, 113.13),
    "Huawei Wuhu": (31.33, 118.43),
    "Huawei Horinger": (40.38, 111.82),
    "Alibaba Zhangbei": (41.16, 114.70),
    "CoreWeave Norway": (58.32, 7.86),               # Ovrebo
    "Start Campus Sines Data Campus": (37.95, -8.87),
    "Nscale Keflavik": (63.98, -22.56),
    "EcoDataCenter 2": (60.48, 15.43),               # Borlange
    "OpenAI Stargate UAE": (24.25, 54.55),           # Abu Dhabi
}

def strip_tags(s):
    return re.sub(r"\s*#\w+", "", str(s)).strip() if pd.notna(s) else None

def geocode(q, cache):
    if q in cache:
        return cache[q]
    r = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"q": q, "format": "json", "limit": 1},
        headers={"User-Agent": "dsc106-project3-class-project"},
        timeout=30,
    )
    time.sleep(1.1)
    hit = r.json()
    cache[q] = [float(hit[0]["lat"]), float(hit[0]["lon"])] if hit else None
    return cache[q]

def main():
    dc = pd.read_csv(RAW / "data_centers.csv")
    tl = pd.read_csv(RAW / "data_center_timelines.csv")
    tl["Date"] = pd.to_datetime(tl["Date"], errors="coerce")

    # Planned peak = max over the whole timeline (Epoch projects future build-out).
    peak = tl.groupby("Data center").agg(
        planned_power_mw=("Power (MW)", "max"),
        planned_water_mgd=("Water use (MGD)", "max"),
        planned_h100e=("H100 equivalents", "max"),
        first_date=("Date", "min"),
        last_date=("Date", "max"),
    )

    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    rows = []
    for _, r in dc.iterrows():
        name = r["Name"]
        addr = str(r["Address"]).strip() if pd.notna(r["Address"]) else ""
        latlon, how = None, None
        if name in FALLBACK:
            latlon, how = FALLBACK[name], "manual"
        if latlon is None and addr:
            latlon = geocode(f"{addr}, {r['Country']}", cache)
            how = "address"
            if latlon is None:
                # Retry with just the locality: last two comma-separated parts.
                parts = [p.strip() for p in addr.split(",") if p.strip()]
                latlon = geocode(", ".join(parts[-2:] + [r["Country"]]), cache)
                how = "locality"
        rows.append({
            "name": name,
            "owner": strip_tags(r["Owner"]),
            "users": strip_tags(r["Users"]),
            "country": r["Country"],
            "address": addr or None,
            "lat": latlon[0] if latlon else None,
            "lon": latlon[1] if latlon else None,
            "geocode": how if latlon else "failed",
            "current_power_mw": r["Current power (MW)"],
            "current_h100e": r["Current H100 equivalents"],
        })
        CACHE.write_text(json.dumps(cache, indent=1))

    sites = pd.DataFrame(rows).merge(peak, left_on="name", right_index=True, how="left")
    sites["planned_power_mw"] = sites[["planned_power_mw", "current_power_mw"]].max(axis=1)

    us = sites.country == "United States"
    bad = us & ~(sites.lat.between(24, 50) & sites.lon.between(-125, -66))
    assert not bad.any(), f"US sites outside CONUS:\n{sites[bad][['name', 'lat', 'lon']]}"
    assert sites.lat.notna().all(), f"ungeocoded: {sites[sites.lat.isna()].name.tolist()}"

    grid = pd.read_csv(ROOT / "data" / "grid_regions.csv")
    sites = sites.merge(grid, on="name", how="left")
    missing = us & sites.grid_region.isna()
    assert not missing.any(), f"no grid region: {sites[missing].name.tolist()}"
    sites.to_csv(ROOT / "data" / "sites.csv", index=False)
    print(sites["geocode"].value_counts())
    print(sites[sites.geocode.isin(["failed", "locality"])][["name", "address", "lat", "lon"]].to_string())

if __name__ == "__main__":
    main()
