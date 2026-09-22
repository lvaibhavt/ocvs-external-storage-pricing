(function () {
  const D = window.STORAGE;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const usd = (n, dp) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: dp ?? (n < 1000 ? 2 : 0), maximumFractionDigits: dp ?? (n < 1000 ? 2 : 0) });
  const num = n => Math.round(n).toLocaleString("en-US");
  const mb = n => Math.floor(n).toLocaleString("en-US");   // throughput rounds down, like the OCI estimator
  const U = D.unitsPerTiB;

  // A datastore is one volume (or one file system / instance), grown in whole TiB.
  // Only when the capacity is bigger than one volume can be does it use more.
  const DEFAULTS = { kind: "block", tib: 20, hours: D.defaultHours };
  let state = { ...DEFAULTS, sel: {}, tier: {} };

  const optsFor = (pid, kind) => D.options.filter(o => o.platform === pid && o.kind === kind);
  function chosen(pid) {
    const list = optsFor(pid, state.kind);
    return list.length ? (list.find(o => o.id === state.sel[pid]) || list[0]) : null;
  }
  function tierOf(o) {
    if (!o || !o.tiers) return null;
    return o.tiers.find(t => t.id === state.tier[o.id]) || o.tiers.find(t => t.default) || o.tiers[0];
  }
  const unitRate = t => (t ? (t.priceHr != null ? t.priceHr * state.hours : t.price) : null);
  const monthly = (o, t) => (o && t && !o.priceOnRequest ? unitRate(t) * state.tib * U : null);

  // Expected performance of the datastore at the chosen capacity.
  function perf(o, t, tib) {
    if (!o || !t) return null;
    const unit = t.mib ? "MiB/s" : "MB/s";
    if (t.fixedMbps) return { mbps: t.fixedMbps, unit, fixed: true, units: 1 };
    const units = o.unitMaxTiB ? Math.max(1, Math.ceil(tib / o.unitMaxTiB)) : 1;
    const each = tib / units;
    const one = (perTiB, max) => (perTiB ? Math.min(perTiB * each, max || Infinity) : null);
    let iops = one(t.iopsPerTiB, t.capIops), mbps = one(t.mbpsPerTiB, t.capMbps);
    if (iops != null) iops *= units;
    if (mbps != null) mbps *= units;
    if (o.serviceMaxIops && iops) iops = Math.min(iops, o.serviceMaxIops);
    if (o.serviceMaxMbps && mbps) mbps = Math.min(mbps, o.serviceMaxMbps);
    return { iops, mbps, unit, units,
      wIops: t.writeIopsPerTiB ? t.writeIopsPerTiB * tib : null,
      wMbps: t.writeMbpsPerTiB ? t.writeMbpsPerTiB * tib : null };
  }
  function perfText(p) {
    if (!p) return "—";
    if (p.fixed) return `${mb(p.mbps)} ${p.unit}`;
    const bits = [];
    if (p.iops) bits.push(`${num(p.iops)} IOPS`);
    if (p.mbps) bits.push(`${mb(p.mbps)} ${p.unit}`);
    return bits.length ? bits.join(" · ") : "throughput-based";
  }
  // "60 IOPS/GB · 480 KB/s per GB", as the OCI estimator words it
  function rateText(t) {
    if (!t) return "not published";
    if (t.fixedMbps) return "Set by the mount target, not by capacity";
    const u = t.mib ? "MiB/s" : "MB/s";
    const i = t.iopsPerGB ? `${num(t.iopsPerGB)} IOPS per GB` : t.iopsPerTiB ? `${num(t.iopsPerTiB)} IOPS per TiB` : null;
    const m = t.kbpsPerGB ? `${num(t.kbpsPerGB)} KB/s per GB` : t.mbpsPerTiB ? `${mb(t.mbpsPerTiB)} ${u} per TiB` : null;
    return [i, m].filter(Boolean).join(" · ") || "not published";
  }
  function maxText(o, t) {
    if (!t) return "not published";
    const u = t.mib ? "MiB/s" : "MB/s";
    if (t.fixedMbps) return `${mb(t.fixedMbps)} ${u} per mount target`;
    const bits = [];
    if (t.capIops) bits.push(`${num(t.capIops)} IOPS`);
    if (t.capMbps) bits.push(`${mb(t.capMbps)} ${u}`);
    return bits.length ? `${bits.join(" · ")} per ${o.unitLabel || "volume"}` : "No published maximum";
  }

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
      const o = chosen(pid), t = tierOf(o), pf = perf(o, t, state.tib), cost = monthly(o, t);
      return `<div class="card pv${p.baseline ? " base" : ""}${o.partner ? " partner" : ""}" data-pid="${pid}">
        <div class="pv-head"><span class="dot" style="background:${p.accent}"></span>
          <div><div class="pv-name">${esc(p.name)}${p.baseline ? '<span class="tag">BASELINE</span>' : ""}</div>
            <div class="pv-sub">${esc(p.regionName)}</div></div></div>
        <div class="pv-body">
          <label>Service
            <select data-k="opt">${list.map(x => `<option value="${x.id}" ${x === o ? "selected" : ""}>${esc(x.name)}${x.partner ? " (partner)" : ""}</option>`).join("")}</select></label>
          ${o.tiers ? `<label>Performance level
            <select data-k="tier">${o.tiers.map(x => `<option value="${x.id}" ${x === t ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select></label>`
            : `<div class="chip warn">No published tiers</div>`}
          <div class="chips">
            <span class="chip">${esc(o.protocol)}</span>
            <span class="chip">${esc(o.datastore)}</span>
            <span class="chip">${esc(o.media)}</span>
          </div>
          <div class="foot-row">
            <div class="perf">${o.priceOnRequest ? "Not published" : esc(perfText(pf))}<span>expected at ${state.tib} TiB</span></div>
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
      return { pid, platform: D.platforms[pid], o, t, cost: monthly(o, t), pf: perf(o, t, state.tib) };
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
    const por = c => c.o.priceOnRequest;

    sec("CONFIGURATION");
    row("Region", c => c.none ? na : c.platform.regionName);
    row("Service", c => c.none ? "Not supported" : c.o.name);
    row("Performance level", c => c.none ? na : (c.t ? c.t.label : "n/a"));
    row("Ownership", c => c.none ? na : c.o.ownership);

    sec("PROTOCOL & MEDIA");
    row("Protocol", c => c.none ? na : c.o.protocol);
    row("Datastore type", c => c.none ? na : c.o.datastore);
    row("Media", c => c.none ? na : c.o.media);
    row("Size limits", c => c.none ? na : `${c.o.minSize} to ${c.o.maxSize}`);

    sec("PERFORMANCE");
    row("Performance rate", c => c.none ? na : (por(c) ? "not published" : rateText(c.t)));
    row("Maximum per volume", c => c.none ? na : (por(c) ? "not published" : maxText(c.o, c.t)));
    row(`Expected IOPS at ${state.tib} TiB`, c => {
      if (c.none || por(c) || !c.pf) return c.none ? na : "not published";
      if (c.pf.fixed) return "n/a";
      if (!c.pf.iops) return "not published";
      const extra = c.pf.units > 1 ? mark(`${c.o.name}: ${state.tib} TiB is larger than one ${c.o.unitLabel} can be (${c.o.unitMaxTiB} TiB), so this datastore needs ${c.pf.units} ${c.o.unitLabel}s.`) : "";
      return num(c.pf.iops) + (c.pf.wIops ? ` read · ${num(c.pf.wIops)} write` : "") + extra;
    }, { strong: true });
    row(`Expected throughput at ${state.tib} TiB`, c => {
      if (c.none || por(c) || !c.pf) return c.none ? na : "not published";
      if (!c.pf.mbps) return "not published";
      return `${mb(c.pf.mbps)} ${c.pf.unit}` + (c.pf.wMbps ? ` read · ${mb(c.pf.wMbps)} write` : "");
    }, { strong: true });

    sec(`MONTHLY PRICE  ·  LIST  ·  ${state.hours} HOURS`);
    row("Rate", c => {
      if (c.none) return na;
      if (por(c)) return "on request";
      return `$${unitRate(c.t).toFixed(4)} per ${c.o.unit} per month` +
        (c.t.priceHr != null ? mark(`${c.o.name} is billed per ${c.o.unit}-hour ($${c.t.priceHr.toFixed(6)}), so the monthly rate is × ${state.hours} hours.`) : "");
    });
    row("Per TiB", c => c.none ? na : (por(c) ? "on request" : usd(c.cost / state.tib)));
    row(`${state.tib} TiB per month`, c => c.none ? na : (por(c) ? "on request" : usd(c.cost, 0)), { strong: true });

    const callouts = [];
    if (base && !base.none && base.cost) {
      sec("SAVINGS vs OCVS");
      row("Monthly saving with OCVS", c => {
        if (c === base) return "—";
        if (c.none || por(c)) return "n/a";
        const d = c.cost - base.cost;
        const pct = Math.round(Math.abs(d / c.cost) * 100);
        return `${d < 0 ? "−" : ""}${usd(Math.abs(d), 0)} (${pct}%${d < 0 ? " more for OCVS" : ""})`;
      }, { savings: true });
      for (const c of cols) {
        if (c === base || c.none || por(c)) continue;
        const cheaper = c.cost > base.cost;
        callouts.push({
          positive: cheaper,
          title: `${Math.abs(Math.round((c.cost - base.cost) / c.cost * 100))}% ${cheaper ? "lower" : "higher"} than ${c.platform.name}`,
          sub: `${cheaper ? "Save" : "Costs"} ${usd(Math.abs(c.cost - base.cost), 0)} ${cheaper ? "" : "more "}per month · ${c.o.name}`
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
    $("#notes").innerHTML = notes.map(n => `<li>${esc(n)}</li>`).join("");

    // per-service notes, tucked away
    $("#svc-notes").innerHTML = cols.filter(c => !c.none).map(c =>
      `<details><summary>${esc(c.platform.name)} — ${esc(c.o.name)}</summary><ul>${c.o.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>
        <p class="links">${c.o.links.map(([l, href]) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(l)}</a>`).join(" · ")}</p></details>`).join("");
    $("#head-sub").textContent = `${state.tib} TiB datastore · ${state.kind === "block" ? "block (iSCSI)" : "file (NFS)"} · Frankfurt · list prices as of ${D.asOf}`;
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
    if (e.target.closest("#reset")) { state = { ...DEFAULTS, sel: {}, tier: {} }; return update(); }
  });
  document.addEventListener("change", e => {
    const el = e.target;
    if (el.id === "cap") { state.tib = Math.max(1, Math.min(1000, Math.round(+el.value) || 1)); return update(); }
    if (el.id === "hours") { state.hours = Math.max(1, Math.min(744, +el.value || 730)); return update(); }
    const card = el.closest("[data-pid]");
    if (!card) return;
    const pid = card.dataset.pid;
    if (el.dataset.k === "opt") state.sel[pid] = el.value;
    if (el.dataset.k === "tier") state.tier[chosen(pid).id] = el.value;
    update();
  });

  update();
})();
