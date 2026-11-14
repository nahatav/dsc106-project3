// Choosing where to build AI data centers as heat waves grow. DSC 106 Project 3, built with D3.
// Six figures: a county siting explorer, then the evidence behind it, ending with governance.

const CLIMATES = [
  { key: "historical|1995-2014", label: "1995–2014", long: "1995–2014" },
  { key: "ssp245|2041-2060", label: "2050s, moderate", long: "the 2050s under moderate emissions" },
  { key: "ssp585|2041-2060", label: "2050s, high", long: "the 2050s under high emissions" },
  { key: "ssp245|2081-2100", label: "2090s, moderate", long: "the 2090s under moderate emissions" },
  { key: "ssp585|2081-2100", label: "2090s, high", long: "the 2090s under high emissions" },
];
const CL = Object.fromEntries(CLIMATES.map(c => [c.key, c]));
const HIST = "historical|1995-2014";

// One palette for the whole page. Risk runs light to dark along the magma scale (perceptually uniform);
// greys carry context; the accent marks the thing to look at.
const MAG = t => d3.interpolateMagma(t);
const RISK = t => d3.interpolateMagma(0.97 - 0.85 * Math.max(0, Math.min(1, t)));
const RISK7 = d3.range(7).map(i => RISK(i / 6));
const ACC = d3.interpolateMagma(0.58), ACCENT = ACC;
const INK = "#202124", LAND = "#f1f3f4", WARMGREY = "#f1f3f4";

const fmtPct = d3.format(".0%"), fmt1 = d3.format(".1f");
const fmtGW = mw => (mw / 1000).toFixed(1) + " GW";
const cite = (...n) => n.map(i => `<a class="cite" href="#r${i}">${i}</a>`).join('<span class="cite-sep">,</span>');
const ease = d3.easeCubicInOut;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const DUR = reduceMotion ? 0 : 750;
const ownerOf = d => (/Stargate/.test(d.name) ? "OpenAI" : d.owner === "SpaceXAI" ? "xAI" : ["Meta", "Google", "Microsoft", "Amazon", "CoreWeave"].includes(d.owner) ? d.owner : "Other");

const tip = d3.select("#tip");
function showTip(e, html) {
  tip.html(html).style("opacity", 1);
  const pad = 14, w = tip.node().offsetWidth, h = tip.node().offsetHeight;
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + w > innerWidth - 8) x = e.clientX - w - pad;
  if (y + h > innerHeight - 8) y = e.clientY - h - pad;
  tip.style("left", x + "px").style("top", y + "px");
}
const hideTip = () => tip.style("opacity", 0);
function onVisible(sel, fn) {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.disconnect(); fn(); } }), { rootMargin: "0px 0px -30% 0px", threshold: 0 });
  io.observe(document.querySelector(sel));
}

const state = { climate: "ssp245|2041-2060" };
let D = {};
const json = u => d3.json(u);
const rKey = k => D.reg.by[k];

Promise.all(["sites", "regions", "coexposure", "buildout", "streams", "siting", "replay", "gwl", "reach", "mosaic", "concurrent", "neighbours", "whatif", "exceed", "nbdist", "govheat"].map(f => json(`data/${f}.json`))
  .concat([json("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-albers-10m.json")]))
  .then(([sites, reg, coex, build, streams, siting, replay, gwl, reach, mosaic, concurrent, neighbours, whatif, exceed, nbdist, govheat, topo]) => {
    D = { sites: sites.sites, models: sites.models, reg, coex, build, streams, siting, replay, gwl, reach, mosaic, concurrent, neighbours, whatif, exceed, nbdist, govheat, topo };
    D.us = D.sites.filter(d => d.country === "United States");
    D.usGW = d3.sum(D.us, d => d.power);
    d3.select("#model-list").text(D.models.join(", "));
    setupGeo();
    Explorer.init(); Reach.init(); Replay.init(); Warming.init(); Duration.init(); Gov.init();
    d3.selectAll("#ex-climate button").on("click", function () { setClimate(this.dataset.k); });
    d3.select("#share-link").on("click", e => { e.preventDefault(); navigator.clipboard && navigator.clipboard.writeText(location.href.split("#")[0]); d3.select("#share-link span").text("Link copied"); });
    setClimate(state.climate);
    Hero.init(); Toc.init();
  });

function setClimate(k) {
  state.climate = k;
  d3.selectAll("#ex-climate button").classed("on", function () { return this.dataset.k === k; });
  Explorer.update();
  if (Reach.ready) Reach.recolor();
  writeProse();
}

/* ---------------- shared geography ---------------- */
const projection = d3.geoAlbers().scale(1300).translate([487.5, 305]);
const G = {};

