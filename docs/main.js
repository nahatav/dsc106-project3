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
  { name: "Paducah", lat: 37.11, lon: -88.80, dx: -12, dy: -8, anchor: "end" },
  { name: "Savannah River Site", lat: 33.25, lon: -81.65, dx: 12, dy: 10, anchor: "start" },
];
const ACCENT = "#a8203b";
const REGION_COLOR = { MISO: "#7a1f3d", PJM: "#b8323e", ERCOT: "#de6a3f", West: "#e9a23b", Southeast: "#a8704a", SPP: "#f3c98b", NYISO: "#8e6c8a" };
const HEAT = ["#fdf8f0", "#fde9c9", "#fccf96", "#f9ad6a", "#f2844f", "#e05a3f", "#c13639", "#93183a", "#5f0a33"];
const PROB_T = [10, 20, 30, 40, 50, 60, 70, 80];
const PROB_C = d3.scaleThreshold().domain(PROB_T).range(HEAT);
const INK = "#202124", BLUE = "#202124", HOT = "#f2844f", WARMGREY = "#f1efec";

const fmtPct = d3.format(".0%"), fmt1 = d3.format(".1f");
const fmtGW = mw => (mw / 1000).toFixed(1) + " GW";
const shortName = n => SHORT[n] || n;
const cite = (...n) => n.map(i => `<a class="cite" href="#r${i}">${i}</a>`).join('<span class="cite-sep">,</span>');
const gridY = g => g.call(a => a.select(".domain").remove()).call(a => a.selectAll(".tick line").attr("stroke", "#ece8e3"));
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

