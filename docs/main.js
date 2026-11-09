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

Promise.all(["sites", "regions", "coexposure", "buildout", "streams", "siting", "replay", "gwl", "reach", "mosaic"].map(f => json(`data/${f}.json`))
  .concat([json("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-albers-10m.json")]))
  .then(([sites, reg, coex, build, streams, siting, replay, gwl, reach, mosaic, topo]) => {
    D = { sites: sites.sites, models: sites.models, reg, coex, build, streams, siting, replay, gwl, reach, mosaic, topo };
    D.us = D.sites.filter(d => d.country === "United States");
    D.usGW = d3.sum(D.us, d => d.power);
    d3.select("#model-list").text(D.models.join(", "));
    setupGeo();
    Explorer.init(); Build.init(); Replay.init(); Warming.init(); Duration.init(); Gov.init();
    d3.selectAll("#ex-climate button").on("click", function () { setClimate(this.dataset.k); });
    d3.select("#share-link").on("click", e => { e.preventDefault(); navigator.clipboard && navigator.clipboard.writeText(location.href.split("#")[0]); d3.select("#share-link span").text("Link copied"); });
    setClimate(state.climate);
    Hero.init();
  });

function setClimate(k) {
  state.climate = k;
  d3.selectAll("#ex-climate button").classed("on", function () { return this.dataset.k === k; });
  Explorer.update();
  if (Build.ready) Build.recolor();
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
    this.paths = svg.append("g").selectAll("path").data(this.cs).join("path").attr("d", d => path(d.f)).attr("fill", "#f1ede7").attr("stroke", "#fff").attr("stroke-width", 0.2);
    svg.append("path").datum(topojson.mesh(D.topo, D.topo.objects.states, (a, b) => a !== b)).attr("d", path).attr("fill", "none").attr("stroke", "#fff").attr("stroke-width", 1.1).style("pointer-events", "none");
    const lower48 = D.topo.objects.states.geometries.filter(g => !["02", "15", "72", "60", "66", "69", "78"].includes(g.id));
    const govOf = g => (g.properties.name === "California" ? "CAISO" : regionOf.get(g.properties.name) || "West");
    svg.append("path").datum(topojson.mesh(D.topo, { type: "GeometryCollection", geometries: lower48 }, (a, b) => a !== b && govOf(a) !== govOf(b)))
      .attr("d", path).attr("fill", "none").attr("stroke", "#9aa0a6").attr("stroke-width", 0.9).attr("stroke-dasharray", "4 3").style("pointer-events", "none");
    this.hl = svg.append("path").attr("fill", "none").attr("stroke", INK).attr("stroke-width", 2).style("pointer-events", "none");
    this.pinG = svg.append("path").attr("fill", "none").attr("stroke", ACC).attr("stroke-width", 2.2).style("pointer-events", "none");
    this.pickG = svg.append("g").style("pointer-events", "none");
    const doe = svg.append("g").style("pointer-events", "none").selectAll("g").data(DOE16).join("g").attr("transform", d => `translate(${projection([d.lon, d.lat])})`);
    doe.append("rect").attr("x", -4).attr("y", -4).attr("width", 8).attr("height", 8).attr("fill", d => (d.sel ? INK : "#fff")).attr("stroke", INK).attr("stroke-width", 1.2);
    legendRamp("#ex-legend", "Siting risk, ranked across counties", RISK7, [[0, "Lowest"], [1, "Highest"]]);
    legendItems("#ex-legend", [{ type: "outline", color: INK, label: "Ten best areas" }, { type: "square", color: INK, label: "DOE selected federal site" }, { type: "outline", color: "#5f6368", label: "Other DOE candidate site" }]);
    // pointer
    this.paths.on("mousemove", (e, d) => { this.hl.attr("d", path(d.f)); this.card(d); const near = this.doeAt(e); showTip(e, near ? `<b>${near.name}</b><br><span class="t-muted">DOE ${near.sel ? "selected" : "candidate"} federal site, ${d.name}${d.ab ? ", " + d.ab : ""}</span><br>Better than <b>${fmtPct(d.better)}</b> of counties` : `<b>${d.name}${d.ab ? ", " + d.ab : ""}</b><br>Better than <b>${fmtPct(d.better)}</b> of counties<br><span class="t-muted">Click to pin</span>`); })
      .on("mouseleave", () => { this.hl.attr("d", null); this.card(this.pin || this.picks[0]); hideTip(); })
      .on("click", (e, d) => { this.pin = d; this.pinG.attr("d", path(d.f)); this.card(d); });
    this.path = path; this.svgNode = svg.node();
    d3.select("#ex-criteria").selectAll("button").data(EX_CRIT).join("button").attr("class", "crit on").html(c => `<span class="ck"></span>${c.label}`)
      .on("click", (e, c) => { if (c.on && EX_CRIT.filter(x => x.on).length === 1) return; c.on = !c.on; d3.select(e.currentTarget).classed("on", c.on); this.update(true); writeProse(); });
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
    const g = this.pickG.selectAll("g").data(this.picks, d => d.id).join(e => { const x = e.append("g"); x.append("path"); x.append("rect").attr("width", 18).attr("height", 18).attr("rx", 3).attr("fill", INK); x.append("text").attr("class", "pick-num").attr("text-anchor", "middle"); return x; });
    g.select("path").attr("d", d => this.path(d.f)).attr("fill", "none").attr("stroke", INK).attr("stroke-width", 2.2);
    g.select("rect").attr("x", d => d.c[0] - 9).attr("y", d => d.c[1] - 33);
    g.select("text").attr("x", d => d.c[0]).attr("y", d => d.c[1] - 20).text((d, i) => i + 1);
    d3.select("#ex-list").selectAll("li").data(this.picks, d => d.id).join("li").order()
      .html((d, i) => `<span class="pk-n">${i + 1}</span><span class="pk-t"><b>${d.name}${d.ab ? ", " + d.ab : ""}</b><br><span class="t-muted">${d.gov === "CAISO" ? "California market" : d.region} · hot on ${fmtPct(d.co / 100)} of fleet shared heat days · ${Math.round(d.hot)} day${Math.round(d.hot) === 1 ? "" : "s"} above 35&deg;C</span></span>`)
      .on("mouseenter", (e, d) => { this.hl.attr("d", this.path(d.f)); this.card(d); }).on("mouseleave", () => { this.hl.attr("d", null); this.card(this.pin || this.picks[0]); })
      .on("click", (e, d) => { this.pin = d; this.pinG.attr("d", this.path(d.f)); this.card(d); });
    this.card(this.pin || this.picks[0]);
  },
  card(d) {
    if (!d) return;
    const tot = this.cs.length, rows = [
      ["co", "Shared heat with the fleet", `In extreme heat on ${fmtPct(d.co / 100)} of the fleet's shared heat days; a 1 GW campus here would ${d.delta <= 0 ? "cut" : "add"} ${fmt1(Math.abs(d.delta))} shared heat days a year`],
      ["ext", "Local extreme heat", `${Math.round(d.ext)} days a year above its design-day temperature`],
      ["hot", "Cooling burden", `${Math.round(d.hot)} day${Math.round(d.hot) === 1 ? "" : "s"} a year above 35&deg;C`],
      ["grid", "Grid concentration", `${d.gov === "CAISO" ? "California, West" : d.region}: ${fmt1(this.gw[d.region])} GW of AI already planned (${fmtPct(d.grid)} of the fleet)`],
    ];
    d3.select("#ex-card").html(`<div class="ex-head"><b>${d.name}${d.ab ? ", " + d.ab : ""}</b><span>${d.rank === 1 ? `Best of ${d3.format(",")(tot)} counties` : `Rank ${d3.format(",")(d.rank)} of ${d3.format(",")(tot)} counties · better than ${d3.format(".1%")(d.better).replace(".0%", "%")}`}</span></div>` +
      rows.map(([k, lab, txt]) => { const c = EX_CRIT.find(x => x.k === k), good = 1 - d["r_" + k]; return `<div class="ex-row${c.on ? "" : " off"}"><span class="ex-lab">${lab}</span><span class="ex-bar"><i style="width:${(good * 100).toFixed(1)}%"></i></span><span class="ex-txt">${txt}</span></div>`; }).join("") +
      `<p class="ex-gov"><b>Who sets the rules:</b> ${GOV_LONG[d.gov]}.</p>`);
  },
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
   Figure 2. Every planned data center as a row: a step strip of its
   power coming online, coloured by the siting risk of its county.
   ================================================================ */