const CITIES = [["Seattle","WA",47.61,-122.33],["Spokane","WA",47.66,-117.43],["Yakima","WA",46.60,-120.51],["Wenatchee","WA",47.42,-120.31],["Portland","OR",45.52,-122.68],["Eugene","OR",44.05,-123.09],["Bend","OR",44.06,-121.31],["Medford","OR",42.33,-122.87],["The Dalles","OR",45.59,-121.18],["Pendleton","OR",45.67,-118.79],["Boise","ID",43.62,-116.20],["Idaho Falls","ID",43.49,-112.03],["Pocatello","ID",42.87,-112.45],["Coeur d'Alene","ID",47.68,-116.78],["Missoula","MT",46.87,-113.99],["Billings","MT",45.78,-108.50],["Great Falls","MT",47.50,-111.30],["Helena","MT",46.59,-112.04],["Bozeman","MT",45.68,-111.04],["Glasgow","MT",48.20,-106.64],["Miles City","MT",46.41,-105.84],["Cheyenne","WY",41.14,-104.82],["Casper","WY",42.87,-106.31],["Rock Springs","WY",41.59,-109.20],["Sheridan","WY",44.80,-106.96],["Cody","WY",44.53,-109.06],["Salt Lake City","UT",40.76,-111.89],["St. George","UT",37.10,-113.58],["Denver","CO",39.74,-104.99],["Grand Junction","CO",39.06,-108.55],["Pueblo","CO",38.25,-104.61],["Albuquerque","NM",35.08,-106.65],["Las Cruces","NM",32.32,-106.76],["Phoenix","AZ",33.45,-112.07],["Tucson","AZ",32.22,-110.97],["Flagstaff","AZ",35.20,-111.65],["Las Vegas","NV",36.17,-115.14],["Reno","NV",39.53,-119.81],["Elko","NV",40.83,-115.76],["Sacramento","CA",38.58,-121.49],["San Francisco","CA",37.77,-122.42],["Fresno","CA",36.74,-119.79],["Bakersfield","CA",35.37,-119.02],["Los Angeles","CA",34.05,-118.24],["San Diego","CA",32.72,-117.16],["Redding","CA",40.59,-122.39],["Eureka","CA",40.80,-124.16],["Santa Barbara","CA",34.42,-119.70],["Fargo","ND",46.88,-96.79],["Bismarck","ND",46.81,-100.78],["Minot","ND",48.23,-101.30],["Williston","ND",48.15,-103.62],["Sioux Falls","SD",43.55,-96.73],["Rapid City","SD",44.08,-103.23],["Pierre","SD",44.37,-100.35],["Omaha","NE",41.26,-95.93],["North Platte","NE",41.12,-100.77],["Kansas City","MO",39.10,-94.58],["Wichita","KS",37.69,-97.34],["Dodge City","KS",37.75,-100.02],["Oklahoma City","OK",35.47,-97.52],["Tulsa","OK",36.15,-95.99],["Dallas","TX",32.78,-96.80],["Houston","TX",29.76,-95.37],["Austin","TX",30.27,-97.74],["San Antonio","TX",29.42,-98.49],["El Paso","TX",31.76,-106.49],["Amarillo","TX",35.22,-101.83],["Lubbock","TX",33.58,-101.86],["Abilene","TX",32.45,-99.73],["Midland","TX",32.00,-102.08],["Corpus Christi","TX",27.80,-97.40],["Minneapolis","MN",44.98,-93.27],["Duluth","MN",46.79,-92.10],["Bemidji","MN",47.47,-94.88],["Des Moines","IA",41.59,-93.62],["Cedar Rapids","IA",41.98,-91.67],["Milwaukee","WI",43.04,-87.91],["Madison","WI",43.07,-89.40],["Green Bay","WI",44.51,-88.01],["Eau Claire","WI",44.81,-91.50],["Chicago","IL",41.88,-87.63],["Springfield","IL",39.78,-89.65],["St. Louis","MO",38.63,-90.20],["Springfield","MO",37.21,-93.29],["Indianapolis","IN",39.77,-86.16],["Fort Wayne","IN",41.08,-85.14],["Detroit","MI",42.33,-83.05],["Grand Rapids","MI",42.96,-85.67],["Traverse City","MI",44.76,-85.62],["Marquette","MI",46.54,-87.40],["Columbus","OH",39.96,-83.00],["Cleveland","OH",41.50,-81.69],["Cincinnati","OH",39.10,-84.51],["Louisville","KY",38.25,-85.76],["Nashville","TN",36.16,-86.78],["Memphis","TN",35.15,-90.05],["Knoxville","TN",35.96,-83.92],["Little Rock","AR",34.75,-92.29],["Jackson","MS",32.30,-90.18],["New Orleans","LA",29.95,-90.07],["Shreveport","LA",32.53,-93.75],["Birmingham","AL",33.52,-86.80],["Atlanta","GA",33.75,-84.39],["Savannah","GA",32.08,-81.09],["Jacksonville","FL",30.33,-81.66],["Orlando","FL",28.54,-81.38],["Miami","FL",25.76,-80.19],["Tampa","FL",27.95,-82.46],["Tallahassee","FL",30.44,-84.28],["Charlotte","NC",35.23,-80.84],["Raleigh","NC",35.78,-78.64],["Asheville","NC",35.60,-82.55],["Charleston","SC",32.78,-79.93],["Richmond","VA",37.54,-77.44],["Ashburn","VA",39.04,-77.49],["Roanoke","VA",37.27,-79.94],["Charleston","WV",38.35,-81.63],["Pittsburgh","PA",40.44,-79.99],["Philadelphia","PA",39.95,-75.17],["Harrisburg","PA",40.27,-76.88],["Scranton","PA",41.41,-75.66],["Erie","PA",42.13,-80.09],["New York","NY",40.71,-74.01],["Albany","NY",42.65,-73.76],["Buffalo","NY",42.89,-78.88],["Syracuse","NY",43.05,-76.15],["Watertown","NY",43.97,-75.91],["Plattsburgh","NY",44.70,-73.45],["Boston","MA",42.36,-71.06],["Hartford","CT",41.76,-72.67],["Burlington","VT",44.48,-73.21],["Concord","NH",43.21,-71.54],["Portland","ME",43.66,-70.26],["Bangor","ME",44.80,-68.77],["Presque Isle","ME",46.68,-68.02]];
function placeName(lon, lat) {
  let best = null, bd = 1e9;
  for (const c of CITIES) { const d = d3.geoDistance([lon, lat], [c[3], c[2]]) * 6371; if (d < bd) { bd = d; best = c; } }
  if (bd < 45) return `${best[0]}, ${best[1]}`;
  const b = (Math.atan2((lon - best[3]) * Math.cos(lat * Math.PI / 180), lat - best[2]) * 180 / Math.PI + 360) % 360, dir = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"][Math.round(b / 45) % 8];
  return `${Math.round(bd / 10) * 10} km ${dir} of ${best[0]}, ${best[1]}`;
}
function cityOnly(lon, lat) { let best = null, bd = 1e9; for (const c of CITIES) { const d = d3.geoDistance([lon, lat], [c[3], c[2]]); if (d < bd) { bd = d; best = c; } } return `${best[0]}, ${best[1]}`; }
// rasterised outline of the lower 48 in projected pixels, for inside tests
function nationMask(cell) {
  const w = Math.ceil(975 / cell), h = Math.ceil(610 / cell), c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d"); ctx.scale(1 / cell, 1 / cell); ctx.beginPath(); d3.geoPath(null, ctx)(G.nation); ctx.fill();
  const px = ctx.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) m[i] = px[i * 4 + 3] > 127;
  return { w, h, cell, m, at(x, y) { const i = Math.floor(x / cell), j = Math.floor(y / cell); return i >= 0 && j >= 0 && i < w && j < h && m[j * w + i] === 1; } };
}
function setupGeo() {
  const lower48 = D.topo.objects.states.geometries.filter(g => !["02", "15"].includes(g.id));
  G.nation = topojson.merge(D.topo, lower48);
  G.states = topojson.mesh(D.topo, { type: "GeometryCollection", geometries: lower48 }, (a, b) => a !== b);
  G.lat = D.coex.lat; G.lon = D.coex.lon; G.ny = G.lat.length; G.nx = G.lon.length; G.k = 4;
  G.NX = (G.nx - 1) * G.k + 1; G.NY = (G.ny - 1) * G.k + 1;
  D.us.forEach(d => { d.xy = projection([d.lon, d.lat]); });
}
function baseMap(svg, fill = WARMGREY) {
  const p = d3.geoPath();
  svg.append("path").datum(G.nation).attr("d", p).attr("fill", fill);
  svg.append("path").datum(G.states).attr("d", p).attr("fill", "none").attr("stroke", "#fff").attr("stroke-width", 1);
}
const decodeU8 = b64 => { const s = atob(b64), a = new Float32Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
function sampleGrid(arr, lon, lat) {
  const f = (axis, v) => { const j = Math.max(0, Math.min(axis.length - 2, Math.floor((v - axis[0]) / (axis[1] - axis[0])))); return [j, Math.max(0, Math.min(1, (v - axis[j]) / (axis[j + 1] - axis[j])))]; };
  const [y0, wy] = f(G.lat, lat), [x0, wx] = f(G.lon, lon), n = G.nx;
  return (arr[y0 * n + x0] * (1 - wx) + arr[y0 * n + x0 + 1] * wx) * (1 - wy) + (arr[(y0 + 1) * n + x0] * (1 - wx) + arr[(y0 + 1) * n + x0 + 1] * wx) * wy;
}
/* ---------------- The explorer: scoring every county as a place to build ---------------- */
// Each county in the lower 48 is scored on four criteria, each turned into a percentile rank
// across counties (lower is better): heat shared with the planned fleet, local extreme heat days,
// days above 35 C, and how much AI power its grid region already hosts. The score is the mean
// rank of the criteria switched on. Climate fields are on a 1-degree grid, sampled at county centroids.
const ST_ABBR = { Alabama: "AL", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE", "District of Columbia": "DC", Florida: "FL", Georgia: "GA", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY" };
const NEW_ENGLAND = ["Connecticut", "Maine", "Massachusetts", "New Hampshire", "Rhode Island", "Vermont"];
const GOV_LONG = {
  PJM: "PJM market, under FERC; covered by FERC's June 2026 large-load orders",
  MISO: "MISO market, under FERC; covered by FERC's June 2026 large-load orders",
  SPP: "SPP market, under FERC; covered by FERC's June 2026 large-load orders",
  NYISO: "NYISO market, under FERC; covered by FERC's June 2026 large-load orders",
  "ISO-NE": "ISO New England market, under FERC; covered by FERC's June 2026 large-load orders",
  CAISO: "California market (CAISO), under FERC; covered by FERC's June 2026 large-load orders",
  ERCOT: "Texas grid (ERCOT), outside FERC; Texas SB 6 lets ERCOT curtail large loads in emergencies",
  Southeast: "Vertically integrated utilities; large-load terms set by the state utility commission",
  West: "Utilities outside an organized market; large-load terms set by the state utility commission",
};
const EX_CRIT = [
  { k: "co", label: "Shared heat with the fleet", on: true },
  { k: "ext", label: "Local extreme heat", on: true },
  { k: "hot", label: "Cooling burden", on: true },
  { k: "grid", label: "Grid concentration", on: true },
];
const EX_RAMP = d3.scaleThreshold().domain([0.4, 0.6, 0.75, 0.85, 0.92, 0.97]).range(RISK7.slice().reverse());
const DOE16 = [["Idaho National Laboratory", 43.52, -112.95, 1], ["Oak Ridge Reservation", 35.93, -84.31, 1], ["Paducah", 37.11, -88.80, 1], ["Savannah River Site", 33.25, -81.65, 1],
  ["Portsmouth", 39.01, -83.00, 0], ["Argonne", 41.71, -87.98, 0], ["Brookhaven", 40.87, -72.88, 0], ["Fermilab", 41.84, -88.26, 0], ["NETL Morgantown", 39.67, -79.97, 0], ["NREL Golden", 39.74, -105.17, 0],
  ["Pacific Northwest Lab", 46.34, -119.28, 0], ["Princeton Plasma Physics Lab", 40.35, -74.60, 0], ["Los Alamos", 35.84, -106.29, 0], ["Sandia", 35.05, -106.54, 0], ["Pantex", 35.31, -101.56, 0], ["Kansas City campus", 38.86, -94.55, 0]]
  .map(([name, lat, lon, sel]) => ({ name, lat, lon, sel: !!sel }));
const Explorer = {
  init() {
    const W = 975, H = 610, svg = (this.svg = d3.select("#ex-map").attr("viewBox", `0 0 ${W} ${H}`)), path = d3.geoPath();
    const stName = new Map(D.topo.objects.states.geometries.map(g => [g.id, g.properties.name]));
    const regionOf = new Map(Object.entries(D.reg.states).flatMap(([r, ss]) => ss.map(st => [st, r])));
    NEW_ENGLAND.forEach(st => regionOf.set(st, "ISO-NE"));
    this.gw = Object.fromEntries(D.reg.regions.map((r, j) => [r, D.reg.power_gw[j]])); this.gw["ISO-NE"] = 0;
    const feats = topojson.feature(D.topo, D.topo.objects.counties).features.filter(f => !["02", "15", "72", "60", "66", "69", "78"].includes(f.id.slice(0, 2)));
    this.cs = feats.map(f => {
      const c = path.centroid(f), ll = projection.invert(c), st = stName.get(f.id.slice(0, 2)), region = regionOf.get(st) || "West";
      return { f, id: f.id, name: f.properties.name, st, ab: ST_ABBR[st] || "", c, lon: ll[0], lat: ll[1], region, gov: st === "California" ? "CAISO" : region };
    }).filter(d => d.st && isFinite(d.lon));
    this.byId = new Map(this.cs.map(d => [d.id, d]));
    this.cs.forEach(d => { d.p2 = new Path2D(path(d.f)); });
    G.stateP = new Path2D(path(topojson.mesh(D.topo, D.topo.objects.states, (a, b) => a !== b)));
    const zg = (this.zg = svg.append("g"));
    this.paths = zg.append("g").selectAll("path").data(this.cs).join("path").attr("d", d => path(d.f)).attr("fill", "#f1ede7").attr("stroke", "#fff").attr("stroke-width", 0.25).attr("vector-effect", "non-scaling-stroke");
    zg.append("path").datum(topojson.mesh(D.topo, D.topo.objects.states, (a, b) => a !== b)).attr("d", path).attr("fill", "none").attr("stroke", "#fff").attr("stroke-width", 1.2).attr("vector-effect", "non-scaling-stroke").style("pointer-events", "none");
    const lower48 = D.topo.objects.states.geometries.filter(g => !["02", "15", "72", "60", "66", "69", "78"].includes(g.id));
    const govOf = g => (g.properties.name === "California" ? "CAISO" : regionOf.get(g.properties.name) || "West");
    zg.append("path").datum(topojson.mesh(D.topo, { type: "GeometryCollection", geometries: lower48 }, (a, b) => a !== b && govOf(a) !== govOf(b)))
      .attr("d", path).attr("fill", "none").attr("stroke", "#9aa0a6").attr("stroke-width", 0.9).attr("stroke-dasharray", "4 3").attr("vector-effect", "non-scaling-stroke").style("pointer-events", "none");
    this.pickG = zg.append("g").style("pointer-events", "none");
    this.hl = zg.append("path").attr("fill", "none").attr("stroke", INK).attr("stroke-width", 2).attr("vector-effect", "non-scaling-stroke").style("pointer-events", "none");
    this.pinG = zg.append("path").attr("fill", "none").attr("stroke", INK).attr("stroke-width", 3).attr("vector-effect", "non-scaling-stroke").style("pointer-events", "none");
    this.ov = svg.append("g").style("pointer-events", "none");
    this.badgeG = this.ov.append("g"); this.stLab = this.ov.append("g");
    this.states = new Map(topojson.feature(D.topo, { type: "GeometryCollection", geometries: lower48 }).features.map(f => [f.properties.name, f]));
    this.view = [W / 2, H / 2, W]; this.T = { k: 1, tx: 0, ty: 0 }; this.W = W; this.H = H; this.zs = null;
    const doe = (this.doeG = this.ov.append("g").selectAll("g").data(DOE16).join("g").attr("transform", d => `translate(${projection([d.lon, d.lat])})`));
    doe.append("rect").attr("x", -4).attr("y", -4).attr("width", 8).attr("height", 8).attr("fill", d => (d.sel ? INK : "#fff")).attr("stroke", INK).attr("stroke-width", 1.2);
    legendRamp("#ex-legend", "Siting risk, ranked across counties", RISK7, [[0, "Lowest"], [1, "Highest"]]);
    legendItems("#ex-legend", [{ type: "outline", color: INK, label: "Ten best areas" }, { type: "square", color: INK, label: "DOE selected federal site" }, { type: "outline", color: "#5f6368", label: "Other DOE candidate site" }]);
    // pointer
    this.paths.on("mousemove", (e, d) => { this.hl.attr("d", path(d.f)); showTip(e, this.tipHtml(d, this.doeAt(e)) + `<div class="t-muted tt-hint">${this.zs === d.st ? "Click to pin this county" : `Click to zoom into ${d.st}`}</div>`); })
      .on("mouseleave", () => { this.hl.attr("d", null); hideTip(); })
      .on("click", (e, d) => { hideTip(); if (this.zs === d.st) this.pinCounty(d); else this.zoomTo(d.st, d); });
    svg.on("click", e => { if (e.target === svg.node()) this.zoomTo(null); });
    d3.select("#ex-back").on("click", () => this.zoomTo(null));
    const inp = d3.select("#ex-search"), list = d3.select("#ex-sugg"); let hits = [], act = -1;
    const show = () => { list.selectAll("li").data(hits, d => d.id).join("li").attr("role", "option").classed("on", (d, i) => i === act)
        .html(d => `<b>${d.name}</b><span>${d.st}</span><em>#${d3.format(",")(d.rank)}</em>`).on("mousedown", (e, d) => { e.preventDefault(); pick(d); });
      inp.attr("aria-expanded", hits.length ? "true" : "false"); list.classed("open", hits.length > 0); };
    const pick = d => { hits = []; act = -1; show(); inp.property("value", `${d.name}, ${d.ab}`); inp.node().blur(); this.zoomTo(d.st, d); };
    inp.on("input", e => { const q = e.target.value.trim().toLowerCase(); act = -1;
      hits = q.length < 2 ? [] : this.cs.filter(d => `${d.name} ${d.st} ${d.ab}`.toLowerCase().includes(q)).sort((a, b) => (b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q)) || a.rank - b.rank).slice(0, 7); show(); })
      .on("keydown", e => { if (!hits.length) return; if (e.key === "ArrowDown") { act = (act + 1) % hits.length; show(); e.preventDefault(); } else if (e.key === "ArrowUp") { act = (act - 1 + hits.length) % hits.length; show(); e.preventDefault(); } else if (e.key === "Enter") { pick(hits[Math.max(0, act)]); } else if (e.key === "Escape") { hits = []; show(); } })
      .on("blur", () => { hits = []; show(); });
    this.path = path; this.svgNode = svg.node();
    d3.select("#ex-criteria").selectAll("button").data(EX_CRIT).join("button").attr("class", "crit on").attr("aria-pressed", "true").html(c => `<span class="ck"><svg viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.6 9.6 3.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>${c.label}`)
      .on("click", (e, c) => { if (c.on && EX_CRIT.filter(x => x.on).length === 1) return; c.on = !c.on; d3.select(e.currentTarget).classed("on", c.on).attr("aria-pressed", String(c.on)); this.update(true); writeProse(); });
  },
  proj2(x, y) { return [x * this.T.k + this.T.tx, y * this.T.k + this.T.ty]; },
  apply(v) {
    const k = this.W / v[2], tx = this.W / 2 - v[0] * k, ty = this.H / 2 - v[1] * k;
    this.view = v; this.T = { k, tx, ty };
    this.zg.attr("transform", `translate(${tx},${ty}) scale(${k})`);
    this.doeG.attr("transform", d => { const q = projection([d.lon, d.lat]); return `translate(${this.proj2(q[0], q[1])})`; });
    this.badgeG.selectAll("g").attr("transform", d => `translate(${this.proj2(d.c[0], d.c[1])})`);
    this.stLab.selectAll("g").attr("transform", d => `translate(${this.proj2(d.c[0], d.c[1])})`);
  },
  zoomTo(st, pin) {
    const W = this.W, H = this.H; let target = [W / 2, H / 2, W];
    if (st) { const [[x0, y0], [x1, y1]] = this.path.bounds(this.states.get(st)), k = Math.min(9, 0.86 / Math.max((x1 - x0) / W, (y1 - y0) / H)); target = [(x0 + x1) / 2, (y0 + y1) / 2, W / k]; }
    this.zs = st; this.stLab.selectAll("*").remove(); if (!pin) this.pinG.attr("d", null);
    const zi = d3.interpolateZoom(this.view, target);
    this.zg.transition().duration(reduceMotion ? 0 : Math.min(1300, zi.duration * 0.8)).ease(ease).tween("zoom", () => t => this.apply(zi(t)))
      .on("end", () => { this.labelState(); if (pin) this.pinCounty(pin); });
    this.badgeG.transition().duration(300).attr("opacity", st ? 0 : 1);
    d3.select("#ex-zoombar").classed("on", !!st);
    this.stateLine();
  },
  stateLine() {
    const st = this.zs; if (!st) return d3.select("#ex-state").html("");
    const cs = this.cs.filter(d => d.st === st).sort((a, b) => a.rank - b.rank), med = d3.median(cs, d => d.rank);
    d3.select("#ex-state").html(`<b>${st}</b> · median county #${d3.format(",")(Math.round(med))} of ${d3.format(",")(this.cs.length)} · best: ` + cs.slice(0, 5).map((d, i) => `<span class="zb-i">${i + 1}</span>${d.name} (#${d3.format(",")(d.rank)})`).join(" "));
  },
  labelState() {
    if (!this.zs) return;
    const cs = this.cs.filter(d => d.st === this.zs).sort((a, b) => a.rank - b.rank).slice(0, 5);
    const g = this.stLab.selectAll("g").data(cs, d => d.id).join(e => { const q = e.append("g"); q.append("rect").attr("x", -11).attr("y", -11).attr("width", 22).attr("height", 22).attr("rx", 4).attr("fill", INK); q.append("text").attr("class", "pick-num").attr("text-anchor", "middle").attr("dy", "0.35em"); return q; });
    g.select(".pick-num").text((d, i) => i + 1);
    g.attr("transform", d => `translate(${this.proj2(d.c[0], d.c[1])})`).attr("opacity", 0).transition().duration(300).attr("opacity", 1);
  },
  pinCounty(d) {
    this.pinG.attr("d", this.path(d.f));
    const q = this.proj2(d.c[0], d.c[1]), box = this.svgNode.getBoundingClientRect(), sc = box.width / this.W;
    showTip({ clientX: box.left + q[0] * sc, clientY: box.top + q[1] * sc }, this.tipHtml(d) + `<div class="t-muted tt-hint">Pinned · click elsewhere to clear</div>`);
    d3.select("#ex-search").property("value", `${d.name}, ${d.ab}`);
  },
  doeAt(e) { const [mx, my] = d3.pointer(e, this.svgNode); return DOE16.find(d => { const q = projection([d.lon, d.lat]); return Math.hypot(q[0] - mx, q[1] - my) < 7; }); },
  pinPoint(lon, lat) { const q = projection([lon, lat]); let b = this.cs[0], bd = 1e9; this.cs.forEach(d => { const dd = Math.hypot(d.c[0] - q[0], d.c[1] - q[1]); if (dd < bd) { bd = dd; b = d; } }); this.pin = b; this.pinG.attr("d", this.path(b.f)); this.card(b); },
  score(k) {
    const co = decodeU8(D.coex.by[k].co), dl = Float32Array.from(D.coex.by[k].delta), ext = decodeU8(D.siting.by[k].ext), hot = decodeU8(D.siting.by[k].hot35), tot = d3.sum(Object.values(this.gw));
    this.cs.forEach(d => { d.co = sampleGrid(co, d.lon, d.lat); d.delta = sampleGrid(dl, d.lon, d.lat); d.ext = sampleGrid(ext, d.lon, d.lat); d.hot = sampleGrid(hot, d.lon, d.lat); d.grid = this.gw[d.region] / tot; });
    const n = this.cs.length - 1;
    EX_CRIT.forEach(c => { const o = this.cs.slice().sort((a, b) => a[c.k] - b[c.k]); o.forEach((d, i) => { d["r_" + c.k] = i / n; }); });
    const on = EX_CRIT.filter(c => c.on);
    this.cs.forEach(d => { d.s = d3.mean(on, c => d["r_" + c.k]); });
    const o = this.cs.slice().sort((a, b) => a.s - b.s); o.forEach((d, i) => { d.rank = i + 1; d.better = 1 - i / n; });
    this.picks = []; for (const d of o) { if (this.picks.length >= 10) break; if (this.picks.every(q => Math.hypot(q.c[0] - d.c[0], q.c[1] - d.c[1]) > 105)) this.picks.push(d); }
    DOE16.forEach(s => { const q = projection([s.lon, s.lat]); let b = this.cs[0], bd = 1e9; this.cs.forEach(d => { const dd = Math.hypot(d.c[0] - q[0], d.c[1] - q[1]); if (dd < bd) { bd = dd; b = d; } }); s.county = b; });
  },
  update(fromToggle) {
    this.score(state.climate);
    this.paths.transition().duration(fromToggle ? 350 : DUR / 2).attr("fill", d => EX_RAMP(d.better));
    this.pickG.selectAll("path").data(this.picks, d => d.id).join("path").attr("d", d => this.path(d.f)).attr("fill", "none").attr("stroke", INK).attr("stroke-width", 2.2).attr("vector-effect", "non-scaling-stroke");
    const g = this.badgeG.selectAll("g").data(this.picks, d => d.id).join(e => { const x = e.append("g"); x.append("rect").attr("x", -9).attr("y", -33).attr("width", 18).attr("height", 18).attr("rx", 3).attr("fill", INK); x.append("text").attr("class", "pick-num").attr("text-anchor", "middle").attr("y", -20); return x; });
    g.attr("transform", d => `translate(${this.proj2(d.c[0], d.c[1])})`).select("text").text((d, i) => i + 1);
    if (this.zs) { this.stLab.selectAll("*").remove(); this.labelState(); this.stateLine(); }
  },
  tipHtml(d, doe) {
    const tot = this.cs.length, row = (k, lab, val) => { const c = EX_CRIT.find(x => x.k === k), good = 1 - d["r_" + k];
      return `<div class="tt-row${c.on ? "" : " off"}"><span>${lab}</span><b>${val}</b><i><em style="width:${(good * 100).toFixed(0)}%"></em></i></div>`; };
    return `${doe ? `<div class="t-muted">DOE ${doe.sel ? "selected" : "candidate"} federal site: ${doe.name}</div>` : ""}<div class="tt-h"><b>${d.name}${d.ab ? ", " + d.ab : ""}</b><span>${d.rank === 1 ? "Best" : `#${d3.format(",")(d.rank)}`} of ${d3.format(",")(tot)}</span></div>` +
      row("co", "Hot on fleet's shared heat days", fmtPct(d.co / 100)) + row("ext", "Extreme heat days a year", Math.round(d.ext)) + row("hot", "Days above 35&deg;C a year", Math.round(d.hot)) + row("grid", `AI planned in ${d.gov === "CAISO" ? "the West" : d.region}`, fmt1(this.gw[d.region]) + " GW") +
      `<div class="tt-gov">${GOV_LONG[d.gov]}</div>`;
  },
  card() {},
};