Promise.all(["sites", "summary", "regions", "reach", "coexposure", "buildout", "season", "streams", "mosaic"].map(f => json(`data/${f}.json`))
  .concat([json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-albers-10m.json")]))
  .then(([sites, summary, reg, reach, coex, build, season, streams, mosaic, topo]) => {
    D = { sites: sites.sites, models: sites.models, summary, reg, reach, coex, build, season, streams, mosaic, topo };
    D.us = D.sites.filter(d => d.country === "United States");
    D.usGW = d3.sum(D.us, d => d.power);
    d3.select("#model-list").text(D.models.join(", "));
    setupGeo();
    Fleet.init(); Reach.init(); Mosaic.init(); Stream.init(); Siting.init(); Globe.init();
    d3.selectAll("#seg-climate button").on("click", function () { setClimate(this.dataset.k); });
    initQuickLinks();
    setClimate(state.climate);
  });

function setClimate(k) {
  state.climate = k;
  d3.selectAll("#seg-climate button").classed("on", function () { return this.dataset.k === k; });
  Reach.update(); Mosaic.update(); Stream.update(); Siting.update(); Globe.update();
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

/* ---------------- Figure 1: the fleet as dots of power, coming online ---------------- */
const ownerOf = d => (/Stargate/.test(d.name) ? "OpenAI" : d.owner === "SpaceXAI" ? "xAI" : ["Meta", "Google", "Microsoft", "Amazon", "CoreWeave"].includes(d.owner) ? d.owner : "Other");
const REGION_LABEL_AT = { West: [-40, 20], SPP: [0, -6], ERCOT: [10, 22], MISO: [-34, -40], PJM: [10, -58], Southeast: [10, 46], NYISO: [6, -16] };
const FM = { unit: 100, r: 3.1, on: "#93183a", fresh: "#f2844f", off: "#ddd6ce", land: "#f3f0ec" };
const Fleet = {
  init() {
    const W = 975, MH = 610, H = 800, svg = (this.svg = d3.select("#fleetmap").attr("viewBox", `0 0 ${W} ${H}`)), path = (this.path = d3.geoPath());
    this.W = W; this.MH = MH; this.view = [W / 2, MH / 2, W]; this.k = 1; this.co = null; this.zr = null;
    const lower48 = D.topo.objects.states.geometries.filter(g => !["02", "15"].includes(g.id));
    const regionOf = new Map(Object.entries(D.reg.states).flatMap(([r, ss]) => ss.map(st => [st, r])));
    const ser = new Map(D.build.sites.map(b => [b.name, b.s]));
    this.months = D.build.months; this.m0 = this.months.indexOf("2023-01");
    this.sites = D.us.map(d => ({ ...d, co: ownerOf(d), s: ser.get(d.name) || [], on: 0 })).sort((p, q) => q.power - p.power);
    this.regs = Object.keys(D.reg.states).map(r => ({ name: r, shape: topojson.merge(D.topo, lower48.filter(g => regionOf.get(g.properties.name) === r)), sites: this.sites.filter(d => d.region === r) }));

    // one dot per 100 MW, packed around each site; dots fill from the centre out
    const dots = (this.dots = []);
    this.sites.forEach(d => {
      d.n = Math.max(1, Math.round(d.power / FM.unit));
      for (let j = 0; j < d.n; j++) { const a = j * 2.39996, rr = Math.sqrt(j + 0.5) * FM.r * 2; dots.push({ site: d, x: d.xy[0] + rr * Math.cos(a), y: d.xy[1] + rr * Math.sin(a), on: false }); }
    });
    const sim = d3.forceSimulation(dots).force("x", d3.forceX(o => o.site.xy[0]).strength(0.07)).force("y", d3.forceY(o => o.site.xy[1]).strength(0.07)).force("c", d3.forceCollide(FM.r + 0.7).iterations(3)).stop();
    for (let i = 0; i < 260; i++) sim.tick();
    d3.groups(dots, o => o.site).forEach(([site, ds]) => ds.sort((p, q) => Math.hypot(p.x - site.xy[0], p.y - site.xy[1]) - Math.hypot(q.x - site.xy[0], q.y - site.xy[1])).forEach((o, i) => { o.rank = i; }));

    // map
    svg.append("clipPath").attr("id", "fm-clip").append("rect").attr("width", W).attr("height", MH);
    const outer = svg.append("g").attr("clip-path", "url(#fm-clip)");
    outer.append("rect").attr("width", W).attr("height", MH).attr("fill", "#fff");
    const g = (this.g = outer.append("g"));
    g.append("path").datum(G.nation).attr("d", path).attr("fill", FM.land);
    this.regHit = g.append("g").selectAll("path").data(this.regs).join("path").attr("d", d => path(d.shape)).attr("fill", "transparent");
    const thin = sel => sel.attr("fill", "none").attr("vector-effect", "non-scaling-stroke").style("pointer-events", "none");
    g.append("path").datum(G.states).attr("d", path).call(thin).attr("stroke", "#fff").attr("stroke-width", 0.9);
    g.append("path").datum(topojson.mesh(D.topo, { type: "GeometryCollection", geometries: lower48 }, (x, y) => x !== y && regionOf.get(x.properties.name) !== regionOf.get(y.properties.name)))
      .attr("d", path).call(thin).attr("stroke", "#c4bbb1").attr("stroke-width", 1.2);
    this.regLine = g.append("path").call(thin).attr("stroke", INK).attr("stroke-width", 1.6);
    this.regLabels = g.append("g").style("pointer-events", "none").selectAll("text").data(this.regs).join("text").attr("class", "region-label").attr("text-anchor", "middle").text(d => d.name)
      .each(d => { const [cx, cy] = path.centroid(d.shape), o = REGION_LABEL_AT[d.name] || [0, 0]; d.lx = cx + o[0]; d.ly = cy + o[1]; });
    this.labelPx = parseFloat(getComputedStyle(this.regLabels.node()).fontSize);
    this.dotSel = g.append("g").style("pointer-events", "none").selectAll("circle").data(dots).join("circle").attr("cx", o => o.x).attr("cy", o => o.y).attr("fill", FM.off);
    this.halo = g.append("g").style("pointer-events", "none");
    this.names = g.append("g").style("pointer-events", "none");

    // pointer: nearest dot picks a site, otherwise the region under the cursor
    const del = d3.Delaunay.from(dots, o => o.x, o => o.y);
    const pick = e => { const [mx, my] = d3.pointer(e, g.node()), o = dots[del.find(mx, my)]; return Math.hypot(o.x - mx, o.y - my) * this.k < 10 ? o.site : null; };
    outer.on("mousemove", e => {
      const d = pick(e), reg = d ? this.regs.find(x => x.name === d.region) : (d3.select(e.target).datum() || {}).shape ? d3.select(e.target).datum() : null;
      this.setHover(d); this.outline(reg); outer.style("cursor", d ? "pointer" : reg ? (this.zr === reg.name ? "zoom-out" : "zoom-in") : null);
      if (d) showTip(e, this.siteTip(d)); else if (reg) showTip(e, this.regTip(reg)); else hideTip();
    }).on("mouseleave", () => { this.setHover(null); this.outline(null); hideTip(); })
      .on("click", e => {
        const d = pick(e); hideTip();
        if (d) { Reach.picked = true; Reach.stopTour(); Reach.pin = d.name; Reach.show(d.name, true); document.getElementById("reach").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }); return; }
        const reg = d3.select(e.target).datum(); this.zoomTo(reg && reg.shape && this.zr !== reg.name ? reg : null);
      });

    // key, in the empty Pacific corner
    const key = (this.key = svg.append("g").attr("class", "fm-key").attr("transform", `translate(18,${MH - 76})`).style("pointer-events", "none"));
    [[FM.on, "100 MW online"], [FM.off, "100 MW planned"]].forEach(([c, t], i) => { const row = key.append("g").attr("transform", `translate(0,${i * 26})`); row.append("circle").attr("cx", 5).attr("r", FM.r + 0.6).attr("fill", c); row.append("text").attr("x", 16).attr("dy", "0.35em").text(t); });
    const kr = key.append("g").attr("transform", "translate(0,52)"); kr.append("line").attr("x2", 11).attr("stroke", "#c4bbb1").attr("stroke-width", 1.5); kr.append("text").attr("x", 16).attr("dy", "0.35em").text("Grid region boundary");

    this.back = svg.append("g").attr("transform", `translate(16,16) scale(${window.innerWidth < 600 ? 1.9 : 1})`).style("cursor", "pointer").attr("opacity", 0).style("pointer-events", "none").on("click", () => this.zoomTo(null));
    this.back.append("rect").attr("width", 130).attr("height", 32).attr("rx", 16).attr("fill", "#fff").attr("stroke", "#e0dad3");
    this.back.append("text").attr("class", "fm-back").attr("x", 65).attr("y", 21).attr("text-anchor", "middle").text("Whole country");

    // company menu
    const cos = d3.rollups(this.sites, x => d3.sum(x, d => d.power), d => d.co).sort((p, q) => (p[0] === "Other") - (q[0] === "Other") || q[1] - p[1]);
    const sel = d3.select("#fleet-co");
    sel.selectAll("option").data([["", d3.sum(this.sites, d => d.power)], ...cos]).join("option").attr("value", c => c[0]).text(c => `${c[0] || "All companies"} (${fmtGW(c[1])})`);
    sel.on("change", e => { this.co = e.target.value || null; this.refilter(); });

    // power online over time, which doubles as the timeline
    const rp = window.innerWidth < 600 ? 100 : 64, ax = (this.ax = d3.scaleLinear().domain([0, 95]).range([120, W - rp])), top = MH + 62, bot = H - 40;
    this.ay = d3.scaleLinear().range([bot, top]);
    const tl = svg.append("g");
    this.yAxis = tl.append("g").attr("class", "fm-axis").attr("transform", `translate(${W - rp},0)`);
    tl.append("g").attr("class", "fm-axis").attr("transform", `translate(0,${bot})`)
      .call(d3.axisBottom(ax).tickValues(d3.range(8).map(y => y * 12 + 6)).tickFormat((v, i) => 2023 + i).tickSize(0)).call(x => x.select(".domain").attr("stroke", "#c9c3bb")).selectAll("text").attr("dy", "1.3em");
    tl.selectAll(".yr").data(d3.range(1, 8)).join("line").attr("x1", y => ax(y * 12 - 0.5)).attr("x2", y => ax(y * 12 - 0.5)).attr("y1", bot).attr("y2", bot + 5).attr("stroke", "#c9c3bb");
    svg.append("clipPath").attr("id", "fm-reveal").append("rect").attr("y", top - 40).attr("height", bot - top + 40).attr("x", ax.range()[0]);
    this.reveal = svg.select("#fm-reveal rect");
    this.areaAll = tl.append("path").attr("fill", "#ede9e4");
    this.areaOn = tl.append("path").attr("fill", FM.on).attr("clip-path", "url(#fm-reveal)");
    this.play_line = tl.append("line").attr("y1", top - 8).attr("y2", bot).attr("stroke", INK).attr("stroke-width", 1.2);
    this.play_dot = tl.append("circle").attr("r", 5).attr("fill", INK).attr("stroke", "#fff").attr("stroke-width", 2);
    this.date = tl.append("text").attr("class", "fm-date").attr("y", top - 18).attr("text-anchor", "middle");
    const btn = tl.append("g").attr("transform", `translate(64,${(top + bot) / 2})`).style("cursor", "pointer").on("click", () => (this.timer ? this.pause() : this.play()));
    btn.append("circle").attr("r", 18).attr("fill", INK);
    this.icon = btn.append("path").attr("fill", "#fff");
    tl.append("rect").attr("x", ax.range()[0] - 8).attr("width", ax.range()[1] - ax.range()[0] + 16).attr("y", top - 40).attr("height", bot - top + 56).attr("fill", "transparent").style("cursor", "ew-resize")
      .call(d3.drag().on("start drag", e => { this.pause(); this.set(Math.max(0, Math.min(95, ax.invert(e.x)))); }));

    this.apply(this.view); this.drawArea(false); this.set(0); this.setIcon(false);
    onVisible("#fleetmap", () => (reduceMotion ? this.set(95) : this.play()), 0.4);
  },
  match(d) { return (!this.co || d.co === this.co) && (!this.zr || d.region === this.zr); },
  scope() { return (this.co ? ` ${this.co}` : "") + (this.zr ? ` in ${this.zr}` : ""); },
  series() { const ss = this.sites.filter(d => this.match(d)); return d3.range(96).map(m => d3.sum(ss, d => Math.min(d.power, d.s[this.m0 + m] || 0))); },
  fmtMonth(m) { return d3.timeFormat("%b %Y")(d3.timeParse("%Y-%m")(this.months[this.m0 + Math.floor(m)])); },
  refilter() {
    this.dotSel.transition().duration(350).attr("opacity", o => (!this.co || o.site.co === this.co ? 1 : 0.14));
    this.drawArea(true); this.drawNames();
  },
  drawArea(animate) {
    const v = this.series(), max = Math.max(500, d3.max(v));
    this.ay.domain([0, max * 1.12]);
    const area = d3.area().x((d, i) => this.ax(i)).y0(this.ay(0)).y1(d => this.ay(d)).curve(d3.curveMonotoneX)(v);
    const t = sel => (animate ? sel.transition().duration(600).ease(ease) : sel);
    t(this.areaAll).attr("d", area); t(this.areaOn).attr("d", area);
    const step = (max > 20000 ? 10000 : max > 8000 ? 4000 : max > 3000 ? 1000 : 500) * (window.innerWidth < 600 ? 2 : 1);
    this.yAxis.call(d3.axisRight(this.ay).tickValues(d3.range(step, max * 1.12, step)).tickFormat(x => x / 1000 + " GW").tickSize(-(this.ax.range()[1] - this.ax.range()[0])))
      .call(x => x.select(".domain").remove()).call(x => x.selectAll(".tick line").attr("stroke", "#eceae6")).call(x => x.selectAll("text").attr("dx", 6));
    this.vals = v; if (this.m != null) this.set(this.m);
  },
  set(m) {
    const playing = !!this.timer; this.m = m; const i = this.m0 + Math.floor(m), x = this.ax(m);
    this.sites.forEach(d => { d.on = Math.min(d.power, d.s[i] || 0); d.nOn = d.on > 0 ? Math.max(1, Math.round(d.n * d.on / d.power)) : 0; });
    const changed = this.dotSel.filter(o => (o.rank < o.site.nOn) !== o.on).each(o => { o.on = !o.on; });
    changed.filter(o => !o.on).interrupt().attr("fill", FM.off);
    const lit = changed.filter(o => o.on);
    if (playing) lit.interrupt().attr("fill", FM.fresh).transition().duration(1200).ease(d3.easeCubicOut).attr("fill", FM.on);
    else lit.interrupt().attr("fill", FM.on);
    this.reveal.attr("width", x - this.ax.range()[0]);
    const v = this.vals[Math.floor(m)] || 0;
    this.play_line.attr("x1", x).attr("x2", x); this.play_dot.attr("cx", x).attr("cy", this.ay(v));
    const lab = `${this.fmtMonth(m)} · ${fmtGW(v)} online`, lx = Math.max(this.ax.range()[0] + 70, Math.min(x, this.ax.range()[1] - 70));
    this.date.attr("x", lx).text(lab);
  },
  apply(v) {
    const W = this.W, MH = this.MH, k = (this.k = W / v[2]);
    this.view = v;
    this.g.attr("transform", `translate(${W / 2 - v[0] * k},${MH / 2 - v[1] * k}) scale(${k})`);
    this.dotSel.attr("r", FM.r * Math.pow(k, -0.12));
    this.regLabels.attr("x", d => d.lx).attr("y", d => d.ly).style("font-size", this.labelPx / k + "px").style("stroke-width", 3 / k + "px").attr("opacity", d => (!this.zr || d.name === this.zr ? 1 : 0.45));
  },
  zoomTo(reg) {
    const W = this.W, MH = this.MH;
    let target = [W / 2, MH / 2, W];
    if (reg) { const [[x0, y0], [x1, y1]] = this.path.bounds(reg.shape), k = Math.min(4, 0.8 / Math.max((x1 - x0) / W, (y1 - y0) / MH)); target = [(x0 + x1) / 2, (y0 + y1) / 2, W / k]; }
    this.zr = reg ? reg.name : null; this.names.selectAll("*").remove(); this.halo.selectAll("*").remove();
    const zi = d3.interpolateZoom(this.view, target);
    this.g.transition().duration(reduceMotion ? 0 : Math.min(1400, zi.duration * 0.9)).ease(ease).tween("zoom", () => t => this.apply(zi(t))).on("end", () => this.drawNames());
    this.key.transition().duration(300).attr("opacity", reg ? 0 : 1);
    this.back.transition().duration(300).attr("opacity", reg ? 1 : 0); this.back.style("pointer-events", reg ? "all" : "none");
    this.drawArea(true);
  },
  setHover(d) {
    if (d === this.hover) return; this.hover = d;
    const k = this.k, rr = FM.r * Math.pow(k, -0.12) + 1.4 / k;
    this.halo.selectAll("circle").data(d ? this.dots.filter(o => o.site === d) : []).join("circle").attr("cx", o => o.x).attr("cy", o => o.y).attr("r", rr)
      .attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.2).attr("vector-effect", "non-scaling-stroke");
    this.drawNames();
  },
  drawNames() {
    // in a zoomed region, name the larger sites without overlaps; always name the hovered site
    const k = this.k, W = this.W, MH = this.MH, v = this.view, px = this.labelPx + 1;
    const scr = (x, y) => [W / 2 + (x - v[0]) * k, MH / 2 + (y - v[1]) * k];
    const ext = d => { const ds = this.dots.filter(o => o.site === d); return [d3.min(ds, o => o.x), d3.max(ds, o => o.x), d3.mean(ds, o => o.y)]; };
    let pick = [];
    if (this.zr) {
      const boxes = this.dots.filter(o => this.match(o.site)).map(o => { const [x, y] = scr(o.x, o.y); return [x - 4, y - 4, x + 4, y + 4]; });
      this.sites.filter(d => this.match(d) && d.power >= 150).forEach(d => {
        const [, x1, ym] = ext(d), [x, y] = scr(x1, ym), w = d.name.length * px * 0.55, bx = [x + 6, y - px / 2 - 1, x + 8 + w, y + px / 2 + 1];
        if (bx[2] > W - 4 || boxes.some(o => !(bx[2] < o[0] || bx[0] > o[2] || bx[3] < o[1] || bx[1] > o[3]))) return;
        boxes.push(bx); pick.push(d);
      });
    }
    if (this.hover && !pick.includes(this.hover)) pick.push(this.hover);
    this.names.selectAll("text").data(pick, d => d.name).join(e => e.append("text").attr("class", "map-label").attr("opacity", 0).call(x => x.transition().duration(250).attr("opacity", 1)))
      .each(function (d) { d._e = ext(d); }).attr("x", d => d._e[1] + 6 / k).attr("y", d => d._e[2]).attr("dy", "0.35em")
      .style("font-size", px / k + "px").style("stroke-width", 3 / k + "px").text(d => d.name);
  },
  outline(reg) { this.regLine.attr("d", reg ? this.path(reg.shape) : null); },
  siteTip(d) { return `<b>${d.name}</b><br><span class="t-muted">${d.co === "Other" ? d.owner || "Other" : d.co} · ${d.grid || d.region}</span><br>${fmtGW(d.on)} of ${fmtGW(d.power)} online by ${this.fmtMonth(this.m)}<br><span class="t-muted">Click to see its heat reach</span>`; },
  regTip(g) { const on = d3.sum(g.sites, d => d.on), pl = d3.sum(g.sites, d => d.power); return `<b>${g.name}</b><br>${g.sites.length} data centers, ${fmtGW(on)} of ${fmtGW(pl)} online by ${this.fmtMonth(this.m)}<br><span class="t-muted">${this.zr === g.name ? "Click to zoom out" : "Click to zoom in"}</span>`; },
  play() {
    if (this.m >= 94.99) this.set(0);
    const t0 = performance.now(), from = this.m, dur = 10000 * (95 - from) / 95;
    this.timer = d3.timer(() => { const u = Math.min(1, (performance.now() - t0) / dur); this.set(from + (95 - from) * u); if (u >= 1) this.pause(); });
    this.setIcon(true);
  },
  pause() { if (this.timer) this.timer.stop(); this.timer = null; this.setIcon(false); },
  setIcon(playing) { this.icon.attr("d", playing ? "M-5,-6h3.5v12h-3.5zM1.5,-6h3.5v12h-3.5z" : "M-4,-7L7,0L-4,7z"); },
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
      .attr("cx", d => d.xy[0]).attr("cy", d => d.xy[1]).attr("r", d => r(d.power)).attr("fill", "#fff").attr("stroke", "#6b645c").attr("stroke-width", 0.8);
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
    if (reduceMotion || this.picked) return;
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
      .attr("stroke", d => (d.name === this.sel ? "#fff" : "#6b645c")).attr("stroke-width", d => (d.name === this.sel ? 2 : 0.8));
    const rr = this.rs(s.power);
    this.ring.transition().duration(DUR).attr("cx", s.xy[0]).attr("cy", s.xy[1]).attr("r", rr + 5);
    this.label.text(shortName(s.name)).transition().duration(DUR).attr("x", s.xy[0]).attr("y", s.xy[1] - rr - 12).attr("text-anchor", "middle");
  },
};

