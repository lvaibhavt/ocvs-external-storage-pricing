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
  const RG = window.STORAGE_REGIONS;
  const DEFAULTS = { kind: "block", tib: 20, hours: D.defaultHours, showPerf: false, showTiers: false, showInfo: false };   // performance-level pickers hidden; defaults used   // performance hidden by default
  // Discounts: off by default; one % per platform, applied to that platform's list price.
  const fresh0 = () => ({ discOn: false, disc: { ocvs: 0, gcve: 0, avs: 0, evs: 0 } });
  const discPct = pid => (state.discOn ? Math.max(0, Math.min(99, +state.disc[pid] || 0)) : 0);
  const net = (pid, list) => (list == null ? null : list * (1 - discPct(pid) / 100));
  // GCVE defaults to Filestore, its cheaper NFS option, so the comparison stays conservative.
  // FSx: dedupe/compression 0% (like-for-like with the other services, which bill provisioned
  // capacity) and 128 MBps throughput capacity, the smallest file system AWS offers.
  const fresh = () => ({ ...DEFAULTS, sel: { gcve: "filestore" }, tier: {}, term: {}, prot: {}, region: { ...RG.defaults },
                         fsxDR: 0, fsxMbps: 128, ...fresh0() });
  let state = fresh();

  const regionsOf = pid => RG.platforms[pid];
  const regionOf = pid => regionsOf(pid).find(r => r.id === state.region[pid]) || regionsOf(pid)[0];
  // The tool compares block (iSCSI) datastores. GCVE has no block option at all,
  // so its NFS options stand in for it, clearly flagged everywhere they appear.
  const usesNfsFallback = pid => pid === "gcve";
  const allOpts = (pid) => D.options.filter(o => o.platform === pid &&
    (usesNfsFallback(pid) ? (o.kind === "vsan" || o.kind === "file") : o.kind === "block"));
  const availIn = (pid, o) => (regionOf(pid).avail || {})[o.id];
  const optsFor = (pid) => allOpts(pid).filter(o => availIn(pid, o));
  function chosen(pid) {
    const list = optsFor(pid);
    return list.length ? (list.find(o => o.id === state.sel[pid]) || list[0]) : null;
  }
  // Tier with this region's price applied (the data file holds Frankfurt prices).
  function tierOf(o) {
    if (!o || !o.tiers) return null;
    const avail = availIn(o.platform, o) || {};
    const list = o.tiers.filter(t => !(t.id in avail) || avail[t.id] != null);
    const t = (state.showTiers && list.find(t => t.id === state.tier[o.id])) || list.find(t => t.default) || list[0];
    if (!t) return null;
    const p = avail[t.id];
    if (p == null) return t;
    if (o.nodeBased) return { ...t, priceHr: p[termOf(o).idx] };
    return t.priceHr != null ? { ...t, priceHr: p } : { ...t, price: p };
  }
  const termOf = o => o.terms.find(x => x.id === state.term[o.id]) || o.terms.find(x => x.default);
  const protOf = o => o.protections.find(x => x.id === state.prot[o.id]) || o.protections.find(x => x.default);
  // Storage-only nodes: usable TiB per node = raw TB (decimal) in TiB x protection factor.
  const usableTiB = (o, t) => t.rawTB * 1e12 / 2 ** 40 * protOf(o).factor;
  const nodesFor = (o, t) => Math.max(1, Math.ceil(state.tib / usableTiB(o, t)));
  function tiersIn(o) {
    const avail = availIn(o.platform, o) || {};
    return o.tiers.filter(t => !(t.id in avail) || avail[t.id] != null);
  }
  const unitRate = t => (t ? (t.priceHr != null ? t.priceHr * state.hours : t.price) : null);
  const monthly = (o, t) => {
    if (!o || !t || o.priceOnRequest) return null;
    if (o.nodeBased) return nodesFor(o, t) * t.priceHr * state.hours;
    if (isFsx(o)) return fsxStorage(o, t) + fsxThroughput(o, t);
    return unitRate(t) * state.tib * U;
  };
  // Same steps as the AWS pricing calculator: capacity x (1 - savings), at least 1,024 GB of SSD,
  // plus throughput capacity per MBps-month.
  const isFsx = o => o && o.id.startsWith("fsx-");
  // FSx dedupe and throughput are editable only with "Choose performance level" on; otherwise 0% and 128 MBps.
  const fdr = () => (state.showTiers ? state.fsxDR : 0), fmb = () => (state.showTiers ? state.fsxMbps : 128);
  const fsxGB = () => Math.max(state.tib * U * (1 - fdr() / 100), 1024);
  const fsxStorage = (o, t) => fsxGB() * t.price;
  const fsxTputRate = (o, t) => ((availIn(o.platform, o) || {})._tput || {})[t.id] ?? t.mbpsPrice ?? 0;
  const fsxThroughput = (o, t) => fmb() * fsxTputRate(o, t);

  // Expected performance of the datastore at the chosen capacity.
  function perf(o, t, tib) {
    if (!o || !t) return null;
    if (o.nodeBased) return { nodeBased: true };
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
    if (p.nodeBased) return "vSAN, not published per node";
    if (p.fixed) return `${mb(p.mbps)} ${p.unit}`;
    const bits = [];
    if (p.iops) bits.push(`${num(p.iops)} IOPS`);
    if (p.mbps) bits.push(`${mb(p.mbps)} ${p.unit}`);
    return bits.length ? bits.join(" · ") : "throughput-based";
  }
  // "60 IOPS/GB · 480 KB/s per GB", as the OCI estimator words it
  function rateText(t) {
    if (!t) return "not published";
    if (t.rawTB) return "vSAN performance is not published per storage-only node";
    if (t.fixedMbps) return "Set by the mount target, not by capacity";
    const u = t.mib ? "MiB/s" : "MB/s";
    const i = t.iopsPerGB ? `${num(t.iopsPerGB)} IOPS per GB` : t.iopsPerTiB ? `${num(t.iopsPerTiB)} IOPS per TiB` : null;
    const m = t.kbpsPerGB ? `${num(t.kbpsPerGB)} KB/s per GB` : t.mbpsPerTiB ? `${mb(t.mbpsPerTiB)} ${u} per TiB` : null;
    return [i, m].filter(Boolean).join(" · ") || "not published";
  }
  function maxText(o, t) {
    if (!t) return "not published";
    if (o.nodeBased) return "Up to 50% of the cluster's nodes";
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
      const p = D.platforms[pid], list = optsFor(pid), reg = regionOf(pid);
      const regionSel = `<label>Region (${regionsOf(pid).length} with ${esc(p.name)})
          <select data-k="region">${regionsOf(pid).map(r => `<option value="${esc(r.id)}" ${r.id === reg.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select></label>`;
      if (!list.length) {
        const missing = allOpts(pid).map(o => o.name).join(" or ");
        return `<div class="card pv off" data-pid="${pid}"><div class="pv-head"><span class="dot" style="background:${p.accent}"></span>
            <div><div class="pv-name">${esc(p.name)}</div><div class="pv-sub">${esc(p.longName)}</div></div></div>
          <div class="pv-body">${regionSel}<div class="nosupport"><b>No external storage in this region</b>
            <span>${esc(`${missing} is not available as a datastore in ${reg.name}.`)}</span></div></div></div>`;
      }
      const o = chosen(pid), t = tierOf(o), pf = perf(o, t, state.tib), cost = net(pid, monthly(o, t));
      return `<div class="card pv${p.baseline ? " base" : ""}${o.partner ? " partner" : ""}" data-pid="${pid}">
        <div class="pv-head"><span class="dot" style="background:${p.accent}"></span>
          <div><div class="pv-name">${esc(p.name)}${usesNfsFallback(pid) ? `<span class="info" tabindex="0" role="button" aria-label="Why GCVE is different">i<span class="info-pop" role="tooltip"><b>No block option on GCVE.</b> Google supports no iSCSI/VMFS datastore for VMware Engine, so its alternatives are compared instead: storage-only nodes (extra vSAN) or NFS from Filestore / NetApp Volumes.</span></span>` : ""}${p.baseline ? '<span class="tag">BASELINE</span>' : ""}</div>
            <div class="pv-sub">${esc(p.longName)}</div></div></div>
        <div class="pv-body">
          ${regionSel}
          <label>Service
            <select data-k="opt">${list.map(x => `<option value="${x.id}" ${x === o ? "selected" : ""}>${esc(x.name)}${x.partner ? " (partner)" : ""}</option>`).join("")}</select></label>
          ${!state.showTiers ? "" : o.tiers ? `<label>Performance level
            <select data-k="tier">${tiersIn(o).map(x => `<option value="${x.id}" ${t && x.id === t.id ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select>
            ${t && t.desc ? `<span class="tier-desc">${esc(t.desc)}</span>` : ""}</label>`
            : `<div class="chip warn">No published tiers</div>`}
          ${o.nodeBased ? `<label>Commitment
            <select data-k="term">${o.terms.map(x => `<option value="${x.id}" ${x.id === termOf(o).id ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select></label>
          <label>vSAN protection
            <select data-k="prot">${o.protections.map(x => `<option value="${x.id}" ${x.id === protOf(o).id ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select></label>
          <div class="so-box"><b>${nodesFor(o, t)} × ${esc(t.id)}</b> for ${state.tib} TiB usable<br>
            ${(nodesFor(o, t) * t.rawTB).toFixed(1)} TB raw · ${(nodesFor(o, t) * usableTiB(o, t)).toFixed(1)} TiB usable (${esc(protOf(o).label.split(" — ")[0])})</div>` : ""}
          ${isFsx(o) && state.showTiers ? `<div class="row2">
            <label>Dedupe + compression savings
              <input type="number" data-k="fsxDR" min="0" max="90" step="5" value="${state.fsxDR}"><span class="hint">% — AWS calculator pre-fills 65</span></label>
            <label>Throughput capacity (MBps)
              <input type="number" data-k="fsxMbps" min="128" max="6144" step="128" value="${state.fsxMbps}"><span class="hint">billed per MBps-month</span></label>
          </div>` : ""}
          <div class="chips">
            <span class="chip">${esc(o.protocol)}</span>
            <span class="chip">${esc(o.datastore)}</span>
            <span class="chip">${esc(o.media)}</span>
          </div>
          <div class="foot-row">
            <div class="perf">${state.showPerf ? `${o.priceOnRequest ? "Not published" : esc(perfText(pf))}<span>${o.nodeBased ? `${nodesFor(o, t)} nodes · ${esc(termOf(o).label)}` : `expected at ${state.tib} TiB`}</span>`
              : `${state.tib} TiB<span>${o.nodeBased ? `${nodesFor(o, t)} nodes · ${esc(termOf(o).label)}` : "datastore"}</span>`}</div>
            <div class="rate">${o.priceOnRequest ? "on request" : usd(cost, 0)}<span>per month</span></div>
          </div>
        </div></div>`;
    }).join("");
  }

  // ---------- comparison table ----------
  function renderTable() {
    const cols = D.order.map(pid => {
      const o = chosen(pid);
      if (!o) return { pid, none: true, platform: D.platforms[pid], region: regionOf(pid) };
      const t = tierOf(o);
      const list = monthly(o, t);
      return { pid, platform: D.platforms[pid], region: regionOf(pid), o, t, list, cost: net(pid, list), pf: perf(o, t, state.tib) };
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
    row("Region", c => c.region.name);
    row("Service", c => c.none ? "Not available in this region" : c.o.name + (usesNfsFallback(c.pid) ? mark(D.gaps.block.gcve) : ""));
    row("Performance level", c => c.none ? na : (c.t ? c.t.label : "n/a"));
    if (state.showInfo) row("What this level means", c => c.none ? na : (c.t && c.t.desc ? c.t.desc : (c.o.priceOnRequest ? "Partner product — sizing and performance set with the vendor" : "—")), { desc: true });
    if (state.showInfo) row("Ownership", c => c.none ? na : c.o.ownership);
    row(`What you buy for ${state.tib} TiB`, c => {
      if (c.none) return na;
      if (c.o.priceOnRequest) return "Sized with the vendor";
      if (c.o.nodeBased) {
        const n = nodesFor(c.o, c.t);
        return `${n} × ${c.t.id} storage-only node${n > 1 ? "s" : ""} = ${(n * c.t.rawTB).toFixed(1)} TB raw, ${(n * usableTiB(c.o, c.t)).toFixed(1)} TiB usable (${protOf(c.o).label.split(" — ")[0]})`;
      }
      if (isFsx(c.o)) return `${state.tib} TiB file system` + (fdr() ? `, billed as ${num(fsxGB())} GB after ${fdr()}% dedupe/compression` : "") + ` + ${num(fmb())} MBps throughput`;
      return `${state.tib} TiB ${c.o.datastore === "NFS" ? "file system" : "volume"}`;
    });

    sec("PROTOCOL & MEDIA");
    row("Protocol", c => c.none ? na : c.o.protocol);
    row("Datastore type", c => c.none ? na : c.o.datastore + (usesNfsFallback(c.pid) ? " (no block option)" : ""));
    row("Media", c => c.none ? na : c.o.media);
    if (state.showInfo) row("Size limits", c => c.none ? na : `${c.o.minSize} to ${c.o.maxSize}`);

    if (state.showPerf) {
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
    }

    sec(`MONTHLY PRICE  ·  LIST  ·  ${state.hours} HOURS`);
    row("Rate", c => {
      if (c.none) return na;
      if (por(c)) return "on request";
      if (c.o.nodeBased) return `$${c.t.priceHr.toFixed(6)} per node-hour × ${state.hours} h × ${nodesFor(c.o, c.t)} nodes (${termOf(c.o).label})`;
      if (isFsx(c.o)) return `$${c.t.price.toFixed(4)} per GB (${usd(fsxStorage(c.o, c.t), 0)}) + $${fsxTputRate(c.o, c.t).toFixed(3)} per MBps (${usd(fsxThroughput(c.o, c.t), 0)})` +
        (fdr() ? mark(`FSx is billed on ${num(fsxGB())} GB, i.e. after ${fdr()}% assumed compression and deduplication, as the AWS calculator does. The other services here bill full provisioned capacity; set 0% for a like-for-like comparison.`) : "");
      return `$${unitRate(c.t).toFixed(4)} per ${c.o.unit} per month` +
        (c.t.priceHr != null ? mark(`${c.o.name} is billed per ${c.o.unit}-hour ($${c.t.priceHr.toFixed(6)}), so the monthly rate is × ${state.hours} hours.`) : "");
    });
    row("Per TiB", c => c.none ? na : (por(c) ? "on request" : usd(c.cost / state.tib)) + (c.o && c.o.nodeBased ? " (of usable TiB requested)" : ""));
    if (state.discOn) {
      row(`${state.tib} TiB per month, list price`, c => c.none ? na : (por(c) ? "on request" : usd(c.list, 0)));
      row("Discount", c => c.none || por(c) ? na : `${discPct(c.pid)}%` + (discPct(c.pid) ? ` (−${usd(c.list - c.cost, 0)})` : ""));
      row(`${state.tib} TiB per month, after discount`, c => c.none ? na : (por(c) ? "on request" : usd(c.cost, 0)), { strong: true });
    } else {
      row(`${state.tib} TiB per month`, c => c.none ? na : (por(c) ? "on request" : usd(c.cost, 0)), { strong: true });
    }

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
      h += `<tr class="${r.strong ? "strong" : ""} ${r.savings ? "savings" : ""} ${r.desc ? "desc" : ""}"><th>${esc(r.label)}</th>${r.cells.map((cell, i) =>
        `<td class="${i === 0 ? "base" : ""} ${String(cell).startsWith("−") ? "neg" : ""} ${/^Not (supported|available)/.test(cell) ? "na" : ""}">${esc(cell)}</td>`).join("")}</tr>`;
    }
    $("#result").innerHTML = h + "</tbody>";
    $("#callouts").innerHTML = callouts.map(c =>
      `<div class="callout ${c.positive ? "" : "neg"}"><strong>${esc(c.title)}</strong><span>${esc(c.sub)}</span></div>`).join("");
    $("#notes").innerHTML = notes.map(n => `<li>${esc(n)}</li>`).join("");

    // per-service notes, tucked away
    $("#svc-notes").innerHTML = cols.filter(c => !c.none).map(c =>
      `<details><summary>${esc(c.platform.name)} — ${esc(c.o.name)}</summary><ul>${c.o.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>
        <p class="links">${c.o.links.map(([l, href]) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(l)}</a>`).join(" · ")}</p></details>`).join("");
    $("#head-sub").textContent = `${state.tib} TiB datastore · block (iSCSI), GCVE compared on NFS · ${state.discOn ? "prices after discount" : "list prices"} as of ${D.asOf}`;

    // Everything the slide needs, so the PPT always matches the page.
    lastReport = { discNote: state.discOn ? `Public list prices less discounts (OCVS ${discPct("ocvs")}%, GCVE ${discPct("gcve")}%, AVS ${discPct("avs")}%, EVS ${discPct("evs")}%)` : "",
      heads: cols.map(c => c.platform.name),
      rows: rows.filter(r => !r.desc),
      callouts, notes,
      subtitle: [`${state.tib} TiB datastore`, "Block (iSCSI) · GCVE on its non-block alternative", state.discOn ? `Monthly prices after discount (OCVS ${discPct("ocvs")}%, GCVE ${discPct("gcve")}%, AVS ${discPct("avs")}%, EVS ${discPct("evs")}%)` : "Monthly list prices", `${state.hours} hours/month for hourly-billed services`].join("  ·  "),
      sources: cols.filter(c => !c.none).map(c => ({
        platform: c.platform.longName, region: c.region.name, service: c.o.name + (c.t ? ` — ${c.t.label}` : ""),
        links: c.o.links.map(l => l[1]) })),
      tib: state.tib, asOf: D.asOf
    };
  }
  let lastReport = null;

  function update() {
    $("#cap").value = state.tib; $("#hours").value = state.hours; $("#showPerf").checked = state.showPerf; $("#showTiers").checked = state.showTiers; $("#showInfo").checked = state.showInfo;
    $("#discOn").checked = state.discOn;
    $("#discBox").hidden = !state.discOn;
    document.querySelectorAll("[data-disc]").forEach(i => { i.value = state.disc[i.dataset.disc]; });
    $("#units").textContent = (state.tib * U).toLocaleString("en-US");
    renderPickers(); renderTable();
  }

  document.addEventListener("click", e => {
    if (e.target.closest("#reset")) { state = fresh(); return update(); }
    const dl = e.target.closest("#export");
    if (dl) {
      dl.disabled = true; const label = dl.textContent; dl.textContent = "Building…";
      Promise.resolve().then(() => window.StorageDeck.download(lastReport))
        .catch(err => alert("Could not build the PowerPoint: " + err.message))
        .finally(() => { dl.disabled = false; dl.textContent = label; });
    }
  });
  document.addEventListener("change", e => {
    const el = e.target;
    if (el.id === "cap") { state.tib = Math.max(1, Math.min(1000, Math.round(+el.value) || 1)); return update(); }
    if (el.id === "showInfo") { state.showInfo = el.checked; return update(); }
    if (el.id === "showTiers") { state.showTiers = el.checked; return update(); }
    if (el.id === "showPerf") { state.showPerf = el.checked; return update(); }
    if (el.id === "discOn") { state.discOn = el.checked; return update(); }
    if (el.dataset.disc) { state.disc[el.dataset.disc] = Math.max(0, Math.min(99, +el.value || 0)); el.value = state.disc[el.dataset.disc]; return update(); }
    if (el.id === "hours") { state.hours = Math.max(1, Math.min(744, +el.value || 730)); return update(); }
    const card = el.closest("[data-pid]");
    if (!card) return;
    const pid = card.dataset.pid;
    if (el.dataset.k === "region") state.region[pid] = el.value;
    if (el.dataset.k === "opt") state.sel[pid] = el.value;
    if (el.dataset.k === "tier" && chosen(pid)) state.tier[chosen(pid).id] = el.value;
    if (el.dataset.k === "term" && chosen(pid)) state.term[chosen(pid).id] = el.value;
    if (el.dataset.k === "prot" && chosen(pid)) state.prot[chosen(pid).id] = el.value;
    if (el.dataset.k === "fsxDR") state.fsxDR = Math.max(0, Math.min(90, +el.value || 0));
    if (el.dataset.k === "fsxMbps") state.fsxMbps = Math.max(128, Math.min(6144, +el.value || 128));
    update();
  });

  update();
  window.StorageApp = { current: () => lastReport };
})();