/* ================================================================
   Shared chart helpers: responsive SVG drawn at true pixel size,
   HTML legends, small square site markers.
   ================================================================ */
function responsive(sel, draw) {
  const el = document.querySelector(sel); let w = 0, first = true;
  const run = () => { const nw = el.clientWidth; if (nw && Math.abs(nw - w) > 4) { w = nw; draw(w, first); first = false; } };
  new ResizeObserver(run).observe(el); run();
}
function legendRamp(sel, label, colors, ticks, centred) {
  const el = d3.select(sel).append("div").attr("class", "lg" + (centred ? " lg-c" : ""));
  el.append("div").attr("class", "lg-label").text(label);
  const bar = el.append("div").attr("class", "lg-ramp");
  colors.forEach(c => bar.append("span").style("background", c));
  const tk = el.append("div").attr("class", "lg-ticks");
  ticks.forEach(([pos, t]) => tk.append("span").style("left", `${pos * 100}%`).text(t));
}
function legendItems(sel, items) {
  const el = d3.select(sel).append("div").attr("class", "lg lg-items");
  items.forEach(it => {
    const s = el.append("span").attr("class", "lg-item");
    if (it.type === "line") s.append("i").attr("class", "lg-line").style("background", it.color).style("height", (it.w || 2) + "px");
    else if (it.type === "band") s.append("i").attr("class", "lg-sq").style("background", it.color).style("width", "16px");
    else s.append("i").attr("class", "lg-sq" + (it.type === "outline" ? " outline" : "")).style(it.type === "outline" ? "border-color" : "background", it.color);
    s.append("span").text(it.label);
  });
}
const sq = (sel, size) => sel.attr("x", d => d.xy[0] - size / 2).attr("y", d => d.xy[1] - size / 2).attr("width", size).attr("height", size);