/* ---------------- Figure 3: every simulated summer, as a mosaic ---------------- */
const Mosaic = {
  init() {
    const stage = document.querySelector("#season .fig-stage"), canvas = (this.canvas = document.getElementById("mosaic"));
    this.ctx = canvas.getContext("2d"); this.W = 720; this.H = 500;
    this.pw = 292; this.gap = 24; this.left = 104; this.top = 46; this.rowH = 2.1; this.n = 200; this.days = D.mosaic.days;
    this.panels = [{ x: this.left, key: HIST }, { x: this.left + this.pw + this.gap, key: state.climate }];
    this.order = "model"; this.reveal = 0; this.fade = 1;
    const resize = () => { const w = stage.clientWidth, dpr = window.devicePixelRatio || 1; canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * this.H / this.W * dpr); canvas.style.height = (w * this.H / this.W) + "px"; this.scale = canvas.width / this.W; this.draw(); };
    new ResizeObserver(resize).observe(stage);
    this.rank = {}; CLIMATES.forEach(c => { this.rank[c.key] = this.ranks(c.key); });
    this.pos = this.panels.map(pn => d3.range(this.n));
    resize();
    d3.selectAll("#mosaic-sort button").on("click", e => { this.order = e.currentTarget.dataset.v; d3.selectAll("#mosaic-sort button").classed("on", function () { return this.dataset.v === Mosaic.order; }); this.animateOrder(); });
    d3.select(canvas).on("mousemove", e => {
      const rect = canvas.getBoundingClientRect(), mx = (e.clientX - rect.left) / rect.width * this.W, my = (e.clientY - rect.top) / rect.height * this.H;
      const pn = this.panels.find(p => mx >= p.x && mx <= p.x + this.pw); if (!pn || my < this.top || my > this.top + this.n * this.rowH) return hideTip();
      const slot = Math.floor((my - this.top) / this.rowH), rows = D.mosaic.by[pn.key], idx = this.slotToRow(pn, slot), r = rows[idx];
      if (!r) return hideTip();
      showTip(e, `<b>${r.m}</b>, simulated ${r.y}<br>${CL[pn.key].label}<br><b>${r.f.split("1").length - 1}</b> shared heat days, May to September`);
    }).on("mouseleave", hideTip);
    onVisible("#mosaic", () => { const t0 = performance.now(), tm = d3.timer(() => { this.reveal = Math.min(1, (performance.now() - t0) / (reduceMotion ? 1 : 1600)); this.draw(); if (this.reveal >= 1) tm.stop(); }); });
  },
  ranks(k) { const rows = D.mosaic.by[k], c = rows.map((r, i) => ({ i, n: r.f.split("1").length - 1 })); c.sort((a, b) => b.n - a.n || a.i - b.i); const rk = new Array(rows.length); c.forEach((o, j) => { rk[o.i] = j; }); return rk; },
  target(pn) { return this.order === "sorted" ? this.rank[pn.key] : d3.range(this.n); },
  slotToRow(pn, slot) { const p = this.pos[this.panels.indexOf(pn)]; let best = 0, bd = 1e9; p.forEach((v, i) => { const dd = Math.abs(v - slot); if (dd < bd) { bd = dd; best = i; } }); return best; },
  animateOrder() {
    const from = this.pos.map(p => p.slice()), to = this.panels.map(pn => this.target(pn)), t0 = performance.now();
    if (this.om) this.om.stop();
    this.moving = true;
    this.om = d3.timer(() => { const t = ease(Math.min(1, (performance.now() - t0) / (reduceMotion ? 1 : 1100))); this.pos = from.map((f, j) => f.map((v, i) => v + (to[j][i] - v) * t)); if (t >= 1) { this.om.stop(); this.moving = false; } this.draw(); });
  },
  draw() {
    const { ctx, scale } = this; if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const cw = this.pw / this.days, shown = Math.round(this.n * this.reveal);
    ctx.font = "500 13px 'Google Sans Flex', Arial, sans-serif"; ctx.fillStyle = INK; ctx.textBaseline = "alphabetic";
    this.panels.forEach((pn, j) => {
      ctx.globalAlpha = 1; ctx.fillStyle = INK; ctx.textAlign = "left"; ctx.fillText(CL[pn.key].label, pn.x, this.top - 16);
      ctx.fillStyle = "#f1efec"; ctx.fillRect(pn.x, this.top, this.pw, this.n * this.rowH);
      const rows = D.mosaic.by[pn.key];
      ctx.globalAlpha = j === 1 ? this.fade : 1; ctx.fillStyle = "#a8203b";
      rows.forEach((r, i) => {
        if (i >= shown) return;
        const y = this.top + this.pos[j][i] * this.rowH;
        for (let d = 0; d < this.days; d++) if (r.f.charCodeAt(d) === 49) ctx.fillRect(pn.x + d * cw, y, cw + 0.4, this.rowH + 0.3);
      });
      ctx.globalAlpha = 1;
      if (this.order === "model" && !this.moving) { ctx.fillStyle = "rgba(255,255,255,.85)"; for (let k = 1; k < 10; k++) ctx.fillRect(pn.x, this.top + k * 20 * this.rowH - 0.5, this.pw, 1); }
      // month ticks
      ctx.fillStyle = "#8a8279"; ctx.font = "12px 'Google Sans Flex', Arial, sans-serif"; ctx.textAlign = "center";
      [["May", 0], ["June", 31], ["July", 61], ["Aug", 92], ["Sept", 123]].forEach(([mname, d0]) => {
        ctx.fillText(mname, pn.x + (d0 + 15) * cw, this.top + this.n * this.rowH + 18);
        ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillRect(pn.x + d0 * cw, this.top, 1, this.n * this.rowH); ctx.fillStyle = "#8a8279";
      });
    });
    // model labels when grouped
    if (this.order === "model" && !this.moving) {
      ctx.textAlign = "right"; ctx.fillStyle = "#6b645c"; ctx.font = "11px 'Google Sans Flex', Arial, sans-serif";
      D.mosaic.by[HIST].filter((r, i) => i % 20 === 0).forEach((r, k) => { const y = this.top + (k * 20 + 10) * this.rowH + 4; ctx.fillText(r.m, this.left - 8, y); });
    }
  },
  update() {
    const pn = this.panels[1]; if (!pn) return;
    if (pn.key === state.climate) return;
    const t0 = performance.now();
    if (this.fm) this.fm.stop();
    this.fm = d3.timer(() => {
      const t = Math.min(1, (performance.now() - t0) / (reduceMotion ? 1 : 700));
      if (t < 0.5) this.fade = 1 - t * 2; else { if (pn.key !== state.climate) { pn.key = state.climate; this.pos[1] = this.target(pn).slice(); } this.fade = (t - 0.5) * 2; }
      this.draw(); if (t >= 1) this.fm.stop();
    });
  },
};

