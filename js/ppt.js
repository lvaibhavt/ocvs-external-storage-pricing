// Builds the storage comparison slide (plus a sources slide) with PptxGenJS,
// in the same style as the compute "OCVS Pricing Advantage" deck.
(function (root) {
  const C = {
    navy: "1F2A5C", gold: "E8B73A", brown: "8A5A00", ink: "222222", body: "333333", muted: "5A6378",
    line: "D5D9E3", secBg: "F1F2F7", baseBg: "EAF1FB", green: "2E7D32", red: "B3261E",
    calloutBg: "EEF6EE", calloutLine: "C8E0C9", calloutBgNeg: "FBEEEE", calloutLineNeg: "E8C4C1", white: "FFFFFF"
  };
  const W = 16.667, H = 9.375, M = 0.6;
  const HEAD = "Georgia", BODY = "Calibri";
  const sup = n => String(n).replace(/\d/g, d => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]);

  function slideMain(pptx, rep) {
    const s = pptx.addSlide();
    s.background = { color: C.white };
    s.addText("OCVS Storage Advantage", { x: M, y: 0.4, w: 11, h: 0.75, fontFace: HEAD, fontSize: 34, bold: true, color: C.navy, margin: 0, isTextBox: true });
    s.addText(rep.subtitle, { x: M, y: 1.12, w: W - 2 * M, h: 0.32, fontFace: BODY, fontSize: 13, color: C.muted, margin: 0, isTextBox: true });
    s.addShape(pptx.ShapeType.roundRect, { x: W - M - 3.6, y: 0.48, w: 3.6, h: 0.55, fill: { color: C.navy }, rectRadius: 0.27, line: { color: C.navy } });
    s.addText("EXTERNAL STORAGE · MONTHLY", { x: W - M - 3.6, y: 0.48, w: 3.6, h: 0.55, fontFace: HEAD, fontSize: 14, bold: true, color: C.gold, align: "center", valign: "middle", margin: 0, isTextBox: true });

    // ---- table ----
    const n = rep.heads.length;
    const firstW = 3.0, colW = (W - 2 * M - firstW) / n;
    const b = { type: "solid", pt: 0.75, color: C.line }, border = [b, b, b, b];
    const top = 1.6, maxH = rep.callouts.length ? 5.9 : 6.7;
    const nSec = rep.rows.filter(r => r.section).length, nData = rep.rows.length - nSec + 1;
    const secH = 0.2;
    const rowH = Math.min(0.32, (maxH - nSec * secH) / nData);
    const fs = rowH >= 0.3 ? 11 : 10;
    const heights = [rowH, ...rep.rows.map(r => (r.section ? secH : rowH))];
    const tableH = heights.reduce((a, v) => a + v, 0);

    const rows = [[
      { text: "Storage / configuration", options: { fill: { color: C.navy }, color: C.white, bold: true, fontFace: HEAD, fontSize: fs + 1, border } },
      ...rep.heads.map((h, i) => ({ text: h, options: { fill: { color: C.navy }, color: i === 0 ? C.gold : C.white, bold: true, fontFace: HEAD, fontSize: fs + 1, align: "center", border } }))
    ]];
    for (const r of rep.rows) {
      if (r.section) {
        rows.push([{ text: r.section, options: { colspan: n + 1, fill: { color: C.secBg }, color: C.brown, bold: true, fontFace: HEAD, fontSize: fs - 2, charSpacing: 2, border } }]);
        continue;
      }
      rows.push([
        { text: r.label, options: { bold: true, color: C.ink, fontFace: HEAD, fontSize: fs, border } },
        ...r.cells.map((cell, i) => {
          const txt = String(cell), neg = txt.startsWith("−");
          return { text: txt, options: {
            align: "center", fontFace: BODY, fontSize: fs, border,
            bold: i === 0 || !!r.savings || !!r.strong,
            color: r.savings && txt !== "—" && txt !== "n/a" ? (neg ? C.red : C.green) : i === 0 ? C.navy : C.body,
            fill: { color: i === 0 ? C.baseBg : C.white } } };
        })
      ]);
    }
    // cell margins in inches: pptxgenjs reads values < 1 as inches
    s.addTable(rows, { x: M, y: top, w: W - 2 * M, colW: [firstW, ...Array(n).fill(colW)], rowH: heights, valign: "middle", margin: [0.02, 0.06, 0.02, 0.06], autoPage: false });

    // ---- callouts ----
    const cy = top + tableH + 0.15;
    if (rep.callouts.length) {
      const gap = 0.3, cw = (W - 2 * M - gap * (rep.callouts.length - 1)) / rep.callouts.length;
      rep.callouts.forEach((co, i) => {
        const x = M + i * (cw + gap);
        s.addShape(pptx.ShapeType.roundRect, { x, y: cy, w: cw, h: 0.82, rectRadius: 0.08, fill: { color: co.positive ? C.calloutBg : C.calloutBgNeg }, line: { color: co.positive ? C.calloutLine : C.calloutLineNeg, width: 1 } });
        s.addText([
          { text: co.title, options: { fontFace: HEAD, fontSize: 19, bold: true, color: co.positive ? C.green : C.red, breakLine: true } },
          { text: co.sub, options: { fontFace: BODY, fontSize: 12, color: C.body } }
        ], { x: x + 0.2, y: cy + 0.04, w: cw - 0.3, h: 0.74, valign: "middle", margin: 0, isTextBox: true });
      });
    }

    // ---- footnotes ----
    const fy = rep.callouts.length ? cy + 0.92 : cy + 0.1;
    const foot = rep.notes.map((t, i) => `${sup(i + 1)} ${t}`).concat([
      `${rep.discNote || "Indicative public list prices"} as of ${rep.asOf}; not a quote. 1 TiB = 1,024 GB/GiB. Storage only: excludes VMware nodes, networking, egress, backup, support and taxes.`
    ]).join("   ");
    s.addText(foot, { x: M, y: fy, w: W - 2 * M, h: Math.max(0.3, H - fy - 0.12), fontFace: BODY, fontSize: 8, color: "666666", valign: "top", margin: 0, isTextBox: true, fit: "shrink" });
  }

  function slideSources(pptx, rep) {
    const s = pptx.addSlide();
    s.background = { color: C.white };
    s.addText("Assumptions & sources", { x: M, y: 0.45, w: 11, h: 0.8, fontFace: HEAD, fontSize: 32, bold: true, color: C.navy, margin: 0, isTextBox: true });
    const items = [
      ["Basis", `${rep.tib} TiB datastore, one volume (or file system) of that size. ${rep.discNote ? rep.discNote + "." : "Monthly list prices."} 1 TiB = 1,024 GB/GiB as in each provider's calculator. Prices as of ${rep.asOf}.`],
      ...rep.sources.map(x => [x.platform, `${x.service} · ${x.region}. Sources: ${x.links.join(" · ")}`]),
      ["GCVE", "Google Cloud VMware Engine supports no block (iSCSI/VMFS) datastore, so it is compared on storage-only nodes (vSAN) or NFS (Filestore / NetApp Volumes)."],
      ["Scope", "Storage only. Excludes VMware nodes, networking, egress, backup, support and taxes. Estimates, not quotes."]
    ];
    const b = { type: "solid", pt: 0.75, color: C.line };
    s.addTable(items.map(([k, v]) => [
      { text: k, options: { bold: true, fontFace: HEAD, fontSize: 13, color: C.navy, fill: { color: C.secBg } } },
      { text: v, options: { fontFace: BODY, fontSize: 11, color: C.body } }
    ]), { x: M, y: 1.5, w: W - 2 * M, colW: [3.2, W - 2 * M - 3.2], border: b, valign: "middle", margin: [0.07, 0.12, 0.07, 0.12], autoPage: false });
  }

  function build(rep) {
    if (!window.PptxGenJS) throw new Error("PptxGenJS failed to load (check your internet connection).");
    if (!rep) throw new Error("Nothing to export yet.");
    const pptx = new window.PptxGenJS();
    pptx.defineLayout({ name: "DECK", width: W, height: H });
    pptx.layout = "DECK";
    pptx.title = "OCVS Storage Comparison";
    slideMain(pptx, rep);
    slideSources(pptx, rep);
    return pptx;
  }
  async function download(rep) {
    await build(rep).writeFile({ fileName: `OCVS_Storage_Comparison_${rep.tib}TiB.pptx` });
  }
  root.StorageDeck = { build, download };
})(this);