/* ================================================================
   Figure 2. How far one data center's heat reaches: every county shaded
   by its chance of extreme heat on the days the selected site is in
   extreme heat (ten models, 20 summers, climate selected in Figure 1).
   ================================================================ */
const RC_T = [10, 20, 30, 40, 50, 60, 70, 80], RC_COL = d3.range(9).map(i => RISK(i / 8));
const Reach = {
  init() {
    this.idx = new Map(D.reach.sites.map((n, i) => [n, i]));
    this.sites = D.us.filter(d => this.idx.has(d.name)).sort((a, b) => b.power - a.power);
    this.tour = this.sites.slice(0, 8).map(d => d.name); this.sel = this.tour[0];
    this.cache = new Map();
    const W = 975, MH = 610, stage = document.getElementById("rc-stage"), canvas = (this.canvas = document.getElementById("rc-canvas"));
    this.ctx = canvas.getContext("2d");
    const resize = () => { const w = stage.clientWidth, dpr = window.devicePixelRatio || 1; canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * MH / W * dpr); canvas.style.height = (w * MH / W) + "px"; this.scale = canvas.width / W; if (this.cur) this.paint(this.cur); };
    new ResizeObserver(resize).observe(stage); resize();
    const svg = d3.select("#rc-map").attr("viewBox", `0 0 ${W} ${MH}`), r = d3.scaleSqrt().domain([0, 2800]).range([3, 13]);
    this.marks = svg.append("g").selectAll("rect").data(this.sites).join("rect").attr("x", d => d.xy[0] - r(d.power) / 2).attr("y", d => d.xy[1] - r(d.power) / 2).attr("width", d => r(d.power)).attr("height", d => r(d.power))
      .attr("fill", "#fff").attr("stroke", INK).attr("stroke-width", 1.2);
    this.ring = svg.append("rect").attr("fill", "none").attr("stroke", "#fff").attr("stroke-width", 2.5).style("pointer-events", "none");
    this.lab = svg.append("text").attr("class", "map-label").attr("text-anchor", "middle").style("pointer-events", "none");
    this.r = r;
    const del = d3.Delaunay.from(this.sites, d => d.xy[0], d => d.xy[1]);
    const near = e => { const [mx, my] = d3.pointer(e), d = this.sites[del.find(mx, my)]; return Math.hypot(d.xy[0] - mx, d.xy[1] - my) < 24 ? d : null; };
    svg.append("rect").attr("width", W).attr("height", MH).attr("fill", "transparent").style("cursor", "pointer")
      .on("mousemove", e => { const d = near(e); if (!d) return hideTip(); showTip(e, `<b>${d.name}</b><br><span class="t-muted">${fmtGW(d.power)} planned · ${d.region}</span><br>On its extreme heat days, <b>${fmtPct(D.reach.by[state.climate].reach[this.idx.get(d.name)])}</b> of the rest of the fleet is in extreme heat too<br><span class="t-muted">Click to select</span>`); })
      .on("mouseleave", hideTip)
      .on("click", e => { const d = near(e); if (!d) return; this.stop(); this.show(d.name); });
    legendRamp("#rc-legend", "Chance a county is in extreme heat on the selected site's extreme heat days", RC_COL, [[0, "0%"], [0.5, "50%"], [1, "100%"]]);
    legendItems("#rc-legend", [{ type: "outline", color: INK, label: "Planned data center, sized by power" }]);
    this.ready = true; this.show(this.sel, true);
    d3.select("#rc-play").on("click", () => (this.timer ? this.stop() : this.play()));
    this.icon(false);
    onVisible("#rc-stage", () => { if (!reduceMotion) this.play(); });
  },
  play() { let i = Math.max(0, this.tour.indexOf(this.sel)); this.timer = d3.interval(() => { i = (i + 1) % this.tour.length; this.show(this.tour[i]); }, 1600); this.icon(true); },
  stop() { if (this.timer) this.timer.stop(); this.timer = null; this.icon(false); },
  icon(p) { d3.select("#rc-play").attr("aria-label", p ? "Pause tour" : "Play tour").html(p ? '<svg viewBox="0 0 16 16"><path d="M4 3h3v10H4zM9 3h3v10H9z"/></svg>' : '<svg viewBox="0 0 16 16"><path d="M5 3l8 5-8 5z"/></svg>'); },
  vals(name) {
    const key = state.climate + "|" + name;
    if (!this.cache.has(key)) { const f = decodeU8(D.reach.by[state.climate].fields[this.idx.get(name)]); this.cache.set(key, Float32Array.from(Explorer.cs, c => sampleGrid(f, c.lon, c.lat))); }
    return this.cache.get(key);
  },
  col(v) { let i = 0; while (i < RC_T.length && v >= RC_T[i]) i++; return RC_COL[i]; },
  paint(a) {
    const { ctx, scale } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); ctx.setTransform(scale, 0, 0, scale, 0, 0);
    Explorer.cs.forEach((c, j) => { ctx.fillStyle = this.col(a[j]); ctx.fill(c.p2); });
    ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 1.1; ctx.stroke(G.stateP);
  },
  show(name, instant) {
    this.sel = name; const s = this.sites.find(d => d.name === name), to = this.vals(name), from = this.cur || to;
    if (this.tm) this.tm.stop();
    if (instant || reduceMotion || from === to) { this.cur = to; this.paint(to); }
    else this.tm = d3.timer(el => { const t = ease(Math.min(1, el / 450)), a = from.map((v, j) => v + (to[j] - v) * t); this.cur = a; this.paint(a); if (t >= 1) { this.cur = to; this.tm.stop(); } });
    const z = this.r(s.power) + 8;
    this.marks.attr("fill", d => (d.name === name ? INK : "#fff"));
    this.ring.transition().duration(instant ? 0 : DUR).attr("x", s.xy[0] - z / 2).attr("y", s.xy[1] - z / 2).attr("width", z).attr("height", z);
    this.lab.text(name).transition().duration(instant ? 0 : DUR).attr("x", s.xy[0]).attr("y", s.xy[1] - z / 2 - 8);
    d3.select("#rc-name").text(name);
    d3.select("#rc-val").html(`On its extreme heat days, <b>${fmtPct(D.reach.by[state.climate].reach[this.idx.get(name)])}</b> of the rest of the fleet is in extreme heat too`);
  },
  recolor() { this.cur = null; this.show(this.sel, true); },
};

/* ================================================================
   Figure 3. One heat wave, many data centers: a county map of how far
   each place is above its design day, and every site, day by day.
   ================================================================ */
