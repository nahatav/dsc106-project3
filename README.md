# Heat is the only AI off switch that works

DSC 106 Project 3. An interactive D3 piece on how often extreme heat hits many of the largest US AI data centers on the same day, using CMIP6 climate projections, and which grid emergency laws can cut those sites off.

Live page: served from `docs/` on GitHub Pages.

## Data

- **CMIP6** daily `tasmax` from the Pangeo / Google Cloud public archive (`gs://cmip6`), 10 models, first member, 1995 to 2014 (historical) and 2041 to 2060 / 2081 to 2100 under SSP2-4.5 and SSP5-8.5.
- **Epoch AI, Frontier Data Centers Hub** (CC BY 4.0): https://epoch.ai/data/ai-data-centers

## Rebuild

```
pip install xarray zarr gcsfs pandas numpy pyarrow requests
python scripts/01_sites.py    # geocode Epoch sites -> data/sites.csv
python scripts/02_cmip6.py    # stream CMIP6 at each site (about 50 GB transferred, 30+ min)
python scripts/03_build.py    # -> docs/data/*.json
python -m http.server 9999 --directory docs
```

`data/grid_regions.csv` assigns each US site to a grid operator by hand.
