(function () {
  const D = window.STORAGE;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const usd = n => "$" + n.toLocaleString("en-US", { maximumFractionDigits: n < 1000 ? 2 : 0 });
  const fmtTiB = tib => `${tib} TiB (${(tib * D.unitsPerTiB).toLocaleString("en-US")} GB/GiB)`;
  const UNITS_PER_TIB = D.unitsPerTiB;   // 1 TiB = 1,024 billed units everywhere

  const state = { kind: "block", tib: 100, hours: D.defaultHours, tier: {} };
  const ORDER = ["ocvs", "avs", "gcve", "evs"];

  function tierOf(opt) {
    if (!opt.tiers) return null;
    return opt.tiers.find(t => t.id === state.tier[opt.id]) || opt.tiers.find(t => t.default) || opt.tiers[0];
  }
  // Per-unit monthly rate. Hourly-billed services depend on hours per month.
  function unitRate(tier) {
    return tier.priceHr != null ? tier.priceHr * state.hours : tier.price;
  }
  // Monthly list cost for the chosen capacity.
  function monthly(opt, tier) {
    if (!tier) return null;
    return unitRate(tier) * state.tib * UNITS_PER_TIB;
  }

  function render() {
    $("#asOf").textContent = D.asOf;
    $("#hours").value = state.hours;
    $("#units").textContent = (state.tib * UNITS_PER_TIB).toLocaleString("en-US");
    document.querySelectorAll(".seg button").forEach(b => b.classList.toggle("on", b.dataset.v === state.kind));

    const opts = D.options.filter(o => o.kind === state.kind);
    const priced = opts.filter(o => !o.priceOnRequest).map(o => ({ o, t: tierOf(o), cost: monthly(o, tierOf(o)) }));
    const cheapest = priced.length ? Math.min(...priced.map(p => p.cost)) : null;

    let html = "";
    for (const pid of ORDER) {
      const p = D.platforms[pid];
      const mine = opts.filter(o => o.platform === pid);
      const gap = (D.gaps[state.kind] || {})[pid];

      html += `<section class="plat">
        <div class="plat-head"><span class="dot" style="background:${p.accent}"></span>
          <h2>${esc(p.name)}</h2><span class="plat-sub">${esc(p.longName)} · ${esc(p.regionName)}</span></div>`;

      if (!mine.length) {
        html += `<div class="panel none"><b>No ${state.kind === "block" ? "block" : "file"} option.</b> ${esc(gap || "")}</div></section>`;
        continue;
      }

      for (const o of mine) {
        const t = tierOf(o), cost = monthly(o, t);
        const best = cost !== null && cheapest !== null && Math.abs(cost - cheapest) < 0.5;
        html += `<div class="panel opt${o.partner ? " partner" : ""}">
          <div class="opt-head">
            <div>
              <h3>${esc(o.name)} ${o.partner ? '<span class="tag partner-tag">Partner</span>' : '<span class="tag">First-party</span>'}
                ${best ? '<span class="tag best">Lowest list price</span>' : ""}</h3>
              ${o.alias ? `<div class="alias">${esc(o.alias)}</div>` : ""}
            </div>
            <div class="price">
              ${o.priceOnRequest
                ? `<div class="por">Price on request</div><div class="price-sub">Not published; quoted by the vendor</div>`
                : `<div class="big">${usd(cost)}<span>/month</span></div>
                   <div class="price-sub">${fmtTiB(state.tib)} · $${unitRate(t).toFixed(4)} per ${o.unit}-month${
                     t.priceHr != null ? ` ($${t.priceHr.toFixed(6)}/${o.unit}-hour × ${state.hours} h)` : " (flat monthly rate)"}</div>`}
            </div>
          </div>
          <div class="facts">
            <div><span>Protocol</span>${esc(o.protocol)}</div>
            <div><span>Media</span>${esc(o.media)}</div>
            <div><span>Performance at ${state.tib} TiB</span>${esc(o.perf(state.tib, t || {}))}</div>
            ${o.tiers && o.tiers.length > 1 ? `<div><span>Tier</span><select data-opt="${o.id}">${o.tiers.map(x =>
                `<option value="${x.id}" ${x === t ? "selected" : ""}>${esc(x.label)} — $${unitRate(x).toFixed(4)}/${o.unit}-month</option>`).join("")}</select></div>` : ""}
          </div>
          <ul class="notes">${o.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>
          <div class="links">${o.links.map(([label, href]) =>
            `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`).join("")}</div>
        </div>`;
      }
      html += "</section>";
    }

    // summary table
    html += `<section class="plat"><div class="plat-head"><h2>Summary</h2>
      <span class="plat-sub">${fmtTiB(state.tib)}, list price, Frankfurt, ${state.hours} hours/month</span></div>
      <div class="panel"><div class="tbl-wrap"><table>
      <thead><tr><th>Platform</th><th>Option</th><th>Protocol</th><th>Media</th><th>Per ${state.kind === "block" ? "month" : "month"}</th><th>Per TiB / month</th></tr></thead><tbody>`;
    for (const pid of ORDER) {
      const mine = opts.filter(o => o.platform === pid);
      if (!mine.length) {
        html += `<tr class="na"><th>${esc(D.platforms[pid].name)}</th><td colspan="5">Not supported</td></tr>`;
        continue;
      }
      for (const o of mine) {
        const t = tierOf(o), cost = monthly(o, t);
        html += `<tr><th>${esc(D.platforms[pid].name)}</th><td>${esc(o.name)}${o.partner ? " (partner)" : ""}</td>
          <td>${esc(o.protocol)}</td><td>${esc(o.media)}</td>
          <td class="num">${o.priceOnRequest ? "On request" : usd(cost)}</td>
          <td class="num">${o.priceOnRequest ? "—" : usd(cost / state.tib)}</td></tr>`;
      }
    }
    html += "</tbody></table></div></div></section>";
    $("#results").innerHTML = html;
  }

  document.addEventListener("click", e => {
    const b = e.target.closest(".seg button");
    if (b) { state.kind = b.dataset.v; render(); }
  });
  document.addEventListener("change", e => {
    if (e.target.id === "hours") { state.hours = Math.max(1, Math.min(744, +e.target.value || 730)); e.target.value = state.hours; render(); }
    if (e.target.id === "cap") { state.tib = Math.max(1, Math.min(1000, +e.target.value || 1)); e.target.value = state.tib; render(); }
    const sel = e.target.closest("select[data-opt]");
    if (sel) { state.tier[sel.dataset.opt] = sel.value; render(); }
  });

  render();
})();