const RP_T = [0.25, 1, 2, 3, 4, 6], RP_COL = [RISK(0.12), RISK(0.3), RISK(0.48), RISK(0.64), RISK(0.8), RISK(0.95)];
const RP_ORDER = ["West", "ERCOT", "SPP", "MISO", "Southeast", "PJM", "NYISO"];
const Replay = {
  init() {
    const R = D.replay, W = 975, MH = 610, stage = document.getElementById("rp-stage"), canvas = (this.canvas = document.getElementById("rp-canvas"));
    this.ctx = canvas.getContext("2d");
    this.frames = R.frames.map(f => { const fld = Float32Array.from(decodeU8(f.ex), v => v / 10 - 10); return { ...f, cv: Float32Array.from(Explorer.cs, c => sampleGrid(fld, c.lon, c.lat)) }; });
    this.col = v => { if (v < RP_T[0]) return LAND; let i = 0; while (i < RP_T.length - 1 && v >= RP_T[i + 1]) i++; return RP_COL[i]; };
    const resize = () => { const w = stage.clientWidth, dpr = window.devicePixelRatio || 1; canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * MH / W * dpr); canvas.style.height = (w * MH / W) + "px"; this.scale = canvas.width / W; if (this.t != null) this.paint(); };
    new ResizeObserver(resize).observe(stage); resize();
    const idx = new Map(R.sites.map((n, i) => [n, i]));
    this.sites = D.us.map(d => ({ ...d, i: idx.get(d.name) })).filter(d => d.i != null);
    const svg = d3.select("#rp-map").attr("viewBox", `0 0 ${W} ${MH}`);
    this.marks = svg.append("g").selectAll("rect").data(this.sites).join("rect").call(sq, 5).attr("stroke-width", 1.2);
    // grid of sites by day
    const n = this.frames.length, rowH = 4.6, left = 96, top = 84, rows = this.sites.slice().sort((a, b) => RP_ORDER.indexOf(a.region) - RP_ORDER.indexOf(b.region) || a.lon - b.lon);
    rows.forEach((d, r) => { d.row = r; });
    const gw = W - left - 44, cw = gw / n, GH = top + rows.length * rowH + 30, g2 = d3.select("#rp-grid").attr("viewBox", `0 0 ${W} ${GH}`);
    this.cw = cw; this.left = left;
    const ys = d3.scaleLinear().domain([0, 1]).range([top - 14, 6]);
    this.bars = g2.append("g").selectAll("rect").data(this.frames).join("rect").attr("x", (f, i) => left + i * cw + 0.6).attr("width", cw - 1.2).attr("y", f => ys(f.share)).attr("height", f => top - 14 - ys(f.share));
    g2.append("line").attr("x1", left).attr("x2", left + gw).attr("y1", ys(0.25)).attr("y2", ys(0.25)).attr("stroke", INK).attr("stroke-dasharray", "3 3").attr("stroke-width", 0.9);
    g2.append("text").attr("class", "rp-t").attr("x", left + gw + 6).attr("y", ys(0.25)).attr("dy", "0.35em").text("25%");
    g2.append("text").attr("class", "rp-t").attr("x", left - 10).attr("y", ys(0.5)).attr("text-anchor", "end").text("Fleet share");
    this.cells = g2.append("g").selectAll("rect").data(rows.flatMap(d => this.frames.map((f, i) => ({ d, i, hot: f.hot[d.i] === "1" })))).join("rect")
      .attr("x", c => left + c.i * cw + 0.4).attr("y", c => top + c.d.row * rowH).attr("width", cw - 0.8).attr("height", rowH - 0.7).attr("fill", "#f1f3f4");
    d3.groups(rows, d => d.region).forEach(([reg, ds]) => { const y0 = top + ds[0].row * rowH, y1 = top + (ds[ds.length - 1].row + 1) * rowH;
      g2.append("text").attr("class", "rp-r").attr("x", left - 10).attr("y", (y0 + y1) / 2).attr("dy", "0.35em").attr("text-anchor", "end").text(reg);
      if (ds[0].row > 0) g2.append("line").attr("x1", left).attr("x2", left + gw).attr("y1", y0 - 0.35).attr("y2", y0 - 0.35).attr("stroke", "#fff").attr("stroke-width", 2.2); });
    this.frames.map((f, i) => [f.date, i]).filter(([d]) => d.endsWith("-01")).forEach(([d, i]) => g2.append("text").attr("class", "rp-t").attr("x", left + i * cw).attr("y", GH - 8).text(d3.timeFormat("%B 1")(d3.timeParse("%Y-%m-%d")(d))));
    this.head = g2.append("rect").attr("y", 2).attr("height", top + rows.length * rowH - 2).attr("width", cw + 2).attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.5);
    g2.append("rect").attr("x", left).attr("width", gw).attr("y", 0).attr("height", top + rows.length * rowH).attr("fill", "transparent").style("cursor", "pointer")
      .on("mousemove", e => { const [mx, my] = d3.pointer(e), i = Math.max(0, Math.min(n - 1, Math.floor((mx - left) / cw))), d = rows[Math.floor((my - top) / rowH)], f = this.frames[i], day = d3.timeFormat("%B %-d")(d3.timeParse("%Y-%m-%d")(f.date));
        showTip(e, d && my >= top ? `<b>${d.name}</b> · ${d.region}<br>${day}: ${f.hot[d.i] === "1" ? "<b>in extreme heat</b>" : "below its design day"}` : `<b>${day}</b><br>${fmtPct(f.share)} of planned AI power in extreme heat`); })
      .on("mouseleave", hideTip)
      .call(d3.drag().on("start drag", e => { this.pause(); this.set(Math.max(0, Math.min(n - 1, Math.floor((e.x - left) / cw)))); }));
    d3.select("#rp-play").on("click", () => (this.timer ? this.pause() : this.play()));
    responsive("#rp-tl-wrap", w => this.drawTimeline(w));
    legendRamp("#rp-legend", "Degrees above the county's own design day (°C)", [LAND, ...RP_COL], [[2 / 7, "1"], [3 / 7, "2"], [4 / 7, "3"], [5 / 7, "4"], [6 / 7, "6"]], true);
    legendItems("#rp-legend", [{ type: "outline", color: "#5f6368", label: "Planned data center" }, { type: "square", color: INK, label: "Data center in extreme heat" }]);
    this.set(0); this.setIcon(false);
    onVisible("#rp-stage", () => (reduceMotion ? this.set(d3.maxIndex(this.frames, f => f.share)) : this.play()), 0.4);
  },
  drawTimeline(w) {
    const n = this.frames.length, H = 58, m = { l: 8, r: 8 }, iw = w - m.l - m.r, svg = d3.select("#rp-tl").attr("width", w).attr("height", H); svg.selectAll("*").remove();
    const x = (this.tx = d3.scaleLinear().domain([0, n - 1]).range([m.l, m.l + iw])), y = d3.scaleLinear().domain([0, 1]).range([34, 6]);
    svg.append("path").attr("d", d3.area().x((f, i) => x(i)).y0(34).y1(f => y(f.share)).curve(d3.curveMonotoneX)(this.frames)).attr("fill", "#e8eaed");
    this.tlFill = svg.append("path").attr("d", d3.area().x((f, i) => x(i)).y0(34).y1(f => y(f.share)).curve(d3.curveMonotoneX)(this.frames)).attr("fill", RISK(0.62)).attr("clip-path", "url(#rp-tlc)");
    this.tlClip = svg.append("clipPath").attr("id", "rp-tlc").append("rect").attr("x", 0).attr("y", 0).attr("height", H).attr("width", 0);
    svg.append("line").attr("x1", m.l).attr("x2", m.l + iw).attr("y1", 34).attr("y2", 34).attr("stroke", "#9aa0a6");
    svg.append("line").attr("x1", m.l).attr("x2", m.l + iw).attr("y1", y(0.25)).attr("y2", y(0.25)).attr("stroke", INK).attr("stroke-dasharray", "3 3").attr("stroke-width", 0.8);
    this.frames.forEach((f, i) => { if (f.date.endsWith("-01") || i === 0) { svg.append("line").attr("x1", x(i)).attr("x2", x(i)).attr("y1", 34).attr("y2", 40).attr("stroke", "#9aa0a6"); svg.append("text").attr("class", "tl-m").attr("x", x(i) + 3).attr("y", 52).text(d3.timeFormat("%b %-d")(d3.timeParse("%Y-%m-%d")(f.date))); } });
    this.tlHead = svg.append("g").style("pointer-events", "none");
    this.tlHead.append("line").attr("y1", 2).attr("y2", 40).attr("stroke", INK).attr("stroke-width", 2);
    this.tlHead.append("circle").attr("cy", 34).attr("r", 7).attr("fill", "#fff").attr("stroke", INK).attr("stroke-width", 2.5);
    svg.append("rect").attr("x", m.l).attr("width", iw).attr("height", H).attr("fill", "transparent").style("cursor", "ew-resize")
      .on("mousemove", e => { const i = Math.round(x.invert(d3.pointer(e)[0])), f = this.frames[Math.max(0, Math.min(n - 1, i))]; showTip(e, `<b>${d3.timeFormat("%B %-d")(d3.timeParse("%Y-%m-%d")(f.date))}</b><br>${fmtPct(f.share)} of planned AI power in extreme heat<br><span class="t-muted">Click or drag to jump here</span>`); })
      .on("mouseleave", hideTip)
      .call(d3.drag().on("start drag", e => { hideTip(); this.pause(); this.set(Math.max(0, Math.min(n - 1, x.invert(e.x)))); }));
    if (this.t != null) this.placeHead();
  },
  placeHead() { if (!this.tlHead) return; const X = this.tx(this.t); this.tlHead.attr("transform", `translate(${X},0)`); this.tlClip.attr("width", X); },
  set(t) {
    const prev = this.t == null ? -1 : Math.floor(this.t); this.t = t; const i = Math.floor(t), f = this.frames[i];
    this.paint();
    if (i === prev) return;
    this.marks.attr("fill", d => (f.hot[d.i] === "1" ? INK : "#fff")).attr("stroke", d => (f.hot[d.i] === "1" ? "#fff" : "#5f6368")).each(function (d) { const z = f.hot[d.i] === "1" ? 8 : 5; d3.select(this).attr("x", d.xy[0] - z / 2).attr("y", d.xy[1] - z / 2).attr("width", z).attr("height", z); });
    this.cells.attr("fill", c => (c.i > i ? "#f8f9fa" : c.hot ? RISK(0.62) : "#eceef0"));
    this.bars.attr("fill", (g, j) => (j > i ? "#eceef0" : g.share >= 0.25 ? RISK(0.62) : "#bdc1c6"));
    this.head.attr("x", this.left + i * this.cw - 1);
    this.placeHead();
    d3.select("#rp-date").text(d3.timeFormat("%B %-d")(d3.timeParse("%Y-%m-%d")(f.date)));
    d3.select("#rp-share").html(`<b>${fmtPct(f.share)}</b> of planned AI power in extreme heat`);
  },
  paint() {
    const i = Math.min(this.frames.length - 1, Math.floor(this.t)), u = this.t - i, a = this.frames[i].cv, b = this.frames[Math.min(this.frames.length - 1, i + 1)].cv;
    const { ctx, scale } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); ctx.setTransform(scale, 0, 0, scale, 0, 0);
    Explorer.cs.forEach((c, j) => { ctx.fillStyle = this.col(a[j] + (b[j] - a[j]) * u); ctx.fill(c.p2); });
    ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 1.1; ctx.stroke(G.stateP);
  },
  play() {
    if (this.t >= this.frames.length - 1) this.set(0);
    const t0 = performance.now(), from = this.t, n = this.frames.length - 1, dur = 320 * (n - from);
    this.timer = d3.timer(() => { const u = Math.min(1, (performance.now() - t0) / dur); this.set(from + (n - from) * u); if (u >= 1) this.pause(); });
    this.setIcon(true);
  },
  pause() { if (this.timer) this.timer.stop(); this.timer = null; this.setIcon(false); },
  setIcon(p) { d3.select("#rp-play").attr("aria-label", p ? "Pause" : "Play").html(p ? '<svg viewBox="0 0 16 16"><path d="M4 3h3v10H4zM9 3h3v10H9z"/></svg>' : '<svg viewBox="0 0 16 16"><path d="M5 3l8 5-8 5z"/></svg>'); },
};

