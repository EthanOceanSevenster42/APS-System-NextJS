"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";

// chart.js is heavy; load it lazily in its own chunk (shared with other analytics
// pages) instead of shipping it in this route's initial JS bundle.
const Bar = dynamic(() => import("@/components/charts").then(m => m.Bar), { ssr: false });
const Line = dynamic(() => import("@/components/charts").then(m => m.Line), { ssr: false });

interface LabData {
  total_samples:      number;
  total_inspections:  number;
  needs_coa:          number;
  needs_retest:       number;
  total_tests:        number;
  fat_count:          number;
  protein_count:      number;
  calcium_count:      number;
  dna_count:          number;
  labs:           { lab: string; n: number }[];
  commodities:    { commodity: string; n: number }[];
  allLabsStats:   { lab: string; n: number }[];
  allCommoditiesStats: { commodity: string; n: number }[];
  monthly:        { month: string; count: number }[];
  testComplianceTrend?:   TestTrendRow[];
  testComplianceSummary?: Record<string, TestSummary>;
  recent:         {
    client_name:  string;
    product_name: string;
    commodity:    string;
    lab:          string;
    needs_retest: string;
    tests:        string[];
    date:         string;
  }[];
}

const COMMODITY_LABEL: Record<string, string> = {
  RAW:     "Raw Meat",
  PMP:     "PMP (Processed)",
  POULTRY: "Poultry",
  EGGS:    "Eggs",
  DAIRY:   "Dairy",
  FISH:    "Fish",
};

const COMMODITY_COLOR: Record<string, string> = {
  RAW:     "#ef4444",
  PMP:     "#f97316",
  POULTRY: "#eab308",
  EGGS:    "#84cc16",
  DAIRY:   "#06b6d4",
  FISH:    "#3b82f6",
};

const TEST_CONFIG = [
  { key: "fat_count",     label: "Fat",     color: "#3b82f6", icon: "fa-tint"     },
  { key: "protein_count", label: "Protein", color: "#8b5cf6", icon: "fa-dna"      },
  { key: "calcium_count", label: "Calcium", color: "#10b981", icon: "fa-atom"     },
  { key: "dna_count",     label: "DNA",     color: "#f59e0b", icon: "fa-dna"      },
] as const;

/* Series for the daily per-test compliance trend. Colours match TEST_CONFIG so
   a test is the same colour wherever it appears on this page. */
const TEST_SERIES = [
  { key: "fat",     label: "Fat",     color: "#3b82f6" },
  { key: "protein", label: "Protein", color: "#8b5cf6" },
  { key: "calcium", label: "Calcium", color: "#10b981" },
  { key: "dna",     label: "DNA",     color: "#f59e0b" },
] as const;

interface TestTrendRow {
  day: string;
  test: string;
  assessed: number;
  compliant: number;
  compliance_rate: number;
}
interface TestSummary { compliant: number; assessed: number; compliance_rate: number }

type Granularity = "day" | "week" | "month" | "year";

/* maxPoints caps how much of the range a view draws. 545 daily points on one
   axis is unreadable whatever the styling, so Day shows a recent window and
   the coarser views cover the longer spans. Each cap is roughly the number of
   labels that stay legible across the card's width. */
const GRANULARITIES: { key: Granularity; label: string; maxPoints: number; span: string }[] = [
  { key: "day",   label: "Day",   maxPoints: 45,  span: "days"   },
  { key: "week",  label: "Week",  maxPoints: 26,  span: "weeks"  },
  { key: "month", label: "Month", maxPoints: 24,  span: "months" },
  { key: "year",  label: "Year",  maxPoints: 20,  span: "years"  },
];

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* Periods with no assessed result are plotted as 0% so every series draws as
   one continuous line. Note the consequence, called out under the chart: a
   plunge to 0% can mean "nothing was tested" rather than "everything failed",
   and a period with only one or two samples swings the full height of the
   chart on a single result. The tooltip carries the sample count behind every
   point, which is the way to tell the two apart. */

/** Collapse an ISO day into the bucket it belongs to. Sortable as a string. */
function bucketKey(iso: string, g: Granularity): string {
  if (g === "year")  return iso.slice(0, 4);
  if (g === "month") return iso.slice(0, 7);
  if (g === "week") {
    const d = new Date(iso + "T00:00:00");
    // Back up to Monday so a week is labelled by the date it commences.
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    return d.toISOString().slice(0, 10);
  }
  return iso;
}

function bucketLabel(key: string, g: Granularity): string {
  if (g === "year") return key;
  if (g === "month") {
    const [y, m] = key.split("-");
    return `${MONTHS_SHORT[Number(m) - 1]} ${y}`;
  }
  const [y, m, d] = key.split("-");
  const base = `${d} ${MONTHS_SHORT[Number(m) - 1]}`;
  return g === "week" ? `${base} ${y.slice(2)}` : base;
}

function fmtTrendDay(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime())
    ? iso
    : `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleString("en", { month: "short" })}`;
}

function Spinner() {
  return (
    <div style={{ width: 36, height: 36, borderRadius: "50%", border: "4px solid rgba(0,120,144,0.2)", borderTopColor: "#007890", animation: "spin 0.8s linear infinite", margin: "0 auto" }} />
  );
}

