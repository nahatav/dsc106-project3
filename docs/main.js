// Measuring the shared heat risk of America's AI data centers. D3 only.
// Six figures tell one story; each animates, and one climate setting drives Figures 2 to 6.

const CLIMATES = [
  { key: "historical|1995-2014", label: "1995–2014", long: "1995–2014" },
  { key: "ssp245|2041-2060", label: "2050s, moderate", long: "the 2050s under moderate emissions" },
  { key: "ssp585|2041-2060", label: "2050s, high", long: "the 2050s under high emissions" },
  { key: "ssp245|2081-2100", label: "2090s, moderate", long: "the 2090s under moderate emissions" },
  { key: "ssp585|2081-2100", label: "2090s, high", long: "the 2090s under high emissions" },
];
const CL = Object.fromEntries(CLIMATES.map(c => [c.key, c]));
const HIST = "historical|1995-2014";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];
const SHORT = {
  "Microsoft Fairwater Wisconsin": "Microsoft Fairwater", "OpenAI Stargate New Mexico": "Stargate New Mexico",
  "Anthropic-Amazon New Carlisle": "Amazon New Carlisle", "Colossus 2": "xAI Colossus 2", "Meta Hyperion": "Meta Hyperion",
  "OpenAI Stargate Shackelford": "Stargate Shackelford", "OpenAI Stargate Abilene": "Stargate Abilene", "QTS Cedar Rapids": "QTS Cedar Rapids",
};
const TOUR = ["Colossus 2", "OpenAI Stargate Abilene", "Microsoft Fairwater Wisconsin", "OpenAI Stargate New Mexico", "Meta Hyperion", "Anthropic-Amazon New Carlisle"];
const DOE_SITES = [
  { name: "Idaho National Laboratory", lat: 43.52, lon: -112.95, dx: 12, dy: 4, anchor: "start" },
  { name: "Oak Ridge Reservation", lat: 35.93, lon: -84.31, dx: 12, dy: 4, anchor: "start" },
  { name: "Paducah site", lat: 37.11, lon: -88.80, dx: -12, dy: -8, anchor: "end" },
  { name: "Savannah River Site", lat: 33.25, lon: -81.65, dx: 12, dy: 10, anchor: "start" },
];
const REGION_COLOR = { ERCOT: "#e8710a", SPP: "#f9ab00", MISO: "#1e8e3e", PJM: "#1a73e8", NYISO: "#9334e6", Southeast: "#12b5cb", West: "#e52592" };
const HEAT = ["#fdf8f0", "#fde9c9", "#fccf96", "#f9ad6a", "#f2844f", "#e05a3f", "#c13639", "#93183a", "#5f0a33"];
const PROB_T = [10, 20, 30, 40, 50, 60, 70, 80];
const PROB_C = d3.scaleThreshold().domain(PROB_T).range(HEAT);
const INK = "#202124", BLUE = "#1a73e8", HOT = "#f2844f";

const fmtPct = d3.format(".0%"), fmt1 = d3.format(".1f");
const fmtGW = mw => (mw / 1000).toFixed(1) + " GW";
const shortName = n => SHORT[n] || n;
const cite = (...n) => n.map(i => `<a class="cite" href="#r${i}">${i}</a>`).join('<span class="cite-sep">,</span>');
const gridY = g => g.call(a => a.select(".domain").remove()).call(a => a.selectAll(".tick line").attr("stroke", "#e8eaed"));
const ease = d3.easeCubicInOut;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const DUR = reduceMotion ? 0 : 750;

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
function onVisible(sel, fn, threshold = 0.35) {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { fn(); io.disconnect(); } }), { threshold });
  io.observe(document.querySelector(sel));
}

const state = { climate: "ssp245|2041-2060" };
let D = {};
const cache = new Map();
const json = u => { if (!cache.has(u)) cache.set(u, d3.json(u)); return cache.get(u); };
const rKey = k => D.reg.by[k];

