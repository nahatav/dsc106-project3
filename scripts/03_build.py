"""Turn CMIP6 site extractions into the JSON files the D3 page loads.

Definitions
-----------
Extreme heat at a site: daily max temperature above that site's 99th
percentile of daily maxima in the same model's 1995-2014 run. Each model is
compared only with itself, so its warm or cold bias cancels. At about 3.65
days a year, this is close to the outdoor "design day" that data center
cooling is typically sized for (ASHRAE 0.4% design dry bulb).

Concurrent heat: the share of planned US frontier power (Epoch AI planned
peak MW, 77 US sites) whose sites are in extreme heat on the same day.

Outputs (docs/data/)
--------------------
sites.json        sites + per-site ensemble stats
concurrency.json  per model/scenario/period/year: worst-day share, days over
                  25%, GW-days in extreme heat by legal regime
summers/*.json    May-Sep daily heat flags per US site, every year (lazy load)
gwl.json          per model/scenario/period stats vs global warming level,
                  plus an ensemble regression with model-bootstrap CI
cooc.json         P(region B in extreme heat | region A in extreme heat)
portfolio.json    worst-day share for the real fleet vs counterfactual fleets
robust.json       headline numbers under alternative thresholds and cutoffs
summary.json      headline numbers with model ranges
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "cmip6"
OUT = ROOT / "docs" / "data"
(OUT / "summers").mkdir(parents=True, exist_ok=True)

SUMMER_MONTHS = [5, 6, 7, 8, 9]
CONCURRENT = 0.25
REGION_HOT = 0.5          # a region is "in extreme heat" when half its planned power is
AR6_OFFSET = 0.85         # 1995-2014 relative to 1850-1900 (IPCC AR6 WG1)
REGIME = {"ERCOT": "sb6", "PJM": "doe202c", "SPP": "doe202c"}
WINDOWS = [("historical", "1995-2014"), ("ssp245", "2041-2060"), ("ssp585", "2041-2060"),
           ("ssp245", "2081-2100"), ("ssp585", "2081-2100")]
ROBUST_Q = [0.98, 0.99, 0.995]
ROBUST_CUT = [0.25, 0.5]
rng = np.random.default_rng(0)


def region_of(grid):
    if not isinstance(grid, str):
        return None
    return "Southeast" if grid.startswith("Southeast") else ("West" if grid.startswith("West") else grid)


def load_sites():
    s = pd.read_csv(ROOT / "data" / "sites.csv")
    s["regime"] = s.grid_region.map(REGIME).fillna("other")
    s.loc[s.country != "United States", "regime"] = "intl"
    s["region"] = s.grid_region.map(region_of)
    return s


def write(name, obj):
    (OUT / name).write_text(json.dumps(obj, separators=(",", ":"), allow_nan=False))


def r(x, n=3):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), n)


def main():
    sites = load_sites()
    us = sites[sites.country == "United States"].reset_index(drop=True)
    names = us.name.values
    power = us.planned_power_mw.values
    w = power / power.sum()
    regimes = us.regime.values
    regions = sorted(us.region.unique(), key=lambda g: -power[us.region.values == g].sum())
    reg_idx = {g: np.where(us.region.values == g)[0] for g in regions}

    # counterfactual fleets: same total power, spread differently
    w_region = np.zeros_like(w)
    for g, ix in reg_idx.items():
        w_region[ix] = (power[ix] / power[ix].sum()) / len(regions)
    w_site = np.full_like(w, 1 / len(w))
    fleets = {"actual": w, "regions": w_region, "sites": w_site}

    models = sorted(p.stem.replace("_tasmax_daily", "") for p in RAW.glob("*_tasmax_daily.parquet"))
    print("models:", models)

    conc_rows, fleet_rows, robust_rows = [], [], []
    cooc_acc = {}   # key -> (n_a, n_ab) arrays
    for m in models:
        daily = pd.read_parquet(RAW / f"{m}_tasmax_daily.parquet")
        tx = daily[names].values
        month = daily.date.str[5:7].astype(int).values
        year = daily.date.str[:4].astype(int).values
        hist = (daily.scenario == "historical").values
        thr = {q: np.quantile(tx[hist], q, axis=0) for q in ROBUST_Q}
        hot = tx > thr[0.99]
        hot35 = tx > 35.0
        share = hot.astype(float) @ w
        share35 = hot35.astype(float) @ w
        reg_share = np.stack([hot[:, ix].astype(float) @ (power[ix] / power[ix].sum()) for ix in reg_idx.values()], axis=1)
        reg_hot = reg_share >= REGION_HOT

        groups = daily.groupby(["scenario", "window"]).indices
        for (scen, period), idx in groups.items():
            # co-occurrence counts, pooled over models
            ra = reg_hot[idx]
            n_a, n_ab = ra.sum(0), ra.T.astype(int) @ ra.astype(int)
            key = f"{scen}|{period}"
            if key in cooc_acc:
                cooc_acc[key] = (cooc_acc[key][0] + n_a, cooc_acc[key][1] + n_ab, cooc_acc[key][2] + len(idx))
            else:
                cooc_acc[key] = (n_a, n_ab, len(idx))

            summers = {}
            for y in np.unique(year[idx]):
                yi = idx[year[idx] == y]
                hy = hot[yi]
                gw = {k: float((hy[:, regimes == k] * power[regimes == k]).sum() / 1000) for k in ["sb6", "doe202c", "other"]}
                conc_rows.append({
                    "model": m, "scenario": scen, "period": period, "year": int(y),
                    "max_share": r(share[yi].max(), 4),
                    "days_over": int((share[yi] >= CONCURRENT).sum()),
                    "max_share35": r(share35[yi].max(), 4),
                    "days_over35": int((share35[yi] >= CONCURRENT).sum()),
                    "gwd_sb6": r(gw["sb6"], 1), "gwd_doe202c": r(gw["doe202c"], 1), "gwd_other": r(gw["other"], 1),
                })
                for fname, fw in fleets.items():
                    s = hy.astype(float) @ fw
                    fleet_rows.append({"model": m, "scenario": scen, "period": period, "year": int(y),
                                       "fleet": fname, "max_share": s.max(), "days_over": int((s >= CONCURRENT).sum())})
                for q in ROBUST_Q:
                    s = (tx[yi] > thr[q]).astype(float) @ w
                    for c in ROBUST_CUT:
                        robust_rows.append({"model": m, "scenario": scen, "period": period, "year": int(y),
                                            "q": q, "cut": c, "max_share": s.max(), "days_over": int((s >= c).sum())})

                si = yi[np.isin(month[yi], SUMMER_MONTHS)]
                code = hot[si].astype(int) + 2 * hot35[si].astype(int)
                summers[int(y)] = {
                    "dates": [d[5:] for d in daily.date.values[si]],
                    "flags": ["".join(map(str, code[:, j])) for j in range(len(names))],
                }
            (OUT / "summers" / f"{m}_{scen}_{period}.json").write_text(
                json.dumps({"sites": list(names), "years": summers}, separators=(",", ":")))

    conc = pd.DataFrame(conc_rows)
    write("concurrency.json", conc_rows)

    # ---- per model/window means, global warming level ----
    per = conc.groupby(["model", "scenario", "period"]).agg(
        days_over=("days_over", "mean"), max_share=("max_share", "median"),
        days_over35=("days_over35", "mean"), max_share35=("max_share35", "median"),
        gwd_sb6=("gwd_sb6", "mean"), gwd_doe202c=("gwd_doe202c", "mean"), gwd_other=("gwd_other", "mean"),
    ).reset_index()
    gm_path = ROOT / "data" / "raw" / "gmst.csv"
    fit = None
    if gm_path.exists():
        gm = pd.read_csv(gm_path).rename(columns={"window": "period"})
        per = per.merge(gm[["model", "scenario", "period", "warming_vs_1995_2014"]], how="left")
        per["gwl"] = per.warming_vs_1995_2014 + AR6_OFFSET
        ok = per.dropna(subset=["gwl"])
        # The response bends upward, so fit a quadratic and bootstrap over models
        # (each resample draws whole models with replacement).
        grid = np.round(np.arange(0.8, ok.gwl.max() + 0.05, 0.05), 2)
        def curve(d):
            c = np.polyfit(d.gwl, d.days_over, 2)
            return np.clip(np.polyval(c, grid), 0, None), c
        mid, coef = curve(ok)
        ms = ok.model.unique()
        boots = []
        for _ in range(2000):
            pick = rng.choice(ms, len(ms), replace=True)
            boots.append(curve(pd.concat([ok[ok.model == x] for x in pick]))[0])
        boots = np.array(boots)
        lo, hi = np.quantile(boots, 0.05, axis=0), np.quantile(boots, 0.95, axis=0)
        def at(x):
            i = int(np.argmin(np.abs(grid - x)))
            return {"mid": r(mid[i], 1), "lo": r(lo[i], 1), "hi": r(hi[i], 1)}
        slope2 = 2 * coef[0] * 2.0 + coef[1]
        fit = {"grid": grid.tolist(), "mid": [r(v, 2) for v in mid], "lo": [r(v, 2) for v in lo], "hi": [r(v, 2) for v in hi],
               "at": {"1.5": at(1.5), "2": at(2.0), "3": at(3.0), "4": at(4.0)}, "slope_at_2": r(slope2, 1)}
        print("GWL fit:", fit["at"], "slope@2C", fit["slope_at_2"])
    write("gwl.json", {"fit": fit, "offset": AR6_OFFSET, "rows": json.loads(per.to_json(orient="records"))})

    # ---- co-occurrence ----
    cooc = {"regions": regions,
            "power_gw": [r(power[reg_idx[g]].sum() / 1000, 1) for g in regions],
            "by": {}}
    for key, (n_a, n_ab, n) in cooc_acc.items():
        with np.errstate(invalid="ignore", divide="ignore"):
            cond = n_ab / n_a[:, None]
        cooc["by"][key] = {"base": [r(x / n, 4) for x in n_a],
                           "cond": [[r(v, 3) if np.isfinite(v) else None for v in row] for row in cond]}
    write("cooc.json", cooc)

    # ---- counterfactual fleets ----
    fl = pd.DataFrame(fleet_rows)
    port = []
    for (scen, period, fname), g in fl.groupby(["scenario", "period", "fleet"]):
        pm = g.groupby("model").agg(ms=("max_share", "median"), do=("days_over", "mean"))
        port.append({"scenario": scen, "period": period, "fleet": fname,
                     "max_share": r(g.max_share.median()), "max_share_lo": r(pm.ms.min()), "max_share_hi": r(pm.ms.max()),
                     "days_over": r(g.days_over.mean(), 1), "days_over_lo": r(pm.do.min(), 1), "days_over_hi": r(pm.do.max(), 1)})
    write("portfolio.json", port)

    # ---- robustness ----
    rb = pd.DataFrame(robust_rows)
    rob = []
    for (q, c, scen, period), g in rb.groupby(["q", "cut", "scenario", "period"]):
        pm = g.groupby("model").days_over.mean()
        rob.append({"q": q, "cut": c, "scenario": scen, "period": period,
                    "max_share": r(g.max_share.median()), "days_over": r(g.days_over.mean(), 1),
                    "days_lo": r(pm.min(), 1), "days_hi": r(pm.max(), 1)})
    write("robust.json", rob)

    # ---- headline summary with model ranges ----
    summ = {"n_models": len(models), "models": models, "us_gw": r(power.sum() / 1000, 1), "n_us": int(len(us)),
            "by": {}}
    for scen, period in WINDOWS:
        p = per[(per.scenario == scen) & (per.period == period)]
        if p.empty:
            continue
        summ["by"][f"{scen}|{period}"] = {
            "max_share": [r(p.max_share.min()), r(p.max_share.median()), r(p.max_share.max())],
            "days_over": [r(p.days_over.min(), 1), r(p.days_over.median(), 1), r(p.days_over.max(), 1)],
            "gwd_sb6": r(p.gwd_sb6.median(), 1), "gwd_doe202c": r(p.gwd_doe202c.median(), 1), "gwd_other": r(p.gwd_other.median(), 1),
            "gwl": r(p.gwl.median(), 2) if "gwl" in p else None,
        }
    write("summary.json", summ)

    # ---- per-site ensemble stats ----
    clim = pd.concat([pd.read_parquet(RAW / f"{m}.parquet") for m in models])
    per_model = clim.groupby(["site", "scenario", "window", "model"]).agg(
        hot=("hot_days_p99", "mean"), hot35=("hot_days_35", "mean"), txx=("txx", "mean")).reset_index()
    stats = {}
    for (site, scen, period), g in per_model.groupby(["site", "scenario", "window"]):
        stats.setdefault(site, {})[f"{scen}|{period}"] = {
            "hot": [r(g.hot.min(), 1), r(g.hot.median(), 1), r(g.hot.max(), 1)],
            "hot35": [r(g.hot35.min(), 1), r(g.hot35.median(), 1), r(g.hot35.max(), 1)],
            "txx": r(g.txx.median(), 1),
        }
    recs = []
    for s in sites.itertuples():
        recs.append({
            "name": s.name, "owner": s.owner if isinstance(s.owner, str) else None, "country": s.country,
            "lat": r(s.lat), "lon": r(s.lon),
            "grid": s.grid_region if isinstance(s.grid_region, str) else None,
            "region": s.region if isinstance(s.region, str) else None,
            "regime": s.regime,
            "power": r(s.planned_power_mw, 1),
            "power_now": r(s.current_power_mw, 1) if pd.notna(s.current_power_mw) else 0,
            "h100e": r(s.planned_h100e, 0) if pd.notna(s.planned_h100e) else None,
            "stats": stats.get(s.name, {}),
        })
    write("sites.json", {"models": models, "sites": recs})

    export_fields(conc)
    print(pd.DataFrame(summ["by"]).T)


def export_fields(conc):
    """Gridded heat for the animated map: for each period/emissions row, the
    ensemble's typical (median worst-day) and worst summer. Values are degrees
    above each grid cell's own 1995-2014 99th percentile, in 0.5 C steps."""
    import base64
    (OUT / "fields").mkdir(exist_ok=True)
    index = []
    for scen, period in WINDOWS:
        rows = conc[(conc.scenario == scen) & (conc.period == period)].sort_values("max_share")
        for kind, row in [("typical", rows.iloc[len(rows) // 2]), ("worst", rows.iloc[-1])]:
            m, y = row.model, int(row.year)
            npz = np.load(RAW / f"{m}_usgrid.npz")
            t, keys = npz["t"].astype(np.float32) / 10, npz["keys"]
            hist = np.char.startswith(keys, "historical|")
            p99 = np.quantile(t[hist], 0.99, axis=0)
            pref = f"{scen}|{period}|{y}-"
            sel = np.array([k.startswith(pref) and int(k[-5:-3]) in SUMMER_MONTHS for k in keys])
            anom = np.clip(np.round((t[sel] - p99) * 2), -127, 127).astype(np.int8)
            name = f"{scen}_{period}_{kind}.json"
            write(f"fields/{name}", {
                "model": m, "scenario": scen, "period": period, "year": y, "kind": kind,
                "lat": [r(v, 3) for v in npz["lat"]], "lon": [r(v - 360 if v > 180 else v, 3) for v in npz["lon"]],
                "dates": [k.split("|")[2][5:] for k in keys[sel]],
                "data": base64.b64encode(anom.tobytes()).decode(),
            })
            index.append({"scenario": scen, "period": period, "kind": kind, "model": m, "year": y,
                          "max_share": r(row.max_share), "file": name})
    write("fields/index.json", index)


if __name__ == "__main__":
    main()