/* ---------------- Figure 4: region-wide heat through the season ---------------- */
const Stream = {
  init() {
    const W = 720, H = 380, m = { t: 44, r: 16, b: 34, l: 48 };
    const svg = d3.select("#stream").attr("viewBox", `0 0 ${W} ${H}`), g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
    this.iw = W - m.l - m.r; this.ih = H - m.t - m.b;
    this.d0 = 120; this.d1 = 275; this.days = d3.range(this.d0, this.d1);
    this.R = ["MISO", "PJM", "ERCOT", "West", "Southeast", "SPP", "NYISO"];
    const smooth = arr => arr.map((v, i) => d3.mean(arr.slice(Math.max(0, i - 4), i + 5)));
    this.data = {};
    CLIMATES.forEach(c => {
      const gw = Object.fromEntries(D.reg.regions.map((r, j) => [r, D.reg.power_gw[j]]));
      const per = Object.fromEntries(D.streams.regions.map((r, j) => [r, smooth(D.streams.by[c.key][j]).map(v => v * gw[r])]));
      this.prob = this.prob || {}; this.prob[c.key] = Object.fromEntries(D.streams.regions.map((r, j) => [r, smooth(D.streams.by[c.key][j])]));
      this.data[c.key] = this.days.map(d => Object.fromEntries([["d", d], ...this.R.map(r => [r, per[r][d]])]));
    });
    this.stack = d3.stack().keys(this.R);
    this.x = d3.scaleLinear().domain([this.d0, this.d1 - 1]).range([0, this.iw]);
    this.y = d3.scaleLinear().range([this.ih, 0]);
    const months = d3.range(4, 9).map(mo => ({ mo, d: d3.timeDay.count(new Date(2050, 0, 1), new Date(2050, mo, 1)) }));
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${this.ih})`).call(d3.axisBottom(this.x).tickValues(months.map(o => o.d + 14)).tickFormat((v, i) => MONTHS[months[i].mo]).tickSize(0)).call(a => a.select(".domain").attr("stroke", "#c9c2ba")).selectAll("text").attr("dy", "1.2em");
    this.ya = g.append("g").attr("class", "axis");
    g.append("text").attr("class", "axis-title").attr("x", -m.l + 2).attr("y", -14).text("Planned AI power in grid regions under region-wide heat, expected GW");
    this.area = d3.area().x(p => this.x(p.data.d)).y0(p => this.y(p[0])).y1(p => this.y(p[1])).curve(d3.curveBasis);
    this.paths = g.append("g").selectAll("path").data(this.stack(this.data[HIST]), s => s.key).join("path").attr("fill", s => REGION_COLOR[s.key]).attr("stroke", "#fff").attr("stroke-width", 0.5);
    this.histTotal = this.days.map((d, i) => d3.sum(this.R, r => this.data[HIST][i][r]));
    this.ghost = g.append("path").attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.5).attr("stroke-dasharray", "4,3");
    this.cursor = g.append("line").attr("y1", 0).attr("y2", this.ih).attr("stroke", INK).style("display", "none");
    g.append("rect").attr("width", this.iw).attr("height", this.ih).attr("fill", "transparent")
      .on("mousemove", e => {
        const i = Math.max(0, Math.min(this.days.length - 1, Math.round(this.x.invert(d3.pointer(e)[0])) - this.d0)), row = this.data[state.climate][i];
        this.cursor.attr("x1", this.x(row.d)).attr("x2", this.x(row.d)).style("display", null);
        const dt = d3.timeDay.offset(new Date(2050, 0, 1), row.d);
        const pr = this.prob[state.climate];
        showTip(e, `<b>${d3.timeFormat("%B %-d")(dt)}</b> · ${CL[state.climate].label}<br><b>${fmt1(d3.sum(this.R, r => row[r]))} GW</b> expected in region-wide heat<br>` + this.R.slice().sort((a, b) => row[b] - row[a]).map(r => `<span style="color:${REGION_COLOR[r]}">■</span> ${r} ${fmt1(row[r])} GW <span class="t-muted">(${fmtPct(pr[r][row.d])} chance)</span>`).join("<br>"));
      }).on("mouseleave", () => { hideTip(); this.cursor.style("display", "none"); });
    // key, ordered as stacked from the bottom
    const key = svg.append("g").attr("transform", `translate(${m.l},${H - 4})`);
    let kx = 0;
    this.R.forEach(r => {
      const it = key.append("g").attr("transform", `translate(${kx},0)`);
      it.append("rect").attr("y", -9).attr("width", 10).attr("height", 10).attr("rx", 2).attr("fill", REGION_COLOR[r]);
      const t = it.append("text").attr("x", 14).attr("y", 0).text(r);
      kx += 14 + r.length * 7.2 + 18;
    });
    const gk = key.append("g").attr("transform", `translate(${kx + 6},0)`);
    gk.append("line").attr("x1", 0).attr("x2", 22).attr("y1", -4).attr("y2", -4).attr("stroke", INK).attr("stroke-width", 1.5).attr("stroke-dasharray", "4,3");
    gk.append("text").attr("x", 28).attr("y", 0).text("1995–2014 total");
    svg.attr("viewBox", `0 0 ${W} ${H + 16}`); key.attr("transform", `translate(${m.l},${H + 10})`);
  },
  update() {
    const st = this.stack(this.data[state.climate]), top = d3.max(st[st.length - 1], p => p[1]);
    this.y.domain([0, Math.max(4, top * 1.12)]).nice();
    this.ya.transition().duration(DUR).call(d3.axisLeft(this.y).ticks(5).tickFormat(d3.format("~f")).tickSize(-this.iw)).call(gridY);
    this.paths.data(st, s => s.key).transition().duration(DUR).attr("d", this.area);
    const line = d3.line().x((v, i) => this.x(this.days[i])).y(v => this.y(v)).curve(d3.curveBasis);
    this.ghost.transition().duration(DUR).attr("d", line(this.histTotal));
  },
};

/* ---------------- Figure 5: siting ---------------- */
const Siting = {
  init() {
    this.map = FieldMap("#co-stage", "#co-canvas");
    const svg = d3.select("#co-map").attr("viewBox", "0 0 975 610"), r = d3.scaleSqrt().domain([0, 2800]).range([2, 12]);
    svg.append("g").selectAll("circle").data(D.us).join("circle").attr("cx", d => d.xy[0]).attr("cy", d => d.xy[1]).attr("r", d => r(d.power))
      .attr("fill", "#fff").attr("fill-opacity", 0.6).attr("stroke", "#6b645c").attr("stroke-width", 0.7).style("pointer-events", "none");
    const dg = svg.append("g").selectAll("g").data(DOE_SITES).join("g").attr("transform", d => `translate(${projection([d.lon, d.lat])})`).style("pointer-events", "none");
    const halo = dg.append("circle").attr("r", 8).attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.5);
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
// Raster globe: each pixel is inverse-projected, the 2-degree field is sampled bilinearly
// and coloured on a continuous scale; coastlines, sites and labels are drawn as vectors on top.
const GLOBE_MAX = 120;
const GLOBE_C = d3.scaleSequentialSqrt(d3.piecewise(d3.interpolateRgb, ["#fbf3e6", "#fcd9a6", "#f8ad6a", "#ef7b4f", "#d64a3e", "#a8203b", "#6b0c35"])).domain([3, GLOBE_MAX]).clamp(true);
const GLOBE_HUBS = [{ t: "Johor", lon: 103.6, lat: 1.4 }, { t: "Abu Dhabi", lon: 54.5, lat: 24.3 }, { t: "Narvik", lon: 17.4, lat: 68.4 },
  { t: "Inner Mongolia", lon: 112.5, lat: 40.8 }, { t: "Northern Virginia", lon: -77.5, lat: 38.9 }, { t: "Texas", lon: -99.7, lat: 32.4 }, { t: "Melbourne", lon: 144.9, lat: -37.8 }];
const Globe = {
  async init() {
    let world, glob;
    try { [world, glob] = await Promise.all([json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"), json("data/global.json")]); }
    catch (e) { d3.select("#world-take").text("The global field is still being computed."); return; }
    this.glob = glob; this.land = topojson.feature(world, world.objects.land);
    this.nlat = glob.lat.length; this.nlon = glob.lon.length;
    const stage = document.getElementById("globe-stage"), canvas = document.getElementById("globe");
    this.W = 720; this.H = 600; this.R = 270;
    this.ctx = canvas.getContext("2d"); this.canvas = canvas;
    this.proj = d3.geoOrthographic().scale(this.R).translate([this.W / 2, this.H / 2]).rotate([95, -28]).clipAngle(90).precision(0.5);
    // land mask on an equirectangular grid (0.5 degree)
    const mw = 720, mh = 360, mc = document.createElement("canvas"); mc.width = mw; mc.height = mh;
    const mctx = mc.getContext("2d"), eq = d3.geoEquirectangular().scale(mw / (2 * Math.PI)).translate([mw / 2, mh / 2]);
    mctx.fillStyle = "#000"; mctx.beginPath(); d3.geoPath(eq, mctx)(this.land); mctx.fill();
    const md = mctx.getImageData(0, 0, mw, mh).data; this.mask = new Uint8Array(mw * mh); for (let i = 0; i < mw * mh; i++) this.mask[i] = md[i * 4 + 3] > 100;
    this.mw = mw; this.mh = mh;
    // offscreen raster at reduced resolution, scaled up smoothly
    this.rs = 1.6; this.rw = Math.round(this.W / this.rs); this.rh = Math.round(this.H / this.rs);
    this.off = document.createElement("canvas"); this.off.width = this.rw; this.off.height = this.rh;
    this.octx = this.off.getContext("2d"); this.img = this.octx.createImageData(this.rw, this.rh);
    this.lut = d3.range(256).map(v => d3.rgb(GLOBE_C(v)));
    const resize = () => { const w = stage.clientWidth, dpr = window.devicePixelRatio || 1; canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * this.H / this.W * dpr); canvas.style.height = (w * this.H / this.W) + "px"; this.scale = canvas.width / this.W; };
    new ResizeObserver(resize).observe(stage); resize();
    this.siteR = d3.scaleSqrt().domain([0, 2800]).range([2.2, 7.5]);
    d3.select(canvas).call(d3.drag().on("start", () => { this.dragging = true; hideTip(); })
      .on("drag", e => { const r = this.proj.rotate(), k = this.canvas.getBoundingClientRect().width / this.W; this.proj.rotate([r[0] + e.dx / k * 0.3, Math.max(-70, Math.min(70, r[1] - e.dy / k * 0.3))]); })
      .on("end", () => { this.dragging = false; this.resumeAt = performance.now() + 2500; }))
      .on("mousemove", e => {
        const rect = canvas.getBoundingClientRect(), mx = (e.clientX - rect.left) / rect.width * this.W, my = (e.clientY - rect.top) / rect.height * this.H;
        const c = this.centre(), hit = D.sites.filter(d => d3.geoDistance([d.lon, d.lat], c) < Math.PI / 2 - 0.05).map(d => ({ d, p: this.proj([d.lon, d.lat]) })).find(o => Math.hypot(o.p[0] - mx, o.p[1] - my) < 8);
        if (hit) { this.hovering = true; const st = hit.d.stats[state.climate]; showTip(e, `<b>${hit.d.name}</b><br><span class="t-muted">${hit.d.country} · ${fmtGW(hit.d.power)} planned</span>${st ? `<br><b>${fmt1(st.hot[1])}</b> extreme heat days per year` : ""}`); }
        else if (this.hovering) { this.hovering = false; hideTip(); }
      }).on("mouseleave", () => { this.hovering = false; hideTip(); });
    // continuous legend
    const lg = d3.select("#globe-legend").append("svg").attr("viewBox", "0 0 720 44");
    const grd = lg.append("defs").append("linearGradient").attr("id", "globe-grad");
    d3.range(0, 1.001, 0.1).forEach(t => grd.append("stop").attr("offset", t).attr("stop-color", GLOBE_C(3 + (GLOBE_MAX - 3) * t * t)));
    lg.append("text").attr("class", "lg-title").attr("y", 4).attr("dy", "0.8em").text("Extreme heat days per year over land (ten-model median)");
    lg.append("rect").attr("y", 20).attr("width", 300).attr("height", 8).attr("rx", 4).attr("fill", "url(#globe-grad)");
    const lx = v => 300 * Math.sqrt((v - 3) / (GLOBE_MAX - 3));
    [[3, "4"], [15, "15"], [40, "40"], [80, "80"], [GLOBE_MAX, "120+"]].forEach(([v, t]) => lg.append("text").attr("x", lx(v)).attr("y", 42).attr("text-anchor", v === 3 ? "start" : v === GLOBE_MAX ? "end" : "middle").text(t));
    const g2 = lg.append("g").attr("transform", "translate(360,10)");
    g2.append("circle").attr("cx", 7).attr("cy", 14).attr("r", 5).attr("fill", BLUE).attr("stroke", "#fff").attr("stroke-width", 1.5);
    g2.append("text").attr("x", 20).attr("y", 18).text("AI data center, sized by planned power");
    this.cur = this.field(state.climate);
    let last = performance.now(); this.visible = false;
    new IntersectionObserver(es => es.forEach(e => { this.visible = e.isIntersecting; }), { threshold: 0.05 }).observe(stage);
    d3.timer(() => {
      const now = performance.now(), dt = Math.min(50, now - last); last = now;
      if (!this.visible && this.painted) return;
      this.painted = true;
      if (!this.dragging && !reduceMotion && !(this.resumeAt && now < this.resumeAt) && !this.hovering) { const r = this.proj.rotate(); this.proj.rotate([r[0] + dt * 0.006, r[1]]); }
      this.paint();
    });
    this.ready = true;
  },
  centre() { const r = this.proj.rotate(); return [-r[0], -r[1]]; },
  field(k) { return decodeU8(this.glob.by[k]); },
  sample(lon, lat) {
    const a = this.cur, nl = this.nlon, fy = (lat + 89) / 2, fx = (lon + 179) / 2;
    const y0 = Math.max(0, Math.min(this.nlat - 2, Math.floor(fy))), wy = Math.max(0, Math.min(1, fy - y0));
    let x0 = Math.floor(fx), wx = fx - x0; x0 = ((x0 % nl) + nl) % nl; const x1 = (x0 + 1) % nl;
    return (a[y0 * nl + x0] * (1 - wx) + a[y0 * nl + x1] * wx) * (1 - wy) + (a[(y0 + 1) * nl + x0] * (1 - wx) + a[(y0 + 1) * nl + x1] * wx) * wy;
  },
  raster() {
    const { rw, rh, rs, proj, img } = this, d = img.data, cx = this.W / 2, cy = this.H / 2, R = this.R;
    for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) {
      const o = (j * rw + i) * 4, x = i * rs + rs / 2, y = j * rs + rs / 2;
      if ((x - cx) ** 2 + (y - cy) ** 2 >= R * R) { d[o + 3] = 0; continue; }
      const ll = proj.invert([x, y]);
      const mi = Math.floor((ll[1] * -1 + 90) / 180 * this.mh), mj = Math.floor((ll[0] + 180) / 360 * this.mw);
      if (!this.mask[Math.max(0, Math.min(this.mh - 1, mi)) * this.mw + ((mj % this.mw) + this.mw) % this.mw]) { d[o] = 242; d[o + 1] = 240; d[o + 2] = 236; d[o + 3] = 255; continue; }
      const c = this.lut[Math.max(0, Math.min(255, Math.round(this.sample(ll[0], ll[1]))))];
      d[o] = c.r; d[o + 1] = c.g; d[o + 2] = c.b; d[o + 3] = 255;
    }
    this.octx.putImageData(img, 0, 0);
  },
  paint() {
    const { ctx, scale, proj } = this, cx = this.W / 2, cy = this.H / 2, R = this.R;
    this.raster();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const glow = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.12);
    glow.addColorStop(0, "rgba(120,90,70,.14)"); glow.addColorStop(1, "rgba(120,90,70,0)");
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, 2 * Math.PI); ctx.fill();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.off, 0, 0, this.W, this.H);
    const geo = d3.geoPath(proj, ctx);
    ctx.beginPath(); geo(d3.geoGraticule10()); ctx.strokeStyle = "rgba(60,52,44,.06)"; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.beginPath(); geo(this.land); ctx.strokeStyle = "rgba(60,52,44,.5)"; ctx.lineWidth = 0.6; ctx.stroke();
    const shade = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    shade.addColorStop(0, "rgba(255,255,255,.10)"); shade.addColorStop(0.7, "rgba(255,255,255,0)"); shade.addColorStop(1, "rgba(32,33,36,.10)");
    ctx.fillStyle = shade; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fill();
    const c = this.centre();
    for (const d of D.sites) {
      if (d3.geoDistance([d.lon, d.lat], c) > Math.PI / 2 - 0.03) continue;
      const p = proj([d.lon, d.lat]); ctx.beginPath(); ctx.arc(p[0], p[1], this.siteR(d.power), 0, 2 * Math.PI);
      ctx.fillStyle = BLUE; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.font = "500 12.5px 'Google Sans Flex', Arial, sans-serif"; ctx.textBaseline = "middle";
    for (const h of GLOBE_HUBS) {
      const dist = d3.geoDistance([h.lon, h.lat], c); if (dist > 1.25) continue;
      const p = proj([h.lon, h.lat]), a = Math.max(0, Math.min(1, (1.25 - dist) / 0.25));
      ctx.globalAlpha = a; ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.strokeText(h.t, p[0] + 10, p[1]); ctx.fillStyle = INK; ctx.fillText(h.t, p[0] + 10, p[1]); ctx.globalAlpha = 1;
    }
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.strokeStyle = "rgba(60,52,44,.25)"; ctx.lineWidth = 1; ctx.stroke();
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
  const own = d3.rollup(D.us, a => d3.sum(a, d => d.power), d => ownerOf(d)), top5 = [...own.entries()].filter(e => e[0] !== "Other").sort((a, b) => b[1] - a[1]).slice(0, 5);
  const reg = d3.rollup(D.us, a => d3.sum(a, d => d.power), d => d.region), topReg = [...reg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  d3.select("#fleet-take").html(`Planned AI capacity in the United States grows from 0.1 GW in early 2023 to <b>${fmtGW(D.usGW)}</b> by 2030, according to construction timelines compiled by Epoch AI${cite(1)}. Five companies (${top5.map(e => e[0]).join(", ")}) plan ${fmtPct(d3.sum(top5, e => e[1]) / D.usGW)} of it, and two grid regions, ${topReg[0][0]} and ${topReg[1][0]}, will host ${fmtPct((topReg[0][1] + topReg[1][1]) / D.usGW)}.`);
  const mean = kk => d3.mean(D.mosaic.by[kk], r => r.f.split("1").length - 1);
  d3.select("#season-take").html(`We call a day a <b>shared heat day</b> when at least a quarter of planned AI power is in extreme heat at once. Here is every simulated summer in the ensemble. In 1995&ndash;2014 the average summer has <b>${fmt1(mean(HIST))}</b> shared heat days, scattered through July${hist ? "" : `; in ${CL[k].long} it has <b>${fmt1(mean(k))}</b>, spread from June into September`}. Sort the rows to see how consistent the change is across models and years.`);
  const med = d3.median(D.reach.by[k].reach), med0 = d3.median(D.reach.by[HIST].reach);
  d3.select("#reach-take").html(`We say a site is in <b>extreme heat</b> on a day hotter than its <b>design day</b>, the level exceeded on only 1% of days in 1995&ndash;2014, close to the condition cooling systems are sized for${cite(5)}. Each model is compared with its own baseline, so model biases cancel. When one site is in extreme heat, many others usually are too: in ${CL[k].long}, the median site shares its hot days with <b>${fmtPct(med)}</b> of the rest of the fleet${hist ? "" : ` (${fmtPct(med0)} in 1995&ndash;2014)`}.`);
  const aug = kk => d3.sum(D.streams.regions, (rg, j) => D.streams.by[kk][j][212] * D.reg.power_gw[D.reg.regions.indexOf(rg)]), r = rKey(k), r0 = rKey(HIST);
  d3.select("#grids-take").html(`Grid emergencies follow heat across a whole region, as in Texas in September 2023${cite(13)}. We call a day <b>region-wide heat</b> when at least half of a grid region is above its design day. On a typical August 1 in ${CL[k].long}, <b>${fmt1(aug(k))} GW</b> of planned AI power is expected to sit in a region under region-wide heat${hist ? "" : `, against ${fmt1(aug(HIST))} GW in 1995&ndash;2014`}. Events also last longer: ${hist ? `${fmtPct(r0.survival[2])} last three days or more` : `the share lasting three days or more rises from ${fmtPct(r0.survival[2])} to <b>${fmtPct(r.survival[2])}</b>`}, while certified data centers must hold only 12 hours of backup fuel${cite(6)}.`);
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