function StatCard({ label, value, icon, color, borderColor, loading, tooltip, href }: { label: string; value: number; icon: string; color: string; borderColor: string; loading: boolean; tooltip?: string; href?: string }) {
  const [showTip, setShowTip] = useState(false);
  return (
    <div
      onClick={href ? () => { window.location.href = href; } : undefined}
      style={{
      background: "#fff",
      borderRadius: 8,
      padding: "12px 14px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
      border: "1px solid #e5e7eb",
      borderLeft: `3px solid ${borderColor}`,
      display: "flex",
      alignItems: "center",
      gap: 10,
      position: "relative",
      cursor: href ? "pointer" : undefined,
      transition: href ? "box-shadow 0.15s" : undefined,
    }}
      onMouseEnter={href ? (e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.12)"; } : undefined}
      onMouseLeave={href ? (e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 2px rgba(0,0,0,0.05)"; } : undefined}
    >
      <div style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: `${color}12`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        <i className={`fas ${icon}`} style={{ fontSize: "0.85rem", color }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#111827", lineHeight: 1, marginBottom: 2 }}>
          {loading ? <Spinner /> : value.toLocaleString()}
        </div>
        <div style={{ fontSize: "0.62rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      </div>
      {tooltip && (
        <div style={{ position: "relative" }}
          onMouseEnter={() => setShowTip(true)} onMouseLeave={() => setShowTip(false)}>
          <i className="fas fa-info-circle" style={{ fontSize: "0.7rem", color: "#d1d5db", cursor: "help" }} />
          {showTip && (
            <div style={{ position: "absolute", bottom: "calc(100% + 6px)", right: 0, background: "#1f2937", color: "#fff", padding: "6px 10px", borderRadius: 6, fontSize: "0.68rem", lineHeight: 1.4, whiteSpace: "normal", width: 200, zIndex: 50, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
              {tooltip}
              <div style={{ position: "absolute", bottom: -4, right: 8, width: 8, height: 8, background: "#1f2937", transform: "rotate(45deg)" }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LabAnalyticsPage() {
  const [rawData, setRawData] = useState<LabData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [labFilter, setLabFilter] = useState("");
  const [commodityFilter, setCommodityFilter] = useState("");
  // Month reads best across a multi-year range; day is there when you need it.
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [allLabsList, setAllLabsList] = useState<string[]>([]);
  const [allCommoditiesList, setAllCommoditiesList] = useState<string[]>([]);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const [filtering, setFiltering] = useState(false);
  const fetchData = (df?: string, dt?: string, lf?: string, cf?: string) => {
    setLoading(true);
    setRawData(null);
    setError("");
    const p = new URLSearchParams();
    const _df = df ?? dateFrom, _dt = dt ?? dateTo, _lf = lf ?? labFilter, _cf = cf ?? commodityFilter;
    if (_df) p.set("date_from", _df);
    if (_dt) p.set("date_to", _dt);
    if (_lf) p.set("lab", _lf);
    if (_cf) p.set("commodity", _cf);
    const qs = p.toString();
    fetch(`/api/lab-analytics${qs ? "?" + qs : ""}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setRawData(d);
          // Use server-provided filter options (from unfiltered dataset)
          if (!initialLoaded) {
            if (d.allLabs) setAllLabsList(d.allLabs);
            if (d.allCommodities) setAllCommoditiesList(d.allCommodities);
            setInitialLoaded(true);
          }
        }
        else setError(d.error || "Failed to load");
      })
      .catch(() => setError("Network error"))
      .finally(() => { setLoading(false); setFiltering(false); });
  };

  useEffect(() => { fetchData("", "", "", ""); }, []);

  const data = rawData;

  const handleReset = () => { setDateFrom(""); setDateTo(""); setLabFilter(""); setCommodityFilter(""); fetchData("", "", "", ""); };

  const handleExtractExcel = async () => {
    if (!data) return;
    // Fetch ALL samples (not just the 50 shown on screen)
    const ep = new URLSearchParams();
    if (dateFrom) ep.set("date_from", dateFrom);
    if (dateTo) ep.set("date_to", dateTo);
    if (labFilter) ep.set("lab", labFilter);
    if (commodityFilter) ep.set("commodity", commodityFilter);
    ep.set("export", "1");
    let allSamples: typeof data.recent = data.recent;
    try {
      const exportRes = await fetch(`/api/lab-analytics?${ep.toString()}`);
      const exportData = await exportRes.json();
      if (exportData.success) allSamples = exportData.recent;
    } catch { /* fall back to data.recent */ }

    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    // Summary sheet
    const summary = [
      { Metric: "Total Inspections", Value: data.total_inspections },
      { Metric: "Total Samples", Value: data.total_samples },
      { Metric: "Tests Run", Value: data.total_tests },
      { Metric: "Fat Tests", Value: data.fat_count },
      { Metric: "Protein Tests", Value: data.protein_count },
      { Metric: "Calcium Tests", Value: data.calcium_count },
      { Metric: "DNA Tests", Value: data.dna_count },
      { Metric: "Needs COA Upload", Value: data.needs_coa },
      { Metric: "Needs Retest", Value: data.needs_retest },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");
    // Samples sheet — all filtered samples, not just last 50
    if (allSamples.length) {
      const rows = allSamples.map(r => ({
        Date: r.date,
        Client: r.client_name,
        Product: r.product_name,
        Commodity: COMMODITY_LABEL[r.commodity] || r.commodity,
        Lab: r.lab,
        Tests: (r.tests || []).join(", "),
        "Needs Retest": r.needs_retest,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Samples");
    }
    XLSX.writeFile(wb, `Lab_Analytics_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExportPdf = async () => {
    if (!data) return;
    try {
      // Fetch ALL samples for the PDF (not just the last 50 shown on screen)
      const ep = new URLSearchParams();
      if (dateFrom) ep.set("date_from", dateFrom);
      if (dateTo) ep.set("date_to", dateTo);
      if (labFilter) ep.set("lab", labFilter);
      if (commodityFilter) ep.set("commodity", commodityFilter);
      ep.set("export", "1");
      const exportRes = await fetch(`/api/lab-analytics?${ep.toString()}`);
      const exportData = await exportRes.json();
      const allSamples: typeof data.recent = exportData.success ? exportData.recent : data.recent;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsPDFModule: any = await import("jspdf");
      const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
      const autoTableModule: any = await import("jspdf-autotable");
      const autoTable = autoTableModule.default || autoTableModule.autoTable || autoTableModule;

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const W = 297, H = 210;
      const ML = 15, MR = 15, MT = 20, MB = 18;
      const CW = W - ML - MR;

      // Brand colors
      const TEAL: [number, number, number] = [0, 120, 144];
      const DARK: [number, number, number] = [15, 23, 42];
      const WHITE: [number, number, number] = [255, 255, 255];
      const GRAY: [number, number, number] = [107, 114, 128];
      const GRAY_LIGHT: [number, number, number] = [156, 163, 175];
      const GREEN: [number, number, number] = [5, 150, 105];
      const RED: [number, number, number] = [220, 38, 38];
      const AMBER: [number, number, number] = [245, 158, 11];
      const BLUE: [number, number, number] = [59, 130, 246];
      const PURPLE: [number, number, number] = [139, 92, 246];
      const ROW_ALT: [number, number, number] = [248, 250, 252];
      const ROW_WHITE: [number, number, number] = [255, 255, 255];

      // Filter description
      const filterDesc = [
        dateFrom && `From: ${dateFrom}`,
        dateTo && `To: ${dateTo}`,
        labFilter && `Lab: ${labFilter}`,
        commodityFilter && `Commodity: ${commodityFilter}`,
      ].filter(Boolean).join("  |  ") || "All Data — No Filters Applied";

      // Fetch logo
      let logoDataUrl: string | null = null;
      try {
        const logoRes = await fetch("/logo.png");
        if (logoRes.ok) {
          const blob = await logoRes.blob();
          logoDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        }
      } catch { /* skip */ }

      // Capture chart canvases
      const chartImages: string[] = [];
      const chartCanvases = document.querySelectorAll("canvas");
      for (const cvs of Array.from(chartCanvases)) {
        try {
          const dataUrl = cvs.toDataURL("image/png", 1.0);
          if (dataUrl && dataUrl.length > 100) chartImages.push(dataUrl);
        } catch { /* skip */ }
      }

      // ── PAGE 1: COVER PAGE ──
      doc.setFillColor(...DARK);
      doc.rect(0, 0, W, H, "F");

      doc.setDrawColor(...TEAL);
      doc.setLineWidth(0.8);
      doc.line(ML, 50, W - MR, 50);
      doc.line(ML, H - 50, W - MR, H - 50);

      if (logoDataUrl) {
        try { doc.addImage(logoDataUrl, "PNG", W / 2 - 18, 58, 36, 32); } catch { /* skip */ }
      }

      const logoBottom = logoDataUrl ? 98 : 75;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(28);
      doc.setTextColor(...WHITE);
      doc.text("FOOD SAFETY AGENCY (PTY) LTD", W / 2, logoBottom, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(18);
      doc.setTextColor(...TEAL);
      doc.text("Lab Analytics Report", W / 2, logoBottom + 12, { align: "center" });

      doc.setFillColor(...TEAL);
      doc.rect(W / 2 - 30, logoBottom + 18, 60, 1.2, "F");

      doc.setFontSize(12);
      doc.setTextColor(...GRAY_LIGHT);
      const reportDate = new Date().toLocaleDateString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      doc.text(reportDate, W / 2, logoBottom + 30, { align: "center" });

      doc.setFontSize(9);
      doc.setTextColor(...GRAY);
      doc.text(filterDesc, W / 2, logoBottom + 38, { align: "center", maxWidth: CW - 40 });

      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      doc.text("CONFIDENTIAL — For authorized personnel only", W / 2, H - 30, { align: "center" });

      // ── PAGE 2: KPI SUMMARY + TEST BREAKDOWN + CHARTS ──
      doc.addPage();
      let y = MT + 4;

      // KPI Section Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...DARK);
      doc.text("Key Metrics", ML, y);
      doc.setDrawColor(...TEAL);
      doc.setLineWidth(0.5);
      doc.line(ML, y + 1.5, ML + 40, y + 1.5);
      y += 7;

      // KPI cards — row 1
      const drawCard = (x: number, y: number, w: number, h: number, label: string, value: string, color: [number, number, number]) => {
        doc.setFillColor(246, 248, 250);
        doc.roundedRect(x, y, w, h, 1.5, 1.5, "F");
        doc.setFillColor(...color);
        doc.rect(x, y, w, 1.5, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(...color);
        doc.text(value, x + w / 2, y + h / 2 - 1, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        doc.setTextColor(...GRAY);
        doc.text(label.toUpperCase(), x + w / 2, y + h / 2 + 5.5, { align: "center" });
      };

      const gap = 3, cH = 22;
      const cW5 = (CW - 4 * gap) / 5;
      const kpiItems = [
        { label: "Total Inspections", value: String(data.total_inspections), color: TEAL },
        { label: "Samples Collected", value: String(data.total_samples), color: GREEN },
        { label: "Tests Conducted", value: String(data.total_tests), color: BLUE },
        { label: "Awaiting COA", value: String(data.needs_coa), color: AMBER },
        { label: "Needs Retest", value: String(data.needs_retest), color: RED },
      ];
      kpiItems.forEach((k, i) => drawCard(ML + i * (cW5 + gap), y, cW5, cH, k.label, k.value, k.color));
      y += cH + 3;

      // Test type cards — row 2
      const cW4 = (CW - 3 * gap) / 4;
      const testItems = [
        { label: "Fat Tests", value: String(data.fat_count), color: BLUE },
        { label: "Protein Tests", value: String(data.protein_count), color: PURPLE },
        { label: "Calcium Tests", value: String(data.calcium_count), color: GREEN },
        { label: "DNA Tests", value: String(data.dna_count), color: AMBER },
      ];
      testItems.forEach((k, i) => drawCard(ML + i * (cW4 + gap), y, cW4, cH, k.label, k.value, k.color));
      y += cH + 8;

      // ── Lab breakdown bars ──
      if (data.labs?.length) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...DARK);
        doc.text("Samples by Laboratory", ML, y);
        doc.setDrawColor(...TEAL);
        doc.setLineWidth(0.5);
        doc.line(ML, y + 1.5, ML + 55, y + 1.5);
        y += 6;

        const maxN = Math.max(...data.labs.map(l => l.n), 1);
        const barMaxW = CW - 80;
        for (const lab of data.labs) {
          const filledW = (lab.n / maxN) * barMaxW;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(...DARK);
          doc.text(lab.lab, ML, y + 4);

          const barX = ML + 50;
          doc.setFillColor(229, 231, 235);
          doc.roundedRect(barX, y, barMaxW, 6, 1.5, 1.5, "F");
          if (filledW > 0) {
            doc.setFillColor(...TEAL);
            doc.roundedRect(barX, y, Math.max(filledW, 3), 6, 1.5, 1.5, "F");
          }

          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          doc.setTextColor(...TEAL);
          doc.text(String(lab.n), barX + barMaxW + 3, y + 4);
          y += 8;
        }
        y += 4;
      }

      // ── Charts (2 per row) ──
      if (chartImages.length > 0) {
        if (y + 55 > H - MB) { doc.addPage(); y = MT + 4; }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...DARK);
        doc.text("Charts & Trends", ML, y);
        doc.setDrawColor(...TEAL);
        doc.setLineWidth(0.5);
        doc.line(ML, y + 1.5, ML + 45, y + 1.5);
        y += 5;

        const slotW = (CW - 4) / 2;
        const maxChH = 55;

        for (let i = 0; i < Math.min(chartImages.length, 6); i += 2) {
          if (y + maxChH + 4 > H - MB) { doc.addPage(); y = MT + 4; }

          try {
            const c1 = chartCanvases[i];
            const ar1 = c1 ? c1.width / c1.height : 2;
            let w1 = slotW, h1 = w1 / ar1;
            if (h1 > maxChH) { h1 = maxChH; w1 = h1 * ar1; }
            if (w1 > slotW) { w1 = slotW; h1 = w1 / ar1; }
            doc.addImage(chartImages[i], "PNG", ML, y, w1, h1);

            let maxH = h1;
            if (i + 1 < chartImages.length && i + 1 < 6) {
              const c2 = chartCanvases[i + 1];
              const ar2 = c2 ? c2.width / c2.height : 2;
              let w2 = slotW, h2 = w2 / ar2;
              if (h2 > maxChH) { h2 = maxChH; w2 = h2 * ar2; }
              if (w2 > slotW) { w2 = slotW; h2 = w2 / ar2; }
              doc.addImage(chartImages[i + 1], "PNG", ML + slotW + 4, y, w2, h2);
              maxH = Math.max(h1, h2);
            }
            y += maxH + 4;
          } catch { /* skip */ }
        }
      }

      // ── TABLE: Recent Samples ──
      doc.addPage();
      let ty = MT + 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...DARK);
      const sampleTitle = (dateFrom || dateTo || labFilter || commodityFilter) ? `Filtered Samples (${allSamples.length})` : `Recent Samples (${allSamples.length})`;
      doc.text(sampleTitle, ML, ty);
      doc.setDrawColor(...TEAL);
      doc.setLineWidth(0.5);
      doc.line(ML, ty + 1.5, ML + doc.getTextWidth(sampleTitle), ty + 1.5);
      ty += 5;

      autoTable(doc, {
        startY: ty,
        head: [["Date", "Client", "Product", "Commodity", "Lab", "Tests", "Retest"]],
        body: allSamples.map(r => [
          r.date || "", r.client_name, r.product_name,
          COMMODITY_LABEL[r.commodity] || r.commodity,
          r.lab, (r.tests || []).join(", "), r.needs_retest || "No",
        ]),
        margin: { left: ML, right: MR, top: MT, bottom: MB },
        styles: { font: "helvetica", fontSize: 7, cellPadding: 1.8, lineColor: [229, 231, 235], lineWidth: 0.15, overflow: "ellipsize" },
        headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", cellPadding: 2 },
        alternateRowStyles: { fillColor: ROW_ALT },
        bodyStyles: { fillColor: ROW_WHITE },
        columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 50, fontStyle: "bold" }, 4: { cellWidth: 42 }, 6: { cellWidth: 14 } },
        showHead: "everyPage",
        didParseCell: (hookData: { section: string; column: { index: number }; cell: { text: string[]; styles: { textColor: [number, number, number] } } }) => {
          if (hookData.section === "body" && hookData.column.index === 6) {
            const val = (hookData.cell.text[0] ?? "").toLowerCase();
            hookData.cell.styles.textColor = val === "yes" ? RED : GREEN;
          }
        },
      });

      // ── HEADERS, FOOTERS, PAGE NUMBERS ──
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        if (p === 1) continue;

        // Header
        if (logoDataUrl) {
          try { doc.addImage(logoDataUrl, "PNG", ML, 4, 10, 9); } catch { /* skip */ }
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...TEAL);
        doc.text("Food Safety Agency", ML + (logoDataUrl ? 12 : 0), 10);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        doc.setTextColor(...GRAY_LIGHT);
        doc.text("Confidential", W - MR, 10, { align: "right" });
        doc.setDrawColor(...TEAL);
        doc.setLineWidth(0.4);
        doc.line(ML, 14, W - MR, 14);

        // Footer
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.line(ML, H - 12, W - MR, H - 12);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...GRAY_LIGHT);
        doc.text(`Food Safety Agency (Pty) Ltd  |  Lab Analytics Report  |  ${new Date().toLocaleDateString("en-ZA")}`, W / 2, H - 8, { align: "center" });
        doc.text(`Page ${p - 1} of ${totalPages - 1}`, W - MR, H - 8, { align: "right" });
      }

      doc.save(`Lab_Analytics_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err: unknown) {
      console.error("PDF generation failed:", err);
      alert("PDF generation failed: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const maxMonthly = data && data.monthly?.length ? Math.max(...data.monthly.map(m => m.count), 1) : 1;
  const maxLab     = data && data.labs?.length ? Math.max(...data.labs.map(l => l.n), 1) : 1;
  const maxCommodity = data && data.commodities?.length ? Math.max(...data.commodities.map(c => c.n), 1) : 1;

  const allLabs = allLabsList;
  const allCommodities = allCommoditiesList;

  if (loading) return (
    <>
    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, width: "100vw", height: "100vh", background: "url('/background.jpg') no-repeat center center fixed", backgroundSize: "cover", opacity: 1, zIndex: -2, pointerEvents: "none" }} />
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 36, height: 36, border: "3px solid #e2e8f0", borderTopColor: "#007890", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
        <div style={{ fontSize: 14, color: "#fff" }}>Loading...</div>
      </div>
    </div>
    </>
  );

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes barGrow { from { width: 0; } }
        @keyframes barHeight { from { height: 0; } }
        .la-page-bg { min-height: 100vh; }
        .la-wrap { padding: 20px 20px 48px; width: 100%; box-sizing: border-box; }
        .la-section-title {
          font-size: 1rem; font-weight: 600; color: #1f2937;
          margin: 0 0 12px; padding: 0 0 10px;
          border-bottom: 1px solid #e5e7eb;
          display: flex; align-items: center; gap: 8px;
        }
        .la-card {
          background: #fff; border-radius: 8px; padding: 16px 20px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
          border: 1px solid #e5e7eb; margin-bottom: 5px;
        }
        .la-stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .la-mid-grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .la-test-row  {
          display: flex; align-items: center; gap: 14px; padding: 12px 0;
          border-bottom: 1px solid #f3f4f6;
        }
        .la-test-row:last-child { border-bottom: none; }
        .la-bar-bg    { flex: 1; height: 10px; background: #f1f3f5; border-radius: 99px; overflow: hidden; }
        .la-bar-fill  { height: 100%; border-radius: 99px; transition: width 0.6s ease; animation: barGrow 0.8s ease-out; }
        .la-lab-row   { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .la-lab-row:last-child { margin-bottom: 0; }
        .la-month-bar-wrap { display: flex; flex-direction: column; align-items: center; flex: 1; gap: 4px; }
        .la-month-chart { display: flex; align-items: flex-end; gap: 8px; height: 120px; padding: 0 4px; }
        .la-month-bar {
          flex: 1; border-radius: 6px 6px 0 0;
          background: linear-gradient(180deg, #007890, #00a3b8);
          transition: height 0.4s ease; min-width: 0;
          animation: barHeight 0.6s ease-out;
          position: relative;
        }
        .la-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.8rem; }
        .la-table thead { position: sticky; top: 0; z-index: 1; }
        .la-table th {
          text-align: left; padding: 10px 14px; color: #4b5563; font-size: 0.7rem;
          font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
          background: #f1f5f9; border-bottom: 2px solid #e2e5ea;
        }
        .la-table th:first-child { border-radius: 8px 0 0 0; }
        .la-table th:last-child { border-radius: 0 8px 0 0; }
        .la-table td {
          padding: 11px 14px; border-bottom: 1px solid #f3f4f6;
          color: #374151; vertical-align: middle;
        }
        .la-table tr:last-child td { border-bottom: none; }
        .la-table tbody tr:nth-child(even) td { background: #f8fafc; }
        .la-table tbody tr:hover td { background: #eef2f7; }
        .la-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 99px; font-size: 0.65rem; font-weight: 600; }
        .la-retest-yes { background: #fef2f2; color: #dc2626; }
        .la-retest-no  { background: #f0fdf4; color: #16a34a; }
        .la-test-tag {
          display: inline-block; padding: 2px 8px; border-radius: 6px;
          font-size: 0.65rem; font-weight: 600; background: #eff6ff;
          color: #2563eb; margin-right: 4px;
        }
        /* Tablet landscape / small desktop */
        @media (max-width: 1100px) {
          .la-stat-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        /* Tablet portrait */
        @media (max-width: 900px) {
          .la-stat-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .la-mid-grid  { grid-template-columns: 1fr !important; }
          .la-month-chart { gap: 4px; }
          .la-section-title { font-size: 0.9rem; }
        }
        /* Mobile landscape / small tablet */
        @media (max-width: 768px) {
          .la-wrap { padding: 16px 12px 32px; }
          .la-header-title { font-size: 1.1rem !important; }
          .la-header-sub { font-size: 0.72rem !important; }
          .la-filter-bar { flex-direction: column !important; gap: 8px !important; }
          .la-filter-bar > div { flex: 1 1 100% !important; min-width: 0 !important; }
          .la-filter-bar input, .la-filter-bar select { width: 100% !important; box-sizing: border-box; }
          .la-filter-btns { display: flex !important; flex-wrap: wrap !important; gap: 8px !important; width: 100% !important; }
          .la-filter-btns button { flex: 1; min-width: 0; }
          .la-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 -12px; padding: 0 12px; }
          .la-table { min-width: 600px; }
          .la-lab-row { flex-wrap: wrap; }
          .la-card { padding: 14px 14px; }
          .la-test-row > div:nth-child(2) { width: 50px !important; font-size: 0.75rem !important; }
        }
        /* Mobile portrait */
        @media (max-width: 480px) {
          .la-wrap { padding: 12px 8px 24px; }
          .la-header-title { font-size: 1rem !important; }
          .la-stat-grid { grid-template-columns: 1fr 1fr !important; gap: 8px; }
          .la-mid-grid { gap: 12px; }
          .la-card { padding: 12px 10px; }
          .la-month-chart { height: 80px; gap: 2px; }
          .la-test-row { gap: 8px; padding: 10px 0; }
          .la-test-row > div:nth-child(2) { width: 44px !important; font-size: 0.72rem !important; }
          .la-test-row > div:nth-child(4) { width: 32px !important; font-size: 0.75rem !important; }
          .la-test-row > div:nth-child(5) { width: 36px !important; font-size: 0.65rem !important; padding: 2px 4px !important; }
          .la-section-title { font-size: 0.82rem; gap: 6px; }
          .la-table th, .la-table td { padding: 8px 10px; }
          .la-filter-card { padding: 10px 12px !important; }
        }
      `}</style>

      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, width: "100vw", height: "100vh", background: "url('/background.jpg') no-repeat center center fixed", backgroundSize: "cover", opacity: 1, zIndex: -2, pointerEvents: "none" }} />
      <div className="la-page-bg">
        <div className="la-wrap">
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <h1 className="la-header-title" style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700, color: "#fff" }}>
              <i className="fas fa-flask" style={{ marginRight: 10 }} />Lab Analytics
            </h1>
            <p className="la-header-sub" style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "rgba(255,255,255,0.8)" }}>Sample testing overview and results</p>
          </div>

          {/* Filter Bar */}
          <div className="la-filter-card" style={{ background: "white", borderRadius: 8, padding: "12px 16px", marginBottom: 16, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb" }}>
            <div className="la-filter-bar" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "0.75rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 120px", minWidth: 120 }}>
                <label style={{ fontSize: "0.65rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>Date From</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  style={{ padding: "6px 10px", fontSize: "0.8rem", border: "1px solid #e5e7eb", borderRadius: 6, outline: "none" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 120px", minWidth: 120 }}>
                <label style={{ fontSize: "0.65rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>Date To</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  style={{ padding: "6px 10px", fontSize: "0.8rem", border: "1px solid #e5e7eb", borderRadius: 6, outline: "none" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 140px", minWidth: 140 }}>
                <label style={{ fontSize: "0.65rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>Lab</label>
                <select value={labFilter} onChange={e => setLabFilter(e.target.value)}
                  style={{ padding: "6px 10px", fontSize: "0.8rem", border: "1px solid #e5e7eb", borderRadius: 6, outline: "none" }}>
                  <option value="">All Labs</option>
                  {allLabs.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 120px", minWidth: 120 }}>
                <label style={{ fontSize: "0.65rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>Commodity</label>
                <select value={commodityFilter} onChange={e => setCommodityFilter(e.target.value)}
                  style={{ padding: "6px 10px", fontSize: "0.8rem", border: "1px solid #e5e7eb", borderRadius: 6, outline: "none" }}>
                  <option value="">All Commodities</option>
                  {allCommodities.map(c => <option key={c} value={c}>{COMMODITY_LABEL[c] || c}</option>)}
                </select>
              </div>
              <div className="la-filter-btns" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button onClick={() => fetchData(dateFrom, dateTo, labFilter, commodityFilter)}
                  style={{ padding: "6px 14px", borderRadius: 6, border: "none", fontWeight: 500, fontSize: "0.75rem", cursor: "pointer", background: "#007890", color: "white" }}>
                  <i className="fas fa-filter" style={{ marginRight: 6 }} />Apply
                </button>
                <button onClick={handleReset}
                  style={{ padding: "6px 14px", borderRadius: 6, border: "none", fontWeight: 500, fontSize: "0.75rem", cursor: "pointer", background: "#6b7280", color: "white" }}>
                  <i className="fas fa-undo" style={{ marginRight: 6 }} />Reset
                </button>
                <button onClick={handleExtractExcel}
                  style={{ padding: "6px 14px", borderRadius: 6, border: "none", fontWeight: 500, fontSize: "0.75rem", cursor: "pointer", background: "#007890", color: "white" }}>
                  <i className="fas fa-file-download" style={{ marginRight: 6 }} />Extract
                </button>
                <button onClick={handleExportPdf}
                  style={{ padding: "6px 14px", borderRadius: 6, border: "none", fontWeight: 500, fontSize: "0.75rem", cursor: "pointer", background: "#d13438", color: "white" }}>
                  <i className="fas fa-file-pdf" style={{ marginRight: 6 }} />PDF
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "14px 18px", color: "#dc2626", marginBottom: 24, fontSize: "0.85rem" }}>
              <i className="fas fa-exclamation-triangle" style={{ marginRight: 8 }} />{error}
            </div>
          )}

          {/* Stat cards */}
          <div className="la-stat-grid">
            <StatCard label="Total Inspections" value={data?.total_inspections ?? 0} icon="fa-clipboard-list" color="#0d9488" borderColor="#0d9488" loading={loading} tooltip="Total number of inspections conducted across all inspectors." />
            <StatCard label="Samples Collected" value={data?.total_samples ?? 0} icon="fa-vial" color="#8b5cf6" borderColor="#8b5cf6" loading={loading} tooltip="Number of inspections where a product sample was collected for lab testing." />
            <StatCard label="Individual Lab Tests" value={data?.total_tests ?? 0} icon="fa-flask" color="#3b82f6" borderColor="#3b82f6" loading={loading} tooltip="Total individual tests run (Fat, Protein, Calcium, DNA). One sample can have multiple tests, e.g. Fat + Protein = 2 tests." />
            <StatCard label="Awaiting COA" value={data?.needs_coa ?? 0} icon="fa-file-upload" color="#f97316" borderColor="#f97316" loading={loading} tooltip="Samples still waiting for a Certificate of Analysis (COA) to be uploaded from the lab. Click to view." href="/inspections?has_coa=NO_COA&sampled=SAMPLED" />
            <StatCard label="Needs Retest" value={data?.needs_retest ?? 0} icon="fa-redo-alt" color="#ef4444" borderColor="#ef4444" loading={loading} tooltip="Samples flagged for retesting due to failed or inconclusive lab results. Click to view." href="/inspections?needs_retest=NEEDS_RETEST" />
          </div>

          {/* Full-width: per-test compliance trend */}
          <div className="la-card" style={{ marginBottom: 16 }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexWrap: "wrap", gap: 10, marginBottom: 4,
            }}>
              <p className="la-section-title" style={{ margin: 0 }}>
                <i className="fas fa-chart-line" style={{ fontSize: "1rem", color: "#007890" }} />
                Compliance Trend by Test
              </p>
              <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" }}>
                {GRANULARITIES.map((g, i) => (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setGranularity(g.key)}
                    style={{
                      padding: "5px 12px", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                      border: "none", borderLeft: i === 0 ? "none" : "1px solid #e5e7eb",
                      background: granularity === g.key ? "#007890" : "#fff",
                      color: granularity === g.key ? "#fff" : "#6b7280",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div style={{ padding: "24px 0", textAlign: "center" }}><Spinner /></div>
            ) : (() => {
              const rows = data?.testComplianceTrend ?? [];
              if (rows.length === 0) {
                return (
                  <div style={{
                    padding: "28px 20px", textAlign: "center",
                    color: "#6b7280", fontSize: "0.8rem", lineHeight: 1.6,
                  }}>
                    <i className="fas fa-chart-line" style={{ fontSize: 22, color: "#d1d5db", display: "block", marginBottom: 10 }} />
                    <b style={{ color: "#374151" }}>No per-test results yet.</b><br />
                    This chart plots the Fat / Protein / Calcium / DNA outcomes captured
                    when a COA/Lab result is uploaded on the Inspection Records page.
                    It fills in as those results are marked.
                  </div>
                );
              }

              // Roll the daily rows up into the chosen bucket. Rates are
              // recomputed from summed counts, never averaged from daily
              // percentages — a day with 1 sample must not weigh the same as a
              // day with 40.
              const buckets = new Map<string, Map<string, { c: number; n: number }>>();
              for (const r of rows) {
                const key = bucketKey(r.day, granularity);
                let per = buckets.get(key);
                if (!per) { per = new Map(); buckets.set(key, per); }
                const cur = per.get(r.test) ?? { c: 0, n: 0 };
                cur.c += r.compliant;
                cur.n += r.assessed;
                per.set(r.test, cur);
              }
              const allKeys = [...buckets.keys()].sort();
              const gcfg = GRANULARITIES.find(g => g.key === granularity)!;
              // Keep the most recent slice: trends are read from the near end.
              const keys = allKeys.slice(-gcfg.maxPoints);
              const hidden = allKeys.length - keys.length;
              const summary = data?.testComplianceSummary ?? {};

              // Every test that has any result at all is drawn; periods with
              // none are zero-filled below so the line stays continuous.
              const shown = TEST_SERIES.filter(s => rows.some(r => r.test === s.key));

              return (
                <>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0 14px" }}>
                    {TEST_SERIES.filter(s => summary[s.key]?.assessed).map(s => {
                      const su = summary[s.key];
                      return (
                        <div key={s.key} style={{
                          display: "flex", alignItems: "center", gap: 7,
                          padding: "6px 10px", borderRadius: 6,
                          border: "1px solid #e5e7eb", background: "#fafafa",
                        }}>
                          <span style={{ width: 9, height: 9, borderRadius: "50%", background: s.color }} />
                          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151" }}>{s.label}</span>
                          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: s.color }}>
                            {su.compliance_rate}%
                          </span>
                          <span style={{ fontSize: "0.68rem", color: "#9ca3af" }}>
                            {su.compliant}/{su.assessed}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ position: "relative", height: 340 }}>
                    <Line
                      data={{
                        labels: keys.map(k => bucketLabel(k, granularity)),
                        datasets: shown
                          .map(s => ({
                            label: s.label,
                            // null (not undefined) so Chart.js breaks the line
                            // over periods with no assessed result, rather than
                            // drawing through them as if they were measured.
                            data: keys.map(k => {
                              const v = buckets.get(k)?.get(s.key);
                              // Real rate whenever anything was assessed, 0 when
                              // nothing was - see the caveat under the chart.
                              return v && v.n ? Math.round((v.c / v.n) * 1000) / 10 : 0;
                            }),
                            borderColor: s.color,
                            backgroundColor: s.color,
                            pointBackgroundColor: s.color,
                            pointRadius: keys.length > 30 ? 2 : 3,
                            pointHoverRadius: 5,
                            borderWidth: 2,
                            tension: 0.3,
                            spanGaps: true,
                          })),
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: "index" as const, intersect: false },
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            mode: "index" as const,
                            intersect: false,
                            callbacks: {
                              label: (ctx: unknown) => {
                                const c = ctx as { dataset: { label: string }; parsed: { y: number | null }; dataIndex: number };
                                if (c.parsed.y === null) return "";
                                const key = TEST_SERIES.find(s => s.label === c.dataset.label)?.key ?? "";
                                const v = buckets.get(keys[c.dataIndex])?.get(key);
                                // Spell out a zero-filled point so it is never
                                // mistaken for a total failure.
                                if (!v || !v.n) return `${c.dataset.label}: no results captured`;
                                return `${c.dataset.label}: ${c.parsed.y.toFixed(1)}% (${v.c}/${v.n})`;
                              },
                            },
                          },
                        },
                        scales: {
                          x: {
                            ticks: {
                              font: { size: 10 },
                              maxRotation: granularity === "day" || granularity === "week" ? 45 : 0,
                              minRotation: 0,
                              autoSkip: true,
                              maxTicksLimit: granularity === "day" ? 15 : 14,
                            },
                            grid: { color: "rgba(0,0,0,0.04)" },
                          },
                          y: {
                            min: 0, max: 105,
                            ticks: { font: { size: 10 }, stepSize: 10, callback: (v: unknown) => (v as number) <= 100 ? `${v}%` : "" },
                            title: { display: true, text: "Compliance %", font: { size: 11 } },
                            grid: { color: "rgba(0,0,0,0.06)" },
                          },
                        },
                      }}
                    />
                  </div>

                  <div style={{
                    marginTop: 12, padding: "9px 12px", borderRadius: 6,
                    background: "#fffbeb", border: "1px solid #fde68a",
                    fontSize: "0.7rem", color: "#92400e", lineHeight: 1.55,
                    display: "flex", alignItems: "flex-start", gap: 8,
                  }}>
                    <i className="fas fa-circle-info" style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>
                      <b>A sharp fall to 0% may just be missing data.</b>{" "}
                      Periods with no captured result are shown as 0%, so a drop does not
                      always mean samples failed. Tests assessed only once or twice in a
                      period also swing the full height of the chart on a single result —
                      hover any point to see the sample count behind it, or use
                      {" "}<b>{granularity === "day" ? "Week or Month" : "Month or Year"}</b>{" "}
                      where each point rests on more samples.
                    </span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: "0.68rem", color: "#9ca3af", textAlign: "center" }}>
                    {hidden > 0 ? (
                      <>
                        Showing the most recent {keys.length} {gcfg.span} of {allKeys.length}
                        {" — switch to "}
                        {granularity === "day" ? "Week or Month" : granularity === "week" ? "Month or Year" : "Year"}
                        {" for the full range"}
                      </>
                    ) : (
                      <>{keys.length} {gcfg.span.replace(/s$/, "")}{keys.length === 1 ? "" : "s"} shown — the full range</>
                    )}
                    {" · "}0% = no result captured for that period
                  </div>
                </>
              );
            })()}
          </div>

          {/* Mid row: Tests breakdown + Monthly trend */}
          <div className="la-mid-grid">

            {/* Test type breakdown */}
            <div className="la-card">
              <p className="la-section-title">
                <i className="fas fa-chart-pie" style={{ fontSize: "1rem", color: "#007890" }} />
                Lab Test Results by Type
              </p>
              {loading ? (
                <div style={{ padding: "24px 0", textAlign: "center" }}><Spinner /></div>
              ) : data ? (
                <div>
                  {TEST_CONFIG.map(t => {
                    const count = data[t.key as keyof LabData] as number;
                    const pct = data.total_samples ? Math.round((count / data.total_samples) * 100) : 0;
                    return (
                      <div key={t.key} className="la-test-row">
                        <div style={{
                          width: 32,
                          height: 32,
                          borderRadius: 10,
                          background: `linear-gradient(135deg, ${t.color}15, ${t.color}28)`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}>
                          <i className={`fas ${t.icon}`} style={{ fontSize: "0.8rem", color: t.color }} />
                        </div>
                        <div style={{ width: 60, fontSize: "0.8rem", fontWeight: 600, color: "#374151" }}>{t.label}</div>
                        <div className="la-bar-bg" style={{ height: 12 }}>
                          <div className="la-bar-fill" style={{
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, ${t.color}, ${t.color}cc)`,
                          }} />
                        </div>
                        <div style={{ width: 40, textAlign: "right", fontSize: "0.82rem", fontWeight: 700, color: "#111827", flexShrink: 0 }}>{count}</div>
                        <div style={{
                          width: 44,
                          textAlign: "right",
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          color: t.color,
                          flexShrink: 0,
                          background: t.color + "12",
                          padding: "2px 6px",
                          borderRadius: 6,
                        }}>{pct}%</div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>


            {/* Monthly trend */}
            <div className="la-card">
              <p className="la-section-title">
                <i className="fas fa-chart-bar" style={{ fontSize: "1rem", color: "#007890" }} />
                Monthly Sample Collection (Last 6 Months)
              </p>
              {loading ? (
                <div style={{ padding: "24px 0", textAlign: "center" }}><Spinner /></div>
              ) : data ? (
                <div style={{ position: "relative", height: 180 }}>
                  <Bar
                    data={{
                      labels: (data.monthly || []).map(m => m.month),
                      datasets: [{
                        label: "Samples",
                        data: (data.monthly || []).map(m => m.count),
                        backgroundColor: "rgba(0,120,144,0.75)",
                        borderRadius: 4,
                        barThickness: 28,
                      }],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (ctx: unknown) => `${(ctx as { parsed: { y: number } }).parsed.y} samples` } },
                      },
                      scales: {
                        x: { ticks: { font: { size: 11 } }, grid: { display: false } },
                        y: { beginAtZero: true, ticks: { font: { size: 10 }, stepSize: Math.ceil(maxMonthly / 5) } },
                      },
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {/* Bottom row: Labs + Commodity */}
          <div className="la-mid-grid">

            {/* Labs */}
            <div className="la-card">
              <p className="la-section-title">
                <i className="fas fa-building" style={{ fontSize: "1rem", color: "#007890" }} />
                Samples Processed per Laboratory
              </p>
              {loading ? (
                <div style={{ padding: "24px 0", textAlign: "center" }}><Spinner /></div>
              ) : data && (data.labs).length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {(data.labs).map((l, i) => {
                    const allMax = Math.max(...data.labs.map(x => x.n), 1);
                    const pct = Math.round((l.n / allMax) * 100);
                    const colors = ["#007890","#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#ec4899","#14b8a6","#64748b","#6366f1"];
                    const col = colors[i % colors.length];
                    return (
                      <div key={l.lab}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#374151" }}>{l.lab}</span>
                          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: col }}>{l.n}</span>
                        </div>
                        <div className="la-bar-bg" style={{ height: 12 }}>
                          <div className="la-bar-fill" style={{
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, ${col}, ${col}bb)`,
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: "#9ca3af", fontSize: "0.8rem", textAlign: "center", padding: "20px 0" }}>No lab data</div>
              )}
            </div>

            {/* Commodity */}
            <div className="la-card">
              <p className="la-section-title">
                <i className="fas fa-boxes" style={{ fontSize: "1rem", color: "#007890" }} />
                Samples by Commodity Type
              </p>
              {loading ? (
                <div style={{ padding: "24px 0", textAlign: "center" }}><Spinner /></div>
              ) : data && (data.commodities).length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {(data.commodities).map(c => {
                    const allComMax = Math.max(...data.commodities.map(x => x.n), 1);
                    const allTotal = data.total_samples;
                    const pct = allComMax ? Math.round((c.n / allComMax) * 100) : 0;
                    const displayPct = allTotal ? Math.round((c.n / allTotal) * 100) : 0;
                    const col = COMMODITY_COLOR[c.commodity] ?? "#64748b";
                    return (
                      <div key={c.commodity}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#374151" }}>
                            {COMMODITY_LABEL[c.commodity] ?? c.commodity}
                          </span>
                          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: col }}>
                            {c.n} <span style={{ fontWeight: 500, color: "#9ca3af", fontSize: "0.72rem" }}>({displayPct}%)</span>
                          </span>
                        </div>
                        <div className="la-bar-bg" style={{ height: 12 }}>
                          <div className="la-bar-fill" style={{
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, ${col}, ${col}bb)`,
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: "#9ca3af", fontSize: "0.8rem", textAlign: "center", padding: "20px 0" }}>No data</div>
              )}
            </div>
          </div>

          {/* Recent Samples Table */}
          <div className="la-card" style={{ padding: "24px 0" }}>
            <p className="la-section-title" style={{ padding: "0 28px 10px", margin: "0 0 0" }}>
              <i className="fas fa-list-alt" style={{ fontSize: "1rem", color: "#007890" }} />
              Recent Samples (Last 50)
            </p>
            {loading ? (
              <div style={{ padding: "32px 0", textAlign: "center" }}><Spinner /></div>
            ) : data && data.recent.length > 0 ? (
              <div className="la-table-scroll" style={{ overflowX: "auto", maxHeight: 520 }}>
                <table className="la-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Client</th>
                      <th>Product</th>
                      <th>Commodity</th>
                      <th>Lab</th>
                      <th>Tests</th>
                      <th>Retest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((r, i) => (
                      <tr key={i}>
                        <td style={{ whiteSpace: "nowrap", color: "#6b7280", fontWeight: 500 }}>
                          {r.date ? new Date(r.date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "\u2014"}
                        </td>
                        <td style={{ fontWeight: 600, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#1f2937" }}>{r.client_name || "\u2014"}</td>
                        <td style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.product_name || "\u2014"}</td>
                        <td>
                          <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: (COMMODITY_COLOR[r.commodity] ?? "#64748b") + "18", color: COMMODITY_COLOR[r.commodity] ?? "#64748b" }}>
                            {(COMMODITY_LABEL[r.commodity] ?? r.commodity) || "\u2014"}
                          </span>
                        </td>
                        <td style={{ color: "#6b7280", fontWeight: 500 }}>{r.lab || <span style={{ color: "#d1d5db" }}>{"\u2014"}</span>}</td>
                        <td>
                          {(r.tests || []).length > 0
                            ? (r.tests || []).map(t => <span key={t} className="la-test-tag">{t.toUpperCase()}</span>)
                            : <span style={{ color: "#d1d5db", fontSize: "0.72rem" }}>None</span>}
                        </td>
                        <td>
                          {(() => {
                            const nr = (r.needs_retest || "").toUpperCase();
                            const isYes = nr === "YES" || nr === "Y";
                            return (
                              <span className={`la-badge ${isYes ? "la-retest-yes" : "la-retest-no"}`}>
                                <i className={`fas fa-${isYes ? "exclamation-circle" : "check-circle"}`} />
                                {isYes ? "Yes" : "No"}
                              </span>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ color: "#9ca3af", fontSize: "0.85rem", textAlign: "center", padding: "32px 0" }}>
                <i className="fas fa-flask" style={{ fontSize: "2rem", display: "block", marginBottom: 12, opacity: 0.3 }} />
                No sample records found
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