Promise.all(["sites", "summary", "regions", "reach", "coexposure", "buildout", "season", "streams"].map(f => json(`data/${f}.json`))
  .concat([json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-albers-10m.json")]))
  .then(([sites, summary, reg, reach, coex, build, season, streams, topo]) => {
    D = { sites: sites.sites, models: sites.models, summary, reg, reach, coex, build, season, streams, topo };
    D.us = D.sites.filter(d => d.country === "United States");
    D.usGW = d3.sum(D.us, d => d.power);
    d3.select("#model-list").text(D.models.join(", "));
    setupGeo();
    Hero.init(); Build.init(); Reach.init(); Ring.init(); Stream.init(); Siting.init(); Globe.init();
    d3.selectAll("#seg-climate button").on("click", function () { setClimate(this.dataset.k); });
    initQuickLinks();
    setClimate(state.climate);
  });

function setClimate(k) {
  state.climate = k;
  d3.selectAll("#seg-climate button").classed("on", function () { return this.dataset.k === k; });
  Reach.update(); Ring.update(); Stream.update(); Siting.update(); Globe.update();
  writeProse();
}

/* ---------------- shared geography ---------------- */
const projection = d3.geoAlbers().scale(1300).translate([487.5, 305]);
const G = {};
function setupGeo() {
  const lower48 = D.topo.objects.states.geometries.filter(g => !["02", "15"].includes(g.id));
  G.nation = topojson.merge(D.topo, lower48);
  G.states = topojson.mesh(D.topo, { type: "GeometryCollection", geometries: lower48 }, (a, b) => a !== b);
  G.lat = D.reach.lat; G.lon = D.reach.lon; G.ny = G.lat.length; G.nx = G.lon.length; G.k = 4;
  G.NX = (G.nx - 1) * G.k + 1; G.NY = (G.ny - 1) * G.k + 1;
  D.us.forEach(d => { d.xy = projection([d.lon, d.lat]); });
}
function baseMap(svg, fill = "#f1f3f4") {
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
function contoursOf(arr) {
  const { nx, ny, k, NX, NY } = G, up = new Float32Array(NX * NY);
  for (let Y = 0; Y < NY; Y++) {
    const fy = Y / k, y0 = Math.min(ny - 2, Math.floor(fy)), wy = fy - y0;
    for (let X = 0; X < NX; X++) {
      const fx = X / k, x0 = Math.min(nx - 2, Math.floor(fx)), wx = fx - x0;
      up[Y * NX + X] = (arr[y0 * nx + x0] * (1 - wx) + arr[y0 * nx + x0 + 1] * wx) * (1 - wy) + (arr[(y0 + 1) * nx + x0] * (1 - wx) + arr[(y0 + 1) * nx + x0 + 1] * wx) * wy;
    }
  }
  const smooth = d3.blur2({ data: up, width: NX, height: NY }, 2).data;
  const ip = (a, fi) => { const j = Math.max(0, Math.min(a.length - 2, Math.floor(fi))); return a[j] + (a[j + 1] - a[j]) * (fi - j); };
  const toXY = ([cx, cy]) => projection([ip(G.lon, Math.max(0, cx - 0.5) / k), ip(G.lat, Math.max(0, cy - 0.5) / k)]);
  return d3.contours().size([NX, NY]).thresholds(PROB_T)(smooth).map(c => {
    const p = new Path2D();
    for (const poly of c.coordinates) for (const ring of poly) { ring.forEach((pt, j) => { const [x, y] = toXY(pt); j ? p.lineTo(x, y) : p.moveTo(x, y); }); p.closePath(); }
    return { value: c.value, path: p };
  });
}
function FieldMap(stageSel, canvasSel) {
  const stage = document.querySelector(stageSel), canvas = document.querySelector(canvasSel), ctx = canvas.getContext("2d");
  let cur = null, timer = null, scale = 1;
  const paint = arr => {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const geo = d3.geoPath(null, ctx);
    ctx.save(); ctx.beginPath(); geo(G.nation); ctx.fillStyle = HEAT[0]; ctx.fill(); ctx.clip();
    for (const c of contoursOf(arr)) { ctx.fillStyle = PROB_C(c.value + 0.01); ctx.fill(c.path, "evenodd"); }
    ctx.restore();
    ctx.beginPath(); geo(G.states); ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 0.8; ctx.stroke();
  };
  const resize = () => {
    const w = stage.clientWidth, dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * 610 / 975 * dpr); canvas.style.height = (w * 610 / 975) + "px"; scale = canvas.width / 975;
    if (cur) paint(cur);
  };
  new ResizeObserver(resize).observe(stage); resize();
  return {
    to(target) {
      if (timer) timer.stop();
      if (!cur || !DUR) { cur = target.slice(); paint(cur); return; }
      const from = cur.slice(), n = from.length;
      timer = d3.timer(el => {
        const t = ease(Math.min(1, el / DUR)), a = new Float32Array(n);
        for (let i = 0; i < n; i++) a[i] = from[i] + (target[i] - from[i]) * t;
        cur = a; paint(a); if (t >= 1) timer.stop();
      });
    },
  };
}
function rampLegend(sel, label, colors, ticks, extras) {
  const svg = d3.select(sel).append("svg").attr("viewBox", "0 0 720 40"), bw = 300 / colors.length;
  svg.append("text").attr("class", "lg-title").attr("y", 4).attr("dy", "0.8em").text(label);
  const b = svg.append("g").attr("transform", "translate(0,20)");
  b.selectAll("rect").data(colors).join("rect").attr("x", (d, i) => i * bw).attr("width", bw).attr("height", 8).attr("fill", d => d);
  b.selectAll("text").data(ticks).join("text").attr("x", d => d[0] * bw).attr("y", 20).attr("text-anchor", (d, i) => (i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle")).text(d => d[1]);
  extras && extras(svg.append("g").attr("transform", "translate(360,6)"));
}

/* ---------------- Header: heat pulses sweep a quiet map ---------------- */
const Hero = {
  init() {
    const svg = d3.select("#hero").attr("viewBox", "60 20 870 560");
    const defs = svg.append("defs");
    const gr = defs.append("radialGradient").attr("id", "pulse");
    [[0, HOT, 0.55], [0.6, HOT, 0.25], [1, HOT, 0]].forEach(([o, c, a]) => gr.append("stop").attr("offset", o).attr("stop-color", c).attr("stop-opacity", a));
    defs.append("clipPath").attr("id", "hero-clip").append("path").datum(G.nation).attr("d", d3.geoPath());
    baseMap(svg, "#eef1f6");
    const pulses = svg.append("g").attr("clip-path", "url(#hero-clip)");
    const r = d3.scaleSqrt().domain([0, 2800]).range([2.2, 9]);
    const dots = svg.append("g").selectAll("circle").data(D.us).join("circle").attr("cx", d => d.xy[0]).attr("cy", d => d.xy[1]).attr("r", d => r(d.power))
      .attr("fill", BLUE).attr("stroke", "#fff").attr("stroke-width", 1);
    if (reduceMotion) return;
    const seeds = D.us.slice().sort((a, b) => b.power - a.power).slice(0, 10);
    let i = 0;
    const fire = () => {
      const s = seeds[i++ % seeds.length], R = 230 + Math.random() * 80, T = 3400;
      pulses.append("circle").attr("cx", s.xy[0]).attr("cy", s.xy[1]).attr("r", 0).attr("fill", "url(#pulse)").attr("opacity", 1)
        .transition().duration(T).ease(d3.easeCubicOut).attr("r", R).transition().duration(900).attr("opacity", 0).remove();
      dots.filter(d => Math.hypot(d.xy[0] - s.xy[0], d.xy[1] - s.xy[1]) < R * 0.75)
        .transition().delay(d => d3.easeCubicOut.invert ? 0 : 0).delay(d => (Math.hypot(d.xy[0] - s.xy[0], d.xy[1] - s.xy[1]) / R) * T * 0.6).duration(300).attr("fill", HOT)
        .transition().delay(1400).duration(900).attr("fill", BLUE);
    };
    fire(); d3.interval(fire, 2600);
  },
};

/* ---------------- Figure 1: the build-out ---------------- */
const Build = {
  init() {
    const svg = d3.select("#build").attr("viewBox", "0 0 975 610");
    baseMap(svg);
    const byName = new Map(D.us.map(d => [d.name, d]));
    this.rows = D.build.sites.map(s => ({ ...byName.get(s.name), s: s.s })).filter(d => d.xy).sort((a, b) => d3.max(b.s) - d3.max(a.s));
    this.months = D.build.months.map(m => d3.timeParse("%Y-%m")(m));
    this.totals = this.months.map((_, i) => d3.sum(this.rows, d => d.s[i]));
    this.r = d3.scaleSqrt().domain([0, 2800]).range([0, 22]);
    this.dots = svg.append("g").selectAll("circle").data(this.rows).join("circle").attr("cx", d => d.xy[0]).attr("cy", d => d.xy[1]).attr("r", 0)
      .attr("fill", BLUE).attr("fill-opacity", 0.45).attr("stroke", BLUE).attr("stroke-width", 1.2)
      .on("mousemove", (e, d) => showTip(e, `<b>${d.name}</b><br><span class="t-muted">${d.owner || ""}</span><br>${fmtGW(d.s[this.i])} online in ${d3.timeFormat("%b %Y")(this.months[this.i])}<br><span class="t-muted">${fmtGW(d.power)} planned</span>`)).on("mouseleave", hideTip);
    this.stamp = svg.append("text").attr("class", "stamp").attr("x", 30).attr("y", 50);
    this.sub = svg.append("text").attr("class", "stamp-sub").attr("x", 30).attr("y", 76);
    // timeline
    const W = 660, H = 110, m = { t: 10, r: 10, b: 24, l: 40 };
    const g = d3.select("#build-line").attr("viewBox", `0 0 ${W} ${H}`).append("g").attr("transform", `translate(${m.l},${m.t})`);
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    this.x = d3.scaleTime().domain(d3.extent(this.months)).range([0, iw]);
    const y = d3.scaleLinear().domain([0, 45]).range([ih, 0]);
    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(3).tickFormat(d => d + " GW").tickSize(-iw)).call(gridY);
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(this.x).ticks(d3.timeYear).tickFormat(d3.timeFormat("%Y")).tickSize(3)).call(a => a.select(".domain").attr("stroke", "#bdc1c6"));
    g.append("path").datum(this.totals).attr("fill", "#e8f0fe").attr("d", d3.area().x((d, i) => this.x(this.months[i])).y0(ih).y1(d => y(d / 1000)));
    this.prog = g.append("path").datum(this.totals).attr("fill", "none").attr("stroke", BLUE).attr("stroke-width", 2.5);
    this.line = d3.line().x((d, i) => this.x(this.months[i])).y(d => y(d / 1000));
    this.cursor = g.append("circle").attr("r", 5).attr("fill", BLUE).attr("stroke", "#fff").attr("stroke-width", 2);
    this.y = y;
    const hit = g.append("rect").attr("width", iw).attr("height", ih).attr("fill", "transparent").style("cursor", "ew-resize");
    const scrub = e => { this.stop(); const t = this.x.invert(d3.pointer(e, hit.node())[0]); this.set(Math.max(0, Math.min(this.months.length - 1, d3.bisectLeft(this.months, t)))); };
    hit.on("pointerdown", function (e) { this.setPointerCapture(e.pointerId); scrub(e); }).on("pointermove", e => { if (e.buttons) scrub(e); });
    d3.select("#build-play").on("click", () => (this.timer ? this.stop() : this.play()));
    this.set(0);
    onVisible("#build", () => this.play());
  },
  set(i) {
    this.i = i;
    this.dots.transition().duration(reduceMotion ? 0 : 110).ease(d3.easeLinear).attr("r", d => this.r(d.s[i]));
    this.stamp.text(d3.timeFormat("%B %Y")(this.months[i]));
    this.sub.text(`${(this.totals[i] / 1000).toFixed(1)} GW of planned AI capacity online`);
    this.prog.attr("d", this.line(this.totals.slice(0, i + 1)));
    this.cursor.attr("cx", this.x(this.months[i])).attr("cy", this.y(this.totals[i] / 1000));
  },
  play() {
    if (this.i >= this.months.length - 1) this.set(0);
    d3.select("#build-play").html("&#10074;&#10074;").attr("aria-label", "Pause");
    this.timer = d3.interval(() => { if (this.i >= this.months.length - 1) return this.stop(); this.set(this.i + 1); }, reduceMotion ? 1 : 120);
  },
  stop() { if (this.timer) this.timer.stop(); this.timer = null; d3.select("#build-play").html("&#9654;").attr("aria-label", "Play"); },
};

/* ---------------- Figure 2: reach, with an automatic tour ---------------- */
const Reach = {
  init() {
    this.idx = new Map(D.reach.sites.map((n, i) => [n, i]));
    this.sel = this.pin = TOUR[0];
    this.map = FieldMap("#rc-stage", "#rc-canvas");
    const svg = d3.select("#rc-map").attr("viewBox", "0 0 975 610");
    const r = d3.scaleSqrt().domain([0, 2800]).range([2.5, 16]);
    this.sites = D.us.slice().sort((a, b) => b.power - a.power);
    this.circles = svg.append("g").selectAll("circle").data(this.sites, d => d.name).join("circle")
      .attr("cx", d => d.xy[0]).attr("cy", d => d.xy[1]).attr("r", d => r(d.power)).attr("fill", "#fff").attr("stroke", "#5f6368").attr("stroke-width", 0.8);
    this.ring = svg.append("circle").attr("fill", "none").attr("stroke", INK).attr("stroke-width", 2).style("pointer-events", "none");
    this.label = svg.append("text").attr("class", "map-label").style("pointer-events", "none");
    this.rs = r;
    const del = d3.Delaunay.from(this.sites, d => d.xy[0], d => d.xy[1]);
    const nearest = e => { const [mx, my] = d3.pointer(e), s = this.sites[del.find(mx, my)]; return Math.hypot(s.xy[0] - mx, s.xy[1] - my) < 40 ? s : null; };
    svg.append("rect").attr("width", 975).attr("height", 610).attr("fill", "transparent").style("cursor", "pointer")
      .on("mousemove", e => { const s = nearest(e); if (!s) { hideTip(); return; } this.stopTour(); this.show(s.name); showTip(e, this.tipHtml(s.name)); })
      .on("mouseleave", () => { hideTip(); if (!this.tour) this.show(this.pin); })
      .on("click", e => { const s = nearest(e); if (s) { this.stopTour(); this.pin = s.name; this.show(s.name, true); } });
    rampLegend("#rc-legend", "Chance of extreme heat on the selected site's hot days", HEAT, [[0, "0%"], [4.5, "50%"], [9, "100%"]], g => {
      g.append("circle").attr("cx", 7).attr("cy", 18).attr("r", 6).attr("fill", INK).attr("stroke", "#fff").attr("stroke-width", 2);
      g.append("text").attr("x", 20).attr("y", 22).text("Selected data center");
    });
    onVisible("#rc-stage", () => this.startTour());
  },
  startTour() {
    if (reduceMotion) return;
    let i = 0;
    this.tour = d3.interval(() => { i = (i + 1) % TOUR.length; this.pin = TOUR[i]; this.show(TOUR[i]); }, 3400);
  },
  stopTour() { if (this.tour) this.tour.stop(); this.tour = null; },
  tipHtml(name) {
    const i = this.idx.get(name), d = D.us.find(u => u.name === name), k = state.climate;
    return `<b>${d.name}</b><br><span class="t-muted">${d.owner || ""} · ${fmtGW(d.power)} planned</span><br>On its hot days, <b>${fmtPct(D.reach.by[k].reach[i])}</b> of the rest of the fleet is in extreme heat too`;
  },
  show(name, force) { if (!name || (name === this.shown && !force)) return; this.shown = name; this.sel = name; this.draw(); },
  update() { this.shown = null; this.show(this.sel); },
  draw() {
    const k = state.climate, i = this.idx.get(this.sel), pr = D.reach.by[k].pair[i], s = this.sites.find(d => d.name === this.sel);
    this.map.to(decodeU8(D.reach.by[k].fields[i]));
    this.circles.transition().duration(DUR / 2).attr("fill", d => (d.name === this.sel ? INK : PROB_C(pr[this.idx.get(d.name)] + 0.01)))
      .attr("stroke", d => (d.name === this.sel ? "#fff" : "#5f6368")).attr("stroke-width", d => (d.name === this.sel ? 2 : 0.8));
    const rr = this.rs(s.power);
    this.ring.transition().duration(DUR).attr("cx", s.xy[0]).attr("cy", s.xy[1]).attr("r", rr + 5);
    this.label.text(shortName(s.name)).transition().duration(DUR).attr("x", s.xy[0]).attr("y", s.xy[1] - rr - 12).attr("text-anchor", "middle");
  },
};

/* ---------------- Figure 3: radial calendar of shared heat days ---------------- */
const RING_T = [0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7];
const RING_C = d3.scaleThreshold().domain(RING_T).range(["#f1f3f4", HEAT[1], HEAT[2], HEAT[3], HEAT[4], HEAT[5], HEAT[6], HEAT[7]]);
const Ring = {
  init() {
    const W = 720, H = 660, cx = W / 2, cy = H / 2 - 4;
    const svg = d3.select("#ring").attr("viewBox", `0 0 ${W} ${H}`), g = svg.append("g").attr("transform", `translate(${cx},${cy})`);
    const r0 = 92, rw = 38, gap = 7;
    this.radii = CLIMATES.map((c, i) => [r0 + i * (rw + gap), r0 + i * (rw + gap) + rw]);
    const ang = d => (d / 365) * 2 * Math.PI;
    const cells = CLIMATES.flatMap((c, ci) => d3.range(365).map(d => ({ ci, d, k: c.key, v: D.season[c.key][d] })));
    const arc = d3.arc().innerRadius(c => this.radii[c.ci][0]).outerRadius(c => this.radii[c.ci][1]).startAngle(c => ang(c.d)).endAngle(c => ang(c.d + 1) + 0.002);
    this.cells = g.append("g").selectAll("path").data(cells).join("path").attr("d", arc).attr("fill", "#f1f3f4")
      .on("mousemove", (e, c) => {
        const dt = d3.timeDay.offset(new Date(2050, 0, 1), c.d);
        showTip(e, `<b>${d3.timeFormat("%B %-d")(dt)}</b> · ${CL[c.k].label}<br>A shared heat day in <b>${fmtPct(c.v)}</b> of simulated years`);
      }).on("mouseleave", hideTip);
    // months
    const outer = this.radii[4][1];
    d3.range(12).forEach(mo => {
      const d0 = d3.timeDay.count(new Date(2050, 0, 1), new Date(2050, mo, 1)), a = ang(d0) - Math.PI / 2;
      g.append("line").attr("x1", Math.cos(a) * (r0 - 6)).attr("y1", Math.sin(a) * (r0 - 6)).attr("x2", Math.cos(a) * (outer + 8)).attr("y2", Math.sin(a) * (outer + 8)).attr("stroke", "#fff").attr("stroke-width", 1.5).style("pointer-events", "none");
      const am = ang(d0 + 15) - Math.PI / 2;
      g.append("text").attr("class", "axis-title").attr("x", Math.cos(am) * (outer + 22)).attr("y", Math.sin(am) * (outer + 22)).attr("dy", "0.35em").attr("text-anchor", "middle").text(MONTHS[mo]);
    });
    // ring labels on the left, reading outward
    this.labels = g.append("g").selectAll("text").data(CLIMATES).join("text").attr("class", "ring-label")
      .attr("x", -8).attr("y", (c, i) => -(this.radii[i][0] + this.radii[i][1]) / 2).attr("dy", "0.35em").attr("text-anchor", "end").text(c => c.label);
    g.append("text").attr("class", "ring-center").attr("y", -8).attr("text-anchor", "middle").text("Shared");
    g.append("text").attr("class", "ring-center").attr("y", 12).attr("text-anchor", "middle").text("heat days");
    this.outline = g.append("g").attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.5);
    rampLegend("#ring-legend", "Share of years in which the day is a shared heat day", RING_C.range(), [[0, "0%"], [1, "2%"], [3, "10%"], [5, "30%"], [7, "70%"]]);
    onVisible("#ring", () => this.cells.transition().duration(reduceMotion ? 0 : 500).delay(c => (reduceMotion ? 0 : c.ci * 420 + c.d * 2.2)).attr("fill", c => RING_C(c.v)));
  },
  update() {
    const i = CLIMATES.findIndex(c => c.key === state.climate), [a, b] = this.radii[i];
    this.outline.selectAll("circle").data([a, b]).join("circle").transition().duration(DUR).attr("r", d => d);
    this.labels.style("font-weight", c => (c.key === state.climate ? 600 : 400)).style("fill", c => (c.key === state.climate ? INK : "#5f6368"));
  },
};

/* ---------------- Figure 4: streams of region-wide heat ---------------- */
const Stream = {
  init() {
    const W = 720, H = 400, m = { t: 20, r: 16, b: 34, l: 16 };
    const g = d3.select("#stream").attr("viewBox", `0 0 ${W} ${H}`).append("g").attr("transform", `translate(${m.l},${m.t})`);
    this.iw = W - m.l - m.r; this.ih = H - m.t - m.b;
    this.d0 = 104; this.d1 = 290; this.days = d3.range(this.d0, this.d1);
    this.R = D.streams.regions;
    const smooth = arr => arr.map((v, i) => d3.mean(arr.slice(Math.max(0, i - 4), i + 5)));
    this.data = {};
    CLIMATES.forEach(c => {
      const per = this.R.map((r, j) => smooth(D.streams.by[c.key][j]));
      this.data[c.key] = this.days.map(d => Object.fromEntries([["d", d], ...this.R.map((r, j) => [r, per[j][d]])]));
    });
    this.stack = d3.stack().keys(this.R).offset(d3.stackOffsetSilhouette).order(d3.stackOrderInsideOut);
    const ext = d3.max(CLIMATES, c => d3.max(this.stack(this.data[c.key]), s => d3.max(s, p => Math.abs(p[1]))));
    this.x = d3.scaleLinear().domain([this.d0, this.d1 - 1]).range([0, this.iw]);
    this.y = d3.scaleLinear().domain([-ext, ext]).range([this.ih, 0]);
    const months = d3.range(3, 10).map(mo => ({ mo, d: d3.timeDay.count(new Date(2050, 0, 1), new Date(2050, mo, 1)) })).filter(o => o.d >= this.d0);
    g.append("g").selectAll("line").data(months).join("line").attr("x1", o => this.x(o.d)).attr("x2", o => this.x(o.d)).attr("y1", 0).attr("y2", this.ih).attr("stroke", "#eef0f2");
    g.append("g").selectAll("text").data(months).join("text").attr("class", "axis-title").attr("x", o => this.x(o.d) + 4).attr("y", this.ih + 22).text(o => MONTHS[o.mo]);
    this.area = d3.area().x(p => this.x(p.data.d)).y0(p => this.y(p[0])).y1(p => this.y(p[1])).curve(d3.curveBasis);
    const histStack = this.stack(this.data[HIST]);
    this.ghost = g.append("path").attr("fill", "none").attr("stroke", "#9aa0a6").attr("stroke-dasharray", "3,3")
      .attr("d", d3.area().x((p, i) => this.x(this.days[i])).y0((p, i) => this.y(histStack[0][i][0])).y1((p, i) => this.y(histStack[histStack.length - 1][i][1])).curve(d3.curveBasis)(this.days));
    this.paths = g.append("g").selectAll("path").data(this.stack(this.data[HIST]), s => s.key).join("path")
      .attr("fill", s => REGION_COLOR[s.key]).attr("fill-opacity", 0.85).attr("stroke", "#fff").attr("stroke-width", 0.6).attr("d", this.area);
    this.labels = g.append("g").selectAll("text").data(this.R).join("text").attr("class", "stream-label").attr("text-anchor", "middle").style("pointer-events", "none");
    this.cursor = g.append("line").attr("y1", 0).attr("y2", this.ih).attr("stroke", INK).attr("stroke-width", 1).style("display", "none");
    g.append("rect").attr("width", this.iw).attr("height", this.ih).attr("fill", "transparent")
      .on("mousemove", e => {
        const d = Math.round(this.x.invert(d3.pointer(e)[0])), row = this.data[state.climate][Math.max(0, Math.min(this.days.length - 1, d - this.d0))];
        this.cursor.attr("x1", this.x(row.d)).attr("x2", this.x(row.d)).style("display", null);
        const dt = d3.timeDay.offset(new Date(2050, 0, 1), row.d);
        showTip(e, `<b>${d3.timeFormat("%B %-d")(dt)}</b> · ${CL[state.climate].label}<br>` + this.R.slice().sort((a, b) => row[b] - row[a]).map(r => `<span style="color:${REGION_COLOR[r]}">●</span> ${r} ${fmtPct(row[r])}`).join("<br>"));
      }).on("mouseleave", () => { hideTip(); this.cursor.style("display", "none"); });
    g.append("text").attr("class", "ref-label").attr("x", this.iw).attr("y", 10).attr("text-anchor", "end").text("Dashed outline: 1995–2014");
  },
  update() {
    const st = this.stack(this.data[state.climate]);
    this.paths.data(st, s => s.key).transition().duration(DUR * 1.2).attr("d", this.area);
    this.labels.data(st.map(s => s.key)).transition().duration(DUR * 1.2)
      .attr("x", (r, j) => { const s = st.find(q => q.key === r), i = d3.maxIndex(s, p => p[1] - p[0]); return this.x(this.days[i]); })
      .attr("y", (r, j) => { const s = st.find(q => q.key === r), i = d3.maxIndex(s, p => p[1] - p[0]); return this.y((s[i][0] + s[i][1]) / 2); })
      .attr("opacity", r => { const s = st.find(q => q.key === r); return d3.max(s, p => p[1] - p[0]) > 0.16 ? 1 : 0; })
      .text(r => r);
  },
};

/* ---------------- Figure 5: siting ---------------- */
const Siting = {
  init() {
    this.map = FieldMap("#co-stage", "#co-canvas");
    const svg = d3.select("#co-map").attr("viewBox", "0 0 975 610"), r = d3.scaleSqrt().domain([0, 2800]).range([2, 12]);
    svg.append("g").selectAll("circle").data(D.us).join("circle").attr("cx", d => d.xy[0]).attr("cy", d => d.xy[1]).attr("r", d => r(d.power))
      .attr("fill", "#fff").attr("fill-opacity", 0.6).attr("stroke", "#5f6368").attr("stroke-width", 0.7).style("pointer-events", "none");
    const dg = svg.append("g").selectAll("g").data(DOE_SITES).join("g").attr("transform", d => `translate(${projection([d.lon, d.lat])})`).style("pointer-events", "none");
    const halo = dg.append("circle").attr("r", 8).attr("fill", "none").attr("stroke", BLUE).attr("stroke-width", 2);
    dg.append("path").attr("d", d3.symbol(d3.symbolDiamond, 240)()).attr("fill", BLUE).attr("stroke", "#fff").attr("stroke-width", 1.5);
    dg.append("text").attr("class", "map-label small").attr("x", d => d.dx).attr("y", d => d.dy).attr("text-anchor", d => d.anchor).text(d => d.name);
    if (!reduceMotion) { const pulse = () => halo.attr("r", 8).attr("opacity", 0.9).transition().duration(1800).ease(d3.easeCubicOut).attr("r", 30).attr("opacity", 0).on("end", (d, i) => i === 0 && pulse()); pulse(); }
    this.dot = svg.append("circle").attr("r", 5).attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.5).style("display", "none").style("pointer-events", "none");
    svg.append("rect").attr("width", 975).attr("height", 610).attr("fill", "transparent").style("cursor", "crosshair")
      .on("mousemove", e => {
        const [mx, my] = d3.pointer(e), ll = projection.invert([mx, my]);
        if (!ll || !d3.geoContains(G.nation, ll)) { this.dot.style("display", "none"); return hideTip(); }
        const near = DOE_SITES.find(d => { const p = projection([d.lon, d.lat]); return Math.hypot(p[0] - mx, p[1] - my) < 14; });
        const pt = near || { lon: ll[0], lat: ll[1] }, p = projection([pt.lon, pt.lat]);
        this.dot.attr("cx", p[0]).attr("cy", p[1]).style("display", near ? "none" : null);
        showTip(e, `<b>${near ? near.name : `${pt.lat.toFixed(1)}°N, ${Math.abs(pt.lon).toFixed(1)}°W`}</b><br>In extreme heat on <b>${fmtPct(sampleGrid(this.raw(state.climate), pt.lon, pt.lat) / 100)}</b> of the fleet's shared heat days`);
      }).on("mouseleave", () => { this.dot.style("display", "none"); hideTip(); });
    rampLegend("#co-legend", "Chance of extreme heat on the fleet's shared heat days", HEAT, [[0, "0%"], [4.5, "50%"], [9, "100%"]], g => {
      g.append("path").attr("transform", "translate(7,18)").attr("d", d3.symbol(d3.symbolDiamond, 140)()).attr("fill", BLUE).attr("stroke", "#fff");
      g.append("text").attr("x", 20).attr("y", 22).text("DOE federal AI site");
    });
  },
  raw(k) { if (this.rk !== k) { this.rk = k; this.r = decodeU8(D.coex.by[k].co); } return this.r; },
  fleet(k) { return d3.sum(D.us, d => sampleGrid(this.raw(k), d.lon, d.lat) * d.power) / D.usGW; },
  update() { this.map.to(this.raw(state.climate)); },
};

/* ---------------- Figure 6: a rotating globe ---------------- */
const DAYS_T = [6, 10, 15, 25, 40, 80, 160];
const DAYS_C = d3.scaleThreshold().domain(DAYS_T).range(HEAT.slice(0, 8));
const Globe = {
  async init() {
    let world, glob;
    try { [world, glob] = await Promise.all([json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"), json("data/global.json")]); }
    catch (e) { d3.select("#world-take").text("The global field is still being computed."); return; }
    this.glob = glob; this.land = topojson.feature(world, world.objects.land);
    const stage = document.getElementById("globe-stage"), canvas = document.getElementById("globe");
    this.ctx = canvas.getContext("2d"); this.canvas = canvas; this.W = 720; this.H = 560;
    this.proj = d3.geoOrthographic().scale(258).translate([this.W / 2, this.H / 2]).rotate([90, -25]).clipAngle(90);
    const { lat, lon } = glob, dl = lat[1] - lat[0];
    this.cells = []; lat.forEach((la, i) => lon.forEach((lo, j) => this.cells.push({ k: i * lon.length + j, c: [lo, la], ring: [[lo - dl / 2, la - dl / 2], [lo + dl / 2, la - dl / 2], [lo + dl / 2, la + dl / 2], [lo - dl / 2, la + dl / 2]] })));
    const resize = () => { const w = stage.clientWidth, dpr = window.devicePixelRatio || 1; canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * this.H / this.W * dpr); canvas.style.height = (w * this.H / this.W) + "px"; this.scale = canvas.width / this.W; };
    new ResizeObserver(resize).observe(stage); resize();
    this.siteR = d3.scaleSqrt().domain([0, 2800]).range([2, 7]);
    d3.select(canvas).call(d3.drag().on("start", () => { this.dragging = true; }).on("drag", e => { const r = this.proj.rotate(); this.proj.rotate([r[0] + e.dx * 0.35, Math.max(-60, Math.min(60, r[1] - e.dy * 0.35))]); }).on("end", () => { this.dragging = false; }))
      .on("mousemove", e => {
        const rect = canvas.getBoundingClientRect(), mx = (e.clientX - rect.left) / rect.width * this.W, my = (e.clientY - rect.top) / rect.height * this.H;
        const vis = D.sites.filter(d => d3.geoDistance([d.lon, d.lat], [-this.proj.rotate()[0], -this.proj.rotate()[1]]) < Math.PI / 2);
        const hit = vis.map(d => ({ d, p: this.proj([d.lon, d.lat]) })).find(o => Math.hypot(o.p[0] - mx, o.p[1] - my) < 8);
        if (hit) { const st = hit.d.stats[state.climate]; showTip(e, `<b>${hit.d.name}</b><br><span class="t-muted">${hit.d.country}</span>${st ? `<br><b>${fmt1(st.hot[1])}</b> extreme heat days per year` : ""}`); this.hover = true; }
        else if (this.hover) { hideTip(); this.hover = false; }
      }).on("mouseleave", () => hideTip());
    rampLegend("#globe-legend", "Extreme heat days per year (ten-model median)", DAYS_C.range(), [[0, ""], [1, "6"], [3, "15"], [5, "40"], [7, "160"]], g => {
      g.append("circle").attr("cx", 7).attr("cy", 18).attr("r", 5).attr("fill", BLUE).attr("stroke", "#fff");
      g.append("text").attr("x", 20).attr("y", 22).text("AI data center");
    });
    this.cur = this.field(state.climate);
    d3.timer(() => { if (!this.dragging && !reduceMotion) { const r = this.proj.rotate(); this.proj.rotate([r[0] + 0.12, r[1]]); } this.paint(); });
    this.ready = true;
  },
  field(k) { return decodeU8(this.glob.by[k]); },
  paint() {
    const { ctx, scale, proj } = this, a = this.cur;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const geo = d3.geoPath(proj, ctx), centre = [-proj.rotate()[0], -proj.rotate()[1]];
    ctx.beginPath(); geo({ type: "Sphere" }); ctx.fillStyle = "#f4f6f9"; ctx.fill();
    ctx.beginPath(); geo(d3.geoGraticule10()); ctx.strokeStyle = "rgba(60,64,67,.07)"; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.save(); ctx.beginPath(); geo(this.land); ctx.clip();
    for (const c of this.cells) {
      if (d3.geoDistance(c.c, centre) > 1.62) continue;
      const pts = c.ring.map(p => proj(p)); if (pts.some(p => !p)) continue;
      ctx.fillStyle = DAYS_C(a[c.k]); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.beginPath(); geo(this.land); ctx.strokeStyle = "rgba(60,64,67,.45)"; ctx.lineWidth = 0.5; ctx.stroke();
    for (const d of D.sites) {
      if (d3.geoDistance([d.lon, d.lat], centre) > Math.PI / 2 - 0.02) continue;
      const p = proj([d.lon, d.lat]); ctx.beginPath(); ctx.arc(p[0], p[1], this.siteR(d.power), 0, 2 * Math.PI); ctx.fillStyle = BLUE; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.beginPath(); geo({ type: "Sphere" }); ctx.strokeStyle = "#bdc1c6"; ctx.lineWidth = 1; ctx.stroke();
  },
  update() {
    if (!this.ready) return;
    const target = this.field(state.climate), from = this.cur.slice();
    if (this.tm) this.tm.stop();
    this.tm = d3.timer(el => { const t = ease(Math.min(1, el / DUR)), a = new Float32Array(from.length); for (let i = 0; i < a.length; i++) a[i] = from[i] + (target[i] - from[i]) * t; this.cur = a; if (t >= 1) this.tm.stop(); });
  },
};

/* ---------------- live prose ---------------- */
function writeProse() {
  const k = state.climate, hist = k === HIST;
  const med = d3.median(D.reach.by[k].reach), med0 = d3.median(D.reach.by[HIST].reach);
  d3.select("#reach-take").html(`We say a site is in <b>extreme heat</b> on a day hotter than its <b>design day</b>, the level exceeded on only 1% of days in 1995&ndash;2014, close to the condition cooling systems are sized for${cite(5)}. Each model is compared with its own baseline, so model biases cancel. When one site is in extreme heat, many others usually are too: in ${CL[k].long}, the median site shares its hot days with <b>${fmtPct(med)}</b> of the rest of the fleet${hist ? "" : ` (${fmtPct(med0)} in 1995&ndash;2014)`}.`);
  const nDays = kk => D.season[kk].filter(v => v > 0.25).length;
  d3.select("#season-take").html(`We call a day a <b>shared heat day</b> when at least a quarter of planned AI power is in extreme heat at once. In 1995&ndash;2014 such days are rare and scattered through July. In the 2050s under moderate emissions, <b>${nDays("ssp245|2041-2060")}</b> days of the year are shared heat days in more than a quarter of years; in the 2090s under high emissions, <b>${nDays("ssp585|2081-2100")}</b>, most of the summer.`);
  const aug = kk => d3.sum(D.streams.by[kk], r => r[212]), r = rKey(k), r0 = rKey(HIST);
  d3.select("#grids-take").html(`Grid emergencies follow heat across a whole region, as in Texas in September 2023${cite(13)}. We count a <b>region-wide heat day</b> when at least half of a grid region is above its design day. On August 1 in ${CL[k].long}, an expected <b>${fmt1(aug(k))}</b> of seven regions are in region-wide heat${hist ? "" : `, against ${fmt1(aug(HIST))} in 1995&ndash;2014`}. Events also last longer: ${hist ? `${fmtPct(r0.survival[2])} last three days or more` : `the share lasting three days or more rises from ${fmtPct(r0.survival[2])} to <b>${fmtPct(r.survival[2])}</b>`}, while certified data centers must hold only 12 hours of backup fuel${cite(6)}.`);
  const fc = Siting.fleet(k), doe = DOE_SITES.map(d => ({ ...d, co: sampleGrid(Siting.raw(k), d.lon, d.lat) })).sort((a, c) => a.co - c.co);
  d3.select("#co-take").html(`For a new site, what matters is whether it overheats when the rest of the fleet does. On the fleet's shared heat days in ${CL[k].long}, a planned site is in extreme heat <b>${fmtPct(fc / 100)}</b> of the time. Among DOE's federal AI sites${cite(8)}, ${doe[0].name} is lowest at ${fmtPct(doe[0].co / 100)} and ${doe[3].name} highest at ${fmtPct(doe[3].co / 100)}. The Pacific Northwest, the northern Rockies and New England are usually cool when the fleet is hot.`);
  const intl = D.sites.filter(d => d.country !== "United States"), my = intl.filter(d => d.country === "Malaysia"), uae = intl.find(d => d.name === "OpenAI Stargate UAE");
  const usMed = d3.median(D.us, u => u.stats[k].hot[1]);
  d3.select("#world-take").html(hist
    ? `Places with steady temperatures pass their old extremes first, so in a warmer world the tropics light up before the mid-latitudes. Choose a future climate to see it.`
    : `Places with steady temperatures pass their old extremes first, so the tropics light up before the mid-latitudes. In ${CL[k].long}, the Johor cluster in Malaysia sees <b>${Math.round(d3.median(my, d => d.stats[k].hot[1]))}</b> extreme heat days a year and Stargate UAE${cite(18)} <b>${Math.round(uae.stats[k].hot[1])}</b>, against ${Math.round(usMed)} for the median US site. Malaysia already delays water-cooled expansions during drought${cite(19)}, while Nordic sites such as Narvik see the fewest${cite(20)}.`);
}

function initQuickLinks() {
  const links = d3.selectAll(".quick a");
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) links.classed("active", function () { return this.getAttribute("href") === "#" + e.target.id; }); }), { rootMargin: "-40% 0px -55% 0px" });
  document.querySelectorAll("main section[id]").forEach(s => io.observe(s));
}