/* ================================================================
   Figure 4. A typical summer in each period, as 153 days from May to
   September. The filled days are the median number of shared heat days,
   placed on the dates where they are most likely.
   ================================================================ */
const Warming = {
  init() {
    const gmed = k => d3.median(D.gwl.pts.filter(p => p.k === k), p => p.gwl), n = r => r.f.split("1").length - 1;
    this.periods = CLIMATES.map(c => {
      const rows = D.mosaic.by[c.key], days = rows[0].f.length, freq = d3.range(days).map(i => d3.mean(rows, r => (r.f.charCodeAt(i) === 49 ? 1 : 0)));
      const med = Math.round(d3.median(rows, n)), pm = d3.rollups(rows, a => d3.mean(a, n), r => r.m).map(e => e[1]);
      const top = new Set(d3.range(days).sort((a, b) => freq[b] - freq[a] || a - b).slice(0, med));
      return { k: c.key, label: c.label, g: gmed(c.key), freq, med, lo: d3.min(pm), hi: d3.max(pm), days: d3.range(days).map(i => ({ i, on: top.has(i), f: freq[i] })) };
    }).sort((a, b) => a.g - b.g);
    legendItems("#wm-legend", [{ type: "square", color: ACC, label: "Shared heat day in the median summer" }, { type: "square", color: "#e8eaed", label: "Other summer day" }]);
    this.played = reduceMotion;
    responsive("#wm-wrap", w => { this.w = w; this.draw(w); });
    onVisible("#wm-wrap", () => { this.played = true; this.fill(true); });
  },
  draw(w) {
    const narrow = w < 620, L = narrow ? 0 : 150, R = narrow ? 0 : 118, rowH = narrow ? 22 : 30, gap = narrow ? 40 : 20, top = 22;
    const H = top + this.periods.length * (rowH + gap), svg = d3.select("#warm").attr("width", w).attr("height", H); svg.selectAll("*").remove();
    const n = this.periods[0].days.length, cw = (w - L - R) / n, x = i => L + i * cw;
    [["May", 0], ["June", 31], ["July", 61], ["August", 92], ["September", 123]].forEach(([mn, d]) => svg.append("text").attr("class", "wm-tk").attr("x", x(d) + 1).attr("y", 12).text(narrow ? mn.slice(0, 3) : mn));
    const rows = svg.selectAll("g.wr").data(this.periods).join("g").attr("class", "wr").attr("transform", (p, i) => `translate(0,${top + i * (rowH + gap) + (narrow ? 18 : 0)})`);
    rows.append("text").attr("class", "wr-l").attr("y", narrow ? -6 : rowH / 2 - 6).attr("dy", "0.35em").text(p => (narrow ? `${p.label} · ${fmt1(p.g)}°C · ${p.med} days` : p.label));
    if (!narrow) rows.append("text").attr("class", "wr-g").attr("y", rowH / 2 + 10).attr("dy", "0.35em").text(p => `${fmt1(p.g)}°C of warming`);
    this.cells = rows.selectAll("rect").data(p => p.days.map(d => ({ ...d, p }))).join("rect").attr("x", d => x(d.i) + 0.4).attr("width", Math.max(0.6, cw - 0.8)).attr("y", 0).attr("height", rowH).attr("fill", "#e8eaed")
      .on("mousemove", (e, d) => showTip(e, `<b>${d3.timeFormat("%B %-d")(d3.timeDay.offset(new Date(2001, 4, 1), d.i))}</b> · ${d.p.label}<br>A shared heat day in <b>${fmtPct(d.f)}</b> of simulated summers`)).on("mouseleave", hideTip);
    [31, 61, 92, 123].forEach(d => svg.append("line").attr("x1", x(d)).attr("x2", x(d)).attr("y1", top - 4).attr("y2", H - gap + 4).attr("stroke", "#fff").attr("stroke-width", 2));
    if (!narrow) { rows.append("text").attr("class", "wr-m").attr("x", w - R + 14).attr("y", rowH / 2 - 6).attr("dy", "0.35em").text(p => `${p.med} days`);
      rows.append("text").attr("class", "wr-mu").attr("x", w - R + 14).attr("y", rowH / 2 + 10).attr("dy", "0.35em").text(p => `models ${Math.round(p.lo)} to ${Math.round(p.hi)}`); }
    this.fill(false);
  },
  fill(animate) {
    if (!this.cells) return;
    const sel = animate && !reduceMotion ? this.cells.transition().delay(d => this.periods.indexOf(d.p) * 220 + d.i * 5).duration(250) : this.cells;
    sel.attr("fill", d => (this.played && d.on ? ACC : "#e8eaed"));
  },
};

/* ================================================================
   Figure 5. Can neighbouring grids help? Small multiples, one panel per
   grid region placed roughly where it sits. Each column is a period; its
   segments split the region's region-wide heat days by how many bordering
   regions are under region-wide heat on the same day. Static.
   ================================================================ */
const SM_P = [["historical|1995-2014", "1995–2014"], ["ssp245|2041-2060", "2050s"], ["ssp585|2081-2100", "2090s"]];
const SM_AT = { West: [0, 0], SPP: [1, 0], MISO: [2, 0], PJM: [3, 0], NYISO: [4, 0], ERCOT: [1, 1], Southeast: [3, 1] };
const SM_C = ["#e8eaed", RISK(0.35), RISK(0.62), RISK(0.9)];
const Duration = {
  init() { responsive("#du-wrap", w => this.draw(w)); },
  draw(w) {
    const narrow = w < 640, cols = narrow ? 2 : 4, gap = 14, pw = (w - gap * (cols - 1)) / cols, ph = narrow ? 236 : 244;
    const order = ["West", "ERCOT", "SPP", "MISO", "Southeast", "PJM", "NYISO"], pos = r => [order.indexOf(r) % cols, Math.floor(order.indexOf(r) / cols)];
    const rowsN = Math.ceil((order.length + 1) / cols), H = rowsN * (ph + gap);
    const svg = d3.select("#dur-chart").attr("width", w).attr("height", H); svg.selectAll("*").remove();
    const N = D.nbdist, gwOf = r => D.reg.power_gw[D.reg.regions.indexOf(r)];
    const panels = svg.selectAll("g.sp").data(order).join("g").attr("class", "sp").attr("transform", r => `translate(${pos(r)[0] * (pw + gap)},${pos(r)[1] * (ph + gap)})`);
    const bg = panels.append("rect").attr("class", "sp-bg").attr("width", pw).attr("height", ph).attr("rx", 10).attr("fill", "#f8f9fa").attr("stroke", "transparent").attr("stroke-width", 2);
    panels.append("text").attr("class", "sp-n").attr("x", 12).attr("y", 22).text(r => r);
    panels.append("text").attr("class", "sp-g").attr("x", 12).attr("y", 38).text(r => `${fmt1(gwOf(r))} GW planned`);
    // bordering regions, wrapped to the panel width
    panels.each(function (r) {
      const t = d3.select(this).append("text").attr("class", "sp-b").attr("x", 12).attr("y", 54), words = ("Borders " + N.neighbours[r].join(", ")).split(" ");
      let line = [], ts = t.append("tspan").attr("x", 12), n = 0;
      words.forEach(wd => { line.push(wd); ts.text(line.join(" ")); if (ts.node().getComputedTextLength() > pw - 24 && line.length > 1) { line.pop(); ts.text(line.join(" ")); line = [wd]; ts = t.append("tspan").attr("x", 12).attr("dy", "1.25em").text(wd); n++; } });
    });
    const top = 94, bot = ph - 40, cw = Math.min(30, (pw - 24) / 3 - 12), x = i => 12 + i * ((pw - 24) / 3) + ((pw - 24) / 3 - cw) / 2, y = d3.scaleLinear().domain([0, 1]).range([bot, top]);
    panels.each(function (r) {
      const g = d3.select(this);
      SM_P.forEach(([k, l], i) => {
        const dist = N.by[k][r].dist; let acc = 0;
        dist.forEach((v, j) => { g.append("rect").attr("x", x(i)).attr("width", cw).attr("y", y(acc + v)).attr("height", Math.max(0, y(acc) - y(acc + v))).attr("fill", SM_C[j]); acc += v; });
        g.append("text").attr("class", "sp-v").attr("x", x(i) + cw / 2).attr("y", top - 6).attr("text-anchor", "middle").text(fmtPct(1 - dist[0]));
        g.append("text").attr("class", "sp-l").attr("x", x(i) + cw / 2).attr("y", bot + 15).attr("text-anchor", "middle").text(l === "1995–2014" ? "Past" : l);
        g.append("text").attr("class", "sp-d").attr("x", x(i) + cw / 2).attr("y", bot + 29).attr("text-anchor", "middle").text(`${fmt1(N.by[k][r].days)} d`);
      });
    });
    // hovering a region outlines the regions it borders
    panels.on("mouseenter", (e, r) => { const nb = N.neighbours[r]; panels.attr("opacity", o => (o === r || nb.includes(o) ? 1 : 0.3)); bg.attr("stroke", o => (o === r ? INK : nb.includes(o) ? RISK(0.55) : "transparent")); })
      .on("mousemove", (e, r) => showTip(e, `<b>${r}</b> borders ${N.neighbours[r].join(", ")}<br>On ${r}'s region-wide heat days, at least one of them is too:<br>` + SM_P.map(([k]) => `${CL[k].label}: <b>${fmtPct(1 - N.by[k][r].dist[0])}</b>`).join("<br>")))
      .on("mouseleave", () => { panels.attr("opacity", 1); bg.attr("stroke", "transparent"); hideTip(); });
    // key in the last cell
    const kc = order.length, kg = svg.append("g").attr("transform", `translate(${(kc % cols) * (pw + gap) + 12},${Math.floor(kc / cols) * (ph + gap)})`);
    kg.append("text").attr("class", "sp-kt").attr("y", 22).text("Bordering regions also");
    kg.append("text").attr("class", "sp-kt").attr("y", 38).text("under region-wide heat:");
    ["None", "One", "Two", "Three or more"].forEach((t, j) => { const it = kg.append("g").attr("transform", `translate(0,${62 + j * 22})`); it.append("rect").attr("width", 12).attr("height", 12).attr("y", -10).attr("rx", 2).attr("fill", SM_C[j]); it.append("text").attr("class", "sp-k").attr("x", 20).text(t); });
    kg.append("text").attr("class", "sp-k2").attr("y", 168).text("Top: at least one");
    kg.append("text").attr("class", "sp-k2").attr("y", 183).text("d: heat days a summer");
    kg.append("text").attr("class", "sp-k2").attr("y", 205).text("Hover a region to see");
    kg.append("text").attr("class", "sp-k2").attr("y", 220).text("the regions it borders");
  },
};

