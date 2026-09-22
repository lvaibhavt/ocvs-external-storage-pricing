(function () {
  const D = window.STORAGE;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const usd = (n, dp) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: dp ?? (n < 1000 ? 2 : 0), maximumFractionDigits: dp ?? (n < 1000 ? 2 : 0) });
  const num = n => Math.round(n).toLocaleString("en-US");
  const mb = n => Math.floor(n).toLocaleString("en-US");   // throughput, rounded down like the OCI estimator
  const short = n => Math.abs(n) >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : "$" + Math.round(n / 1000) + "K";
  const U = D.unitsPerTiB, SLICE = D.sliceGiB;

  const DEFAULTS = { kind: "block", tib: 100, hours: D.defaultHours };
  let state = { ...DEFAULTS, sel: {}, tier: {}, units: {} };

  const optsFor = (pid, kind) => D.options.filter(o => o.platform === pid && o.kind === kind);
  function chosen(pid) {
    const list = optsFor(pid, state.kind);
    if (!list.length) return null;
    return list.find(o => o.id === state.sel[pid]) || list[0];
  }
  function tierOf(o) {
    if (!o || !o.tiers) return null;
    return o.tiers.find(t => t.id === state.tier[o.id]) || o.tiers.find(t => t.default) || o.tiers[0];
  }
  const unitRate = t => (t ? (t.priceHr != null ? t.priceHr * state.hours : t.price) : null);
  const monthly = (o, t) => (o && t && !o.priceOnRequest ? unitRate(t) * state.tib * U : null);

  // What you actually get at a capacity: the capacity is split into the fewest
  // volumes / instances the service allows, each one is capped at its published
  // maximum, and any service-wide maximum is applied on top. This is why a
  // 900 TiB OCI datastore is not 90 IOPS x 921,600 GB — every volume stops at
  // 75,000 IOPS, exactly as the OCI cost estimator shows.
  // Fewest units the capacity can live in (each has a maximum size).
  const minUnits = (o, tib) => Math.max(1, o.unitMaxTiB ? Math.ceil(tib / o.unitMaxTiB) : 1);
  // Most units worth using: past this, each one is below its performance maximum anyway.
  function bestUnits(o, t, tib) {
    const lo = minUnits(o, tib);
    const forCap = t && t.capIops && t.iopsPerTiB ? Math.ceil(tib / (t.capIops / t.iopsPerTiB)) : 1;
    let n = Math.max(lo, forCap);
    if (o.maxUnits) n = Math.min(n, o.maxUnits);
    return Math.max(n, lo);
  }
  function perf(o, t, tib, unitsWanted) {
    if (!o || !t) return null;
    const unit = t.mib ? "MiB/s" : "MB/s";
    if (t.fixedMbps) return { mbps: t.fixedMbps, unit, fixed: true, units: 1 };
    let units = unitsWanted || minUnits(o, tib);
    units = Math.max(units, minUnits(o, tib));
    if (o.maxUnits) units = Math.min(units, o.maxUnits);
    const perUnitTiB = tib / units;
    const cap = (perTiB, capPer, serviceMax) => {
      if (!perTiB) return null;
      let v = perTiB * perUnitTiB;
      if (capPer) v = Math.min(v, capPer);
      v *= units;
      if (serviceMax) v = Math.min(v, serviceMax);
      return v;
    };
    const linearIops = t.iopsPerTiB ? t.iopsPerTiB * tib : null;
    const iops = cap(t.iopsPerTiB, t.capIops, o.serviceMaxIops);
    const mbps = cap(t.mbpsPerTiB, t.capMbps, o.serviceMaxMbps);
    const perUnitIops = t.iopsPerTiB ? Math.min(t.iopsPerTiB * perUnitTiB, t.capIops || Infinity) : null;
    const perUnitMbps = t.mbpsPerTiB ? Math.min(t.mbpsPerTiB * perUnitTiB, t.capMbps || Infinity) : null;
    return {
      iops, mbps, unit, units, perUnitTiB, perUnitIops, perUnitMbps,
      atUnitMax: !!(t.capIops && t.iopsPerTiB * perUnitTiB >= t.capIops),
      serviceCapped: !!(o.serviceMaxIops && iops >= o.serviceMaxIops),
      wIops: t.writeIopsPerTiB ? t.writeIopsPerTiB * tib : null,
      wMbps: t.writeMbpsPerTiB ? t.writeMbpsPerTiB * tib : null,
      limited: !!(linearIops && iops && iops < linearIops - 1),
      overUnits: !!(o.maxUnits && units > o.maxUnits)
    };
  }
  // Per-unit figure first — that is what each provider's own calculator shows —
  // then the total across the units the capacity needs.
  function perUnitText(o, t) {
    if (!t) return "—";
    if (t.fixedMbps) return `${num(t.fixedMbps)} ${t.mib ? "MiB/s" : "MB/s"} ${o.capScope}`;
    const bits = [];
    if (t.capIops) bits.push(`${num(t.capIops)} IOPS`);
    if (t.capMbps) bits.push(`${mb(t.capMbps)} ${t.mib ? "MiB/s" : "MB/s"}`);
    return bits.length ? `${bits.join(" · ")} max ${o.capScope}` : "No published per-unit maximum";
  }
  // "32 volumes × 25,000 IOPS each = 800,000 IOPS in total"
  function totalText(o, p) {
    if (!p) return "";
    if (p.fixed) return "same at any capacity";
    if (!p.iops && !p.mbps) return "throughput-based QoS";
    const label = (o.unitLabel || "volume") + (p.units > 1 ? "s" : "");
    if (p.iops) return p.units > 1
      ? `${p.units} ${label} × ${num(p.perUnitIops)} IOPS each = ${num(p.iops)} IOPS in total`
      : `1 ${label} at ${num(p.iops)} IOPS`;
    return `${p.units} ${label} × ${mb(p.perUnitMbps)} ${p.unit} each = ${mb(p.mbps)} ${p.unit} in total`;
  }
  const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);

  // ---------- picker cards ----------
  function renderPickers() {
    $("#pickers").innerHTML = D.order.map(pid => {
      const p = D.platforms[pid], list = optsFor(pid, state.kind);
      if (!list.length) {
        return `<div class="card pv off"><div class="pv-head"><span class="dot" style="background:${p.accent}"></span>
            <div><div class="pv-name">${esc(p.name)}</div><div class="pv-sub">${esc(p.regionName)}</div></div></div>
          <div class="pv-body"><div class="nosupport"><b>No ${esc(state.kind)} option</b>
            <span>${esc((D.gaps[state.kind] || {})[pid] || "")}</span></div></div></div>`;
      }
      const o = chosen(pid), t = tierOf(o), pf = perf(o, t, state.tib, state.units[pid]), cost = monthly(o, t);
      return `<div class="card pv${p.baseline ? " base" : ""}${o.partner ? " partner" : ""}" data-pid="${pid}">
        <div class="pv-head"><span class="dot" style="background:${p.accent}"></span>
          <div><div class="pv-name">${esc(p.name)}${p.baseline ? '<span class="tag">BASELINE</span>' : ""}</div>
            <div class="pv-sub">${esc(p.regionName)}</div></div></div>
        <div class="pv-body">
          <label>Service
            <select data-k="opt">${list.map(x => `<option value="${x.id}" ${x === o ? "selected" : ""}>${esc(x.name)}${x.partner ? " (partner)" : ""}</option>`).join("")}</select></label>
          ${o.tiers ? `<label>Tier / performance level
            <select data-k="tier">${o.tiers.map(x => `<option value="${x.id}" ${x === t ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select></label>`
            : `<div class="chip warn">No published tiers</div>`}
          <div class="chips">
            <span class="chip">${esc(o.protocol)}</span>
            <span class="chip">${esc(o.datastore)}</span>
            <span class="chip">${esc(o.media)}</span>
          </div>
          ${pf && !pf.fixed && o.unitMaxTiB ? `<label>${esc(cap1(o.unitLabel || "volume"))}s the capacity is split into
            <input type="number" data-k="units" min="${minUnits(o, state.tib)}" max="${o.maxUnits || 999}" value="${pf.units}">
            <span class="hint">${pf.units} × ${pf.perUnitTiB.toFixed(pf.perUnitTiB < 10 ? 2 : 1)} TiB each${bestUnits(o, t, state.tib) > pf.units ? ` · up to ${bestUnits(o, t, state.tib)} adds more total IOPS` : ""}</span></label>` : ""}
          <div class="foot-row">
            <div class="perf">${esc(perUnitText(o, t))}<span>${esc(totalText(o, pf))}</span></div>
            <div class="rate">${o.priceOnRequest ? "on request" : usd(cost, 0)}<span>per month</span></div>
          </div>
        </div></div>`;
    }).join("");
  }

  // ---------- comparison table ----------
  function renderTable() {
    const cols = D.order.map(pid => {
      const o = chosen(pid);
      if (!o) return { pid, none: true, platform: D.platforms[pid] };
      const t = tierOf(o);
      return { pid, platform: D.platforms[pid], o, t, cost: monthly(o, t), pf: perf(o, t, state.tib, state.units[pid]), slice: perf(o, t, SLICE / 1024, 1) };
    });
    const base = cols[0];
    const notes = [];
    const mark = txt => {
      if (!notes.includes(txt)) notes.push(txt);
      return String(notes.indexOf(txt) + 1).replace(/\d/g, d => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]);
    };

    const rows = [];
    const sec = t => rows.push({ section: t });
    const row = (label, fn, o = {}) => rows.push({ label, cells: cols.map(fn), ...o });
    const na = "—";

    sec("CONFIGURATION");
    row("Region", c => c.none ? na : c.platform.regionName);
    row("Service", c => c.none ? "Not supported" : c.o.name);
    row("Tier / performance level", c => c.none ? na : (c.t ? c.t.label : "n/a"));
    row("Ownership", c => c.none ? na : c.o.ownership);

    sec("PROTOCOL & MEDIA");
    row("Protocol", c => c.none ? na : c.o.protocol);
    row("Datastore type", c => c.none ? na : c.o.datastore);
    row("Media", c => c.none ? na : c.o.media);
    row("Minimum size", c => c.none ? na : c.o.minSize);
    row("Maximum size", c => c.none ? na : c.o.maxSize);

    sec("PERFORMANCE");
    row("How performance scales", c => c.none ? na : c.o.scaling);
    row("IOPS rate, and where it stops", c => {
      if (c.none) return na;
      if (!c.t) return "not published";
      if (c.t.fixedMbps) return "n/a — fixed per mount target";
      if (!c.t.iopsPerTiB) return "not published";
      const rate = c.t.iopsPerGB ? `${num(c.t.iopsPerGB)} IOPS per GB` : `${num(c.t.iopsPerTiB)} IOPS per TiB`;
      if (!c.t.capIops) return rate + (c.t.writeIopsPerTiB ? ` read · ${num(c.t.writeIopsPerTiB)} write per TiB` : "");
      const atTiB = c.t.capIops / c.t.iopsPerTiB;
      const at = atTiB < 1 ? `${num(atTiB * 1024)} GB` : `${atTiB.toFixed(atTiB < 10 ? 1 : 0)} TiB`;
      return `${rate}, until the volume reaches ${at} — bigger volumes stay at ${num(c.t.capIops)}`;
    });
    row("Throughput rate, and where it stops", c => {
      if (c.none) return na;
      if (!c.t) return "not published";
      if (c.t.fixedMbps) return "n/a — fixed per mount target";
      if (!c.t.mbpsPerTiB) return "not published";
      const u = c.t.mib ? "MiB/s" : "MB/s";
      const rate = c.t.kbpsPerGB ? `${num(c.t.kbpsPerGB)} KB/s per GB` : `${mb(c.t.mbpsPerTiB)} ${u} per TiB`;
      if (!c.t.capMbps) return rate + (c.t.writeMbpsPerTiB ? ` read · ${mb(c.t.writeMbpsPerTiB)} write per TiB` : "");
      const atTiB = c.t.capMbps / c.t.mbpsPerTiB;
      const at = atTiB < 1 ? `${num(atTiB * 1024)} GB` : `${atTiB.toFixed(atTiB < 10 ? 1 : 0)} TiB`;
      return `${rate}, until the volume reaches ${at} — bigger volumes stay at ${mb(c.t.capMbps)} ${u}`;
    });
    row("Maximum for one volume / instance", c => {
      if (c.none || !c.t) return na;
      if (c.t.fixedMbps) return `${mb(c.t.fixedMbps)} ${c.t.mib ? "MiB/s" : "MB/s"} ${c.o.capScope}`;
      const bits = [];
      if (c.t.capIops) bits.push(`${num(c.t.capIops)} IOPS`);
      if (c.t.capMbps) bits.push(`${mb(c.t.capMbps)} ${c.t.mib ? "MiB/s" : "MB/s"}`);
      return bits.length ? `${bits.join(" · ")} ${c.o.capScope}` : "Not published";
    });
    row("Capacity limit for one volume / instance", c => {
      if (c.none) return na;
      return c.o.unitMaxTiB ? `${c.o.unitMaxTiB} TiB ${c.o.capScope}` : "Not published";
    });
    row(`How ${state.tib} TiB is split`, c => {
      if (c.none || !c.pf) return na;
      const n = c.pf.units, label = (c.o.unitLabel || "volume") + (n > 1 ? "s" : "");
      if (c.pf.fixed) return "1 mount target";
      return n > 1 ? `${n} ${label} × ${(c.pf.perUnitTiB).toFixed(c.pf.perUnitTiB < 10 ? 2 : 1)} TiB each`
                   : `1 ${label} of ${(c.pf.perUnitTiB).toFixed(c.pf.perUnitTiB < 10 ? 2 : 1)} TiB`;
    });
    row("IOPS per volume / instance", c => {
      if (c.none || !c.pf || c.pf.fixed) return na;
      if (!c.pf.perUnitIops) return "not published";
      return num(c.pf.perUnitIops) + (c.pf.atUnitMax ? ` (at the ${num(c.t.capIops)} maximum)` : ` (below the ${num(c.t.capIops)} maximum)`);
    });
    row(`Total IOPS at ${state.tib} TiB`, c => {
      if (c.none || !c.pf) return na;
      if (c.pf.fixed) return "n/a";
      if (!c.pf.iops) return "not published";
      const sum = `${c.pf.units} × ${num(c.pf.perUnitIops)} = ${num(c.pf.iops)}`;
      return sum + (c.pf.wIops ? ` (read)` : "") +
        (c.pf.serviceCapped ? mark(`${c.o.name}: the service-wide maximum of ${num(c.o.serviceMaxIops)} IOPS applies, so the total stops there however the capacity is split.`) : "");
    }, { strong: true });
    row(`Total throughput at ${state.tib} TiB`, c => {
      if (c.none || !c.pf) return na;
      if (!c.pf.mbps) return "not published";
      return (c.pf.fixed ? `${mb(c.pf.mbps)} ${c.pf.unit}` : `${c.pf.units} × ${mb(c.pf.perUnitMbps)} = ${mb(c.pf.mbps)} ${c.pf.unit}`) +
        (c.pf.wMbps ? ` read · ${mb(c.pf.wMbps)} write` : "") +
        (c.pf.fixed ? mark(`${c.o.name}: throughput comes from the mount target, so it is the same at any capacity.`) : "");
    }, { strong: true });
    row(`One ${SLICE} GB volume on its own`, c => {
      if (c.none || !c.slice) return na;
      if (c.slice.fixed) return `${mb(c.slice.mbps)} ${c.slice.unit} — same as at ${state.tib} TiB`;
      const bits = [];
      if (c.slice.iops) bits.push(`${num(c.slice.iops)} IOPS`);
      if (c.slice.mbps) bits.push(`${mb(c.slice.mbps)} ${c.slice.unit}`);
      return bits.length ? bits.join(" · ") : "not published";
    });

    sec(`PRICING  ·  LIST  ·  ${state.hours} HOURS / MONTH`);
    row("Rate per unit-month", c => {
      if (c.none) return na;
      if (c.o.priceOnRequest) return "on request";
      return `$${unitRate(c.t).toFixed(4)} / ${c.o.unit}` +
        (c.t.priceHr != null ? mark(`${c.o.name} is billed per ${c.o.unit}-hour ($${c.t.priceHr.toFixed(6)}); monthly = rate × ${state.hours} h.`) : "");
    });
    row("Per TiB / month", c => c.none ? na : (c.o.priceOnRequest ? "on request" : usd(c.cost / state.tib)));
    row(`${state.tib} TiB / month`, c => c.none ? na : (c.o.priceOnRequest ? "on request" : usd(c.cost, 0)), { strong: true });
    row("3-year total (36 months)", c => c.none ? na : (c.o.priceOnRequest ? "on request" : usd(c.cost * 36, 0)));

    const callouts = [];
    if (base && !base.none && base.cost) {
      sec("SAVINGS vs OCVS");
      const diff = (c, mult) => {
        if (c === base) return "—";
        if (c.none || c.o.priceOnRequest) return "n/a";
        const d = (c.cost - base.cost) * mult;
        const pct = Math.round(Math.abs((c.cost - base.cost) / c.cost) * 100);
        return `${d < 0 ? "−" : ""}${usd(Math.abs(d), 0)} (${pct}%${d < 0 ? " more for OCVS" : ""})`;
      };
      row("Monthly saving with OCVS", c => diff(c, 1), { savings: true });
      row("3-year saving with OCVS", c => diff(c, 36), { savings: true });

      for (const c of cols) {
        if (c === base || c.none || c.o.priceOnRequest) continue;
        const cheaper = c.cost > base.cost;
        callouts.push({
          positive: cheaper,
          title: `${Math.abs(Math.round((c.cost - base.cost) / c.cost * 100))}% ${cheaper ? "lower" : "higher"} than ${c.platform.name}`,
          sub: `${cheaper ? "Save" : "Costs"} ${short(Math.abs((c.cost - base.cost) * 36))} ${cheaper ? "" : "more "}over 3 years · ${c.o.name}`
        });
      }
    }

    let h = `<thead><tr><th>Storage / configuration</th>${cols.map((c, i) =>
      `<th class="${i === 0 ? "base" : ""}">${esc(c.platform.name)}</th>`).join("")}</tr></thead><tbody>`;
    for (const r of rows) {
      if (r.section) { h += `<tr class="sec"><td colspan="${cols.length + 1}">${esc(r.section)}</td></tr>`; continue; }
      h += `<tr class="${r.strong ? "strong" : ""} ${r.savings ? "savings" : ""}"><th>${esc(r.label)}</th>${r.cells.map((cell, i) =>
        `<td class="${i === 0 ? "base" : ""} ${String(cell).startsWith("−") ? "neg" : ""} ${cell === "Not supported" ? "na" : ""}">${esc(cell)}</td>`).join("")}</tr>`;
    }
    $("#result").innerHTML = h + "</tbody>";
    $("#callouts").innerHTML = callouts.map(c =>
      `<div class="callout ${c.positive ? "" : "neg"}"><strong>${esc(c.title)}</strong><span>${esc(c.sub)}</span></div>`).join("");

    const perNotes = cols.filter(c => !c.none).flatMap(c => c.o.notes.map(n => `${c.o.name} — ${n}`));
    $("#notes").innerHTML = notes.map(n => `<li>${esc(n)}</li>`).join("") +
      perNotes.map(n => `<li class="plain">${esc(n)}</li>`).join("");
    $("#head-sub").textContent = `${state.tib} TiB · ${state.kind === "block" ? "block (iSCSI)" : "file (NFS)"} · Frankfurt · list prices as of ${D.asOf}`;
  }

  function update() {
    document.querySelectorAll(".seg button").forEach(b => b.classList.toggle("on", b.dataset.v === state.kind));
    $("#cap").value = state.tib; $("#hours").value = state.hours;
    $("#units").textContent = (state.tib * U).toLocaleString("en-US");
    renderPickers(); renderTable();
  }

  document.addEventListener("click", e => {
    const seg = e.target.closest(".seg button");
    if (seg) { state.kind = seg.dataset.v; return update(); }
    if (e.target.closest("#reset")) { state = { ...DEFAULTS, sel: {}, tier: {}, units: {} }; return update(); }
  });
  document.addEventListener("change", e => {
    const el = e.target;
    if (el.id === "cap") { state.tib = Math.max(1, Math.min(1000, +el.value || 1)); return update(); }
    if (el.id === "hours") { state.hours = Math.max(1, Math.min(744, +el.value || 730)); return update(); }
    const card = el.closest("[data-pid]");
    if (!card) return;
    const pid = card.dataset.pid;
    if (el.dataset.k === "opt") state.sel[pid] = el.value;
    if (el.dataset.k === "tier") state.tier[chosen(pid).id] = el.value;
    if (el.dataset.k === "units") {
      const o = chosen(pid);
      state.units[pid] = Math.max(minUnits(o, state.tib), Math.min(o.maxUnits || 999, +el.value || 1));
    }
    update();
  });

  update();
})();
