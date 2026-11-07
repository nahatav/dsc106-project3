"""Region-wide heat: a better stand-in for grid emergencies than heat at one site.

Grid emergencies happen when a whole balancing area is hot and demand peaks
everywhere at once (ERCOT's EEA2 on 6 Sept 2023 followed statewide heat). So
for each grid region we compute, every day, the share of the region's land area
that is above its own design day (each grid cell's 1995-2014 99th percentile of
daily max temperature, in the same model). A region with at least half its
area above that line is on a "grid-stress day".

Regions are approximated by whole states (documented on the page):
  ERCOT TX; SPP KS OK NE SD; MISO ND MN IA WI MI IL IN MO AR LA MS;
  PJM OH PA NJ DE MD DC VA WV KY; NYISO NY; Southeast TN AL GA SC NC FL;
  West WA OR CA NV AZ UT ID MT WY CO NM.

Outputs (docs/data/):
  regions.json          stress-day stats, event durations (survival curves),
                        conditional co-occurrence, counterfactual fleets,
                        robustness to the area threshold
  calendar/<m>_<s>_<p>.json   May-Sep daily stress flags per region, every year
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd
from matplotlib.path import Path as MPath

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "cmip6"
OUT = ROOT / "docs" / "data"
(OUT / "calendar").mkdir(parents=True, exist_ok=True)

REGION_STATES = {
    "ERCOT": ["Texas"],
    "SPP": ["Kansas", "Oklahoma", "Nebraska", "South Dakota"],
    "MISO": ["North Dakota", "Minnesota", "Iowa", "Wisconsin", "Michigan", "Illinois", "Indiana",
             "Missouri", "Arkansas", "Louisiana", "Mississippi"],
    "PJM": ["Ohio", "Pennsylvania", "New Jersey", "Delaware", "Maryland", "District of Columbia",
            "Virginia", "West Virginia", "Kentucky"],
    "NYISO": ["New York"],
    "Southeast": ["Tennessee", "Alabama", "Georgia", "South Carolina", "North Carolina", "Florida"],
    "West": ["Washington", "Oregon", "California", "Nevada", "Arizona", "Utah", "Idaho", "Montana",
             "Wyoming", "Colorado", "New Mexico"],
}
AREA_HOT = 0.5
AREA_ROBUST = [0.3, 0.5, 0.7]
CONCURRENT = 0.25
SUMMER = {5, 6, 7, 8, 9}
WINDOWS = [("historical", "1995-2014"), ("ssp245", "2041-2060"), ("ssp585", "2041-2060"),
           ("ssp245", "2081-2100"), ("ssp585", "2081-2100")]
MAXD = 15


def r(x, n=3):
    return None if x is None or not np.isfinite(x) else round(float(x), n)


def state_paths():
    g = json.load(open(ROOT / "data" / "raw" / "us_states.geojson"))
    out = {}
    for f in g["features"]:
        geom, polys = f["geometry"], []
        rings = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
        for poly in rings:
            polys.append(MPath(np.array(poly[0])))
        out[f["properties"]["name"]] = polys
    return out


def region_masks(lat, lon, paths):
    lon = np.where(lon > 180, lon - 360, lon)
    LON, LAT = np.meshgrid(lon, lat)
    pts = np.column_stack([LON.ravel(), LAT.ravel()])
    masks = {}
    for reg, states in REGION_STATES.items():
        m = np.zeros(len(pts), bool)
        for s in states:
            for p in paths[s]:
                m |= p.contains_points(pts)
        masks[reg] = m.reshape(LAT.shape)
    return masks


def runs(flags):
    """Lengths of consecutive True runs."""
    out, cur = [], 0
    for f in flags:
        if f:
            cur += 1
        elif cur:
            out.append(cur); cur = 0
    if cur:
        out.append(cur)
    return out


def main():
    paths = state_paths()
    sites = pd.read_csv(ROOT / "data" / "sites.csv")
    grid = pd.read_csv(ROOT / "data" / "grid_regions.csv")
    sites = sites.merge(grid, on="name", how="left", suffixes=("", "_g"))
    us = sites[sites.country == "United States"].copy()
    us["region"] = us.grid_region.map(lambda g: "Southeast" if g.startswith("Southeast") else ("West" if g.startswith("West") else g))
    regions = list(REGION_STATES)
    power = np.array([us.loc[us.region == g, "planned_power_mw"].sum() for g in regions])
    w_actual = power / power.sum()
    w_even = np.full(len(regions), 1 / len(regions))

    models = sorted(p.stem.replace("_usgrid", "") for p in RAW.glob("*_usgrid.npz"))
    stat_rows, events, robust_rows, fleet_rows = [], [], [], []
    cooc = {}
    for m in models:
        z = np.load(RAW / f"{m}_usgrid.npz")
        t = z["t"].astype(np.float32) / 10
        keys = z["keys"]
        scen = np.array([k.split("|")[0] for k in keys]); per = np.array([k.split("|")[1] for k in keys])
        date = np.array([k.split("|")[2] for k in keys])
        year = np.array([int(d[:4]) for d in date]); month = np.array([int(d[5:7]) for d in date])
        masks = region_masks(z["lat"], z["lon"], paths)
        wcell = np.cos(np.deg2rad(z["lat"]))[:, None] * np.ones((1, len(z["lon"])))
        hist = scen == "historical"
        p99 = np.quantile(t[hist], 0.99, axis=0)
        hot = t > p99
        share = np.stack([(hot * (wcell * masks[g])).sum((1, 2)) / (wcell * masks[g]).sum() for g in regions], axis=1)

        for s, p in WINDOWS:
            idx = np.where((scen == s) & (per == p))[0]
            if not len(idx):
                continue
            stress = share[idx] >= AREA_HOT
            # co-occurrence counts
            n_a, n_ab = stress.sum(0), stress.T.astype(int) @ stress.astype(int)
            k = f"{s}|{p}"
            a0 = cooc.get(k, (0, 0, 0))
            cooc[k] = (a0[0] + n_a, a0[1] + n_ab, a0[2] + len(idx))
            # events per region (consecutive stress days)
            for j, g in enumerate(regions):
                for L in runs(stress[:, j]):
                    events.append({"model": m, "scenario": s, "period": p, "region": g, "days": L})
            cal = {}
            for y in np.unique(year[idx]):
                yi = idx[year[idx] == y]
                st = share[yi] >= AREA_HOT
                fs = st.astype(float) @ w_actual
                fe = st.astype(float) @ w_even
                stat_rows.append({"model": m, "scenario": s, "period": p, "year": int(y),
                                  "fleet_max": r(fs.max()), "fleet_days": int((fs >= CONCURRENT).sum()),
                                  **{f"days_{g}": int(st[:, j].sum()) for j, g in enumerate(regions)}})
                fleet_rows.append({"model": m, "scenario": s, "period": p, "year": int(y),
                                   "actual": int((fs >= CONCURRENT).sum()), "even": int((fe >= CONCURRENT).sum()),
                                   "actual_max": fs.max(), "even_max": fe.max()})
                for a in AREA_ROBUST:
                    sa = (share[yi] >= a).astype(float) @ w_actual
                    robust_rows.append({"model": m, "scenario": s, "period": p, "area": a,
                                        "fleet_days": int((sa >= CONCURRENT).sum()),
                                        "region_days": float((share[yi] >= a).sum(0).mean())})
                si = np.isin(month[yi], list(SUMMER))
                cal[int(y)] = {"dates": [d[5:] for d in date[yi][si]],
                               "flags": ["".join("1" if v else "0" for v in st[si, j]) for j in range(len(regions))],
                               "share": [[round(float(v), 2) for v in share[yi][si, j]] for j in range(len(regions))]}
            (OUT / "calendar" / f"{m}_{s}_{p}.json").write_text(json.dumps({"regions": regions, "years": cal}, separators=(",", ":")))
        print(m, "done", flush=True)

    st = pd.DataFrame(stat_rows)
    ev = pd.DataFrame(events)
    fl = pd.DataFrame(fleet_rows)
    rb = pd.DataFrame(robust_rows)

    out = {"regions": regions, "power_gw": [r(x / 1000, 1) for x in power], "states": REGION_STATES,
           "area_hot": AREA_HOT, "by": {}}
    for s, p in WINDOWS:
        k = f"{s}|{p}"
        S, E, F = st[(st.scenario == s) & (st.period == p)], ev[(ev.scenario == s) & (ev.period == p)], fl[(fl.scenario == s) & (fl.period == p)]
        if S.empty:
            continue
        pm = S.groupby("model")
        reg = {}
        for g in regions:
            dm = pm[f"days_{g}"].mean()
            eg = E[E.region == g]
            reg[g] = {"days": [r(dm.min(), 1), r(dm.median(), 1), r(dm.max(), 1)],
                      "events_per_year": r(len(eg) / S.shape[0], 2),
                      "mean_len": r(eg.days.mean(), 2) if len(eg) else 0}
        # survival: P(event length >= d), pooled over models and regions; plus per-model spread
        surv = [r((E.days >= d).mean(), 4) if len(E) else 0 for d in range(1, MAXD + 1)]
        per_model = [[r((g_.days >= d).mean(), 4) for d in range(1, MAXD + 1)] for _, g_ in E.groupby("model")]
        pmv = np.array(per_model) if per_model else np.zeros((1, MAXD))
        days_in_long = r(E.loc[E.days >= 3, "days"].sum() / max(1, E.days.sum()))
        fdm = pm.fleet_days.mean()
        fa, fe_ = F.groupby("model").actual.mean(), F.groupby("model").even.mean()
        n_a, n_ab, n = cooc[k]
        with np.errstate(invalid="ignore", divide="ignore"):
            cond = n_ab / n_a[:, None]
        out["by"][k] = {
            "fleet_days": [r(fdm.min(), 1), r(fdm.median(), 1), r(fdm.max(), 1)],
            "fleet_max": r(S.fleet_max.median()),
            "regions": reg,
            "survival": surv, "survival_lo": [r(v, 4) for v in pmv.min(0)], "survival_hi": [r(v, 4) for v in pmv.max(0)],
            "n_events": int(len(E)), "share_days_in_3plus": days_in_long,
            "longest": int(E.days.max()) if len(E) else 0,
            "fleet_actual": [r(fa.min(), 1), r(fa.median(), 1), r(fa.max(), 1)],
            "fleet_even": [r(fe_.min(), 1), r(fe_.median(), 1), r(fe_.max(), 1)],
            "base": [r(x / n, 4) for x in n_a],
            "cond": [[r(v, 3) for v in row] for row in cond],
            "robust": {str(a): {"fleet_days": r(g_.groupby("model").fleet_days.mean().median(), 1),
                                 "region_days": r(g_.groupby("model").region_days.mean().median(), 1)}
                        for a, g_ in rb[(rb.scenario == s) & (rb.period == p)].groupby("area")},
        }
        print(k, "fleet days", out["by"][k]["fleet_days"], "events", len(E), "3+ share", days_in_long,
              "actual/even", out["by"][k]["fleet_actual"][1], out["by"][k]["fleet_even"][1])
    (OUT / "regions.json").write_text(json.dumps(out, separators=(",", ":"), allow_nan=False))


if __name__ == "__main__":
    main()