/* ================================================================
   Figure 6. Who decides: the measures now shaping the fleet, what each
   addresses, and how much planned AI power falls under each grid regime.
   ================================================================ */
const GOV_REGIMES = [
  { k: "FERC", label: "Organized markets under FERC", sub: "PJM, MISO, SPP, NYISO", regions: ["PJM", "MISO", "SPP", "NYISO"] },
  { k: "TX", label: "ERCOT under Texas law", sub: "Texas SB 6", regions: ["ERCOT"] },
  { k: "STATE", label: "Outside organized markets", sub: "State commissions and TVA", regions: ["Southeast", "West"] },
];
const GOV_COLS = ["Speeds approval or connection", "Sets terms for connecting", "Curtailment or backup in an emergency", "Climate risk at the site", "Heat across many sites at once"];
// 2 = addressed, 1 = partly or only during an emergency, 0 = not part of the measure as described
const GOV_ROWS = [
  { date: "Jan 2025", name: "Georgia PSC large-load rule", who: "State", ap: ["STATE"], c: [0, 2, 0, 0, 0], ref: 25, note: ["", "New contracts above 100 MW go to the commission for review.", "", "", ""] },
  { date: "Jun 2025", name: "Texas SB 6", who: "State", ap: ["TX"], c: [0, 2, 2, 0, 0], ref: 11, note: ["", "Interconnection standards for loads above 75 MW, including disclosure of on-site backup generation.", "ERCOT can curtail new large loads or call on their backup generation during firm load shed.", "", ""] },
  { date: "Jul 2025", name: "AEP Ohio data center tariff", who: "State", ap: ["FERC"], c: [0, 2, 0, 0, 0], ref: 26, note: ["", "New data centers above 25 MW pay for at least 85% of subscribed demand for up to 12 years.", "", "", ""] },
  { date: "Jul 2025", name: "Executive Order 14318", who: "Federal", ap: ["FERC", "TX", "STATE"], c: [2, 0, 0, 0, 0], ref: 7, note: ["Fast-tracks federal permitting, including new NEPA categorical exclusions, for AI data centers above 100 MW.", "", "", "", ""] },
  { date: "2025", name: "DOE federal AI sites", who: "Federal", ap: ["FERC", "STATE"], c: [2, 1, 0, 0, 0], ref: 8, note: ["Four DOE sites selected from 16 candidates for AI data centers with co-located energy.", "Site-specific arrangements for co-located generation.", "", "", ""] },
  { date: "May 2026", name: "DOE 202(c) heat-wave order", who: "Federal", ap: ["FERC"], c: [0, 0, 2, 0, 1], ref: 27, note: ["", "", "Authorized PJM to move data centers onto backup generation during a Mid-Atlantic heat wave.", "", "Acts on heat across many sites, but only during the event."] },
  { date: "Jun 2026", name: "FERC large-load show-cause orders", who: "Federal", ap: ["FERC"], c: [2, 2, 0, 0, 0], ref: 10, note: ["Six market operators must justify or reform how they connect loads above 50 MW, within 60 days.", "Cost responsibility and interconnection procedures for large loads.", "", "", ""] },
  { date: "Jul 2026", name: "FERC order on NERC standards", who: "Federal", ap: ["FERC", "TX", "STATE"], c: [0, 1, 1, 0, 0], ref: 28, note: ["", "Data centers must register with NERC by the end of 2026.", "New standards address how computational loads ride through grid disturbances.", "", ""] },
];
const Gov = {
  init() {
    const gw = r => d3.sum(D.us.filter(d => r.regions.includes(d.region)), d => d.power);
    GOV_REGIMES.forEach(r => { r.gw = gw(r); });
    this.sel = null; this.k = "ssp245|2041-2060";
    d3.select("#gov-periods").selectAll("button").data([["historical|1995-2014", "1995–2014"], ["ssp245|2041-2060", "2050s, moderate"], ["ssp585|2081-2100", "2090s, high"]]).join("button").text(d => d[1])
      .on("click", (e, d) => { this.k = d[0]; this.heat(true); });
    legendItems("#gov-legend", [{ type: "square", color: INK, label: "Addressed" }, { type: "square", color: "#9aa0a6", label: "Partly, or only during an emergency" }, { type: "outline", color: "#bdc1c6", label: "Not part of the measure as described" }]);
    this.played = reduceMotion;
    responsive("#gov-wrap", w => this.draw(w));
    onVisible("#gov-wrap", () => { this.played = true; d3.selectAll("#gov-chart rect.cell").attr("opacity", 0).transition().delay(d => GOV_ROWS.indexOf(d.r) * 90 + d.i * 40).duration(300).attr("opacity", 1); });
  },
  draw(w) {
    const narrow = w < 640, labW = narrow ? 0 : 310, colW = (w - labW) / GOV_COLS.length, rowH = narrow ? 58 : 40, headH = narrow ? 64 : 74, barH = narrow ? 150 : 120;
    const SHORT = ["Speeds approval", "Sets terms", "Emergency", "Site climate", "Many sites at once"];
    const H = barH + headH + GOV_ROWS.length * rowH + 58;
    const svg = d3.select("#gov-chart").attr("width", w).attr("height", H); svg.selectAll("*").remove();
    // top: who regulates the planned fleet, and how much of it is in extreme heat on a shared heat day (CMIP6)
    const tot = d3.sum(GOV_REGIMES, r => r.gw), xb = d3.scaleLinear().domain([0, tot]).range([0, w]), bh = 26;
    svg.append("text").attr("class", "pn-t").attr("y", 14).text(narrow ? "AI load in extreme heat on a shared heat day" : `Planned AI load by who sets its grid-connection terms (${fmtGW(tot)}), and the part in extreme heat on a typical shared heat day`);
    let acc = 0; GOV_REGIMES.forEach(r => { r.x0 = xb(acc); r.w = xb(r.gw) - 3; acc += r.gw; });
    const segs = svg.append("g").attr("transform", "translate(0,28)").selectAll("g").data(GOV_REGIMES).join("g").style("cursor", "pointer").on("click", (e, r) => { this.sel = this.sel === r.k ? null : r.k; this.focus(); })
      .on("mousemove", (e, r) => { const H2 = D.govheat.by; showTip(e, `<b>${r.label}</b> · ${fmtGW(r.gw)} planned<br>In extreme heat on a typical shared heat day (CMIP6, ten-model median):<br>` + [["historical|1995-2014", "1995–2014"], ["ssp245|2041-2060", "2050s, moderate"], ["ssp585|2081-2100", "2090s, high"]].map(([k, l]) => `${l}: <b>${H2[k][r.k].gw.toFixed(1)} GW</b> (${fmtPct(H2[k][r.k].share)}), ${H2[k].shared_days} shared heat days a summer`).join("<br>")); })
      .on("mouseleave", hideTip);
    segs.append("rect").attr("x", r => r.x0).attr("width", r => r.w).attr("height", bh).attr("fill", "#e8eaed");
    this.hotBars = segs.append("rect").attr("x", r => r.x0).attr("width", 0).attr("height", bh).attr("fill", RISK(0.72));
    this.hotLabs = segs.append("text").attr("class", "gv-hot").attr("y", bh / 2).attr("dy", "0.35em");
    if (narrow) GOV_REGIMES.forEach((r, i) => { const q = segs.filter(o => o === r).append("g").attr("transform", `translate(0,${bh + 22 + i * 20})`);
      q.append("text").attr("class", "gv-seg").text(r.k === "FERC" ? "FERC markets" : r.k === "TX" ? "ERCOT, Texas law" : "Outside markets"); q.append("text").attr("class", "gv-seg-v gv-nh").attr("x", w).attr("text-anchor", "end"); });
    else { segs.append("text").attr("class", "gv-seg").attr("x", r => r.x0).attr("y", bh + 20).text(r => (r.k === "FERC" ? "Markets regulated by FERC" : r.k === "TX" ? "ERCOT, Texas law" : "Outside markets"));
      segs.append("text").attr("class", "gv-seg-v gv-nh").attr("x", r => r.x0).attr("y", bh + 37); }
    this.svgGov = svg;
    this.segs = segs;
    // matrix
    const g = svg.append("g").attr("transform", `translate(0,${barH})`);
    const hd = g.selectAll("g.hd").data(narrow ? SHORT : GOV_COLS).join("g").attr("class", "hd").attr("transform", (c, i) => `translate(${labW + i * colW + colW / 2},${headH - 10})`);
    hd.each(function (c, i) { const t = d3.select(this).append("text").attr("class", "gv-col" + (i === 4 ? " acc" : "")).attr("text-anchor", "middle"); const words = c.split(" "), lines = []; let cur = "";
      words.forEach(wd => { if ((cur + " " + wd).trim().length > (narrow ? 9 : 15)) { lines.push(cur.trim()); cur = wd; } else cur += " " + wd; }); lines.push(cur.trim());
      lines.forEach((l, j) => t.append("tspan").attr("x", 0).attr("dy", j ? "1.2em" : `${-(lines.length - 1) * 1.2}em`).text(l)); });
    g.append("rect").attr("x", labW + 4 * colW + 4).attr("y", headH - 4).attr("width", colW - 8).attr("height", GOV_ROWS.length * rowH + 6).attr("fill", "none").attr("stroke", ACC).attr("stroke-width", 1.5).attr("rx", 4);
    const rows = (this.rows = g.selectAll("g.rw").data(GOV_ROWS).join("g").attr("class", "rw").attr("transform", (r, i) => `translate(0,${headH + i * rowH})`));
    rows.append("line").attr("x1", 0).attr("x2", w).attr("y1", rowH).attr("y2", rowH).attr("stroke", "#e8eaed");
    if (narrow) rows.append("text").attr("class", "gv-name").attr("y", 15).html(r => `<tspan class="gv-date-t">${r.date}</tspan>  ${r.name}`);
    else { rows.append("text").attr("class", "gv-date").attr("y", rowH / 2).attr("dy", "0.35em").text(r => r.date); rows.append("text").attr("class", "gv-name").attr("x", 76).attr("y", rowH / 2).attr("dy", "0.35em").text(r => r.name); }
    const s2 = Math.min(18, colW * 0.4), cy = narrow ? 38 : rowH / 2;
    const cells = rows.selectAll("rect.cell").data(r => r.c.map((v, i) => ({ r, v, i }))).join("rect").attr("class", "cell")
      .attr("x", d => labW + d.i * colW + colW / 2 - s2 / 2).attr("y", cy - s2 / 2).attr("width", s2).attr("height", s2).attr("rx", 2)
      .attr("fill", d => (d.v === 2 ? INK : d.v === 1 ? "#9aa0a6" : "#fff")).attr("stroke", d => (d.v ? "none" : "#bdc1c6")).attr("stroke-width", 1.2)
      .on("mousemove", (e, d) => showTip(e, `<b>${d.r.name}</b> <span class="t-muted">(${d.r.who.toLowerCase()}, ${d.r.date})</span><br>${GOV_COLS[d.i]}<br>${d.r.note[d.i] || (d.v ? "" : "Not part of the measure as described.")}`)).on("mouseleave", hideTip);
    if (!this.played) cells.attr("opacity", 0);
    const ty = headH + GOV_ROWS.length * rowH + 28;
    if (!narrow) g.append("text").attr("class", "gv-name gv-tally-l").attr("x", 0).attr("y", ty).attr("dy", "0.35em").text("Measures addressing it");
    GOV_COLS.forEach((c, i) => { const full = GOV_ROWS.filter(r => r.c[i] === 2).length, part = GOV_ROWS.filter(r => r.c[i] === 1).length;
      g.append("text").attr("class", "gv-tally" + (i === 4 ? " acc" : "")).attr("x", labW + i * colW + colW / 2).attr("y", ty).attr("dy", "0.35em").attr("text-anchor", "middle").text(narrow ? `${full}/${GOV_ROWS.length}` : `${full} of ${GOV_ROWS.length}`);
      if (part) g.append("text").attr("class", "gv-tally-s").attr("x", labW + i * colW + colW / 2).attr("y", ty + 16).attr("dy", "0.35em").attr("text-anchor", "middle").text(`+${part} partly`); });
    rows.on("mouseenter", (e, r) => { if (!this.sel) segs.attr("opacity", s3 => (r.ap.includes(s3.k) ? 1 : 0.3)); }).on("mouseleave", () => this.focus());
    this.focus(); this.heat(false);
  },
  heat(animate) {
    if (!this.hotBars) return;
    const H2 = D.govheat.by[this.k], t = sel => (animate && !reduceMotion ? sel.transition().duration(700).ease(ease) : sel);
    t(this.hotBars).attr("width", r => r.w * H2[r.k].share);
    this.hotLabs.attr("x", r => r.x0 + 8).attr("fill", "#fff").text(r => (r.w * H2[r.k].share > 70 ? `${H2[r.k].gw.toFixed(1)} GW` : ""));
    d3.select("#gov-chart").selectAll(".gv-nh").text(r => (r.k === "FERC" ? `${H2[r.k].gw.toFixed(1)} of ${fmtGW(r.gw)} in extreme heat (${fmtPct(H2[r.k].share)})` : `${H2[r.k].gw.toFixed(1)} of ${fmtGW(r.gw)} (${fmtPct(H2[r.k].share)})`));
    d3.selectAll("#gov-periods button").classed("on", d => d[0] === this.k);
    d3.select("#gov-days").html(`<b>${H2.shared_days}</b> shared heat days a summer`);
  },
  focus() {
    if (!this.rows) return;
    this.segs.attr("opacity", r => (!this.sel || r.k === this.sel ? 1 : 0.3));
    this.rows.attr("opacity", r => (!this.sel || r.ap.includes(this.sel) ? 1 : 0.25));
  },
};