const Build = {
  init() {
    const months = D.build.months, m0 = months.indexOf("2023-01"), ser = new Map(D.build.sites.map(b => [b.name, b.s]));
    this.n = 96; this.m0 = m0;
    this.sites = D.us.map(d => { const s0 = (ser.get(d.name) || []).slice(m0, m0 + 96).map(v => Math.min(d.power, v || 0)), i = s0.findIndex(v => v > 0);
      const c = Explorer.cs.reduce((a, b) => (Math.hypot(b.c[0] - d.xy[0], b.c[1] - d.xy[1]) < Math.hypot(a.c[0] - d.xy[0], a.c[1] - d.xy[1]) ? b : a));
      return { ...d, co: ownerOf(d), s: s0, first: i < 0 ? 96 : i, county: c }; });
    this.group = "region"; this.sort = "size";
    const ctl = (sel, opts, key) => d3.select(sel).selectAll("button").data(opts).join("button").text(o => o[1]).classed("on", o => o[0] === this[key])
      .on("click", (e, o) => { this[key] = o[0]; d3.selectAll(`${sel} button`).classed("on", q => q[0] === this[key]); this.layout(true); });
    ctl("#bd-group", [["region", "Grid region"], ["company", "Company"]], "group");
    ctl("#bd-sort", [["size", "Size"], ["risk", "Siting risk"], ["first", "First power"]], "sort");
    legendRamp("#bd-legend", "Siting risk of the county (Figure 1, selected climate)", RISK7, [[0, "Lowest"], [1, "Highest"]]);
    legendItems("#bd-legend", [{ type: "band", color: "#5f6368", label: "Strip thickness: power online (thicker is larger)" }]);
    this.played = reduceMotion; this.ready = true; this.rev = reduceMotion ? 1 : 0;
    responsive("#bd-wrap", w => { this.w = w; this.draw(w); });
    onVisible("#bd-wrap", () => { this.played = true; const t0 = performance.now(), tm = d3.timer(() => { this.rev = d3.easeCubicInOut(Math.min(1, (performance.now() - t0) / 1800)); d3.select("#bd-reveal").attr("width", (this.tw + 2) * this.rev); if (this.rev >= 1) tm.stop(); }); }, 0.1);
  },
  risk(d) { return 1 - d.county.better; },
  draw(w) {
    const narrow = w < 620, L = narrow ? 118 : 196, Rw = narrow ? 64 : 104, rowH = 14, headH = 28, top = 30;
    this.L = L; this.tw = w - L - Rw; this.rowH = rowH; this.headH = headH; this.top = top;
    const svg = d3.select("#build").attr("width", w); svg.selectAll("*").remove();
    const x = (this.x = d3.scaleLinear().domain([0, this.n]).range([L, L + this.tw]));
    svg.append("defs").append("clipPath").attr("id", "bd-clip").append("rect").attr("id", "bd-reveal").attr("x", L).attr("y", 0).attr("height", 5000).attr("width", (this.tw + 2) * this.rev);
    this.grid = svg.append("g");
    d3.range(0, 9).forEach(i => { this.grid.append("line").attr("class", "bd-yr").attr("x1", x(i * 12)).attr("x2", x(i * 12)).attr("y1", top - 6);
      if (i < 8) svg.append("text").attr("class", "bd-ax").attr("x", x(i * 12 + 6)).attr("y", top - 12).attr("text-anchor", "middle").text(narrow ? `'${String(2023 + i).slice(2)}` : 2023 + i); });
    svg.append("text").attr("class", "bd-ax").attr("x", w).attr("y", top - 12).attr("text-anchor", "end").text("Planned");
    this.heads = svg.append("g");
    this.rows = svg.append("g").selectAll("g.br").data(this.sites, d => d.name).join("g").attr("class", "br").style("cursor", "pointer");
    this.rows.append("rect").attr("class", "br-bg").attr("x", 0).attr("width", w).attr("y", -1).attr("height", rowH).attr("fill", "transparent");
    this.rows.append("text").attr("class", "br-n").attr("x", L - 10).attr("y", rowH / 2 - 0.5).attr("dy", "0.35em").attr("text-anchor", "end").text(d => (narrow ? d.name.replace(/^(OpenAI |Microsoft |Meta |Google |Amazon |CoreWeave )/, "") : d.name)).each(function () { const t = this; while (t.getComputedTextLength() > L - 16 && t.textContent.length > 4) t.textContent = t.textContent.slice(0, -2) + "…"; });
    const mid = rowH / 2 - 0.5, hgt = d3.scaleSqrt().domain([0, 2800]).range([0, rowH - 1.5]);
    this.rows.append("line").attr("x1", L).attr("x2", L + this.tw).attr("y1", mid).attr("y2", mid).attr("stroke", "#e8eaed");
    this.areas = this.rows.append("path").attr("clip-path", "url(#bd-clip)").attr("d", d => d3.area().curve(d3.curveMonotoneX).x((v, i) => x(i)).y0(v => mid + hgt(v) / 2).y1(v => mid - hgt(v) / 2)([...d.s, d.s[this.n - 1]]));
    this.rows.append("text").attr("class", "br-v").attr("x", w).attr("y", rowH / 2 - 0.5).attr("dy", "0.35em").attr("text-anchor", "end").text(d => fmtGW(d.power));
    this.rows.on("mousemove", (e, d) => { this.rows.select(".br-bg").attr("fill", o => (o === d ? "#f1f3f4" : "transparent"));
      const fp = d.first < 96 ? d3.timeFormat("%B %Y")(new Date(2023, d.first, 1)) : "after 2030";
      showTip(e, `<b>${d.name}</b><br><span class="t-muted">${d.co === "Other" ? d.owner || "Other" : d.co} · ${d.region}</span><br>${fmtGW(d.power)} planned, first power ${fp}<br>${d.county.name}${d.county.ab ? ", " + d.county.ab : ""}: siting risk higher than ${fmtPct(this.risk(d))} of counties<br><span class="t-muted">Click to score this county in Figure 1</span>`); })
      .on("mouseleave", () => { this.rows.select(".br-bg").attr("fill", "transparent"); hideTip(); })
      .on("click", (e, d) => { hideTip(); Explorer.pin = d.county; Explorer.pinG.attr("d", Explorer.path(d.county.f)); Explorer.card(d.county); document.getElementById("explore").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }); });
    this.recolor(); this.layout(false);
  },
  recolor() { if (this.areas) this.areas.transition().duration(DUR / 2).attr("fill", d => RISK(this.risk(d))); },
  layout(animate) {
    const key = d => (this.group === "region" ? d.region : d.co);
    const sorter = { size: (a, b) => b.power - a.power, risk: (a, b) => this.risk(b) - this.risk(a), first: (a, b) => a.first - b.first || b.power - a.power }[this.sort];
    const groups = d3.groups(this.sites, key).map(([k, ds]) => ({ k, ds: ds.sort(sorter), gw: d3.sum(ds, d => d.power) })).sort((a, b) => (a.k === "Other") - (b.k === "Other") || b.gw - a.gw);
    let y = this.top + 4;
    groups.forEach(g => { g.y = y; y += this.headH; g.ds.forEach(d => { d.y = y; y += this.rowH; }); y += 8; });
    d3.select("#build").attr("height", y + 4);
    this.grid.selectAll("line").attr("y2", y);
    const t = sel => (animate && !reduceMotion ? sel.transition().duration(750).ease(ease) : sel);
    t(this.rows).attr("transform", d => `translate(0,${d.y})`);
    const H = this.heads.selectAll("g.bh").data(groups, g => g.k).join(e => { const q = e.append("g").attr("class", "bh"); q.append("text").attr("class", "bh-k"); q.append("text").attr("class", "bh-v"); q.append("line"); return q; });
    t(H).attr("transform", g => `translate(0,${g.y})`);
    H.select(".bh-k").attr("y", 17).text(g => g.k);
    H.select(".bh-v").attr("x", this.w).attr("y", 17).attr("text-anchor", "end").text(g => `${fmtGW(g.gw)} · ${g.ds.length} site${g.ds.length > 1 ? "s" : ""}`);
    H.select("line").attr("x1", 0).attr("x2", this.w).attr("y1", 22).attr("y2", 22).attr("stroke", "#9aa0a6");
  },
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
    legendRamp("#rp-legend", "Degrees above the county's own design day (°C)", [LAND, ...RP_COL], [[2 / 7, "1"], [3 / 7, "2"], [4 / 7, "3"], [5 / 7, "4"], [6 / 7, "6"]], true);
    legendItems("#rp-legend", [{ type: "outline", color: "#5f6368", label: "Planned data center" }, { type: "square", color: INK, label: "Data center in extreme heat" }]);
    this.set(0); this.setIcon(false);
    onVisible("#rp-stage", () => (reduceMotion ? this.set(d3.maxIndex(this.frames, f => f.share)) : this.play()), 0.4);
  },
  set(t) {
    const prev = this.t == null ? -1 : Math.floor(this.t); this.t = t; const i = Math.floor(t), f = this.frames[i];
    this.paint();
    if (i === prev) return;
    this.marks.attr("fill", d => (f.hot[d.i] === "1" ? INK : "#fff")).attr("stroke", d => (f.hot[d.i] === "1" ? "#fff" : "#5f6368")).each(function (d) { const z = f.hot[d.i] === "1" ? 8 : 5; d3.select(this).attr("x", d.xy[0] - z / 2).attr("y", d.xy[1] - z / 2).attr("width", z).attr("height", z); });
    this.cells.attr("fill", c => (c.i > i ? "#f8f9fa" : c.hot ? RISK(0.62) : "#eceef0"));
    this.bars.attr("fill", (g, j) => (j > i ? "#eceef0" : g.share >= 0.25 ? RISK(0.62) : "#bdc1c6"));
    this.head.attr("x", this.left + i * this.cw - 1);
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
   Figure 4. How many shared heat days a summer brings: the share of all
   simulated summers in five bands, one bar per period, ordered by warming.
   ================================================================ */
const WM_BANDS = [[0, 5, "Fewer than 5"], [5, 15, "5 to 14"], [15, 30, "15 to 29"], [30, 60, "30 to 59"], [60, 999, "60 or more"]];
const WM_COL = [RISK(0.04), RISK(0.28), RISK(0.5), RISK(0.72), RISK(0.93)];
const Warming = {
  init() {
    const gmed = k => d3.median(D.gwl.pts.filter(p => p.k === k), p => p.gwl);
    this.periods = CLIMATES.map(c => { const days = D.mosaic.by[c.key].map(r => r.f.split("1").length - 1), n = days.length;
      let acc = 0; const segs = WM_BANDS.map(([lo, hi, l], i) => { const v = days.filter(d => d >= lo && d < hi).length / n, o = { i, l, v, x0: acc }; acc += v; return o; });
      return { k: c.key, label: c.label, g: gmed(c.key), med: d3.median(days), segs, n }; }).sort((a, b) => a.g - b.g);
    legendItems("#wm-legend", WM_BANDS.map(([, , l], i) => ({ type: "square", color: WM_COL[i], label: `${l} shared heat days` })));
    this.played = reduceMotion;
    responsive("#wm-wrap", w => { this.w = w; this.draw(w); });
    onVisible("#wm-wrap", () => { this.played = true; this.grow(true); });
  },
  draw(w) {
    const narrow = w < 620, L = narrow ? 0 : 160, R = narrow ? 0 : 96, barH = 36, gap = narrow ? 44 : 22, top = 26;
    const H = top + this.periods.length * (barH + gap) + 8, svg = d3.select("#warm").attr("width", w).attr("height", H); svg.selectAll("*").remove();
    const x = (this.x = d3.scaleLinear().domain([0, 1]).range([L, w - R]));
    [0, 0.25, 0.5, 0.75, 1].forEach(v => { svg.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", top - 6).attr("y2", H - 8).attr("stroke", "#e8eaed");
      svg.append("text").attr("class", "wm-tk").attr("x", x(v)).attr("y", top - 12).attr("text-anchor", v === 0 ? "start" : v === 1 ? "end" : "middle").text(fmtPct(v)); });
    if (!narrow) svg.append("text").attr("class", "wm-tk").attr("x", w).attr("y", top - 12).attr("text-anchor", "end").text("");
    const rows = svg.selectAll("g.wr").data(this.periods).join("g").attr("class", "wr").attr("transform", (p, i) => `translate(0,${top + i * (barH + gap) + (narrow ? 20 : 0)})`);
    rows.append("text").attr("class", "wr-l").attr("x", narrow ? 0 : 0).attr("y", narrow ? -8 : barH / 2 - 6).attr("dy", "0.35em").text(p => (narrow ? `${p.label} · ${fmt1(p.g)}°C` : p.label));
    if (!narrow) rows.append("text").attr("class", "wr-g").attr("x", 0).attr("y", barH / 2 + 10).attr("dy", "0.35em").text(p => `${fmt1(p.g)}°C of warming`);
    this.segs = rows.selectAll("g.ws").data(p => p.segs.map(sg => ({ ...sg, p }))).join("g").attr("class", "ws");
    this.segs.append("rect").attr("y", 0).attr("height", barH).attr("fill", d => WM_COL[d.i]).attr("stroke", "#fff").attr("stroke-width", 1.5);
    this.segs.append("text").attr("class", d => "ws-v" + (d.i >= 3 ? " light" : "")).attr("y", barH / 2).attr("dy", "0.35em").attr("text-anchor", "middle").text(d => (d.v >= (narrow ? 0.1 : 0.06) ? fmtPct(d.v) : ""));
    this.segs.on("mousemove", (e, d) => showTip(e, `<b>${d.p.label}</b> · ${fmt1(d.p.g)}°C of global warming<br><b>${fmtPct(d.v)}</b> of simulated summers have ${d.l.toLowerCase()} shared heat days<br><span class="t-muted">${Math.round(d.v * d.p.n)} of ${d.p.n} summers, ten models</span>`)).on("mouseleave", hideTip);
    if (!narrow) rows.append("text").attr("class", "wr-m").attr("x", w - R + 14).attr("y", barH / 2 - 6).attr("dy", "0.35em").text(p => p.med);
    if (!narrow) rows.append("text").attr("class", "wr-mu").attr("x", w - R + 14).attr("y", barH / 2 + 10).attr("dy", "0.35em").text("median days");
    this.grow(false);
  },
  grow(animate) {
    if (!this.segs) return;
    const x = this.x, sel = animate && !reduceMotion ? this.segs.transition().delay(d => this.periods.indexOf(d.p) * 160 + d.i * 70).duration(600).ease(ease) : this.segs;
    const f = this.played ? 1 : 0;
    sel.select("rect").attr("x", d => x(d.x0 * f)).attr("width", d => Math.max(0, x(d.v * f) - x(0)));
    sel.select("text").attr("x", d => x((d.x0 + d.v / 2) * f)).attr("opacity", f);
  },
};

/* ================================================================
   Figure 5. How widely and how long: a region-by-day calendar of
   region-wide heat, and the length of region-wide heat events.
   ================================================================ */
const DU_P = [["historical|1995-2014", "1995–2014"], ["ssp245|2041-2060", "2050s, moderate"], ["ssp585|2081-2100", "2090s, high"]];
const DU_C = ["#bdc1c6", MAG(0.6), MAG(0.24)];
const Duration = {
  init() {
    const sm = a => a.map((v, i) => d3.mean(a.slice(Math.max(0, i - 2), i + 3)));
    this.d0 = 120; this.n = 153; this.k = DU_P[0][0];
    this.regs = D.reg.regions.map((r, j) => ({ r, gw: D.reg.power_gw[j], si: D.streams.regions.indexOf(r) })).sort((a, b) => b.gw - a.gw);
    this.P = Object.fromEntries(DU_P.map(([k]) => [k, this.regs.map(g => sm(D.streams.by[k][g.si]).slice(this.d0, this.d0 + this.n))]));
    d3.select("#du-periods").selectAll("button").data(DU_P).join("button").text(d => d[1]).classed("on", d => d[0] === this.k).on("click", (e, d) => { this.stop(); this.set(d[0], true); });
    legendRamp("#du-legend", "Chance of region-wide heat on the date", d3.range(7).map(i => RISK(i / 6)), [[0, "0%"], [0.5, "25%"], [1, "50% or more"]]);
    this.played = reduceMotion;
    responsive("#du-wrap", w => { this.w = w; this.draw(w); });
    onVisible("#du-wrap", () => { this.played = true; this.set(this.k, true); if (reduceMotion) return; let i = 0; this.timer = d3.interval(() => { i += 1; if (i >= DU_P.length) return this.stop(); this.set(DU_P[i][0], true); }, 2600); });
  },
  stop() { if (this.timer) this.timer.stop(); this.timer = null; },
  col(v) { return RISK(Math.min(1, v / 0.5)); },
  draw(w) {
    const narrow = w < 620, L = narrow ? 92 : 150, R = narrow ? 8 : 132, cellH = narrow ? 20 : 32, topH = 92, gw = w - L - R, cw = gw / this.n;
    const calH = this.regs.length * cellH, H = topH + 8 + calH + 28;
    const svg = d3.select("#dur-chart").attr("width", w).attr("height", H); svg.selectAll("*").remove();
    this.cw = cw; this.L = L; this.topH = topH; this.cellH = cellH;
    // expected number of regions under region-wide heat on each date
    const ys = d3.scaleLinear().domain([0, 4]).range([topH - 10, 34]);
    svg.append("text").attr("class", "pn-t").attr("x", 0).attr("y", 14).text(narrow ? "Regions at once" : "Grid regions under region-wide heat at once");
    svg.append("g").attr("class", "ax").attr("transform", `translate(${L},0)`).call(d3.axisLeft(ys).tickValues([0, 2, 4]).tickSize(-gw)).call(a => a.select(".domain").remove());
    this.tops = svg.append("g").selectAll("rect").data(d3.range(this.n)).join("rect").attr("x", i => L + i * cw).attr("width", Math.max(0.6, cw - 0.4)).attr("y", topH - 10).attr("height", 0).attr("fill", INK);
    // calendar
    const g = svg.append("g").attr("transform", `translate(0,${topH + 8})`);
    this.rowsG = g.selectAll("g.cr").data(this.regs).join("g").attr("class", "cr").attr("transform", (r, i) => `translate(0,${i * cellH})`);
    this.rowsG.append("text").attr("class", "cr-n").attr("x", L - 10).attr("y", cellH / 2 - (narrow ? 0 : 6)).attr("dy", "0.35em").attr("text-anchor", "end").text(r => r.r);
    if (!narrow) this.rowsG.append("text").attr("class", "cr-g").attr("x", L - 10).attr("y", cellH / 2 + 8).attr("dy", "0.35em").attr("text-anchor", "end").text(r => `${fmt1(r.gw)} GW planned`);
    this.cells = this.rowsG.selectAll("rect").data((r, ri) => d3.range(this.n).map(i => ({ ri, i }))).join("rect").attr("x", c => L + c.i * cw).attr("width", cw + 0.3).attr("y", 1).attr("height", cellH - 2).attr("fill", LAND);
    if (!narrow) this.lens = this.rowsG.append("text").attr("class", "cr-len").attr("x", w - R + 12).attr("y", cellH / 2).attr("dy", "0.35em");
    if (!narrow) g.append("text").attr("class", "cr-h").attr("x", w - R + 12).attr("y", -8).text("Average event");
    [["May", 0], ["June", 31], ["July", 61], ["August", 92], ["September", 123]].forEach(([mn, d]) => { g.append("line").attr("x1", L + d * cw).attr("x2", L + d * cw).attr("y1", 0).attr("y2", calH).attr("stroke", "#fff").attr("stroke-width", 1.5);
      g.append("text").attr("class", "cr-m").attr("x", L + d * cw + 2).attr("y", calH + 16).text(narrow ? mn.slice(0, 3) : mn); });
    const cross = g.append("line").attr("y1", -4).attr("y2", calH + 4).attr("stroke", INK).attr("stroke-width", 1.2).style("display", "none");
    g.append("rect").attr("x", L).attr("width", gw).attr("height", calH).attr("fill", "transparent").on("mousemove", e => {
      const i = Math.max(0, Math.min(this.n - 1, Math.floor((d3.pointer(e)[0] - L) / cw))), dt = d3.timeDay.offset(new Date(2001, 4, 1), i), P = this.P[this.k];
      cross.attr("x1", L + (i + 0.5) * cw).attr("x2", L + (i + 0.5) * cw).style("display", null);
      showTip(e, `<b>${d3.timeFormat("%B %-d")(dt)}</b> · ${DU_P.find(p => p[0] === this.k)[1]}<br>Chance of region-wide heat:<br>` + this.regs.map((r, j) => `${r.r}: <b>${fmtPct(P[j][i])}</b>`).join("<br>") + `<br>Expected regions at once: <b>${fmt1(d3.sum(P, a => a[i]))}</b>`);
    }).on("mouseleave", () => { cross.style("display", "none"); hideTip(); });
    this.ys = ys; this.set(this.k, false);
  },
  set(k, animate) {
    this.k = k; d3.selectAll("#du-periods button").classed("on", d => d[0] === k);
    if (!this.cells) return;
    const P = this.P[k], show = this.played, t = sel => (animate && !reduceMotion ? sel.transition().delay(c => (c.i ?? c) * 4).duration(500) : sel);
    t(this.cells).attr("fill", c => (show ? this.col(P[c.ri][c.i]) : LAND));
    t(this.tops).attr("y", i => (show ? this.ys(d3.sum(P, a => a[i])) : this.topH - 10)).attr("height", i => (show ? this.topH - 10 - this.ys(d3.sum(P, a => a[i])) : 0));
    if (this.lens) this.lens.text(r => `${fmt1(D.reg.by[k].regions[r.r].mean_len)} days`);
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
    this.sel = null;
    legendItems("#gov-legend", [{ type: "square", color: INK, label: "Addressed" }, { type: "square", color: "#9aa0a6", label: "Partly, or only during an emergency" }, { type: "outline", color: "#bdc1c6", label: "Not part of the measure as described" }]);
    this.played = reduceMotion;
    responsive("#gov-wrap", w => this.draw(w));
    onVisible("#gov-wrap", () => { this.played = true; d3.selectAll("#gov-chart rect.cell").attr("opacity", 0).transition().delay(d => GOV_ROWS.indexOf(d.r) * 90 + d.i * 40).duration(300).attr("opacity", 1); });
  },
  draw(w) {
    const narrow = w < 640, labW = narrow ? 0 : 310, colW = (w - labW) / GOV_COLS.length, rowH = narrow ? 58 : 40, headH = narrow ? 64 : 74, barH = narrow ? 118 : 86;
    const SHORT = ["Speeds approval", "Sets terms", "Emergency", "Site climate", "Many sites at once"];
    const H = barH + headH + GOV_ROWS.length * rowH + 58;
    const svg = d3.select("#gov-chart").attr("width", w).attr("height", H); svg.selectAll("*").remove();
    // top: who sets connection terms for the planned fleet
    const tot = d3.sum(GOV_REGIMES, r => r.gw), xb = d3.scaleLinear().domain([0, tot]).range([0, w]), cols = [MAG(0.22), MAG(0.5), MAG(0.74)];
    svg.append("text").attr("class", "pn-t").attr("y", 14).text(narrow ? `Who sets connection terms, ${fmtGW(tot)} planned` : `Who sets grid-connection terms for the ${fmtGW(tot)} planned by 2030`);
    let acc = 0;
    const segs = svg.append("g").attr("transform", "translate(0,26)").selectAll("g").data(GOV_REGIMES).join("g").style("cursor", "pointer").on("click", (e, r) => { this.sel = this.sel === r.k ? null : r.k; this.focus(); });
    segs.append("rect").attr("x", r => { const x = xb(acc); acc += r.gw; return x; }).attr("width", r => xb(r.gw) - 3).attr("height", 18).attr("fill", (r, i) => cols[i]);
    if (narrow) GOV_REGIMES.forEach((r, i) => { const q = segs.filter(o => o === r).append("g").attr("transform", `translate(0,${32 + i * 20})`);
      q.append("rect").attr("width", 10).attr("height", 10).attr("y", -9).attr("fill", cols[i]); q.append("text").attr("class", "gv-seg").attr("x", 16).text(`${r.label}: ${fmtGW(r.gw)} (${fmtPct(r.gw / tot)})`); });
    else { acc = 0; segs.append("text").attr("class", "gv-seg").attr("x", r => { const x = xb(acc); acc += r.gw; return x; }).attr("y", 36).text(r => (r.k === "FERC" ? "Markets regulated by FERC" : r.k === "TX" ? "ERCOT, Texas law" : "Outside markets"));
      acc = 0; segs.append("text").attr("class", "gv-seg-v").attr("x", r => { const x = xb(acc); acc += r.gw; return x; }).attr("y", 52).text(r => `${fmtGW(r.gw)} · ${fmtPct(r.gw / tot)}`); }
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
    this.focus();
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

/* ---------------- the narrative, written from the data ---------------- */
function writeProse() {
  const k = state.climate, when = CL[k].long, ex = Explorer, pk = ex.picks || [];
  const nm = d => `${d.name}${d.ab ? ", " + d.ab : ""}`, on = EX_CRIT.filter(c => c.on).map(c => c.label.toLowerCase());
  const area = d => (["Washington", "Oregon", "Idaho", "Montana"].includes(d.st) ? "the Pacific Northwest and northern Rockies" : NEW_ENGLAND.includes(d.st) || d.st === "New York" ? "northern New England" : ["North Dakota", "South Dakota", "Minnesota", "Nebraska"].includes(d.st) ? "the northern Plains" : ["North Carolina", "Georgia", "South Carolina", "Virginia"].includes(d.st) ? "the Carolina and Georgia Piedmont" : d.st === "California" ? "coastal California" : "");
  const areas = [...new Set(pk.map(area).filter(Boolean))], list = a => (a.length > 1 ? a.slice(0, -1).join(", ") + " and " + a[a.length - 1] : a[0] || "");
  d3.select("#ex-take").html(`We start with the answer. Figure 1 scores all ${d3.format(",")(ex.cs.length)} counties in the lower 48 as places for a new AI data center, using ${on.length === 4 ? "four criteria" : list(on)} described below it. In ${when}, the lowest-risk areas are ${list(areas.slice(0, 4)) || "spread across the country"}, and the top-ranked county is <b>${pk[0] ? nm(pk[0]) : ""}</b>. Hover a county for its scorecard, click to pin it, and change the climate or the criteria to see how the ranking moves. The rest of this post explains why these places come out on top.`);
  d3.select("#ex-criteria-text").html(`<b>Shared heat with the fleet</b> is how often a county is in extreme heat on the fleet's shared heat days, defined in Figure 3. Siting tools in use today weigh power, water, land and cooling cost${cite(12, 13)}, but not this. <b>Local extreme heat</b> counts days above the county's own design-day temperature, the 1-in-100-day heat that cooling systems are sized for${cite(4)}. <b>Cooling burden</b> counts days above 35&deg;C, which drive cooling energy and water use${cite(14, 15)}. <b>Grid concentration</b> favors grid regions that host less of the planned fleet. Each criterion is ranked across counties and the ranks are averaged into one siting risk.`);
  const doe = DOE16.filter(s => s.sel).map(s => ({ ...s, b: s.county ? s.county.better : 0 })).sort((p, q) => q.b - p.b), all = DOE16.map(s => ({ ...s, b: s.county ? s.county.better : 0 })).sort((p, q) => q.b - p.b);
  d3.select("#doe-take").html(`The same scores apply to federal land. Of the four sites the Department of Energy selected for AI data centers${cite(8)}, ${doe[0].name} ranks best, ahead of ${fmtPct(doe[0].b)} of counties, and ${doe[3].name} ranks lowest, ahead of ${fmtPct(doe[3].b)}. Among all 16 candidates${cite(9)}, ${all[0].name} ranks highest.`);
  const reg = d3.rollup(D.us, a => d3.sum(a, d => d.power), d => d.region), topReg = [...reg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const own = d3.rollup(D.us, a => d3.sum(a, d => d.power), d => ownerOf(d)), top5 = [...own.entries()].filter(e => e[0] !== "Other").sort((a, b) => b[1] - a[1]).slice(0, 5);
  const inTop = d3.sum(D.us.filter(d => { const c = ex.cs.reduce((a, b) => (Math.hypot(b.c[0] - d.xy[0], b.c[1] - d.xy[1]) < Math.hypot(a.c[0] - d.xy[0], a.c[1] - d.xy[1]) ? b : a)); return c.better >= 0.85; }), d => d.power);
  d3.select("#build-take").html(`Those places are not where the fleet is going. Planned AI capacity in the United States grows from 0.1 GW in early 2023 to <b>${fmtGW(D.usGW)}</b> by 2030, according to construction timelines compiled by Epoch AI${cite(1)}. Three grid regions, ${topReg.map(e => e[0]).join(", ").replace(/, ([^,]*)$/, " and $1")}, will host ${fmtPct(d3.sum(topReg, e => e[1]) / D.usGW)} of it, and five companies (${top5.map(e => e[0]).join(", ")}) plan ${fmtPct(d3.sum(top5, e => e[1]) / D.usGW)}. Only ${fmtPct(inTop / D.usGW)} of planned power sits in counties ranked in the best 15% in Figure 1. Figure 2 shows each site's build-out, coloured by the siting risk of its county; regroup or re-sort the rows, or click one to score its county.`);
  const rch = D.reach.by["ssp245|2041-2060"].reach, rch0 = D.reach.by[HIST].reach, R = D.replay, pkF = R.frames[d3.maxIndex(R.frames, f => f.share)];
  d3.select("#replay-take").html(`Concentration matters because heat waves are large. A data center is in <b>extreme heat</b> on a day hotter than its <b>design day</b>, the temperature exceeded on only 1% of days in 1995&ndash;2014; each climate model is compared with its own past, so model biases cancel. In the 2050s under moderate emissions, the median data center shares its extreme heat days with ${fmtPct(d3.median(rch))} of the rest of the fleet, up from ${fmtPct(d3.median(rch0))} in 1995&ndash;2014. When at least a quarter of planned AI power is in extreme heat together, we call it a <b>shared heat day</b>. Figure 3 replays the longest run of them in our ensemble for that climate: <b>${R.run_days} consecutive days</b> in one model's simulated summer (${R.model}), one plausible summer rather than a forecast. On its worst day, ${d3.timeFormat("%B %-d")(d3.timeParse("%Y-%m-%d")(pkF.date))}, <b>${fmtPct(pkF.share)}</b> of planned AI power is in extreme heat at once, on the days when homes and hospitals on the same grids need the most power${cite(5)}.`);
  const at = D.gwl.at, past = d3.mean(D.gwl.pts.filter(p => p.k === HIST), p => p.days);
  const P = Warming.periods, band = (k, i) => P.find(p => p.k === k).segs[i].v, gmax = P[P.length - 1];
  d3.select("#warm-take").html(`Summers like that are rare today and become ordinary as the planet warms. Figure 4 sorts all 1,000 simulated summers in our ensemble, ten climate models with 20 summers each in five periods, by how many shared heat days each one holds. In 1995&ndash;2014, <b>${fmtPct(band(HIST, 0))}</b> of summers have fewer than five. By the 2050s under moderate emissions, at about 2&deg;C of global warming, ${fmtPct(1 - band("ssp245|2041-2060", 0) - band("ssp245|2041-2060", 1))} have 15 or more, and in the 2090s under high emissions, at ${fmt1(gmax.g)}&deg;C, <b>${fmtPct(band("ssp585|2081-2100", 4))}</b> have 60 or more. Across models the relationship with warming is close to a single curve: about ${Math.round(D.gwl.at["1.5"])} shared heat days at 1.5&deg;C, ${Math.round(D.gwl.at["2.0"])} at 2&deg;C and ${Math.round(D.gwl.at["3.0"])} at 3&deg;C${cite(23)}.`);
  const FUT = "ssp245|2041-2060", r50 = rKey(FUT), r0 = rKey(HIST), rH = rKey("ssp585|2081-2100");
  const aug = kk => d3.sum(D.streams.regions, (rg, j) => D.streams.by[kk][j][212] * D.reg.power_gw[D.reg.regions.indexOf(rg)]);
  d3.select("#dur-take").html(`For the power grid, what matters is how widely the heat spreads and how long it holds. We call a day <b>region-wide heat</b> when at least half of a grid region is above its design day; on those days the region's neighbors are often hot too, which limits emergency imports, and NERC already treats wide-area heat as a leading reliability risk${cite(24)}. Figure 5 shows these events growing longer and more frequent. The share lasting three days or more rises from ${fmtPct(r0.survival[2])} in 1995&ndash;2014 to <b>${fmtPct(r50.survival[2])}</b> in the 2050s under moderate emissions and ${fmtPct(rH.survival[2])} in the 2090s under high emissions, while certified data centers must hold only 12 hours of backup fuel${cite(16)}. On a typical August 1 in the 2050s, ${fmt1(aug(FUT))} GW of planned AI power sits in a region under region-wide heat, against ${fmt1(aug(HIST))} GW in 1995&ndash;2014.`);
  const gwr = r => d3.sum(D.us.filter(d => r.includes(d.region)), d => d.power);
  d3.select("#gov-take").html(`Who could act on this? Decisions about AI data centers are split across federal agencies, grid regulators and states, and the pace has been fast: Figure 6 lists eight measures adopted since January 2025. Each answers a different question. Federal permitting and DOE's site program speed approval${cite(7, 8)}; FERC's June 2026 orders and state tariffs set the terms for connecting to the grid${cite(10, 25, 26)}; Texas's SB 6 and FERC's July 2026 order on NERC standards cover what happens when the grid is stressed${cite(11, 28)}. None asks whether a new site will be hot on the same days as the rest of the fleet. The closest is DOE's May 2026 emergency order, which moved PJM data centers onto backup generation during a heat wave${cite(27)}: shared heat, handled during the event rather than planned for. Responsibility is also divided by geography: ${fmtPct(gwr(["PJM", "MISO", "SPP", "NYISO"]) / D.usGW)} of planned AI power will connect in markets regulated by FERC, ${fmtPct(gwr(["ERCOT"]) / D.usGW)} in ERCOT under Texas law and ${fmtPct(gwr(["Southeast", "West"]) / D.usGW)} outside organized markets, where state commissions and TVA set the terms.`);
  const ar1 = [...new Set(pk.slice(0, 10).map(area).filter(Boolean))];
  d3.select("#rec-1").html(`<b>Add shared heat to siting reviews.</b> DOE's site selection${cite(8, 9)} and state reviews score sites one at a time. A fleet-level criterion needs only public climate data, and in Figure 1 it points to ${list(ar1) || "a handful of regions"}, where a new gigawatt would reduce rather than add to the days the fleet overheats together.`);
  d3.select("#rec-2").html(`<b>Plan curtailment for regions, not sites.</b> The large-load rules now being written at FERC, NERC and in Texas${cite(10, 11, 28)} treat each data center as one load among many. On a typical August day in the 2050s under moderate emissions, about ${fmt1(aug(FUT))} GW of planned AI power sits in a region under region-wide heat, so curtailment and backup plans should assume many campuses at once, before an emergency order is needed${cite(27)}.`);
  d3.select("#rec-3").html(`<b>Size backup for multi-day events.</b> ${fmtPct(r50.survival[2])} of region-wide heat events in that climate last three days or more, against a 12-hour fuel requirement for certified facilities${cite(16)}. Backup and demand-response standards should be tested against the long events that climate models already produce.`);
}