/* ---------------- Header image: the explorer's answer, in miniature ---------------- */
const Hero = {
  init() {
    const svg = d3.select("#hero-map").attr("viewBox", "0 0 975 610"), path = d3.geoPath();
    svg.append("g").selectAll("path").data(Explorer.cs).join("path").attr("d", d => path(d.f)).attr("fill", d => EX_RAMP(d.better));
    svg.append("path").datum(topojson.mesh(D.topo, D.topo.objects.states, (a, b) => a !== b)).attr("d", path).attr("fill", "none").attr("stroke", "#fff").attr("stroke-width", 1.4);
    svg.append("g").selectAll("path").data(Explorer.picks).join("path").attr("d", d => path(d.f)).attr("fill", "none").attr("stroke", INK).attr("stroke-width", 4);
  },
};

/* ---------------- table of contents ---------------- */
const Toc = {
  init() {
    const links = d3.selectAll(".toc a");
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) links.classed("on", function () { return this.getAttribute("href") === "#" + e.target.id; }); }), { rootMargin: "-35% 0px -60% 0px" });
    document.querySelectorAll("main section[id]").forEach(x => io.observe(x));
  },
};

/* ---------------- the narrative, written from the data ---------------- */
function writeProse() {
  const k = state.climate, when = CL[k].long, ex = Explorer, pk = ex.picks || [];
  const area = d => (["Washington", "Oregon", "Idaho", "Montana"].includes(d.st) ? "the Pacific Northwest" : NEW_ENGLAND.includes(d.st) || d.st === "New York" ? "northern New England" : ["North Dakota", "South Dakota", "Minnesota", "Nebraska"].includes(d.st) ? "the northern Plains" : ["North Carolina", "Georgia", "South Carolina", "Virginia"].includes(d.st) ? "the Carolina Piedmont" : d.st === "California" ? "coastal California" : "");
  const areas = [...new Set(pk.map(area).filter(Boolean))], list = a => (a.length > 1 ? a.slice(0, -1).join(", ") + " and " + a[a.length - 1] : a[0] || "");
  d3.select("#ex-take").html(`Figure 1 ranks all ${d3.format(",")(ex.cs.length)} counties as places for new AI capacity. In ${when}, the lowest-risk areas are ${list(areas.slice(0, 3))}.`);
  const doe = DOE16.filter(x => x.sel).map(x => ({ ...x, b: x.county ? x.county.better : 0 })).sort((p2, q) => q.b - p2.b);
  d3.select("#doe-take").html(`Of DOE's four selected federal sites${cite(8)}, ${doe[0].name} ranks best (ahead of ${fmtPct(doe[0].b)} of counties) and ${doe[3].name} worst (${fmtPct(doe[3].b)}).`);
  const near = d => ex.cs.reduce((a, b) => (Math.hypot(b.c[0] - d.xy[0], b.c[1] - d.xy[1]) < Math.hypot(a.c[0] - d.xy[0], a.c[1] - d.xy[1]) ? b : a));
  const best = d3.sum(D.us.filter(d => near(d).better >= 0.85), d => d.power) / D.usGW, worst = d3.sum(D.us.filter(d => near(d).better < 0.25), d => d.power) / D.usGW;
  d3.select("#build-take").html(`The fleet is going elsewhere: only <b>${fmtPct(best)}</b> of the ${fmtGW(D.usGW)} planned by 2030 sits in Figure 1's best 15% of counties, and <b>${fmtPct(worst)}</b> in the worst quarter${cite(1)}. Extreme heat is regional, so on a typical site's hottest days <b>${fmtPct(d3.median(D.reach.by[k].reach))}</b> of the rest of the fleet is in extreme heat too.`);
  const R = D.replay, pkF = R.frames[d3.maxIndex(R.frames, f => f.share)];
  d3.select("#replay-take").html(`In one simulated 2050s summer, the fleet has <b>${R.run_days} consecutive shared heat days</b> (a quarter of planned power in extreme heat at once), peaking at <b>${fmtPct(pkF.share)}</b> on ${d3.timeFormat("%B %-d")(d3.timeParse("%Y-%m-%d")(pkF.date))}.`);
  const P = Warming.periods, pk2 = kk => P.find(q => q.k === kk);
  d3.select("#warm-take").html(`A typical summer has <b>${pk2(HIST).med}</b> shared heat days in 1995&ndash;2014, <b>${pk2("ssp245|2041-2060").med}</b> at about 2&deg;C of warming and <b>${pk2("ssp585|2081-2100").med}</b> in the 2090s under high emissions. All ten models agree on the direction${cite(23)}.`);
  const NB = D.nbdist.by, any = (kk, r) => 1 - NB[kk][r].dist[0];
  d3.select("#dur-take").html(`A grid region in trouble imports power from its neighbours, which is why NERC studies transfer capability between regions${cite(29)}. That help fails when the neighbours are hot too. In the 2050s under moderate emissions, on MISO's region-wide heat days at least one bordering region is also under region-wide heat <b>${fmtPct(any("ssp245|2041-2060", "MISO"))}</b> of the time, and PJM's <b>${fmtPct(any("ssp245|2041-2060", "PJM"))}</b>; in the 2090s under high emissions, both pass ${fmtPct(Math.min(any("ssp585|2081-2100", "MISO"), any("ssp585|2081-2100", "PJM")))}.`);
  const gwr = r => d3.sum(D.us.filter(d => r.includes(d.region)), d => d.power);
  const GH = D.govheat.by, g50 = GH["ssp245|2041-2060"];
  d3.select("#gov-take").html(`Responsibility for the fleet is split: ${fmtPct(gwr(["PJM", "MISO", "SPP", "NYISO"]) / D.usGW)} of planned AI power connects under FERC, ${fmtPct(gwr(["ERCOT"]) / D.usGW)} under Texas law and ${fmtPct(gwr(["Southeast", "West"]) / D.usGW)} outside organized markets. The CMIP6 models show every one of them facing the same heat at once: on a typical shared heat day in the 2050s, <b>${g50.FERC.gw.toFixed(1)} GW</b> of FERC-regulated load, ${g50.TX.gw.toFixed(1)} GW in ERCOT and ${g50.STATE.gw.toFixed(1)} GW outside the markets are in extreme heat, on ${g50.shared_days} such days a summer against ${GH[HIST].shared_days} in 1995&ndash;2014. None of the eight measures adopted since 2025 plans for heat across many sites at once.`);
  const ar1 = [...new Set(pk.slice(0, 10).map(area).filter(Boolean))];
  d3.select("#rec-1").html(`<b>Add shared heat to siting reviews.</b> Placing new capacity in ${list(ar1)} reduces the fleet's shared heat days (Figure 5)${cite(8, 9)}.`);
  d3.select("#rec-2").html(`<b>Plan curtailment for regions, not single sites.</b> Rules now being written at FERC, NERC and in Texas should assume many campuses at once${cite(10, 11, 28)}.`);
  d3.select("#rec-3").html(`<b>Size backup for multi-day events.</b> ${fmtPct(rKey("ssp245|2041-2060").survival[2])} of region-wide heat events in the 2050s last three days or more, against a 12-hour fuel standard${cite(16)}.`);
}
