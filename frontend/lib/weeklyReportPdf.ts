/* Weekly Inspector Management Report — PDF builder.
 *
 * One source of truth for the PDF design. Used in two places:
 *  - the Export PDF button on the weekly report page (browser)
 *  - /api/weekly-report/pdf on the Next.js server, which the automatic
 *    Monday email uses to attach the exact same document.
 * Change the design here and both stay identical.
 */

/* ── Report data types (shared with the page) ────────────────────────────── */
export interface PerformanceRow {
  inspector_name: string;
  quarter_target: number;
  weekly_inspections: number;
  prev_inspections: number;
  month_inspections?: number;
  cumulative_inspections: number;
  cumulative_approved: number;
  cumulative_pending: number;
  target_pct: number | null;
  rank: number;
  rank_change: number | null;
}
export interface TrendPoint { week: string; inspections?: number; rate?: number | null; }
export interface MonthlyTrendRow {
  month: string; label: string; inspections: number;
  compliant: number; non_compliant: number; rate: number | null; partial: boolean;
  prev_inspections?: number; prev_rate?: number | null; prev_label?: string;
}
export interface MonthlyFinancialsRow {
  inspector_name: string; inspections: number; hours: number;
  revenue: number; cost: number; profit: number; rev_per_hr: number;
}
export interface MonthlyFinancials {
  rows: MonthlyFinancialsRow[];
  month?: string; month_label?: string; partial?: boolean;
  total_revenue: number; total_cost: number; total_profit: number;
}
export interface SampleRow { inspector_name: string; inspections: number; taken: number; no_sample: number; completed: number; waiting: number; overdue: number; outstanding: number; rank: number; }
export interface OutstandingSample {
  inspector_name: string; client_name: string; commodity: string;
  sample_date: string; age_days: number; overdue: boolean;
}
export interface ApprovalRow {
  inspector_name: string; total_records: number; captured_on_time: number;
  approved: number; pending: number; approval_rate: number; capture_rate: number; rank: number;
}
export interface OccurrenceRow { inspector_name: string; count: number; rank: number; }
export interface OccurrenceDetail {
  inspector_name: string; client_name: string; town: string;
  date_of_inspection: string | null; submitted: string | null; status: string;
}
export interface ComplianceRow {
  inspector_name: string; inspections: number; compliant: number; non_compliant: number;
  not_assessed: number; assessed?: number; rate: number | null; prev_rate: number | null; change: number | null; rank: number;
}
export interface CommodityInspectorRow {
  inspector_name: string; inspections: number; compliant: number; non_compliant: number;
  not_assessed: number; rate: number | null;
}
export interface CommodityComplianceRow {
  commodity: string; inspections: number; compliant: number; non_compliant: number;
  not_assessed: number; rate: number | null; inspectors?: CommodityInspectorRow[];
}
export interface KpiCommodityRow {
  inspector_name: string;
  commodities: { commodity: string; target: number; done: number; pct: number | null }[];
  total_target: number; total_done: number; total_pct: number | null;
}
export interface FinanceStage {
  avg: number | null; median: number | null; count: number;
  prev_avg: number | null; prev_count: number; target: number | null; label: string;
}
export interface FinanceEfficiency {
  timeliness: { approval: FinanceStage; send_docs: FinanceStage; invoice: FinanceStage; sample_to_coa: FinanceStage };
  speed_to_cash: FinanceStage;
  invoiced_week: { rand: number; jobs: number };
  invoiced_prev: { rand: number; jobs: number };
  unbilled: { rand: number; jobs: number; aged_rand: number; aged_jobs: number };
  rates: { hour: number; km: number; sample: number };
}
export interface TravelRow {
  inspector_name: string; km: number; hours: number; inspections: number;
  avg_km_per_inspection: number; new_facilities: number; rank: number;
}
export interface InspectionDetailRow {
  date: string | null; client: string; commodity: string;
  result: "Pass" | "Fail" | "Not recorded" | string;
  approved: boolean; sample_taken: boolean; sample_result_back: boolean;
}
export interface InspectorDetail {
  name: string;
  daily: { date: string; count: number }[];
  inspections: InspectionDetailRow[];
}
export interface ReportResponse {
  success: boolean;
  inspector_detail?: InspectorDetail | null;
  week_start: string; week_end: string; is_single_week: boolean; quarter: string;
  admin_lag_days: number; sample_overdue_days: number;
  totals: {
    inspections: number; prev_inspections: number; active_inspectors: number;
    samples: number; occurrences: number; approved: number; pending: number;
    overall_compliance: number | null; prev_overall_compliance: number | null;
    total_km: number; total_hours: number;
  };
  /* Back-office turnaround per stage. Timing only — never invoice amounts. */
  turnaround?: Record<string, {
    avg: number | null; count: number; prev_avg: number | null;
    target: number; label: string;
  }>;
  /* Administration throughput this period vs last. Counts + timing only. */
  throughput?: {
    sent: { count: number; prev: number };
    invoices_uploaded: { count: number; prev: number };
    coas_uploaded: { count: number; prev: number };
    approvals_done?: { count: number; prev: number };
    lab_results?: { cur: { needed: number; back: number }; prev: { needed: number; back: number } };
    invoice_completion?: {
      cur: { needed: number; done: number; todo?: { client: string; date: string | null; age: number | null }[] };
      prev: { needed: number; done: number; todo?: { client: string; date: string | null; age: number | null }[] };
    };
    samples_at_lab?: number;
    invoice_time: { avg: number | null; prev_avg: number | null; count: number };
    top_senders: { name: string; count: number; prev: number }[];
  };
  /* Whole current backlog — every inspection not yet fully completed, by stage. */
  outstanding_backlog?: {
    needs_approval: number; not_sent: number; needs_invoice: number;
    needs_coa: number; complete: number; outstanding_total: number; total: number;
  };
  performance: PerformanceRow[];
  kpi_commodity?: KpiCommodityRow[];
  inspection_trend: TrendPoint[];
  samples: SampleRow[];
  sample_status: { completed: number; waiting: number; overdue: number };
  outstanding_samples: OutstandingSample[];
  approvals: ApprovalRow[];
  occurrences: OccurrenceRow[];
  occurrence_detail: OccurrenceDetail[];
  compliance: ComplianceRow[];
  commodity_compliance?: CommodityComplianceRow[];
  compliance_trend: TrendPoint[];
  monthly_trend?: MonthlyTrendRow[];
  admin_monthly?: { month: string; label: string; invoices: number; sent: number; partial: boolean;
    prev_invoices?: number; prev_sent?: number; prev_label?: string }[];
  admin_people?: { name: string; invoices: number; sent: number; avg_days: number | null; days_count: number }[];
  commodity_week?: { commodity: string; count: number; prev: number }[];
  billing_backlog?: {
    total: number;
    buckets: { d0_7: number; d8_30: number; d31_60: number; d60_plus: number };
    top_clients: { client: string; jobs: number; oldest: number }[];
    oldest_days: number;
  };
  roster?: string[];
  monthly_financials?: MonthlyFinancials;
  monthly_financials_series?: MonthlyFinancials[];
  finance_efficiency?: FinanceEfficiency;
  travel: TravelRow[];
  error?: string;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + (iso.length === 10 ? "T12:00:00" : ""))
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
export function fmtWeekLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

/* ── PDF builder — returns the jsPDF document ────────────────────────────── */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function buildWeeklyReportPdf(data: ReportResponse, logo: string | null): Promise<any> {
  const jsPDFModule: any = await import("jspdf");
  const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
  const autoTableModule: any = await import("jspdf-autotable");
  const autoTable = autoTableModule.default || autoTableModule.autoTable || autoTableModule;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, ML = 14, MR = 14, CW = W - ML - MR;
  const TEAL: [number, number, number] = [0, 120, 144];
  const DARK: [number, number, number] = [17, 24, 39];
  const GRAY: [number, number, number] = [107, 114, 128];
  const GREEN: [number, number, number] = [21, 128, 61];
  const RED: [number, number, number] = [220, 38, 38];
  const t2 = data.totals;
  const periodLabel = data.is_single_week
    ? `Monday ${fmtDate(data.week_start)} — Sunday ${fmtDate(data.week_end)}`
    : `${fmtDate(data.week_start)} — ${fmtDate(data.week_end)}`;
  const mv = (n: number | null, suffix = "") =>
    n === null || n === undefined ? "new" : n === 0 ? "-" : `${n > 0 ? "+" : ""}${n}${suffix}`;

  let y = 0;
  const header = (title: string) => {
    doc.setFillColor(...TEAL);
    doc.rect(ML, y, CW, 9, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11); doc.setFont("helvetica", "bold");
    doc.text(title, ML + 3, y + 6);
    doc.setFont("helvetica", "normal");
    y += 13;
  };
  const table = (head: string[], body: (string | number)[][], redRows: number[] = [], centerCols: number[] = []) => {
    const centerSet = new Set(centerCols);
    autoTable(doc, {
      startY: y + 1,
      head: [head],
      body,
      rowPageBreak: "avoid",
      margin: { left: ML, right: MR },
      styles: { fontSize: 7.5, cellPadding: 2.2, textColor: DARK },
      headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (h: any) => {
        if (centerSet.has(h.column.index)) h.cell.styles.halign = "center";
        if (h.section === "body" && redRows.includes(h.row.index)) h.cell.styles.textColor = RED;
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  };
  const needPage = (space: number) => {
    if (y + space > 283) { doc.addPage(); y = 16; }
  };
  // Sections flow on — a new page only when barely any room is left, so pages
  // never end in big blank gaps (long tables continue onto the next page)
  const sectionPage = () => {
    if (y > 215) { doc.addPage(); y = 16; } else if (y > 20) { y += 4; }
  };

  /* ── Chart drawing helpers (match the on-screen visuals) ── */
  const AMBER: [number, number, number] = [217, 119, 6];
  const BLUE: [number, number, number] = [37, 99, 235];
  const HAIR: [number, number, number] = [243, 244, 246];

  const chartTitle = (txt: string) => {
    doc.setTextColor(...DARK); doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text(txt, ML, y + 3);
    doc.setFont("helvetica", "normal");
    y += 8;
  };

  // Shared bar geometry so every bar chart lines up on the same edges
  const BAR_STEP = 6.4, BAR_H = 4.3, LABEL_W = 44, VAL_W = 14;

  // Two measures side by side in ONE chart — each half is scaled to its own maximum
  const drawDualBars = (title: string, rows: { label: string; a: number; b: number }[], aLabel: string, bLabel: string, aColor: [number, number, number], bColor: [number, number, number]) => {
    needPage(Math.min(21 + rows.length * BAR_STEP, 260));
    chartTitle(title);
    const halfW = (CW - LABEL_W - 4) / 2;
    const aX = ML + LABEL_W + 2, bX = aX + halfW + 4;
    const aBarW = halfW - VAL_W - 2, bBarW = halfW - VAL_W - 2;
    doc.setFontSize(6.8); doc.setTextColor(...GRAY);
    doc.setFillColor(...aColor); doc.rect(aX, y, 3.2, 3.2, "F");
    doc.text(aLabel, aX + 4.6, y + 2.6);
    doc.setFillColor(...bColor); doc.rect(bX, y, 3.2, 3.2, "F");
    doc.text(bLabel, bX + 4.6, y + 2.6);
    y += 7;
    const aMax = Math.max(...rows.map(r => r.a), 1);
    const bMax = Math.max(...rows.map(r => r.b), 1);
    rows.forEach(r => {
      needPage(BAR_STEP + 2);
      doc.setFontSize(7.4); doc.setTextColor(55, 65, 81);
      doc.text(String(r.label).substring(0, 30), ML, y + 3.4);
      doc.setFillColor(...HAIR); doc.roundedRect(aX, y, aBarW, BAR_H, 1, 1, "F");
      const aw = Math.max((r.a / aMax) * aBarW, r.a > 0 ? 1.4 : 0);
      if (aw > 0) { doc.setFillColor(...aColor); doc.roundedRect(aX, y, aw, BAR_H, 1, 1, "F"); }
      doc.setFont("helvetica", "bold"); doc.setTextColor(...DARK); doc.setFontSize(7.4);
      doc.text(r.a.toLocaleString("en-ZA"), aX + aBarW + VAL_W, y + 3.4, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFillColor(...HAIR); doc.roundedRect(bX, y, bBarW, BAR_H, 1, 1, "F");
      const bw = Math.max((r.b / bMax) * bBarW, r.b > 0 ? 1.4 : 0);
      if (bw > 0) { doc.setFillColor(...bColor); doc.roundedRect(bX, y, bw, BAR_H, 1, 1, "F"); }
      doc.setFont("helvetica", "bold"); doc.setTextColor(...DARK); doc.setFontSize(7.4);
      doc.text(r.b.toLocaleString("en-ZA"), W - MR, y + 3.4, { align: "right" });
      doc.setFont("helvetica", "normal");
      y += BAR_STEP;
    });
    y += 6;
  };

  const drawHBars = (title: string, rows: { label: string; value: number }[], color: [number, number, number], unit = "") => {
    needPage(Math.min(14 + rows.length * BAR_STEP, 260)); // keep title + whole chart on one page
    chartTitle(title);
    const max = Math.max(...rows.map(r => r.value), 1);
    const barX = ML + LABEL_W + 2, barW = CW - LABEL_W - VAL_W - 4;
    rows.forEach(r => {
      needPage(BAR_STEP + 2);
      doc.setFontSize(7.4); doc.setTextColor(55, 65, 81);
      doc.text(String(r.label).substring(0, 30), ML, y + 3.4);
      doc.setFillColor(...HAIR);
      doc.roundedRect(barX, y, barW, BAR_H, 1, 1, "F");
      const bw = Math.max((r.value / max) * barW, r.value > 0 ? 1.4 : 0);
      if (bw > 0) { doc.setFillColor(...color); doc.roundedRect(barX, y, bw, BAR_H, 1, 1, "F"); }
      doc.setFont("helvetica", "bold"); doc.setTextColor(...DARK); doc.setFontSize(7.4);
      doc.text(`${r.value.toLocaleString("en-ZA")}${unit}`, W - MR, y + 3.4, { align: "right" });
      doc.setFont("helvetica", "normal");
      y += BAR_STEP;
    });
    y += 6;
  };

  const drawStackedBars = (title: string, rows: { label: string; a: number; b: number }[], aLabel: string, bLabel: string, aColor: [number, number, number], bColor: [number, number, number]) => {
    needPage(Math.min(21 + rows.length * BAR_STEP, 260));
    chartTitle(title);
    // Legend sits against the right edge of the chart
    doc.setFontSize(6.8);
    const bTextW = doc.getTextWidth(bLabel), aTextW = doc.getTextWidth(aLabel);
    let lx = W - MR - bTextW;
    doc.setTextColor(...GRAY);
    doc.text(bLabel, lx, y + 2.6);
    doc.setFillColor(...bColor); doc.rect(lx - 4.6, y, 3.2, 3.2, "F");
    lx = lx - 4.6 - 7 - aTextW;
    doc.text(aLabel, lx, y + 2.6);
    doc.setFillColor(...aColor); doc.rect(lx - 4.6, y, 3.2, 3.2, "F");
    y += 7;
    const max = Math.max(...rows.map(r => r.a + r.b), 1);
    const barX = ML + LABEL_W + 2, barW = CW - LABEL_W - VAL_W - 4;
    rows.forEach(r => {
      needPage(BAR_STEP + 2);
      doc.setFontSize(7.4); doc.setTextColor(55, 65, 81);
      doc.text(String(r.label).substring(0, 30), ML, y + 3.4);
      doc.setFillColor(...HAIR);
      doc.roundedRect(barX, y, barW, BAR_H, 1, 1, "F");
      const aw = (r.a / max) * barW, bw2 = (r.b / max) * barW;
      if (aw > 0) { doc.setFillColor(...aColor); doc.roundedRect(barX, y, Math.max(aw, 1), BAR_H, 1, 1, "F"); }
      if (bw2 > 0) { doc.setFillColor(...bColor); doc.roundedRect(barX + aw, y, Math.max(bw2, 1), BAR_H, 1, 1, "F"); }
      doc.setFont("helvetica", "bold"); doc.setTextColor(...DARK); doc.setFontSize(7.4);
      doc.text(`${r.a}/${r.a + r.b}`, W - MR, y + 3.4, { align: "right" });
      doc.setFont("helvetica", "normal");
      y += BAR_STEP;
    });
    y += 6;
  };

  const drawTrend = (title: string, points: { label: string; value: number | null }[], color: [number, number, number], unit = "", chH = 34) => {
    needPage(11 + chH + 15);
    chartTitle(title);
    const vals = points.map(p => p.value).filter((v): v is number => v !== null);
    if (!vals.length) return;
    const min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
    const chX = ML + 4, chW = CW - 8, yTop = y + 2;
    const xs = (i: number) => chX + (i * chW) / Math.max(points.length - 1, 1);
    const ys = (v: number) => yTop + chH - ((v - min) / span) * chH;
    doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.2);
    doc.line(ML, yTop + chH, ML + CW, yTop + chH);
    doc.setDrawColor(...color); doc.setLineWidth(0.7);
    let prev: [number, number] | null = null;
    points.forEach((p, i) => {
      if (p.value === null) { prev = null; return; }
      const X = xs(i), Y = ys(p.value);
      if (prev) doc.line(prev[0], prev[1], X, Y);
      prev = [X, Y];
    });
    points.forEach((p, i) => {
      if (p.value === null) return;
      doc.setFillColor(...color); doc.circle(xs(i), ys(p.value), 1.1, "F");
    });
    points.forEach((p, i) => {
      doc.setFontSize(6.2); doc.setTextColor(...GRAY);
      doc.text(fmtWeekLabel(p.label), xs(i), yTop + chH + 4.5, { align: "center" });
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...DARK);
      doc.text(`${p.value === null ? "-" : p.value}${unit}`, xs(i), yTop + chH + 8.2, { align: "center" });
      doc.setFont("helvetica", "normal");
    });
    y = yTop + chH + 14;
  };

  const drawDoughnut = (parts: { label: string; value: number; color: [number, number, number] }[]) => {
    const total = parts.reduce((s, p) => s + p.value, 0);
    if (!total) return;
    const r = 21;
    needPage(2 * r + 14);
    // The chart itself sits on the page centre line; the legend hangs to its right
    doc.setFontSize(7.5);
    const legendTexts = parts.map(p => `${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)`);
    const cx = W / 2, cy = y + r + 2;
    let angle = -Math.PI / 2;
    parts.forEach(p => {
      if (p.value <= 0) return;
      const sweep = (p.value / total) * Math.PI * 2;
      const steps = Math.max(2, Math.ceil(sweep / 0.12));
      const poly: [number, number][] = [[cx, cy]];
      for (let i = 0; i <= steps; i++) {
        const a = angle + (sweep * i) / steps;
        poly.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      const rel: [number, number][] = [];
      for (let i = 1; i < poly.length; i++) rel.push([poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]]);
      doc.setFillColor(...p.color);
      doc.lines(rel, cx, cy, [1, 1], "F", true);
      angle += sweep;
    });
    doc.setFillColor(255, 255, 255);
    doc.circle(cx, cy, r * 0.55, "F");
    doc.setTextColor(...DARK); doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text(String(total), cx, cy + 0.5, { align: "center" });
    doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(...GRAY);
    doc.text("samples", cx, cy + 4.5, { align: "center" });
    // legend — vertically centred beside the chart
    let ly = cy - (parts.length * 7) / 2 + 1;
    parts.forEach((p, i) => {
      doc.setFillColor(...p.color); doc.rect(cx + r + 10, ly, 3.6, 3.6, "F");
      doc.setTextColor(...DARK); doc.setFontSize(7.5);
      doc.text(legendTexts[i], cx + r + 15.5, ly + 2.9);
      ly += 7;
    });
    y = cy + r + 8;
  };

  /* ══ PAGE 1: COVER — same design as the Inspector Analytics PDF ══ */
  const H = 297;
  const WHITE: [number, number, number] = [255, 255, 255];
  const GRAY_LIGHT: [number, number, number] = [156, 163, 175];
  doc.setFillColor(...DARK);
  doc.rect(0, 0, W, H, "F");
  // Subtle decorative accent lines
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.8);
  doc.line(ML, 42, W - MR, 42);
  doc.line(ML, H - 62, W - MR, H - 62);
  // Logo
  if (logo) { try { doc.addImage(logo, "PNG", W / 2 - 18, 58, 36, 32); } catch { /* skip */ } }
  const logoBottom = logo ? 102 : 80;
  // Company name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...WHITE);
  doc.text("FOOD SAFETY AGENCY (PTY) LTD", W / 2, logoBottom, { align: "center" });
  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor(...TEAL);
  doc.text("Weekly Inspector Management Report", W / 2, logoBottom + 11, { align: "center" });
  // Decorative teal bar
  doc.setFillColor(...TEAL);
  doc.rect(W / 2 - 30, logoBottom + 16.5, 60, 1.2, "F");
  // Period + quarter
  doc.setFontSize(11);
  doc.setTextColor(...GRAY_LIGHT);
  doc.text(`Reporting period: ${periodLabel}`, W / 2, logoBottom + 27, { align: "center" });
  doc.setFontSize(10);
  doc.text(data.quarter, W / 2, logoBottom + 34, { align: "center" });
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text("This report contains no financial information.", W / 2, logoBottom + 43, { align: "center" });
  // Contents list — fills the middle of the cover and tells the reader what's inside
  doc.setFontSize(9);
  doc.setTextColor(...TEAL);
  doc.text("IN THIS REPORT", W / 2, logoBottom + 58, { align: "center" });
  doc.setFontSize(9.5);
  doc.setTextColor(...GRAY_LIGHT);
  [
    "Last Week's Winners",
    "Last Week's Watch-Outs",
    "Action Points for Last Week",
    "1. Inspection Performance",
    "2. Sample Tracking",
    "3. Approval versus Capturing",
    "4. Weekly Compliance",
    "5. Travel Activity",
  ].forEach((s, i) => {
    doc.text(s, W / 2, logoBottom + 66 + i * 7, { align: "center" });
  });
  // Confidential badge at bottom
  doc.setFontSize(8);
  doc.text("CONFIDENTIAL — For authorized personnel only", W / 2, H - 42, { align: "center" });

  /* ══ PAGE 2: KEY PERFORMANCE INDICATORS — analytics-style cards ══ */
  doc.addPage();
  const drawKpiCard = (x: number, cy: number, w: number, h: number, label: string, value: string, color: [number, number, number]) => {
    doc.setFillColor(246, 248, 250);
    doc.roundedRect(x, cy, w, h, 2, 2, "F");
    doc.setFillColor(...color);
    doc.rect(x, cy, w, 2.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(19);
    doc.setTextColor(...color);
    doc.text(value, x + w / 2, cy + h / 2, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(doc.splitTextToSize(label.toUpperCase(), w - 6), x + w / 2, cy + h / 2 + 9, { align: "center" });
  };
  y = 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...DARK);
  doc.text("Key Performance Indicators", ML, y);
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.7);
  doc.line(ML, y + 2.5, ML + 78, y + 2.5);
  y += 12;

  const AMBER0: [number, number, number] = [217, 119, 6];
  const compColor: [number, number, number] = t2.overall_compliance !== null && t2.overall_compliance >= 70 ? GREEN : AMBER0;
  const cardH = 38, gap = 5;
  const w3 = (CW - 2 * gap) / 3;
  drawKpiCard(ML, y, w3, cardH, `Inspections (${mv(t2.inspections - t2.prev_inspections)} vs previous)`, String(t2.inspections), TEAL);
  drawKpiCard(ML + w3 + gap, y, w3, cardH, "Active inspectors", String(t2.active_inspectors), [37, 99, 235]);
  drawKpiCard(ML + 2 * (w3 + gap), y, w3, cardH, "Samples taken", String(t2.samples), AMBER0);
  y += cardH + gap;
  const w2 = (CW - gap) / 2;
  drawKpiCard(ML, y, w2, cardH,
    `Overall compliance (${t2.overall_compliance !== null && t2.prev_overall_compliance !== null ? mv(Math.round((t2.overall_compliance - t2.prev_overall_compliance) * 10) / 10, "pt") : "n/a"} vs previous)`,
    t2.overall_compliance === null ? "-" : `${t2.overall_compliance}%`, compColor);
  drawKpiCard(ML + w2 + gap, y, w2, cardH, "Kilometres travelled", t2.total_km.toLocaleString("en-ZA"), TEAL);
  y += cardH + 14;

  /* ══ THIS WEEK'S WINNERS — the good news first. Every winner is computed
     straight from the week's numbers; categories with no data are skipped. ══ */
  const winners: { label: string; name: string; value: string }[] = [];
  const topPerf = data.performance[0];
  if (topPerf && topPerf.weekly_inspections > 0) winners.push({ label: "Most Inspections", name: topPerf.inspector_name, value: `${topPerf.weekly_inspections} inspections` });
  // Fastest to approve = highest share of their own inspections already
  // approved (approved ÷ total), so someone who cleared their whole queue wins
  // over someone who merely approved a big raw count. Volume breaks ties.
  const topAppr = [...data.approvals]
    .filter(a => a.total_records > 0 && a.approved > 0)
    .sort((a, b) =>
      (b.approved / b.total_records) - (a.approved / a.total_records)
      || b.approved - a.approved)[0];
  if (topAppr) {
    const pct = Math.round(topAppr.approved * 100 / topAppr.total_records);
    winners.push({ label: "Fastest to Approve", name: topAppr.inspector_name, value: `${pct}% approved (${topAppr.approved} of ${topAppr.total_records})` });
  }
  const topComp = [...data.compliance].filter(c => c.compliant + c.non_compliant > 0).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0) || (b.inspections ?? 0) - (a.inspections ?? 0))[0];
  if (topComp) winners.push({ label: "Best Compliance", name: topComp.inspector_name, value: `${topComp.rate}% of ${topComp.compliant + topComp.non_compliant} assessed` });
  if (winners.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...DARK);
    doc.text("Last Week's Winners", ML, y);
    doc.setDrawColor(...AMBER0);
    doc.setLineWidth(0.7);
    doc.line(ML, y + 2.5, ML + 60, y + 2.5);
    y += 8;
    const wc = (CW - 2 * gap) / 3, wch = 24;
    winners.slice(0, 6).forEach((w0, i) => {
      const x = ML + (i % 3) * (wc + gap), yy = y + Math.floor(i / 3) * (wch + 5);
      doc.setFillColor(255, 251, 235);
      doc.roundedRect(x, yy, wc, wch, 2, 2, "F");
      doc.setFillColor(...AMBER0);
      doc.rect(x, yy, wc, 2.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8); doc.setTextColor(...GRAY);
      doc.text(w0.label.toUpperCase(), x + wc / 2, yy + 8.5, { align: "center" });
      doc.setFontSize(10); doc.setTextColor(...DARK);
      doc.text(w0.name, x + wc / 2, yy + 14.8, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5); doc.setTextColor(...GRAY);
      doc.text(w0.value, x + wc / 2, yy + 20, { align: "center" });
    });
    y += Math.ceil(Math.min(winners.length, 6) / 3) * (wch + 5) + 10;
  }

  /* ══ WATCH-OUTS — the mirror of the winners block, red instead of amber, so
     the bad news sits beside the good news instead of hiding inside it.
     Categories with nothing to report are skipped, same as the winners. ══ */
  const watchOuts: { label: string; name: string; value: string }[] = [];
  const worstPending = [...data.approvals]
    .sort((a, b) => b.pending - a.pending || b.total_records - a.total_records)[0];
  if (worstPending && worstPending.pending > 0) watchOuts.push({
    label: "Most Not Approved",
    name: worstPending.inspector_name,
    value: `${worstPending.pending} of ${worstPending.total_records} not approved`,
  });
  if (watchOuts.length > 0) {
    const wch2 = 24;
    needPage(8 + Math.ceil(Math.min(watchOuts.length, 6) / 3) * (wch2 + 5) + 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...DARK);
    doc.text("Last Week's Watch-Outs", ML, y);
    doc.setDrawColor(...RED);
    doc.setLineWidth(0.7);
    doc.line(ML, y + 2.5, ML + 60, y + 2.5);
    y += 8;
    const wc = (CW - 2 * gap) / 3;
    watchOuts.slice(0, 6).forEach((w0, i) => {
      const x = ML + (i % 3) * (wc + gap), yy = y + Math.floor(i / 3) * (wch2 + 5);
      doc.setFillColor(254, 242, 242);
      doc.roundedRect(x, yy, wc, wch2, 2, 2, "F");
      doc.setFillColor(...RED);
      doc.rect(x, yy, wc, 2.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8); doc.setTextColor(...GRAY);
      doc.text(w0.label.toUpperCase(), x + wc / 2, yy + 8.5, { align: "center" });
      doc.setFontSize(10); doc.setTextColor(...DARK);
      doc.text(w0.name, x + wc / 2, yy + 14.8, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5); doc.setTextColor(...GRAY);
      doc.text(w0.value, x + wc / 2, yy + 20, { align: "center" });
    });
    y += Math.ceil(Math.min(watchOuts.length, 6) / 3) * (wch2 + 5) + 10;
  }

  /* ══ ACTION POINTS — turned automatically from this week's numbers into
     instructions, so the report tells management what to DO. Shares the KPI
     page so the whole "what happened + what to do" story is one page. ══ */
  const actions: { sev: "red" | "amber"; text: string }[] = [];
  const backlog = data.approvals.filter(a => a.pending > 0);
  const backlogTotal = backlog.reduce((s, a) => s + a.pending, 0);
  if (backlogTotal > 0) {
    const worst = [...backlog].sort((a, b) => b.pending - a.pending).slice(0, 3)
      .map(a => `${a.inspector_name} (${a.pending} waiting)`).join(", ");
    actions.push({
      sev: backlogTotal >= 50 ? "red" : "amber",
      text: `Approve the backlog: ${backlogTotal} inspections are still waiting for office approval. Largest backlogs: ${worst}. Every day they wait, the ${data.admin_lag_days}-day standard slips further.`,
    });
  }
  const lateCap = data.approvals.filter(a => a.capture_rate < 80 && a.total_records >= 5);
  if (lateCap.length > 0) {
    actions.push({
      sev: "amber",
      text: `Chase late capturing: ${lateCap.map(a => `${a.inspector_name} captured only ${a.capture_rate}% of inspections within ${data.admin_lag_days} days`).join("; ")}. Remind them to capture on the day of the inspection.`,
    });
  }
  const lowComp = data.compliance.filter(c => (c.compliant + c.non_compliant) >= 10 && c.rate !== null && c.rate < 50);
  if (lowComp.length > 0) {
    actions.push({
      sev: "red",
      text: `Follow up on low pass rates: ${lowComp.map(c => `${c.inspector_name} at ${c.rate}%${c.change !== null ? ` (${c.change > 0 ? "+" : ""}${c.change}pt vs last week)` : ""}`).join("; ")}. Look at which clients and products are failing and whether intervention is needed.`,
    });
  }
  const noOutcome = data.compliance.reduce((s, c) => s + (c.not_assessed ?? 0), 0);
  if (noOutcome >= 20) {
    const worstNo = [...data.compliance].sort((a, b) => (b.not_assessed ?? 0) - (a.not_assessed ?? 0)).slice(0, 3)
      .map(c => `${c.inspector_name} (${c.not_assessed})`).join(", ");
    actions.push({
      sev: "red",
      text: `Get outcomes recorded: ${noOutcome} of last week's inspections have no compliant / non-compliant outcome recorded, so nobody knows whether those clients are safe. Most outcomes missing: ${worstNo}. An inspection without an outcome cannot count as compliant.`,
    });
  }
  if (data.sample_status.overdue > 0) {
    actions.push({
      sev: "red",
      text: `Chase ${data.sample_status.overdue} overdue sample${data.sample_status.overdue === 1 ? "" : "s"}: more than ${data.sample_overdue_days} days with no lab result. The list is in Section 2 — find out if each one is stuck with the inspector, the courier or the laboratory.`,
    });
  }
  const noTarget = data.performance.filter(p => !p.quarter_target).length;
  if (noTarget > 0) {
    actions.push({
      sev: "amber",
      text: `Set quarterly targets: ${noTarget} of ${data.performance.length} inspectors have no ${data.quarter} target captured, so their target progress cannot be measured. Capture the targets so next week's report can track them.`,
    });
  }
  const dropPct = t2.prev_inspections > 0 ? Math.round(((t2.inspections - t2.prev_inspections) * 100) / t2.prev_inspections) : 0;
  if (dropPct <= -15) {
    actions.push({
      sev: "amber",
      text: `Inspections dropped ${Math.abs(dropPct)}% (${t2.prev_inspections} the week before to ${t2.inspections} last week). Check leave, planning and routes so the volume recovers.`,
    });
  }

  needPage(40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...DARK);
  doc.text("Action Points for Last Week", ML, y);
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.7);
  doc.line(ML, y + 2.5, ML + 70, y + 2.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  doc.text("Created automatically from last week's numbers. Red = act now, amber = needs attention.", ML, y + 9);
  y += 17;
  if (actions.length === 0) {
    doc.setFillColor(...GREEN);
    doc.circle(ML + 2, y + 1.5, 2.1, "F");
    doc.setTextColor(...DARK); doc.setFontSize(10.5);
    doc.text("Nothing needed urgent attention last week — all measures are within limits.", ML + 8, y + 3);
  } else {
    doc.setFontSize(10);
    actions.forEach((a, i) => {
      const lines = doc.splitTextToSize(a.text, CW - 15) as string[];
      const blockH = lines.length * 5.1 + 8;
      needPage(blockH);
      doc.setFillColor(...(a.sev === "red" ? RED : AMBER0));
      doc.circle(ML + 2.4, y + 2.2, 2.1, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...DARK);
      doc.text(`${i + 1}.`, ML + 8, y + 3.6);
      doc.setFont("helvetica", "normal");
      doc.text(lines, ML + 15, y + 3.6);
      y += blockH;
    });
  }

  sectionPage();

  /* ── 1. Inspection performance ── */
  header("1. Inspection Performance");
  const apprOf = (name: string) => data.approvals.find(a => a.inspector_name === name);
  const perfTotals = {
    week: data.performance.reduce((s, p) => s + p.weekly_inspections, 0),
    approved: data.approvals.reduce((s, a) => s + a.approved, 0),
    pending: data.approvals.reduce((s, a) => s + a.pending, 0),
    cum: data.performance.reduce((s, p) => s + p.cumulative_inspections, 0),
  };
  autoTable(doc, {
    startY: y + 1,
    head: [["Rank", "Inspector", "Quarterly Target", data.is_single_week ? "Last Week" : "This Period", "Approved", "Waiting Approval", "vs Week Before", "Quarter So Far", "% of Target", "Rank Change"]],
    body: data.performance.map(p => [p.rank, p.inspector_name, p.quarter_target || "No target set", p.weekly_inspections, apprOf(p.inspector_name)?.approved ?? 0, apprOf(p.inspector_name)?.pending ?? 0, mv(p.weekly_inspections - (p.prev_inspections ?? 0)), p.cumulative_inspections, p.target_pct === null ? "-" : `${p.target_pct}%`, mv(p.rank_change)]),
    foot: [["", "Whole team — grand total", "", perfTotals.week, perfTotals.approved, perfTotals.pending, "", perfTotals.cum, "", ""]],
    margin: { left: ML, right: MR },
    styles: { fontSize: 7, cellPadding: 2.2, textColor: DARK },
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontSize: 7, fontStyle: "bold" },
    footStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 7, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "center" }, 5: { halign: "center" },
      6: { halign: "center" }, 7: { halign: "center" }, 8: { halign: "center" }, 9: { halign: "center" },
    },
    didParseCell: (h: any) => {
      if (h.section !== "body") {
        if (h.column.index !== 1 && h.column.index !== 2) h.cell.styles.halign = "center";
        return;
      }
      const raw = String(h.cell.raw);
      // Podium — gold, silver, bronze tints for the top three
      if (h.row.index === 0) h.cell.styles.fillColor = [254, 243, 199];
      else if (h.row.index === 1) h.cell.styles.fillColor = [226, 232, 240];
      else if (h.row.index === 2) h.cell.styles.fillColor = [255, 237, 213];
      if (h.column.index === 0) { h.cell.styles.fontStyle = "bold"; h.cell.styles.textColor = TEAL; }
      if (h.column.index === 1) h.cell.styles.fontStyle = "bold";
      if (h.column.index === 3) h.cell.styles.fontStyle = "bold";
      if (h.column.index === 2 && raw === "No target set") h.cell.styles.textColor = GRAY;
      // This week's approvals — approved green, waiting red when something waits
      if (h.column.index === 4) { h.cell.styles.fontStyle = "bold"; h.cell.styles.textColor = GREEN; }
      if (h.column.index === 5) { h.cell.styles.fontStyle = "bold"; h.cell.styles.textColor = raw !== "0" ? RED : GRAY; }
      // Movement columns — green up, red down, gray unchanged
      if (h.column.index === 6 || h.column.index === 9) {
        h.cell.styles.fontStyle = "bold";
        if (raw.startsWith("+")) h.cell.styles.textColor = GREEN;
        else if (raw.startsWith("-") && raw.length > 1) h.cell.styles.textColor = RED;
        else h.cell.styles.textColor = GRAY;
      }
      if (h.column.index === 8 && raw !== "-") h.cell.styles.fontStyle = "bold";
    },
  });
  y = (doc as any).lastAutoTable.finalY + 3;
  doc.setTextColor(...DARK); doc.setFontSize(7.5);
  doc.text(`"Approved" plus "Waiting Approval" add up to last week's inspections. "Quarter So Far" is every inspection this quarter (${data.quarter}) up to the end of last week.`, ML, y + 2);
  y += 8;
  drawStackedBars(
    `Inspections this ${data.is_single_week ? "week" : "period"} — normal inspections vs occurrence reports`,
    data.performance.map(p => {
      const occ = data.occurrences.find(o => o.inspector_name === p.inspector_name)?.count ?? 0;
      return { label: p.inspector_name, a: p.weekly_inspections - occ, b: occ };
    }),
    "Normal inspections", "Occurrence reports", TEAL, AMBER,
  );
  drawStackedBars(
    "Of those inspections — approved vs still waiting for approval",
    data.performance
      .map(p => {
        const a = data.approvals.find(x => x.inspector_name === p.inspector_name);
        return { label: p.inspector_name, a: a?.approved ?? 0, b: a?.pending ?? 0 };
      })
      .sort((x, z) => z.a - x.a || (z.a + z.b) - (x.a + x.b)),
    "Approved", "Waiting approval", BLUE, RED,
  );
  /* Travel effort behind the inspections — covering ground fast is good,
     many hours for little distance is a slow day worth asking about */
  if (data.travel.length > 0) {
    const effRows = [...data.travel]
      .map(t => ({ ...t, kmPerHour: t.hours > 0 ? Math.round((t.km / t.hours) * 10) / 10 : 0 }))
      .sort((a, b) => b.km - a.km);
    needPage(70);
    doc.setTextColor(...DARK); doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text("The travel effort behind these inspections:", ML, y);
    doc.setFont("helvetica", "normal");
    y += 3;
    autoTable(doc, {
      startY: y + 1,
      head: [["Inspector", "Inspections", "KM Travelled", "Hours on the Road"]],
      body: effRows.map(t => [t.inspector_name, t.inspections, t.km.toLocaleString("en-ZA"), t.hours]),
      margin: { left: ML, right: MR },
      styles: { fontSize: 7.5, cellPadding: 2.2, textColor: DARK },
      headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" } },
      didParseCell: (h: any) => {
        if (h.section === "head" && h.column.index > 0) h.cell.styles.halign = "center";
        if (h.section !== "body") return;
        if (h.column.index === 0) h.cell.styles.fontStyle = "bold";
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  /* ── 2. Samples ── */
  sectionPage();
  header("2. Sample Tracking");
  doc.setTextColor(...DARK); doc.setFontSize(8.5);
  doc.text(`Status: ${data.sample_status.completed} completed (COA received)  ·  ${data.sample_status.waiting} waiting  ·  ${data.sample_status.overdue} overdue (> ${data.sample_overdue_days} days)`, ML, y + 2);
  y += 6;
  drawDoughnut([
    { label: "Completed (COA received)", value: data.sample_status.completed, color: GREEN },
    { label: "Waiting for results", value: data.sample_status.waiting, color: AMBER },
    { label: `Overdue (> ${data.sample_overdue_days} days)`, value: data.sample_status.overdue, color: RED },
  ]);
  doc.setTextColor(...DARK); doc.setFontSize(7.5);
  doc.text(`"Result Back" — the lab result (called a COA) has come back and been added to the file.`, ML, y);
  doc.text(`"Still Waiting" — the sample is still on its way to the lab, or the lab is still testing it.`, ML, y + 4);
  doc.text(`"No Sample Taken" — the inspection was done without taking a sample.`, ML, y + 8);
  y += 11;
  autoTable(doc, {
    startY: y + 1,
    head: [["Rank", "Inspector", "Inspections", "Samples Taken", "No Sample Taken", "Result Back", "Still Waiting", `Waiting > ${data.sample_overdue_days} Days`]],
    body: data.samples.map(s => [s.rank, s.inspector_name, s.inspections ?? "-", s.taken, s.no_sample ?? "-", s.completed, s.waiting, s.overdue]),
    margin: { left: ML, right: MR },
    styles: { fontSize: 7.5, cellPadding: 2.2, textColor: DARK },
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold", halign: "center" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" },
      4: { halign: "center" }, 5: { halign: "center" }, 6: { halign: "center" }, 7: { halign: "center" },
    },
    didParseCell: (h: any) => {
      if (h.section === "head" && h.column.index === 1) h.cell.styles.halign = "left";
      if (h.section !== "body") return;
      const raw = String(h.cell.raw);
      if (h.column.index === 1) h.cell.styles.fontStyle = "bold";
      if (h.column.index === 3) h.cell.styles.fontStyle = "bold";
      if (h.column.index === 4) { h.cell.styles.fontStyle = "bold"; h.cell.styles.textColor = raw !== "0" ? AMBER : GRAY; }
      if (h.column.index === 5 && raw !== "0") h.cell.styles.textColor = GREEN;
      if (h.column.index === 7 && raw !== "0") { h.cell.styles.fontStyle = "bold"; h.cell.styles.textColor = RED; }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  if (data.outstanding_samples.length) {
    // Grouped per inspector — one row per person to phone, not a long flat list
    const groups = new Map<string, { count: number; maxDays: number; clients: string[] }>();
    data.outstanding_samples.forEach(s => {
      const g = groups.get(s.inspector_name) || { count: 0, maxDays: 0, clients: [] };
      g.count += 1;
      g.maxDays = Math.max(g.maxDays, s.age_days);
      if (!g.clients.includes(s.client_name)) g.clients.push(s.client_name);
      groups.set(s.inspector_name, g);
    });
    const grouped = [...groups.entries()].sort((a, b) => b[1].maxDays - a[1].maxDays || b[1].count - a[1].count);
    // Keep the whole table together so its header never repeats across a page split
    needPage(Math.min(18 + grouped.length * 12, 250));
    doc.setTextColor(...DARK); doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text("Samples awaiting laboratory results", ML, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK); doc.setFontSize(7.5);
    doc.text(`A sample normally waits a few days while it travels to the laboratory and is tested. A row in red has a sample waiting longer than ${data.sample_overdue_days} days.`, ML, y + 4.5);
    y += 6.5;
    autoTable(doc, {
      startY: y + 1,
      head: [["Inspector", "Samples Waiting", "Longest Waiting", "Clients"]],
      body: grouped.map(([name, g]) => [name, g.count, `${g.maxDays} days`, g.clients.join(", ")]),
      rowPageBreak: "avoid",
      margin: { left: ML, right: MR },
      styles: { fontSize: 7.5, cellPadding: 2.2, textColor: DARK, valign: "middle" },
      headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 34, fontStyle: "bold" },
        1: { cellWidth: 24, halign: "center" },
        2: { cellWidth: 24, halign: "center" },
      },
      didParseCell: (h: any) => {
        if (h.section === "head" && (h.column.index === 1 || h.column.index === 2)) h.cell.styles.halign = "center";
        if (h.section !== "body") return;
        const g = grouped[h.row.index]?.[1];
        if (g && g.maxDays > data.sample_overdue_days) h.cell.styles.textColor = RED;
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  /* ── 3. Approvals ── */
  sectionPage();
  header("3. Approvals & Capture Time");
  doc.setTextColor(...DARK); doc.setFontSize(7.5);
  doc.text(`"Captured" = the inspection was entered into the system. Green = approved, or entered within ${data.admin_lag_days} days of the inspection. Red = still waiting for approval, or entered more than ${data.admin_lag_days} days after it.`, ML, y);
  y += 4;
  autoTable(doc, {
    startY: y + 1,
    head: [["Rank", "Inspector", "Inspections", `Captured Within ${data.admin_lag_days} Days`, "Approved", "Waiting Approval"]],
    body: data.approvals.map(a => [a.rank, a.inspector_name, a.total_records, a.captured_on_time, a.approved, a.pending]),
    margin: { left: ML, right: MR },
    styles: { fontSize: 7.5, cellPadding: 2.2, textColor: DARK },
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "center" }, 5: { halign: "center" } },
    didParseCell: (h: any) => {
      if (h.section === "head" && h.column.index !== 1) h.cell.styles.halign = "center";
      if (h.section !== "body") return;
      const a = data.approvals[h.row.index];
      if (!a) return;
      const raw = String(h.cell.raw);
      if (h.column.index === 1) h.cell.styles.fontStyle = "bold";
      if (h.column.index === 3) {
        h.cell.styles.fontStyle = "bold";
        const ratio = a.total_records > 0 ? a.captured_on_time / a.total_records : 0;
        h.cell.styles.textColor = ratio >= 0.9 ? GREEN : ratio >= 0.5 ? AMBER : RED;
      }
      if (h.column.index === 4 && raw !== "0") { h.cell.styles.fontStyle = "bold"; h.cell.styles.textColor = GREEN; }
      if (h.column.index === 5) { h.cell.styles.fontStyle = "bold"; h.cell.styles.textColor = raw !== "0" ? RED : GRAY; }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  /* ── 4. Compliance ── */
  sectionPage();
  header("4. Weekly Compliance");
  doc.setTextColor(...DARK); doc.setFontSize(8.5);
  doc.text("% Compliant = out of the inspections that have a result, how many passed (a pass is \"compliant\", a fail is \"non-compliant\").", ML, y + 1);
  doc.text("Inspections with no result recorded yet are left out — not counted as a pass and not counted as a fail — so they don't", ML, y + 5);
  doc.text("change the score. \"No Outcome Recorded\" shows how many are still waiting for a result.", ML, y + 9);
  y += 14;
  const compTotals = data.compliance.reduce(
    (t, c) => ({ insp: t.insp + (c.inspections ?? 0), c: t.c + c.compliant, nc: t.nc + c.non_compliant, na: t.na + (c.not_assessed ?? 0) }),
    { insp: 0, c: 0, nc: 0, na: 0 },
  );
  const compTotalRate = (compTotals.c + compTotals.nc) > 0 ? Math.round((compTotals.c * 100 / (compTotals.c + compTotals.nc)) * 10) / 10 : null;
  autoTable(doc, {
    startY: y + 1,
    head: [["Rank", "Inspector", "Inspections", "Compliant", "Non-Compliant", "No Outcome Recorded", "% Compliant"]],
    body: data.compliance.map(c => [c.rank, c.inspector_name, c.inspections ?? (c.compliant + c.non_compliant), c.compliant, c.non_compliant, c.not_assessed ?? 0, c.rate === null ? "n/a" : `${c.rate}%`]),
    foot: [["", "Whole team — grand total", compTotals.insp, compTotals.c, compTotals.nc, compTotals.na, compTotalRate === null ? "n/a" : `${compTotalRate}%`]],
    margin: { left: ML, right: MR },
    styles: { fontSize: 7.5, cellPadding: 2.2, textColor: DARK },
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
    footStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "center" },
      5: { halign: "center" }, 6: { halign: "center" },
    },
    didParseCell: (h: any) => {
      if (h.section !== "body") {
        if (h.column.index !== 1) h.cell.styles.halign = "center";
        return;
      }
      const raw = String(h.cell.raw);
      if (h.column.index === 1) h.cell.styles.fontStyle = "bold";
      if (h.column.index === 3 && raw !== "0") h.cell.styles.textColor = GREEN;
      if (h.column.index === 4 && raw !== "0") h.cell.styles.textColor = RED;
      if (h.column.index === 5 && raw !== "0") { h.cell.styles.textColor = AMBER; h.cell.styles.fontStyle = "bold"; }
      if (h.column.index === 6) h.cell.styles.fontStyle = "bold";
    },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  /* Compliance per commodity — ONE table: inspectors down the side, one
     column per commodity, each cell = % compliant (compliant / inspections) */
  const comms = (data.commodity_compliance ?? []).filter(c => (c.inspectors ?? []).length > 0);
  if (comms.length > 0) {
    type CellData = { n: number; c: number; nc: number; rate: number | null } | null;
    const rateOf = (c: number, nc: number) => (c + nc) > 0 ? Math.round((c * 100 / (c + nc)) * 10) / 10 : null;
    const dataFor = (name: string, colIdx: number): CellData => {
      if (colIdx < comms.length) {
        const p = (comms[colIdx].inspectors ?? []).find(x => x.inspector_name === name);
        return p ? { n: p.inspections, c: p.compliant, nc: p.non_compliant, rate: rateOf(p.compliant, p.non_compliant) } : null;
      }
      let n = 0, c = 0, nc = 0;
      comms.forEach(cm => {
        const p = (cm.inspectors ?? []).find(x => x.inspector_name === name);
        if (p) { n += p.inspections; c += p.compliant; nc += p.non_compliant; }
      });
      return n > 0 ? { n, c, nc, rate: rateOf(c, nc) } : null;
    };
    const cellText = (d: CellData) => {
      if (!d || d.n === 0) return "none";
      if (d.c === 0 && d.nc === 0) return "not assessed yet";
      return `${d.rate}%`;
    };
    const teamCombined = comms.reduce((t, c) => ({ c: t.c + c.compliant, nc: t.nc + c.non_compliant }), { c: 0, nc: 0 });
    const teamCombinedRate = rateOf(teamCombined.c, teamCombined.nc);
    needPage(50);
    doc.setTextColor(...DARK); doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text("Compliance per commodity:", ML, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK); doc.setFontSize(7.5);
    doc.text(`Each box shows how many of that commodity passed, out of the ones that have a result. "none" = this inspector did no inspections of that commodity.`, ML, y + 5);
    doc.text(`"not assessed yet" = the inspection was done but no result is recorded, so it is set aside — not scored as a pass or a fail.`, ML, y + 10);
    doc.text(`Green = 75% or better. Orange = 50% to 74.9%. Red = below 50%. Grey = not assessed yet.`, ML, y + 15);
    y += 19;
    autoTable(doc, {
      startY: y + 1,
      head: [["Inspector", ...comms.map(c => c.commodity), "All Commodities Combined"]],
      body: data.compliance.map(ci => [
        ci.inspector_name,
        ...comms.map((c, i) => cellText(dataFor(ci.inspector_name, i))),
        cellText(dataFor(ci.inspector_name, comms.length)),
      ]),
      foot: [["Whole team", ...comms.map(c => c.rate === null ? "n/a" : `${c.rate}%`), teamCombinedRate === null ? "n/a" : `${teamCombinedRate}%`]],
      rowPageBreak: "avoid",
      margin: { left: ML, right: MR },
      styles: { fontSize: 7.5, cellPadding: 3.6, valign: "middle", textColor: DARK },
      headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
      footStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (h: any) => {
        if (h.column.index !== 0) h.cell.styles.halign = "center";
        if (h.section !== "body") return;
        if (h.column.index === 0) { h.cell.styles.fontStyle = "bold"; return; }
        const ci = data.compliance[h.row.index];
        if (!ci) return;
        const d = dataFor(ci.inspector_name, h.column.index - 1);
        if (!d || d.n === 0) { h.cell.styles.textColor = GRAY; return; }
        if (d.rate === null) { h.cell.styles.fillColor = [243, 244, 246]; h.cell.styles.textColor = GRAY; return; }
        h.cell.styles.fontStyle = "bold";
        if (d.rate >= 75) { h.cell.styles.fillColor = [220, 252, 231]; h.cell.styles.textColor = GREEN; }
        else if (d.rate >= 50) { h.cell.styles.fillColor = [254, 243, 199]; h.cell.styles.textColor = AMBER; }
        else { h.cell.styles.fillColor = [254, 226, 226]; h.cell.styles.textColor = RED; }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  /* ── 5. Travel ── */
  sectionPage();
  header("5. Travel Activity");
  autoTable(doc, {
    startY: y + 1,
    head: [["Rank", "Inspector", "KM Travelled", "Hours on the Road", "Inspections", "KM per Inspection (Rough Estimate)"]],
    body: data.travel.map(v => [v.rank, v.inspector_name, v.km.toLocaleString("en-ZA"), v.hours, v.inspections, v.avg_km_per_inspection]),
    foot: [["", "Whole team — grand total", data.totals.total_km.toLocaleString("en-ZA"), data.totals.total_hours, data.travel.reduce((s, v) => s + v.inspections, 0), ""]],
    rowPageBreak: "avoid",
    margin: { left: ML, right: MR },
    styles: { fontSize: 7.5, cellPadding: 2.2, textColor: DARK },
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
    footStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "center" }, 5: { halign: "center" } },
    didParseCell: (h: any) => {
      if (h.section !== "body") {
        if (h.column.index !== 1) h.cell.styles.halign = "center";
        return;
      }
      // Podium — gold, silver, bronze tints for the top three travellers
      if (h.row.index === 0) h.cell.styles.fillColor = [254, 243, 199];
      else if (h.row.index === 1) h.cell.styles.fillColor = [226, 232, 240];
      else if (h.row.index === 2) h.cell.styles.fillColor = [255, 237, 213];
      if (h.column.index === 0) { h.cell.styles.fontStyle = "bold"; h.cell.styles.textColor = TEAL; }
      if (h.column.index === 1) h.cell.styles.fontStyle = "bold";
      if (h.column.index === 2) h.cell.styles.fontStyle = "bold";
    },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  /* ── Footer on every page ── */
  const pages = doc.getNumberOfPages();
  for (let i = 2; i <= pages; i++) { // cover page stays clean
    doc.setPage(i);
    doc.setTextColor(...GRAY); doc.setFontSize(7);
    doc.text(`Food Safety Agency — Weekly Inspector Management Report · ${periodLabel}`, ML, 292);
    doc.text(`Page ${i - 1} of ${pages - 1}`, W - MR, 292, { align: "right" });
  }

  return doc;
}

/* ── Personal report for ONE inspector — only their own numbers ──────────── */
export async function buildInspectorReportPdf(data: ReportResponse, inspectorName: string, logo: string | null): Promise<any> {
  const jsPDFModule: any = await import("jspdf");
  const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
  const autoTableModule: any = await import("jspdf-autotable");
  const autoTable = autoTableModule.default || autoTableModule.autoTable || autoTableModule;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, ML = 14, MR = 14, CW = W - ML - MR;
  const TEAL: [number, number, number] = [0, 120, 144];
  const DARK: [number, number, number] = [17, 24, 39];
  const GRAY: [number, number, number] = [107, 114, 128];
  const GREEN: [number, number, number] = [21, 128, 61];
  const RED: [number, number, number] = [220, 38, 38];
  const AMBER: [number, number, number] = [217, 119, 6];
  const BLUE: [number, number, number] = [37, 99, 235];

  const HAIR: [number, number, number] = [243, 244, 246];
  const low = inspectorName.trim().toLowerCase();
  const byName = <T extends { inspector_name: string }>(rows: T[]): T | undefined =>
    rows.find(r => r.inspector_name.trim().toLowerCase() === low);
  const detail = data.inspector_detail && data.inspector_detail.name.trim().toLowerCase() === low
    ? data.inspector_detail : null;
  const dayLabel = (iso: string) =>
    new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "2-digit" });
  const perf = byName(data.performance);
  const samp = byName(data.samples);
  const appr = byName(data.approvals);
  const comp = byName(data.compliance);
  const trav = byName(data.travel);
  const myOutstanding = data.outstanding_samples.filter(s => s.inspector_name.trim().toLowerCase() === low);
  const myOccurrences = data.occurrence_detail.filter(o => o.inspector_name.trim().toLowerCase() === low);

  const periodLabel = data.is_single_week
    ? `Monday ${fmtDate(data.week_start)} — Sunday ${fmtDate(data.week_end)}`
    : `${fmtDate(data.week_start)} — ${fmtDate(data.week_end)}`;

  let y = 0;

  /* ══ PAGE 1: COVER — same design as the other FSA reports ══ */
  const H = 297;
  const GRAY_LIGHT: [number, number, number] = [156, 163, 175];
  doc.setFillColor(...DARK);
  doc.rect(0, 0, W, H, "F");
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.8);
  doc.line(ML, 42, W - MR, 42);
  doc.line(ML, H - 62, W - MR, H - 62);
  if (logo) { try { doc.addImage(logo, "PNG", W / 2 - 18, 58, 36, 32); } catch { /* skip */ } }
  const logoBottom = logo ? 102 : 80;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text("FOOD SAFETY AGENCY (PTY) LTD", W / 2, logoBottom, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor(...TEAL);
  doc.text("Your Weekly Performance Report", W / 2, logoBottom + 11, { align: "center" });
  doc.setFillColor(...TEAL);
  doc.rect(W / 2 - 30, logoBottom + 16.5, 60, 1.2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(inspectorName, W / 2, logoBottom + 28, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...GRAY_LIGHT);
  doc.text(periodLabel, W / 2, logoBottom + 37, { align: "center" });
  doc.setFontSize(10);
  doc.text(data.quarter, W / 2, logoBottom + 44, { align: "center" });
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text("This report is about YOUR work only. It contains no financial information.", W / 2, logoBottom + 53, { align: "center" });
  doc.setFontSize(9);
  doc.setTextColor(...TEAL);
  doc.text("IN THIS REPORT", W / 2, logoBottom + 68, { align: "center" });
  doc.setFontSize(9.5);
  doc.setTextColor(...GRAY_LIGHT);
  [
    "1. Your week at a glance",
    "2. The race — where everyone stands",
    "3. Your inspections",
    "4. Your capturing and approvals",
    "5. Your compliance results",
    "6. Your samples",
    "7. Your occurrence reports",
    "8. Your travel",
  ].forEach((s, i) => {
    doc.text(s, W / 2, logoBottom + 76 + i * 7, { align: "center" });
  });
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text("CONFIDENTIAL — For you and management only", W / 2, H - 42, { align: "center" });

  /* ══ PAGE 2: YOUR WEEK AT A GLANCE ══ */
  doc.addPage();
  y = 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...DARK);
  doc.text("1. Your week at a glance", ML, y);
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.7);
  doc.line(ML, y + 2.5, ML + 70, y + 2.5);
  doc.setFont("helvetica", "normal");
  y += 12;

  /* KPI cards — this inspector only */
  const card = (x: number, cy: number, w: number, h: number, label: string, value: string, color: [number, number, number]) => {
    doc.setFillColor(246, 248, 250);
    doc.roundedRect(x, cy, w, h, 2, 2, "F");
    doc.setFillColor(...color);
    doc.rect(x, cy, w, 2.2, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...color);
    doc.text(value, x + w / 2, cy + h / 2 + 1, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.6); doc.setTextColor(...GRAY);
    doc.text(doc.splitTextToSize(label.toUpperCase(), w - 5), x + w / 2, cy + h / 2 + 8, { align: "center" });
  };
  const gap = 5, w3 = (CW - 2 * gap) / 3, cardH = 28;
  const compColor: [number, number, number] = comp && comp.rate !== null ? (comp.rate >= 70 ? GREEN : AMBER) : GRAY;
  card(ML, y, w3, cardH, "Inspections this week", String(perf?.weekly_inspections ?? 0), TEAL);
  card(ML + w3 + gap, y, w3, cardH, `Your rank (of ${data.performance.length} inspectors)`, perf ? `#${perf.rank}` : "—", BLUE);
  card(ML + 2 * (w3 + gap), y, w3, cardH, "Compliance rate", comp && comp.rate !== null ? `${comp.rate}%` : "—", compColor);
  y += cardH + gap;
  card(ML, y, w3, cardH, "Samples taken", String(samp?.taken ?? 0), AMBER);
  card(ML + w3 + gap, y, w3, cardH, "Kilometres travelled", trav ? trav.km.toLocaleString("en-ZA") : "0", TEAL);
  card(ML + 2 * (w3 + gap), y, w3, cardH, "Hours on the road", trav ? String(trav.hours) : "0", BLUE);
  y += cardH + 12;

  const needPage = (space: number) => { if (y + space > 283) { doc.addPage(); y = 16; } };
  const sectionTitle = (txt: string) => {
    needPage(20);
    doc.setFillColor(...TEAL);
    doc.rect(ML, y, CW, 8, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text(txt, ML + 3, y + 5.5);
    doc.setFont("helvetica", "normal");
    y += 12;
  };
  const table = (head: string[], body: (string | number)[][], redRows: number[] = []) => {
    autoTable(doc, {
      startY: y, head: [head], body,
      margin: { left: ML, right: MR },
      styles: { fontSize: 8, cellPadding: 2.2, textColor: DARK },
      headStyles: { fillColor: [241, 245, 249], textColor: DARK, fontSize: 8, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 251, 253] },
      didParseCell: (h: any) => {
        if (h.section === "body" && redRows.includes(h.row.index)) h.cell.styles.textColor = RED;
      },
    });
    y = (doc as any).lastAutoTable.finalY + 9;
  };
  const factRows = (rows: [string, string][]) => {
    autoTable(doc, {
      startY: y, body: rows,
      margin: { left: ML, right: MR },
      styles: { fontSize: 8.5, cellPadding: 2, textColor: DARK },
      alternateRowStyles: { fillColor: [250, 251, 253] },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 85 } },
    });
    y = (doc as any).lastAutoTable.finalY + 9;
  };

  /* The race — full standings, stock-market style */
  sectionTitle("2. The race — who did the most inspections this week");
  doc.setTextColor(...GRAY); doc.setFontSize(8.5);
  doc.text("Position 1 did the most inspections this week. The last column shows how many more (green) or fewer (red)", ML, y);
  doc.text("inspections each person did compared with last week. Your row is highlighted.", ML, y + 4);
  y += 9;
  const myIdx = data.performance.findIndex(p => p.inspector_name.trim().toLowerCase() === low);
  autoTable(doc, {
    startY: y,
    head: [["Position", "Inspector", "Inspections This Week", "Inspections Last Week", "More or Fewer"]],
    body: data.performance.map(p => {
      const diff = p.weekly_inspections - (p.prev_inspections ?? 0);
      return [
        `#${p.rank}`, p.inspector_name, p.weekly_inspections, p.prev_inspections ?? 0,
        diff > 0 ? `+${diff}` : String(diff),
      ];
    }),
    margin: { left: ML, right: MR },
    styles: { fontSize: 8, cellPadding: 2.2, textColor: DARK },
    headStyles: { fillColor: [241, 245, 249], textColor: DARK, fontSize: 8, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 251, 253] },
    didParseCell: (h: any) => {
      if (h.section !== "body") return;
      if (h.row.index === myIdx) {
        h.cell.styles.fillColor = [230, 247, 249];
        h.cell.styles.fontStyle = "bold";
      }
      if (h.column.index === 4) {
        const v = String(h.cell.raw);
        if (v.startsWith("+")) h.cell.styles.textColor = GREEN;
        else if (v.startsWith("-")) h.cell.styles.textColor = RED;
        h.cell.styles.fontStyle = "bold";
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 9;

  /* Your inspections */
  sectionTitle("3. Your inspections");
  factRows([
    ["Inspections you did this week", String(perf?.weekly_inspections ?? 0)],
    ["Your total for this quarter so far", String(perf?.cumulative_inspections ?? 0)],
    ["Your target for this quarter", perf?.quarter_target ? String(perf.quarter_target) : "No target set yet"],
    ["How much of your target is done", perf?.target_pct === null || !perf ? "—" : `${perf.target_pct}%`],
  ]);

  /* Day-by-day bars */
  if (detail && detail.daily.length > 0 && detail.daily.length <= 14) {
    needPage(48);
    doc.setTextColor(...DARK); doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text("Your inspections day by day:", ML, y);
    doc.setFont("helvetica", "normal");
    y += 6;
    const maxC = Math.max(...detail.daily.map(d => d.count), 1);
    const n = detail.daily.length;
    const bw = Math.min(20, (CW - (n - 1) * 6) / n);
    const gap2 = (CW - n * bw) / Math.max(n - 1, 1);
    const chartH = 24, baseY = y + chartH + 4;
    detail.daily.forEach((d, i) => {
      const x = ML + i * (bw + gap2);
      doc.setFillColor(...HAIR);
      doc.roundedRect(x, y + 4, bw, chartH, 1, 1, "F");
      const h = Math.max((d.count / maxC) * chartH, d.count > 0 ? 1.2 : 0);
      if (h > 0) { doc.setFillColor(...TEAL); doc.roundedRect(x, baseY - h, bw, h, 1, 1, "F"); }
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.6); doc.setTextColor(...DARK);
      doc.text(String(d.count), x + bw / 2, y + 1.5, { align: "center" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.4); doc.setTextColor(...GRAY);
      doc.text(dayLabel(d.date), x + bw / 2, baseY + 4.5, { align: "center" });
    });
    y = baseY + 11;
  }

  /* Full list of the week's inspections */
  if (detail && detail.inspections.length > 0) {
    needPage(36);
    doc.setTextColor(...DARK); doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text("Every inspection you did this week:", ML, y);
    doc.setFont("helvetica", "normal");
    y += 4;
    table(
      ["Date", "Client", "Commodity", "Approved?"],
      detail.inspections.map(r => [
        fmtDate(r.date), r.client, r.commodity, r.approved ? "Yes" : "Waiting",
      ]),
    );
  }

  /* Capturing & approvals */
  sectionTitle("4. Your capturing and approvals");
  factRows([
    ["Inspections you captured", String(appr?.total_records ?? 0)],
    [`Captured on time (within ${data.admin_lag_days} days)`, appr ? `${appr.captured_on_time} (${appr.capture_rate}%)` : "0"],
    ["Approved by the office", String(appr?.approved ?? 0)],
    ["Still waiting for approval", String(appr?.pending ?? 0)],
  ]);

  /* Compliance */
  sectionTitle("5. Your compliance results");
  factRows([
    ["Products that passed (compliant)", String(comp?.compliant ?? 0)],
    ["Products that failed (non-compliant)", String(comp?.non_compliant ?? 0)],
    ["Inspections with no outcome recorded yet (not scored)", String(comp?.not_assessed ?? 0)],
    ["Your pass rate — of inspections with a recorded result", comp && comp.rate !== null ? `${comp.rate}%` : "No recorded results this week"],
    ["Compared to last week", comp?.change === null || !comp ? "—" : `${comp.change > 0 ? `${comp.change}pt better` : `${Math.abs(comp.change)}pt worse`}`],
  ]);

  /* Samples */
  sectionTitle("6. Your samples");
  factRows([
    ["Samples you took", String(samp?.taken ?? 0)],
    ["Results back from the lab", String(samp?.completed ?? 0)],
    ["Still waiting for results", String(samp?.waiting ?? 0)],
    [`Waiting more than ${data.sample_overdue_days} days — needs follow-up`, String(samp?.overdue ?? 0)],
  ]);
  const mySamples = detail ? detail.inspections.filter(r => r.sample_taken) : [];
  if (mySamples.length > 0) {
    needPage(30);
    doc.setTextColor(...DARK); doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text("The samples you took this week:", ML, y);
    doc.setFont("helvetica", "normal");
    y += 4;
    table(
      ["Date", "Client", "Commodity", "Lab result back?"],
      mySamples.map(r => [fmtDate(r.date), r.client, r.commodity, r.sample_result_back ? "Yes" : "Not yet"]),
    );
  }
  if (myOutstanding.length) {
    needPage(30);
    doc.setTextColor(...RED); doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text("These samples of yours have no lab result yet — please follow them up:", ML, y);
    doc.setFont("helvetica", "normal");
    y += 4;
    table(
      ["Client", "Commodity", "Sample Date", "Days Waiting"],
      myOutstanding.map(s => [s.client_name, s.commodity, fmtDate(s.sample_date), s.age_days]),
      myOutstanding.map((s, i) => s.overdue ? i : -1).filter(i => i >= 0),
    );
  }

  /* Occurrences */
  sectionTitle("7. Your occurrence reports");
  factRows([
    ["Occurrence reports you submitted", String(myOccurrences.length)],
    ["Out of inspections you did", String(perf?.weekly_inspections ?? 0)],
  ]);
  if (myOccurrences.length === 0) {
    doc.setTextColor(...GRAY); doc.setFontSize(9);
    doc.text("You submitted no occurrence reports this week.", ML, y);
    y += 10;
  } else {
    table(
      ["Facility", "Area", "Status", "Inspection Date", "Submitted On"],
      myOccurrences.map(o => [o.client_name, o.town || "-", o.status, fmtDate(o.date_of_inspection), fmtDate(o.submitted)]),
    );
  }

  /* Travel */
  sectionTitle("8. Your travel");
  factRows([
    ["Kilometres you travelled", trav ? trav.km.toLocaleString("en-ZA") : "0"],
    ["Hours on the road", trav ? String(trav.hours) : "0"],
    ["Kilometres per inspection", trav ? String(trav.avg_km_per_inspection) : "—"],
    ["New clients you found", String(trav?.new_facilities ?? 0)],
  ]);

  /* Footer — cover page stays clean */
  const pages = doc.getNumberOfPages();
  for (let i = 2; i <= pages; i++) {
    doc.setPage(i);
    doc.setTextColor(...GRAY); doc.setFontSize(7);
    doc.text(`Food Safety Agency — Weekly Performance Report · ${inspectorName} · ${periodLabel}`, ML, 292);
    doc.text(`Page ${i - 1} of ${pages - 1}`, W - MR, 292, { align: "right" });
  }

  return doc;
}

/* ── Manager Report — operations-focused, NO per-inspector ranking tables and
   NO financial data. A short "how is the operation running and what needs my
   attention" document for managers, built from the same report payload.
   First draft — expect to iterate on wording/sections. ───────────────────── */
export async function buildManagerReportPdf(data: ReportResponse, logo: string | null): Promise<any> {
  const jsPDFModule: any = await import("jspdf");
  const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
  const autoTableModule: any = await import("jspdf-autotable");
  const autoTable = autoTableModule.default || autoTableModule.autoTable || autoTableModule;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, ML = 14, MR = 14, CW = W - ML - MR;
  const TEAL: [number, number, number] = [0, 120, 144];
  const DARK: [number, number, number] = [17, 24, 39];
  const GRAY: [number, number, number] = [107, 114, 128];
  const GRAY_LIGHT: [number, number, number] = [156, 163, 175];
  const GREEN: [number, number, number] = [21, 128, 61];
  const RED: [number, number, number] = [220, 38, 38];
  const AMBER: [number, number, number] = [217, 119, 6];
  const BLUE: [number, number, number] = [37, 99, 235];
  const WHITE: [number, number, number] = [255, 255, 255];
  const HAIR: [number, number, number] = [243, 244, 246];

  const t = data.totals;
  const ob = data.outstanding_backlog;
  const ss = data.sample_status;
  const periodLabel = data.is_single_week
    ? `Monday ${fmtDate(data.week_start)} — Sunday ${fmtDate(data.week_end)}`
    : `${fmtDate(data.week_start)} — ${fmtDate(data.week_end)}`;
  const mv = (n: number | null, suffix = "") =>
    n === null || n === undefined ? "new" : n === 0 ? "no change" : `${n > 0 ? "+" : ""}${n}${suffix}`;

  let y = 0;
  const header = (title: string) => {
    if (y > 250) { doc.addPage(); y = 16; }
    doc.setFillColor(...TEAL);
    doc.rect(ML, y, CW, 9, "F");
    doc.setTextColor(...WHITE);
    doc.setFontSize(11); doc.setFont("helvetica", "bold");
    doc.text(title, ML + 3, y + 6);
    doc.setFont("helvetica", "normal");
    y += 13;
  };
  const intro = (txt: string) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...DARK);
    const lines = doc.splitTextToSize(txt, CW);
    doc.text(lines, ML, y);
    y += lines.length * 4 + 3;
  };
  const needPage = (space: number) => { if (y + space > 283) { doc.addPage(); y = 16; } };

  /* ══ PAGE 1: COVER ══ */
  doc.setFillColor(...DARK);
  doc.rect(0, 0, W, H, "F");
  doc.setDrawColor(...TEAL); doc.setLineWidth(0.8);
  doc.line(ML, 42, W - MR, 42);
  doc.line(ML, H - 62, W - MR, H - 62);
  if (logo) { try { doc.addImage(logo, "PNG", W / 2 - 18, 58, 36, 32); } catch { /* skip */ } }
  const logoBottom = logo ? 102 : 80;
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...WHITE);
  doc.text("FOOD SAFETY AGENCY (PTY) LTD", W / 2, logoBottom, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(14); doc.setTextColor(...TEAL);
  doc.text("Weekly Manager Report", W / 2, logoBottom + 11, { align: "center" });
  doc.setFillColor(...TEAL);
  doc.rect(W / 2 - 30, logoBottom + 16.5, 60, 1.2, "F");
  doc.setFontSize(11); doc.setTextColor(...GRAY_LIGHT);
  doc.text(`Reporting period: ${periodLabel}`, W / 2, logoBottom + 27, { align: "center" });
  doc.setFontSize(10);
  doc.text(data.quarter, W / 2, logoBottom + 34, { align: "center" });
  doc.setFontSize(9); doc.setTextColor(...GRAY);
  doc.text("A manager's view of the team — who's doing well and where the delays are.", W / 2, logoBottom + 43, { align: "center" });
  doc.setFontSize(9); doc.setTextColor(...TEAL);
  doc.text("IN THIS REPORT", W / 2, logoBottom + 58, { align: "center" });
  doc.setFontSize(9.5); doc.setTextColor(...GRAY_LIGHT);
  [
    "The Week at a Glance",
    "Standing Out",
    "Falling Behind",
    "1. Where the Delays Are",
    "2. Team Progress",
    "3. KPIs — Target Progress",
    "4. Sample Pipeline",
    "5. Office & Admin",
    "6. Month by Month",
    "7. Profit by Month",
  ].forEach((s, i) => doc.text(s, W / 2, logoBottom + 66 + i * 7, { align: "center" }));
  doc.setFontSize(8);
  doc.text("CONFIDENTIAL — For authorized personnel only", W / 2, H - 42, { align: "center" });

  /* ══ PAGE 2: THE WEEK AT A GLANCE — KPI cards ══ */
  doc.addPage();
  const drawKpiCard = (x: number, cy: number, w: number, h: number, label: string, value: string, color: [number, number, number]) => {
    doc.setFillColor(246, 248, 250);
    doc.roundedRect(x, cy, w, h, 2, 2, "F");
    doc.setFillColor(...color);
    doc.rect(x, cy, w, 2.5, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(19); doc.setTextColor(...color);
    doc.text(value, x + w / 2, cy + h / 2, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text(doc.splitTextToSize(label.toUpperCase(), w - 6), x + w / 2, cy + h / 2 + 9, { align: "center" });
  };
  y = 24;
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...DARK);
  doc.text("The Week at a Glance", ML, y);
  doc.setDrawColor(...TEAL); doc.setLineWidth(0.7);
  doc.line(ML, y + 2.5, ML + 62, y + 2.5);
  y += 12;
  const compColor: [number, number, number] = t.overall_compliance !== null && t.overall_compliance >= 70 ? GREEN : AMBER;
  const cardH = 38, gap = 5;
  const w3 = (CW - 2 * gap) / 3;
  drawKpiCard(ML, y, w3, cardH, `Inspections (${mv(t.inspections - t.prev_inspections)} vs previous)`, String(t.inspections), TEAL);
  drawKpiCard(ML + w3 + gap, y, w3, cardH, "Active inspectors", String(t.active_inspectors), BLUE);
  drawKpiCard(ML + 2 * (w3 + gap), y, w3, cardH, "Samples taken", String(t.samples), AMBER);
  y += cardH + gap;
  // Second row: compliance, backlog, and (if present) profit this month.
  const fin0 = data.monthly_financials;
  const randShort = (n: number) => {
    const neg = n < 0; const a = Math.abs(n);
    const s = a >= 1000 ? `R${Math.round(a / 1000)}k` : `R${Math.round(a)}`;
    return neg ? `-${s}` : s;
  };
  if (fin0) {
    drawKpiCard(ML, y, w3, cardH,
      `Overall compliance (${t.overall_compliance !== null && t.prev_overall_compliance !== null ? mv(Math.round((t.overall_compliance - t.prev_overall_compliance) * 10) / 10, "pt") : "n/a"} vs previous)`,
      t.overall_compliance === null ? "-" : `${t.overall_compliance}%`, compColor);
    drawKpiCard(ML + w3 + gap, y, w3, cardH, `Backlog outstanding (of ${ob ? ob.total : "-"} total)`, ob ? String(ob.outstanding_total) : "-", ob && ob.outstanding_total > 0 ? RED : GREEN);
    drawKpiCard(ML + 2 * (w3 + gap), y, w3, cardH, "Team profit this month", randShort(fin0.total_profit), fin0.total_profit >= 0 ? GREEN : RED);
  } else {
    const w2 = (CW - gap) / 2;
    drawKpiCard(ML, y, w2, cardH,
      `Overall compliance (${t.overall_compliance !== null && t.prev_overall_compliance !== null ? mv(Math.round((t.overall_compliance - t.prev_overall_compliance) * 10) / 10, "pt") : "n/a"} vs previous)`,
      t.overall_compliance === null ? "-" : `${t.overall_compliance}%`, compColor);
    drawKpiCard(ML + w2 + gap, y, w2, cardH, `Backlog outstanding (of ${ob ? ob.total : "-"} total)`, ob ? String(ob.outstanding_total) : "-", ob && ob.outstanding_total > 0 ? RED : GREEN);
  }
  y += cardH + 14;

  /* ══ STANDING OUT + FALLING BEHIND — a plain-language read on who's doing
     well and who's slipping, so a manager gets the picture without reading the
     full ranking tables. Built from the same performance/approval/compliance
     data as the inspector report, just summarised. ══ */
  const perf = [...data.performance];
  const apprByName: Record<string, ApprovalRow> = {};
  data.approvals.forEach(a => { apprByName[a.inspector_name] = a; });
  const compByName: Record<string, ComplianceRow> = {};
  data.compliance.forEach(c => { compByName[c.inspector_name] = c; });

  // Standing out: who is doing the inspections. Volume leads; keeping your own
  // work clean (approved + assessed) and compliance break ties.
  const standouts = perf
    .filter(p => p.weekly_inspections > 0)
    .map(p => {
      const a = apprByName[p.inspector_name];
      const c = compByName[p.inspector_name];
      const approvedShare = a && a.total_records > 0 ? a.approved / a.total_records : 0;
      const assessedShare = c && c.inspections > 0 ? (c.inspections - c.not_assessed) / c.inspections : 0;
      return { p, a, c, approvedShare, assessedShare };
    })
    .sort((x, y2) =>
      y2.p.weekly_inspections - x.p.weekly_inspections
      || (y2.approvedShare + y2.assessedShare) - (x.approvedShare + x.assessedShare)
      || (y2.c?.rate ?? 0) - (x.c?.rate ?? 0))
    .slice(0, 3);

  // Falling behind: biggest hold-ups on their own work (unapproved + unassessed).
  const laggards = perf
    .filter(p => p.weekly_inspections > 0)
    .map(p => {
      const a = apprByName[p.inspector_name];
      const c = compByName[p.inspector_name];
      const pending = a ? a.pending : 0;
      const noOutcome = c ? c.not_assessed : 0;
      return { p, a, c, pending, noOutcome, drag: pending + noOutcome };
    })
    .filter(r => r.drag > 0)
    .sort((x, y2) => y2.drag - x.drag || y2.p.weekly_inspections - x.p.weekly_inspections)
    .slice(0, 3);

  const highlightBlock = (title: string, accent: [number, number, number], lines: string[]) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...DARK);
    doc.text(title, ML, y);
    doc.setDrawColor(...accent); doc.setLineWidth(0.7);
    doc.line(ML, y + 2.5, ML + doc.getTextWidth(title) + 6, y + 2.5);
    y += 8;
    if (lines.length === 0) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
      doc.text("Nothing to show this week.", ML + 5, y + 1);
      doc.setFont("helvetica", "normal");
      y += 8;
      return;
    }
    lines.forEach(txt => {
      const wrapped = doc.splitTextToSize(txt, CW - 6);
      needPage(wrapped.length * 4 + 5);
      doc.setFillColor(...accent);
      doc.rect(ML, y - 2.6, 2, wrapped.length * 4 + 1.5, "F");
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...DARK);
      doc.text(wrapped, ML + 5, y + 1);
      y += wrapped.length * 4 + 4;
    });
    y += 4;
  };

  const standoutLines = standouts.map(s => {
    const rateTxt = s.c && s.c.rate !== null ? `, ${s.c.rate}% compliant` : "";
    const cleanBits: string[] = [];
    if (s.approvedShare >= 1) cleanBits.push("all approved");
    if (s.assessedShare >= 1) cleanBits.push("all outcomes recorded");
    const clean = cleanBits.length ? ` — ${cleanBits.join(", ")}` : "";
    return `${s.p.inspector_name}: ${s.p.weekly_inspections} inspection${s.p.weekly_inspections === 1 ? "" : "s"}${rateTxt}${clean}.`;
  });
  // Money highlights (this month so far) — top earner + most profitable.
  const finS = data.monthly_financials;
  if (finS && finS.rows.length) {
    const randS = (n: number) => `R${Math.round(n).toLocaleString("en-ZA").replace(/,/g, " ")}`;
    const topRev = [...finS.rows].sort((a, b) => b.revenue - a.revenue)[0];
    const topProfit = [...finS.rows].sort((a, b) => b.profit - a.profit)[0];
    if (topRev && topRev.revenue > 0) standoutLines.push(`Most revenue this month: ${topRev.inspector_name} — ${randS(topRev.revenue)} billed.`);
    if (topProfit && topProfit.profit > 0) standoutLines.push(`Most profitable this month: ${topProfit.inspector_name} — ${randS(topProfit.profit)} profit.`);
  }
  highlightBlock("Standing Out", GREEN, standoutLines);

  highlightBlock("Falling Behind", RED, laggards.map(l => {
    const bits: string[] = [];
    if (l.pending > 0) bits.push(`${l.pending} still not approved`);
    if (l.noOutcome > 0) bits.push(`${l.noOutcome} with no outcome recorded`);
    return `${l.p.inspector_name}: ${l.p.weekly_inspections} inspection${l.p.weekly_inspections === 1 ? "" : "s"}, but ${bits.join(" and ")}.`;
  }));

  /* ══ 1. WHERE THE DELAYS ARE — one proper table: a row per inspector, a
     column per hold-up, so a manager sees the whole overview of what's stuck
     (e.g. everything not yet approved) and who owns it, at a glance. ══ */
  // The whole table is ~13 rows; keep it together on one page (don't let it
  // split and leave a half-empty page before Team Progress). Start fresh if it
  // wouldn't fully fit below the winners.
  if (y > 150) { doc.addPage(); y = 16; } else if (y > 20) { y += 4; }
  header("1. Where the Delays Are");

  const overdueByName = (n: string) => { const s = data.samples.find(x => x.inspector_name === n); return s ? s.overdue : 0; };
  const delayRowsAll = perf.map(p => {
    const wait = apprByName[p.inspector_name] ? apprByName[p.inspector_name].pending : 0;
    const overdue = overdueByName(p.inspector_name);
    const noRes = compByName[p.inspector_name] ? compByName[p.inspector_name].not_assessed : 0;
    return { name: p.inspector_name, wait, overdue, noRes, total: wait + overdue + noRes };
  })
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total || b.wait - a.wait);

  const tWait = delayRowsAll.reduce((s, r) => s + r.wait, 0);
  const tOverdue = delayRowsAll.reduce((s, r) => s + r.overdue, 0);
  const tNoRes = delayRowsAll.reduce((s, r) => s + r.noRes, 0);
  const tAll = tWait + tOverdue + tNoRes;

  autoTable(doc, {
    startY: y,
    head: [[
      "Inspector",
      "Waiting for\napproval",
      `Samples overdue\n(over ${data.sample_overdue_days} days)`,
      "No result\nrecorded yet",
      "Total\nstuck",
    ]],
    body: delayRowsAll.map(r => [
      r.name,
      String(r.wait),
      String(r.overdue),
      String(r.noRes),
      String(r.total),
    ]),
    foot: [["Whole team", String(tWait), String(tOverdue), String(tNoRes), String(tAll)]],
    theme: "grid",
    rowPageBreak: "avoid",
    styles: { fontSize: 8, cellPadding: 2.6, valign: "middle", halign: "center", lineColor: [226, 232, 240], textColor: DARK },
    headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 7.8, halign: "center", valign: "middle" },
    footStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: 8, halign: "center" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 46, halign: "left", fontStyle: "bold" },
      1: { cellWidth: 34 }, 2: { cellWidth: 42 }, 3: { cellWidth: 34 },
      4: { cellWidth: 26, fontStyle: "bold" },
    },
    margin: { left: ML, right: MR },
    didParseCell: (d: any) => {
      if (d.section === "body") {
        // red the actual counts so a manager's eye lands on the problems; a 0 is
        // greyed so "nothing stuck" doesn't shout for attention.
        if (d.column.index >= 1 && d.column.index <= 3) {
          if (Number(d.cell.raw) === 0) d.cell.styles.textColor = GRAY;
          else { d.cell.styles.textColor = RED; d.cell.styles.fontStyle = "bold"; }
        }
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 6;
  doc.setFont("helvetica", "italic"); doc.setFontSize(7); doc.setTextColor(...DARK);
  doc.text('All from last week\'s inspections. Each number is how many of that inspector\'s inspections are stuck at that step; 0 means nothing stuck there.', ML, y, { maxWidth: CW });
  doc.setFont("helvetica", "normal"); doc.setTextColor(...DARK);
  y += 9;

  /* ══ HOW FAST EACH STAGE CLEARS — the four back-office turnaround stages
     (from the web Timelines tab) as clean cards: typical (median) days, with
     average, target and week-on-week trend, tagged with the team that owns each
     step. This is the cross-team timeliness view — a manager metric. ══ */
  const feM = data.finance_efficiency;
  if (feM) {
    if (y > 215) { doc.addPage(); y = 16; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...DARK);
    doc.text("How fast each stage clears", ML, y);
    doc.setDrawColor(...TEAL); doc.setLineWidth(0.6); doc.line(ML, y + 2.2, ML + 58, y + 2.2);
    y += 8;
    const tstages = [
      { key: "approval" as const, name: "Approval", who: "Inspector" },
      { key: "send_docs" as const, name: "Send documents", who: "Office" },
      { key: "invoice" as const, name: "Invoice", who: "Finance" },
      { key: "sample_to_coa" as const, name: "Sample to COA", who: "Lab" },
    ];
    const gT = 5, cwT = (CW - 3 * gT) / 4, chT = 30;
    tstages.forEach((s, i) => {
      const t = feM.timeliness[s.key];
      const x = ML + i * (cwT + gT);
      const med = t.median;
      const col: [number, number, number] = (med != null && t.target != null)
        ? (med <= t.target ? GREEN : med <= t.target + 3 ? AMBER : RED) : GRAY;
      doc.setFillColor(246, 248, 250); doc.roundedRect(x, y, cwT, chT, 2, 2, "F");
      doc.setFillColor(...col); doc.rect(x, y, cwT, 2.2, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.6); doc.setTextColor(...DARK);
      doc.text(s.name, x + cwT / 2, y + 7, { align: "center" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.2); doc.setTextColor(...GRAY);
      doc.text(s.who, x + cwT / 2, y + 10.8, { align: "center" });
      doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(...col);
      doc.text(med != null ? String(med) : "—", x + cwT / 2, y + 19.5, { align: "center" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(...GRAY);
      doc.text("days (typical)", x + cwT / 2, y + 23, { align: "center" });
      const trend = (t.prev_avg != null && t.avg != null) ? (t.avg < t.prev_avg ? "improving" : t.avg > t.prev_avg ? "slower" : "flat") : "";
      const trendCol: [number, number, number] = trend === "improving" ? GREEN : trend === "slower" ? RED : GRAY;
      doc.setFontSize(5.8); doc.setTextColor(...GRAY);
      doc.text(`avg ${t.avg != null ? t.avg : "—"}d${t.target != null ? ` · target ${t.target}d` : ""}`, x + cwT / 2, y + 26.6, { align: "center" });
      if (trend) { doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(...trendCol); doc.text(trend, x + cwT / 2, y + 29.2, { align: "center" }); }
    });
    y += chT + 4;
    doc.setFont("helvetica", "italic"); doc.setFontSize(6.8); doc.setTextColor(...GRAY);
    doc.text('Typical = median days from inspection to that step, for jobs that cleared it this week. Green = at or under target, amber = close, red = over. Trend is vs last week.', ML, y, { maxWidth: CW });
    doc.setFont("helvetica", "normal"); doc.setTextColor(...DARK); y += 8;
  }

  /* ══ 2. TEAM PROGRESS — one table, one header. Per inspector: how many
     inspections last week / this week / this month, split into normal vs
     occurrence reports, and how many are approved vs still waiting. ══ */
  if (perf.length) {
    // Keep the whole roster (incl. zero-week inspectors) together: it needs
    // roughly the lower two-thirds of a page, so only push to a fresh page when
    // there isn't room for it here — otherwise flow on and avoid a blank gap.
    if (y > 120) { doc.addPage(); y = 16; } else if (y > 20) { y += 4; }
    header("2. Team Progress");

    const occByName: Record<string, number> = {};
    data.occurrences.forEach(o => { occByName[o.inspector_name] = o.count; });

    // Include EVERY inspector on the roster, even those who did zero work last
    // week — a blank week is exactly what a manager needs to see, not hide.
    // Anyone in the roster with no performance row is added with all-zero stats.
    const perfByName: Record<string, PerformanceRow> = {};
    perf.forEach(p => { perfByName[p.inspector_name.trim().toLowerCase()] = p; });
    const zeroRow = (name: string): PerformanceRow => ({
      inspector_name: name, quarter_target: 0, weekly_inspections: 0, prev_inspections: 0,
      month_inspections: 0, cumulative_inspections: 0, cumulative_approved: 0,
      cumulative_pending: 0, target_pct: null, rank: 999, rank_change: null,
    });
    const allPerf: PerformanceRow[] = [...perf];
    (data.roster ?? []).forEach(name => {
      if (!perfByName[name.trim().toLowerCase()]) allPerf.push(zeroRow(name));
    });

    // Busiest first; the zero-week inspectors sink to the bottom, then by name.
    const rowsP = allPerf.sort((a, b) =>
      b.weekly_inspections - a.weekly_inspections
      || a.inspector_name.localeCompare(b.inspector_name));
    const body = rowsP.map(p => {
      const a = apprByName[p.inspector_name];
      const occ = occByName[p.inspector_name] || 0;
      const normal = Math.max(p.weekly_inspections - occ, 0);
      const approved = a ? a.approved : 0;
      const waiting = a ? a.pending : 0;
      return [
        p.inspector_name,
        String(p.prev_inspections),
        String(p.weekly_inspections),
        String(p.month_inspections ?? p.cumulative_inspections),
        String(normal),
        String(occ),
        String(approved),
        String(waiting),
      ];
    });
    const sum = (f: (p: PerformanceRow) => number) => perf.reduce((s, p) => s + f(p), 0);
    const teamOcc = perf.reduce((s, p) => s + (occByName[p.inspector_name] || 0), 0);
    const teamNormal = perf.reduce((s, p) => s + Math.max(p.weekly_inspections - (occByName[p.inspector_name] || 0), 0), 0);
    const teamApproved = perf.reduce((s, p) => s + (apprByName[p.inspector_name]?.approved || 0), 0);
    const teamWaiting = perf.reduce((s, p) => s + (apprByName[p.inspector_name]?.pending || 0), 0);

    autoTable(doc, {
      startY: y,
      // Two header rows: a grouping band, then fully-spelled-out column names —
      // so every number says exactly what it counts (no cryptic "Last Week").
      head: [
        [
          { content: "Inspector", rowSpan: 2, styles: { valign: "middle", halign: "left" } },
          { content: "Inspections completed", colSpan: 3, styles: { halign: "center" } },
          { content: "This week's inspections, split by type", colSpan: 2, styles: { halign: "center" } },
          { content: "This week's approval status", colSpan: 2, styles: { halign: "center" } },
        ],
        [
          "Last week", "This week", "This month",
          "Routine\ninspections", "Occurrence\nreports",
          "Approved", "Waiting for\napproval",
        ],
      ],
      body,
      foot: [[
        "Whole team",
        String(sum(p => p.prev_inspections)),
        String(sum(p => p.weekly_inspections)),
        String(sum(p => p.month_inspections ?? p.cumulative_inspections)),
        String(teamNormal), String(teamOcc),
        String(teamApproved), String(teamWaiting),
      ]],
      theme: "grid",
      // Header shows once; if the roster spills to a second page the rows just
      // continue with no repeated grouping band.
      showHead: "firstPage",
      styles: { fontSize: 8, cellPadding: 2.1, valign: "middle", halign: "center", lineColor: [226, 232, 240], textColor: DARK },
      headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 7.5, halign: "center", valign: "middle", lineColor: [255, 255, 255], lineWidth: 0.3 },
      footStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: 8, halign: "center" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 40, halign: "left", fontStyle: "bold" },
        1: { cellWidth: 18 }, 2: { cellWidth: 18 }, 3: { cellWidth: 18 },
        4: { cellWidth: 22 }, 5: { cellWidth: 22 },
        6: { cellWidth: 18 }, 7: { cellWidth: 22 },
      },
      margin: { left: ML, right: MR },
      didParseCell: (d: any) => {
        // Tint the grouping band a touch darker so the two header rows read as
        // a hierarchy, not one blurry block.
        if (d.section === "head" && d.row.index === 0 && d.column.index > 0) {
          d.cell.styles.fillColor = [0, 95, 114];
        }
        if (d.section === "body") {
          if (d.column.index === 2) {
            d.cell.styles.fontStyle = "bold"; // This week = headline
            // Zero inspections this week is a flag, not a blank — show it in red.
            if (Number(d.cell.raw) === 0) d.cell.styles.textColor = RED;
          }
          if (d.column.index === 6 && Number(d.cell.raw) > 0) { d.cell.styles.textColor = GREEN; d.cell.styles.fontStyle = "bold"; }
          if (d.column.index === 7 && Number(d.cell.raw) > 0) { d.cell.styles.textColor = RED; d.cell.styles.fontStyle = "bold"; }
          if (d.column.index === 5 && Number(d.cell.raw) > 0) { d.cell.styles.textColor = AMBER; d.cell.styles.fontStyle = "bold"; }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 5;
    doc.setFont("helvetica", "italic"); doc.setFontSize(7); doc.setTextColor(...DARK);
    doc.text('Busiest first. Routine + Occurrence = this week\'s inspections. Approved + Waiting = this week\'s inspections. "This month" is the calendar month up to the end of the reporting week.', ML, y, { maxWidth: CW });
    doc.setFont("helvetica", "normal"); doc.setTextColor(...DARK);
    y += 9;
  }

  /* ══ 3. KPIs — TARGET PROGRESS PER COMMODITY — each inspector against their
     manager-set quarterly targets, broken down by commodity. Target vs done
     this quarter, with % achieved, plus a Total row per inspector. ══ */
  const kpiC = data.kpi_commodity ?? [];
  if (kpiC.length) {
    if (y > 165) { doc.addPage(); y = 16; } else if (y > 20) { y += 4; }
    header(`3. KPIs — Target Progress by Commodity (${data.quarter})`);
    intro(`Each inspector against the quarterly targets set for them, per commodity. "Done" is inspections completed in ${data.quarter} so far; "% of target" is how far through that commodity's target they are. Green = on track (75%+), amber = behind (50–74%), red = well behind (under 50%).`);

    // One wide table: a column per commodity, cell = "done/target". The % (used
    // only for the green/amber/red colour) is looked up from the same data.
    const COMMS = ["Poultry", "Raw meat", "PMP", "Eggs"];
    const cellFor = (insp: KpiCommodityRow, name: string) => {
      const c = insp.commodities.find(x => x.commodity === name);
      if (!c || (c.target === 0 && c.done === 0)) return { text: "—", pct: null as number | null };
      return { text: `${c.done}/${c.target}`, pct: c.pct };
    };
    autoTable(doc, {
      startY: y,
      head: [["Inspector", ...COMMS, "Total"]],
      body: kpiC.map(insp => [
        insp.inspector_name,
        ...COMMS.map(cm => cellFor(insp, cm).text),
        `${insp.total_done}/${insp.total_target}`,
      ]),
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2.6, valign: "middle", halign: "center", lineColor: [226, 232, 240], textColor: DARK },
      headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 8, halign: "center" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: ML, right: MR },
      columnStyles: {
        0: { cellWidth: 44, halign: "left", fontStyle: "bold" },
        1: { cellWidth: 27 }, 2: { cellWidth: 27 }, 3: { cellWidth: 27 }, 4: { cellWidth: 27 },
        5: { cellWidth: 27, fontStyle: "bold" },
      },
      didParseCell: (d: any) => {
        if (d.section !== "body") return;
        const insp = kpiC[d.row.index];
        if (!insp) return;
        // Commodity columns 1..4 → colour by that commodity's %; Total col 5 → total %.
        if (d.column.index >= 1 && d.column.index <= 4) {
          const pct = cellFor(insp, COMMS[d.column.index - 1]).pct;
          if (pct !== null) d.cell.styles.textColor = pct >= 75 ? GREEN : pct >= 50 ? AMBER : RED;
          else d.cell.styles.textColor = GRAY;
        } else if (d.column.index === 5 && insp.total_pct !== null) {
          d.cell.styles.textColor = insp.total_pct >= 75 ? GREEN : insp.total_pct >= 50 ? AMBER : RED;
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 5;
    doc.setFont("helvetica", "italic"); doc.setFontSize(7); doc.setTextColor(...DARK);
    doc.text('Each cell is "done / target" for the quarter. Green = 75%+ of target, amber = 50–74%, red = under 50%. "—" means no target for that commodity.', ML, y, { maxWidth: CW });
    doc.setFont("helvetica", "normal"); y += 9;
  }

  /* ══ 4. SAMPLE PIPELINE — lab health at a glance: three status cards with a
     shared share-bar underneath, so a manager instantly sees how many samples
     are back, still at the lab, or overdue. ══ */
  if (ss) {
    if (y > 170) { doc.addPage(); y = 16; } else if (y > 20) { y += 4; }
    header("4. Sample Pipeline");
    const totalS = ss.completed + ss.waiting + ss.overdue;
    const pct = (n: number) => totalS ? Math.round(n * 100 / totalS) : 0;
    // A soft tint of each status colour for the card face
    const tint = (c: [number, number, number]): [number, number, number] =>
      [Math.round(c[0] + (255 - c[0]) * 0.92), Math.round(c[1] + (255 - c[1]) * 0.92), Math.round(c[2] + (255 - c[2]) * 0.92)];

    const cardData: { label: string; value: number; color: [number, number, number] }[] = [
      { label: "Result back", value: ss.completed, color: GREEN },
      { label: "Still at the lab", value: ss.waiting, color: BLUE },
      { label: `Overdue (over ${data.sample_overdue_days} days)`, value: ss.overdue, color: RED },
    ];

    // ── Three compact status cards: big number on the left, label under it,
    //    share % on the right — all on one tight line. ──
    const gapC = 6, cardW = (CW - 2 * gapC) / 3, cardH = 16;
    cardData.forEach((c, i) => {
      const x = ML + i * (cardW + gapC);
      doc.setFillColor(...tint(c.color));
      doc.roundedRect(x, y, cardW, cardH, 2, 2, "F");
      doc.setDrawColor(...c.color); doc.setLineWidth(0.3);
      doc.roundedRect(x, y, cardW, cardH, 2, 2, "S");
      // Number
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...c.color);
      doc.text(String(c.value), x + 6, y + 10.5);
      // Label to the right of the number
      const numW = doc.getTextWidth(String(c.value));
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...DARK);
      doc.text(doc.splitTextToSize(c.label, cardW - numW - 26), x + 6 + numW + 3, y + 9);
      // Share %, right-aligned
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...c.color);
      doc.text(`${pct(c.value)}%`, x + cardW - 5, y + 10.5, { align: "right" });
    });
    y += cardH + 8;

    // ── Which jobs are waiting for a COA — the exact inspections, not just a
    //    count. Overdue (oldest first) at the top so a manager can chase the
    //    specific client/inspector/sample today. ──
    const waitingJobs = (data.outstanding_samples ?? [])
      .slice()
      .sort((a, b) => (Number(b.overdue) - Number(a.overdue)) || (b.age_days - a.age_days)
        || a.inspector_name.localeCompare(b.inspector_name));
    if (waitingJobs.length) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...DARK);
      doc.text("Which jobs are waiting for a COA", ML, y);
      y += 2;
      autoTable(doc, {
        startY: y,
        head: [["Inspector", "Client", "Commodity", "Sample taken", "Days waiting"]],
        body: waitingJobs.map(s => [
          s.inspector_name,
          s.client_name,
          s.commodity,
          fmtDate(s.sample_date),
          String(s.age_days),
        ]),
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 2.2, valign: "middle", lineColor: [226, 232, 240], textColor: DARK },
        headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 8, halign: "left", valign: "middle" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 38, fontStyle: "bold" },
          1: { cellWidth: 62 },
          2: { cellWidth: 24, halign: "center" },
          3: { cellWidth: 30, halign: "center" },
          4: { cellWidth: 25, halign: "center", fontStyle: "bold" },
        },
        margin: { left: ML, right: MR },
        didParseCell: (d: any) => {
          // Highlight the wait in red when it's past the overdue window.
          if (d.section === "body" && d.column.index === 4) {
            const row = waitingJobs[d.row.index];
            if (row && row.overdue) { d.cell.styles.textColor = RED; }
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 4;
      doc.setFont("helvetica", "italic"); doc.setFontSize(7); doc.setTextColor(...DARK);
      doc.text(`Every job with a sample still at the lab and no result back. "Days waiting" in red is over ${data.sample_overdue_days} days — chase these first. Each needs its COA before the job can close.`, ML, y, { maxWidth: CW });
      doc.setFont("helvetica", "normal"); doc.setTextColor(...DARK);
      y += 8;
    }
  }

  /* ══ 4. OFFICE & ADMIN — what the back office got through this week vs the week
     before: documents sent, invoices added, lab results (COAs) received; plus
     how many samples are still out at the lab right now. ══ */
  const tpA = data.throughput;
  if (tpA) {
    if (y > 210) { doc.addPage(); y = 16; } else if (y > 20) { y += 4; }
    header("5. Office & Admin");
    intro('What the back office got through — this week next to the week before. "Documents sent" and "Invoices added" are files handled this week. "Lab results back" shows, of the samples TAKEN that week (each one needs a result), how many are back — so the target changes with sample volume (some weeks only 10 are needed, some 50). "Jobs waiting for lab results" below is a live count of every job (site visit) with a sample still at the lab and no result back yet — the whole backlog to date, not just this week.');
    const nzA = (v: unknown) => Number(v) || 0;
    const moreFewerA = (n: number) => n === 0 ? "no change" : n > 0 ? `${n} more` : `${Math.abs(n)} fewer`;
    // Lab results: "X of Y (%)" — of the samples TAKEN that week, how many are back.
    const lr = tpA.lab_results;
    const lrCell = (p?: { needed: number; back: number }) =>
      p && p.needed > 0 ? `${p.back} of ${p.needed} (${Math.round(p.back * 100 / p.needed)}%)`
        : p && p.needed === 0 ? "no samples" : "-";
    const lrChange = (() => {
      if (!lr || lr.cur.needed === 0 || lr.prev.needed === 0) return "";
      const cp = Math.round(lr.cur.back * 100 / lr.cur.needed);
      const pp = Math.round(lr.prev.back * 100 / lr.prev.needed);
      const d = cp - pp;
      return d === 0 ? "no change" : `${d > 0 ? "+" : ""}${d}pt`;
    })();
    autoTable(doc, {
      startY: y,
      head: [["What the office did", "This week", "Week before", "Change"]],
      body: [
        ["Documents sent to clients", String(nzA(tpA.sent.count)), String(nzA(tpA.sent.prev)), moreFewerA(nzA(tpA.sent.count) - nzA(tpA.sent.prev))],
        ["Invoices added", String(nzA(tpA.invoices_uploaded.count)), String(nzA(tpA.invoices_uploaded.prev)), moreFewerA(nzA(tpA.invoices_uploaded.count) - nzA(tpA.invoices_uploaded.prev))],
        ["Lab results back (of samples taken)", lrCell(lr?.cur), lrCell(lr?.prev), lrChange],
      ],
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 3, valign: "middle", lineColor: [226, 232, 240], textColor: DARK },
      headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 8.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right" }, 3: { halign: "right" } },
      margin: { left: ML, right: MR },
      didParseCell: (d: any) => {
        if (d.section === "body" && d.column.index === 3) {
          const s = String(d.cell.raw || "");
          if (s.includes("more") || s.startsWith("+")) d.cell.styles.textColor = GREEN;
          else if (s.includes("fewer") || s.startsWith("-")) d.cell.styles.textColor = RED;
          else d.cell.styles.textColor = GRAY;
          d.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    // Live "samples waiting at the lab" callout
    if (tpA.samples_at_lab !== undefined) {
      const n = tpA.samples_at_lab;
      const tintA = (c: [number, number, number]): [number, number, number] =>
        [Math.round(c[0] + (255 - c[0]) * 0.9), Math.round(c[1] + (255 - c[1]) * 0.9), Math.round(c[2] + (255 - c[2]) * 0.9)];
      const stripH = 11;
      doc.setFillColor(...tintA(n > 0 ? AMBER : GREEN)); doc.roundedRect(ML, y, CW, stripH, 2, 2, "F");
      doc.setFillColor(...(n > 0 ? AMBER : GREEN)); doc.rect(ML, y, 2, stripH, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...(n > 0 ? AMBER : GREEN));
      doc.text(String(n), ML + 6, y + 7.6);
      const nW = doc.getTextWidth(String(n));
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...DARK);
      doc.text("job" + (n === 1 ? "" : "s") + " still waiting for lab results", ML + 6 + nW + 3, y + 6);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...GRAY);
      doc.text("(every job with a sample still at the lab, no result back yet — the whole backlog to date, counted once per job)", ML + 6 + nW + 3, y + 9.6);
      doc.setTextColor(...DARK);
      y += stripH + 8;
    }
  }

  /* ══ 5. MONTH-BY-MONTH — inspections done and compliance, one row per month,
     each with the change on the month before, so a manager sees the direction
     of travel in tables (not charts). ══ */
  const months = data.monthly_trend ?? [];
  if (months.length) {
    if (y > 175) { doc.addPage(); y = 16; }
    header("6. Month by Month");

    // Blend a colour toward white: t=0 → white, t=1 → full colour. Used to shade
    // each row by size/score so the good/big months stand out at a glance.
    const shade = (c: [number, number, number], t: number): [number, number, number] => {
      const k = Math.max(0, Math.min(1, t));
      return [Math.round(255 + (c[0] - 255) * k), Math.round(255 + (c[1] - 255) * k), Math.round(255 + (c[2] - 255) * k)];
    };

    // ── Table A: inspections done per month (rows shaded teal by volume) ──
    const inspMax = Math.max(...months.map(m => m.inspections), 1);
    intro('How many inspections were completed each calendar month, oldest at the top. Rows are shaded by size — the busier the month, the darker the teal. Each "Change" compares that month with the month before it (named in the cell). The current month is only counted up to the end of the reporting week, so it is still building.');
    autoTable(doc, {
      startY: y,
      head: [["Month", "Inspections", "Change vs the Month Before"]],
      body: months.map((m) => {
        // Compare to the month before it — for the first visible row that's the
        // hidden earlier month (prev_inspections/prev_label), so it still shows a change.
        const prevN = m.prev_inspections;
        const prevLbl = m.prev_label;
        const diff = (prevN === undefined) ? null : m.inspections - prevN;
        const pct = (prevN && prevN > 0 && diff !== null) ? ` (${diff > 0 ? "+" : ""}${Math.round(diff * 100 / prevN)}%)` : "";
        const change = diff === null ? "—"
          : `${diff === 0 ? "no change" : `${diff > 0 ? "+" : ""}${diff}${pct}`}${prevLbl ? ` vs ${prevLbl}` : ""}`;
        return [m.label + (m.partial ? " (so far)" : ""), String(m.inspections), change];
      }),
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 3, valign: "middle", lineColor: [226, 232, 240], textColor: DARK },
      headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 8.5 },
      margin: { left: ML, right: MR },
      columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right" } },
      didParseCell: (d: any) => {
        if (d.section === "body") {
          // Row heatmap: darker teal = more inspections (0.08..0.55 of full teal)
          const m = months[d.row.index];
          const t = 0.08 + (m.inspections / inspMax) * 0.47;
          d.cell.styles.fillColor = shade(TEAL, t);
          if (d.column.index === 2) {
            const s = String(d.cell.raw || "");
            if (s.startsWith("+")) d.cell.styles.textColor = GREEN;
            else if (s.startsWith("-")) d.cell.styles.textColor = RED;
            else d.cell.styles.textColor = DARK;
            d.cell.styles.fontStyle = "bold";
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // ── Table B: compliance per month (rows tinted green/amber/red by score) ──
    if (y > 205) { doc.addPage(); y = 16; }
    intro('Overall compliance each month — ALL commodities combined, not one product. Rows are colour-coded: green is a good month (75%+), amber is middling (50–74%), red is poor (below 50%). Of the inspections that had a pass/fail result, this is the share that passed; inspections with no result yet are left out. Each "Change" is in percentage points against the month before it (named in the cell).');
    autoTable(doc, {
      startY: y,
      head: [["Month", "Overall Compliance\n(all commodities)", "Assessed", "Change vs the Month Before"]],
      body: months.map((m) => {
        const prevRate = m.prev_rate ?? null;
        const prevLbl = m.prev_label;
        const diff = (m.rate !== null && prevRate !== null) ? Math.round((m.rate - prevRate) * 10) / 10 : null;
        const change = diff === null ? "—"
          : `${diff === 0 ? "no change" : `${diff > 0 ? "+" : ""}${diff}pt`}${prevLbl ? ` vs ${prevLbl}` : ""}`;
        const assessed = m.compliant + m.non_compliant;
        return [m.label + (m.partial ? " (so far)" : ""), m.rate === null ? "n/a" : `${m.rate}%`, String(assessed), change];
      }),
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 3, valign: "middle", lineColor: [226, 232, 240], textColor: DARK },
      headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 8.5 },
      margin: { left: ML, right: MR },
      columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right" }, 3: { halign: "right" } },
      didParseCell: (d: any) => {
        if (d.section === "body") {
          const m = months[d.row.index];
          // Row heatmap by compliance band: green >=75, amber 50-74, red <50.
          if (m.rate !== null) {
            const band: [number, number, number] = m.rate >= 75 ? GREEN : m.rate >= 50 ? AMBER : RED;
            d.cell.styles.fillColor = shade(band, 0.22);
          } else {
            d.cell.styles.fillColor = [248, 250, 252];
          }
          if (d.column.index === 1 && m.rate !== null) {
            d.cell.styles.textColor = m.rate >= 75 ? GREEN : m.rate >= 50 ? AMBER : RED;
          }
          if (d.column.index === 3) {
            const s = String(d.cell.raw || "");
            if (s.startsWith("+")) d.cell.styles.textColor = GREEN;
            else if (s.startsWith("-")) d.cell.styles.textColor = RED;
            else d.cell.styles.textColor = DARK;
            d.cell.styles.fontStyle = "bold";
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  /* ══ 5. PROFIT BY MONTH (management-only) — one grid: inspectors down the
     side, months across the top, each cell that inspector's profit for the
     month (green = profit, red = loss). Profit = revenue (billed hrs/km/samples)
     − cost (full month salary + 20% fee). ══ */
  const finSeriesRaw = (data.monthly_financials_series ?? []).filter(m => m.rows);
  if (finSeriesRaw.length) {
    if (y > 150) { doc.addPage(); y = 16; } else if (y > 20) { y += 4; }
    header("7. Profit by Month");
    intro('Each inspector\'s profit for every month, so you can see who is consistently making money for us. Profit = revenue billed (hours, kilometres, samples) minus their full cost for the month (salary and related deductions, plus a 20% management fee). A GREEN figure is real profit the inspector made for the business; a RED figure is a loss. The current month (marked with *) is negative simply because we are still early in it — a whole month\'s salary is already charged, but only a part-month of revenue has come in — so it corrects itself as the month fills up.');

    // Oldest → newest across the page (series comes newest-first)
    const months = [...finSeriesRaw].reverse();
    // Short month header e.g. "Mar", "Aug*" (* = still in progress)
    const mHead = (m: MonthlyFinancials) => {
      const short = (m.month_label || "").split(" ")[0].slice(0, 3);
      return short + (m.partial ? "*" : "");
    };
    // Compact rand for narrow cells: "R31k" / "-R22k" / "R0"
    const randK = (n: number) => {
      const neg = n < 0; const a = Math.abs(n);
      const body = a >= 1000 ? `R${Math.round(a / 1000)}k` : `R${Math.round(a)}`;
      return `${neg ? "-" : ""}${body}`;
    };

    // Profit lookup: inspector name -> { monthIndex -> profit }
    const nameSet = new Set<string>();
    months.forEach(m => m.rows.forEach(r => nameSet.add(r.inspector_name)));
    const profitByName: Record<string, Record<number, number | undefined>> = {};
    months.forEach((m, mi) => m.rows.forEach(r => {
      (profitByName[r.inspector_name] ??= {})[mi] = r.profit;
    }));
    // Rank inspectors by their most recent full month's profit (fallback: latest)
    const rankIdx = months.length - 1;
    const names = [...nameSet].sort((a, b) =>
      (profitByName[b]?.[rankIdx] ?? -Infinity) - (profitByName[a]?.[rankIdx] ?? -Infinity)
      || a.localeCompare(b));

    const head = ["Inspector", ...months.map(mHead)];
    const NO_WORK = "no inspections done this month";
    const body = names.map(n => [n, ...months.map((_, mi) => {
      const p = profitByName[n]?.[mi];
      return p === undefined ? NO_WORK : randK(p);
    })]);
    const teamRow = ["Whole team", ...months.map(m => randK(m.total_profit))];

    const monthColW = (CW - 44) / months.length;
    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      foot: [teamRow],
      theme: "grid",
      rowPageBreak: "avoid",
      styles: { fontSize: 7.5, cellPadding: 2.1, valign: "middle", halign: "right", lineColor: [226, 232, 240], textColor: DARK },
      headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 7.5, halign: "right", valign: "middle" },
      footStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: 7.5, halign: "right" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: (() => {
        const cs: Record<number, any> = { 0: { cellWidth: 44, halign: "left", fontStyle: "bold" } };
        for (let i = 1; i <= months.length; i++) cs[i] = { cellWidth: monthColW };
        return cs;
      })(),
      margin: { left: ML, right: MR },
      didParseCell: (d: any) => {
        if (d.section === "head" && d.column.index > 0) d.cell.styles.halign = "center";
        // Colour every profit cell green/red by its numeric value
        if (d.section === "body" && d.column.index > 0) {
          const p = profitByName[names[d.row.index]]?.[d.column.index - 1];
          if (p === undefined) {
            // "no inspections done this month" — grey, smaller, centred so the
            // phrase wraps neatly inside the narrow column.
            d.cell.styles.textColor = GRAY;
            d.cell.styles.fontStyle = "italic";
            d.cell.styles.fontSize = 5.6;
            d.cell.styles.halign = "center";
          } else {
            d.cell.styles.textColor = p >= 0 ? GREEN : RED;
          }
        }
        if (d.section === "foot" && d.column.index > 0) {
          const raw = String(d.cell.raw || "");
          d.cell.styles.textColor = raw.startsWith("-") ? [255, 180, 180] : [190, 240, 200];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    doc.setFont("helvetica", "italic"); doc.setFontSize(7); doc.setTextColor(...DARK);
    doc.text('Amounts in thousands of rand (e.g. R31k). "No inspections done this month" means exactly that — the inspector logged no work that month (not started yet, left, or none captured) — it is not missing data. A month with * is still in progress. Management-confidential.', ML, y, { maxWidth: CW });
    doc.setFont("helvetica", "normal");
    y += 9;
  }

  /* ── Footer on every page ── */
  const pages = doc.getNumberOfPages();
  for (let i = 2; i <= pages; i++) {
    doc.setPage(i);
    doc.setTextColor(...GRAY); doc.setFontSize(7);
    doc.text(`Food Safety Agency — Weekly Manager Report · ${periodLabel}`, ML, 292);
    doc.text(`Page ${i - 1} of ${pages - 1}`, W - MR, 292, { align: "right" });
  }

  return doc;
}

/* ── Finance Report — for the finance team. Invoicing + documents sent, how
   fast, who's doing it, and whether it's rising or dropping. Volume/timing
   only: actual rand amounts aren't in the system (Xero not synced). ───────── */
export async function buildFinanceReportPdf(data: ReportResponse, logo: string | null): Promise<any> {
  const jsPDFModule: any = await import("jspdf");
  const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
  const autoTableModule: any = await import("jspdf-autotable");
  const autoTable = autoTableModule.default || autoTableModule.autoTable || autoTableModule;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, ML = 14, MR = 14, CW = W - ML - MR;
  const TEAL: [number, number, number] = [0, 120, 144];
  const DARK: [number, number, number] = [17, 24, 39];
  const GRAY: [number, number, number] = [107, 114, 128];
  const GRAY_LIGHT: [number, number, number] = [156, 163, 175];
  const GREEN: [number, number, number] = [21, 128, 61];
  const RED: [number, number, number] = [220, 38, 38];
  const AMBER: [number, number, number] = [217, 119, 6];
  const BLUE: [number, number, number] = [37, 99, 235];
  const WHITE: [number, number, number] = [255, 255, 255];

  const tp = data.throughput;
  const am = data.admin_monthly ?? [];
  const periodLabel = data.is_single_week
    ? `Monday ${fmtDate(data.week_start)} — Sunday ${fmtDate(data.week_end)}`
    : `${fmtDate(data.week_start)} — ${fmtDate(data.week_end)}`;
  const nz = (v: unknown) => Number(v) || 0;

  let y = 0;
  const header = (title: string) => {
    if (y > 255) { doc.addPage(); y = 16; }
    doc.setFillColor(...TEAL); doc.rect(ML, y, CW, 9, "F");
    doc.setTextColor(...WHITE); doc.setFontSize(11); doc.setFont("helvetica", "bold");
    doc.text(title, ML + 3, y + 6); doc.setFont("helvetica", "normal"); y += 13;
  };
  const intro = (txt: string) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...DARK);
    const lines = doc.splitTextToSize(txt, CW); doc.text(lines, ML, y); y += lines.length * 4 + 3;
  };

  /* ══ COVER ══ */
  doc.setFillColor(...DARK); doc.rect(0, 0, W, H, "F");
  doc.setDrawColor(...TEAL); doc.setLineWidth(0.8);
  doc.line(ML, 42, W - MR, 42); doc.line(ML, H - 62, W - MR, H - 62);
  if (logo) { try { doc.addImage(logo, "PNG", W / 2 - 18, 58, 36, 32); } catch { /* skip */ } }
  const lb = logo ? 102 : 80;
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...WHITE);
  doc.text("FOOD SAFETY AGENCY (PTY) LTD", W / 2, lb, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(14); doc.setTextColor(...TEAL);
  doc.text("Weekly Finance Report", W / 2, lb + 11, { align: "center" });
  doc.setFillColor(...TEAL); doc.rect(W / 2 - 30, lb + 16.5, 60, 1.2, "F");
  doc.setFontSize(11); doc.setTextColor(...GRAY_LIGHT);
  doc.text(`Reporting period: ${periodLabel}`, W / 2, lb + 27, { align: "center" });
  doc.setFontSize(10); doc.text(data.quarter, W / 2, lb + 34, { align: "center" });
  doc.setFontSize(9); doc.setTextColor(...GRAY);
  doc.text("Invoicing, profitability and money owed — the financial health of the APS department.", W / 2, lb + 43, { align: "center" });
  doc.setFontSize(9); doc.setTextColor(...TEAL);
  doc.text("IN THIS REPORT", W / 2, lb + 56, { align: "center" });
  doc.setFontSize(9); doc.setTextColor(...GRAY_LIGHT);
  ["The Week at a Glance", "Profitability — Revenue vs Cost",
   "Action Points", "Unbilled Invoices — Act On These", "Invoicing & Documents Each Month",
   "Invoices Done vs Needed", "Who's Doing the Work  ·  Commodities"]
    .forEach((s, i) => doc.text(s, W / 2, lb + 63 + i * 6.4, { align: "center" }));
  doc.setFontSize(8); doc.setTextColor(...GRAY);
  doc.text("DRAFT for review — tell me what to remove.", W / 2, H - 48, { align: "center" });
  doc.setFontSize(8); doc.setTextColor(...GRAY_LIGHT);
  doc.text("CONFIDENTIAL — Management only (contains revenue)", W / 2, H - 42, { align: "center" });

  /* ══ PAGE 2: THE WEEK AT A GLANCE ══ */
  doc.addPage();
  const drawKpi = (x: number, cy: number, w: number, h: number, label: string, value: string, sub: string, color: [number, number, number]) => {
    doc.setFillColor(246, 248, 250); doc.roundedRect(x, cy, w, h, 2, 2, "F");
    doc.setFillColor(...color); doc.rect(x, cy, w, 2.5, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(19); doc.setTextColor(...color);
    doc.text(value, x + w / 2, cy + h / 2 - 1, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text(doc.splitTextToSize(label.toUpperCase(), w - 6), x + w / 2, cy + h / 2 + 6, { align: "center" });
    if (sub) { doc.setFontSize(6.8); doc.setTextColor(...(sub.startsWith("+") ? GREEN : sub.startsWith("-") ? RED : GRAY)); doc.text(sub, x + w / 2, cy + h - 4, { align: "center" }); }
  };
  y = 24;
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...DARK);
  doc.text("The Week at a Glance", ML, y);
  doc.setDrawColor(...TEAL); doc.setLineWidth(0.7); doc.line(ML, y + 2.5, ML + 62, y + 2.5);
  y += 12;
  const chg = (c: number, p: number) => { const d = c - p; return d === 0 ? "no change" : `${d > 0 ? "+" : ""}${d} vs last week`; };
  const gap = 5, w3 = (CW - 2 * gap) / 3, cardH = 40;
  if (tp) {
    drawKpi(ML, y, w3, cardH, "Invoices uploaded this week", String(nz(tp.invoices_uploaded.count)), chg(nz(tp.invoices_uploaded.count), nz(tp.invoices_uploaded.prev)), TEAL);
    drawKpi(ML + w3 + gap, y, w3, cardH, "Documents sent this week", String(nz(tp.sent.count)), chg(nz(tp.sent.count), nz(tp.sent.prev)), BLUE);
    // Completion %: of this week's jobs that need an invoice, how many are done.
    const ic0 = tp.invoice_completion;
    if (ic0 && ic0.cur.needed > 0) {
      const pc = Math.round(ic0.cur.done * 100 / ic0.cur.needed);
      drawKpi(ML + 2 * (w3 + gap), y, w3, cardH, "This week's inspections invoiced", `${pc}%`, `${ic0.cur.done} of ${ic0.cur.needed} done`, pc >= 90 ? GREEN : pc >= 70 ? AMBER : RED);
    } else {
      drawKpi(ML + 2 * (w3 + gap), y, w3, cardH, "This week's inspections invoiced", "—", "no jobs needing an invoice", GRAY);
    }
  }
  y += cardH + 12;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
  doc.text("Rand values are estimated from billable hours, kilometres and samples at the standard rates (the same basis as the Revenue Per Inspector page). Corporate-store jobs are handled centrally and excluded.", ML, y, { maxWidth: CW });
  doc.setTextColor(...DARK); y += 10;

  // Rand formatter, reused by the Profitability section below.
  const rand = (n: number) => "R" + Math.round(n).toLocaleString("en-ZA");

  /* NOTE: the cross-team Timeliness scorecard (Approval/Inspector, Send docs/
     Office, Sample→COA/Lab) and the "Where It's Stuck & Who Owns It" backlog
     live in the MANAGER report — they span every team, not just finance. The
     finance report keeps only financial content (Speed to Cash, invoicing,
     profitability, unbilled). */

  /* ══ PROFITABILITY — revenue, cost and profit for the department this month
     and the trend across recent months. ══ */
  const mseriesNewest = data.monthly_financials_series ?? [];
  // Use the last COMPLETE month for the headline — a partial month compares part-
  // month revenue against a full month of salary, which reads as a false loss.
  const mf = mseriesNewest.find(m => !m.partial) ?? data.monthly_financials;
  const mseries = mseriesNewest.slice().reverse(); // oldest -> newest
  if (mf) {
    if (y > 205) { doc.addPage(); y = 16; }
    header("Profitability — Revenue vs Cost");
    intro(`Department revenue (billable hours, kilometres and samples at standard rates) against cost (salaries + 20% management fee) for ${mf.month_label ?? "the month"} — the last complete month. Profit is revenue minus cost; margin is profit as a share of revenue. The current month is still building, so its profit is only meaningful once the month closes.`);
    const margin = mf.total_revenue > 0 ? Math.round(mf.total_profit * 100 / mf.total_revenue) : 0;
    const g4 = 5, cw4 = (CW - 3 * g4) / 4, ch4 = 26;
    const cards: [string, string, [number, number, number]][] = [
      ["Revenue", rand(mf.total_revenue), TEAL],
      ["Cost", rand(mf.total_cost), GRAY],
      ["Profit", rand(mf.total_profit), mf.total_profit >= 0 ? GREEN : RED],
      ["Margin", `${margin}%`, margin >= 25 ? GREEN : margin >= 0 ? AMBER : RED],
    ];
    cards.forEach((c, i) => {
      const x = ML + i * (cw4 + g4);
      doc.setFillColor(246, 248, 250); doc.roundedRect(x, y, cw4, ch4, 2, 2, "F");
      doc.setFillColor(...c[2]); doc.rect(x, y, cw4, 2.4, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...c[2]);
      doc.text(c[1], x + cw4 / 2, y + 13, { align: "center" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
      doc.text(c[0].toUpperCase(), x + cw4 / 2, y + 20, { align: "center" });
    });
    y += ch4 + 8;

    if (mseries.length > 1) {
      if (y > 230) { doc.addPage(); y = 16; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...DARK);
      doc.text("Month by month", ML, y + 2); y += 6;
      autoTable(doc, {
        startY: y,
        head: [["Month", "Revenue", "Cost", "Profit", "Margin"]],
        body: mseries.map(m => {
          const mg = m.total_revenue > 0 ? Math.round(m.total_profit * 100 / m.total_revenue) : 0;
          // Partial month: revenue is real, but profit/margin vs a full month's
          // salary would read as a false loss — show them as "building".
          return [(m.month_label ?? "") + (m.partial ? " (so far)" : ""), rand(m.total_revenue), rand(m.total_cost),
            m.partial ? "building" : rand(m.total_profit), m.partial ? "—" : `${mg}%`];
        }),
        theme: "grid",
        styles: { fontSize: 8.5, cellPadding: 2.6, valign: "middle", lineColor: [226, 232, 240], textColor: DARK },
        headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 8.5 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" }, 4: { halign: "right" } },
        margin: { left: ML, right: MR },
        didParseCell: (d: any) => {
          if (d.section === "body" && (d.column.index === 3 || d.column.index === 4)) {
            const m = mseries[d.row.index];
            if (m.partial) { d.cell.styles.textColor = GRAY; d.cell.styles.fontStyle = "italic"; }
            else if (m.total_profit < 0) d.cell.styles.textColor = RED;
            else if (d.column.index === 3) d.cell.styles.textColor = GREEN;
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }
  }

  /* ══ ACTION POINTS — what the finance manager should do this week, generated
     straight from the numbers. Red = urgent, amber = attention. ══ */
  const bl = data.billing_backlog;
  const actions: { sev: "red" | "amber"; text: string }[] = [];
  if (bl && bl.total > 0) {
    const over60 = bl.buckets.d60_plus;
    if (over60 > 0) actions.push({ sev: "red", text: `Invoice the ${over60} job${over60 === 1 ? "" : "s"} that have been waiting over 60 days to be billed. The oldest has been waiting ${bl.oldest_days} days. Do these first.` });
    actions.push({ sev: bl.total > 200 ? "red" : "amber", text: `In total, ${bl.total} completed job${bl.total === 1 ? " has" : "s have"} not been invoiced. Each one is money the agency has earned but not yet billed.` });
    const c = bl.top_clients[0];
    if (c) actions.push({ sev: "amber", text: `Start with ${c.client}: they have ${c.jobs} completed job${c.jobs === 1 ? "" : "s"} waiting to be invoiced — the most of any client.` });
  }
  const _ic = tp?.invoice_completion;
  if (_ic && _ic.cur.needed > 0) {
    const still = _ic.cur.needed - _ic.cur.done;
    if (still > 0) actions.push({ sev: "amber", text: `${still} of this week's ${_ic.cur.needed} inspections that need an invoice still have not been billed. Finish these so the week is fully invoiced.` });
  }
  if (actions.length) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...DARK);
    doc.text("Action Points", ML, y);
    doc.setDrawColor(...RED); doc.setLineWidth(0.7); doc.line(ML, y + 2.5, ML + 42, y + 2.5);
    y += 6;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
    doc.text("What to do this week, in order. A red bar means do it now; an amber bar means keep an eye on it.", ML, y + 3);
    y += 8;
    actions.slice(0, 6).forEach((a, i) => {
      const lines = doc.splitTextToSize(`${i + 1}. ${a.text}`, CW - 6);
      if (y + lines.length * 4 + 6 > 283) { doc.addPage(); y = 16; }
      doc.setFillColor(...(a.sev === "red" ? RED : AMBER));
      doc.rect(ML, y - 2.6, 2, lines.length * 4 + 1.5, "F");
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...DARK);
      doc.text(lines, ML + 5, y + 1);
      y += lines.length * 4 + 4;
    });
    y += 6;
  }

  /* ══ 1. UNBILLED INVOICES — the action list: jobs sent but not invoiced,
     aged, plus the clients to bill first. This is what to act on. ══ */
  if (bl && bl.total > 0) {
    if (y > 200) { doc.addPage(); y = 16; }
    header("1. Unbilled Invoices — Act On These");
    intro('Raw meat and PMP jobs that were completed and sent to the client but still have no invoice uploaded — billable work we have not billed for yet. (Poultry and eggs are not billed, so they are not counted.) Aged from the inspection date. Clear the oldest first.');
    autoTable(doc, {
      startY: y,
      head: [["How long waiting", "Jobs not yet invoiced"]],
      body: [
        ["0–7 days", String(bl.buckets.d0_7)],
        ["8–30 days", String(bl.buckets.d8_30)],
        ["31–60 days", String(bl.buckets.d31_60)],
        ["Over 60 days (urgent)", String(bl.buckets.d60_plus)],
      ],
      foot: [["Total unbilled jobs", String(bl.total)]],
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 3, valign: "middle", lineColor: [226, 232, 240], textColor: DARK },
      headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 8.5 },
      footStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: 8.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: ML, right: MR },
      columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right", fontStyle: "bold" } },
      didParseCell: (d: any) => {
        if (d.section === "body" && d.column.index === 1) {
          const n = Number(d.cell.raw);
          // urgent (60+) row is red; older buckets amber; recent grey/dark
          if (d.row.index === 3 && n > 0) d.cell.styles.textColor = RED;
          else if (d.row.index === 2 && n > 0) d.cell.styles.textColor = AMBER;
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // Clients to bill first
    if (bl.top_clients.length) {
      if (y > 215) { doc.addPage(); y = 16; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...DARK);
      doc.text("Clients to bill first (most jobs waiting)", ML, y + 2);
      y += 6;
      autoTable(doc, {
        startY: y,
        head: [["Client", "Jobs not invoiced", "Oldest (days)"]],
        body: bl.top_clients.map(c => [c.client, String(c.jobs), String(c.oldest)]),
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 2.6, valign: "middle", lineColor: [226, 232, 240], textColor: DARK },
        headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: ML, right: MR },
        columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right" } },
        didParseCell: (d: any) => {
          if (d.section === "body" && d.column.index === 2 && Number(d.cell.raw) > 60) {
            d.cell.styles.textColor = RED; d.cell.styles.fontStyle = "bold";
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }
  }

  /* ══ 2. INVOICING & DOCUMENTS — month by month. Just the counts, with a small
     up/down arrow next to each showing the direction vs the month above. ══ */
  if (am.length) {
    header("2. Invoicing & Documents Each Month");
    intro('How many invoices were uploaded and how many documents were sent each month, both counted per job. A green arrow means more than the month above; a red arrow means fewer. The current month is only counted up to the end of the reporting week, so it is still building.');
    autoTable(doc, {
      startY: y,
      head: [["Month", "Invoices uploaded", "Documents sent"]],
      body: am.map((m) => [
        m.label + (m.partial ? " (so far)" : ""),
        String(m.invoices),
        String(m.sent),
      ]),
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3.2, valign: "middle", lineColor: [226, 232, 240], textColor: DARK },
      headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: ML, right: MR },
      // number columns wide, right-aligned, with left padding so the drawn arrow
      // sits to the left of the number without overlapping.
      columnStyles: {
        0: { cellWidth: 46, fontStyle: "bold" },
        1: { halign: "right", fontStyle: "bold", cellPadding: { top: 3.2, bottom: 3.2, left: 10, right: 8 } },
        2: { halign: "right", fontStyle: "bold", cellPadding: { top: 3.2, bottom: 3.2, left: 10, right: 8 } },
      },
      didDrawCell: (d: any) => {
        if (d.section !== "body" || (d.column.index !== 1 && d.column.index !== 2)) return;
        const m = am[d.row.index];
        const cur = d.column.index === 1 ? m.invoices : m.sent;
        const prev = d.column.index === 1 ? m.prev_invoices : m.prev_sent;
        if (prev === undefined || cur === prev) return;
        const up = cur > prev;
        const cx = d.cell.x + 5, cy = d.cell.y + d.cell.height / 2, s = 1.8;
        if (up) { doc.setFillColor(...GREEN); doc.triangle(cx - s, cy + s, cx + s, cy + s, cx, cy - s, "F"); }
        else { doc.setFillColor(...RED); doc.triangle(cx - s, cy - s, cx + s, cy - s, cx, cy + s, "F"); }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  /* ══ 3. INVOICES DONE vs NEEDED — of the week's inspections that need an
     invoice, how many were invoiced. This week next to the week before. ══ */
  const ic = tp?.invoice_completion;
  if (ic) {
    if (y > 215) { doc.addPage(); y = 16; }
    header("3. Invoices Done vs Needed");
    intro('Of the inspections done in the week that need an invoice, how many have been invoiced. "Need an invoice" means every Raw meat and PMP job (these are always billed) plus any other job that was invoiced. Eggs and most poultry are not billed, so they are not counted.');
    const pctOf = (p: { needed: number; done: number }) => p.needed > 0 ? Math.round(p.done * 100 / p.needed) : 0;
    const cur = ic.cur, prev = ic.prev;
    autoTable(doc, {
      startY: y,
      head: [["Week", "Needed an invoice", "Invoiced", "Done", "Still to do"]],
      body: [
        [`This week`, String(cur.needed), String(cur.done), `${pctOf(cur)}%`, String(cur.needed - cur.done)],
        [`Week before`, String(prev.needed), String(prev.done), `${pctOf(prev)}%`, String(prev.needed - prev.done)],
      ],
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 3, valign: "middle", lineColor: [226, 232, 240], textColor: DARK },
      headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 8.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: ML, right: MR },
      columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" }, 4: { halign: "right" } },
      didParseCell: (d: any) => {
        if (d.section === "body") {
          const p = d.row.index === 0 ? cur : prev;
          const pc = pctOf(p);
          if (d.column.index === 3) d.cell.styles.textColor = pc >= 90 ? GREEN : pc >= 70 ? AMBER : RED;
          if (d.column.index === 4 && (p.needed - p.done) > 0) { d.cell.styles.textColor = RED; d.cell.styles.fontStyle = "bold"; }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
    doc.setFont("helvetica", "italic"); doc.setFontSize(7); doc.setTextColor(...DARK);
    doc.text('Counted per job; corporate-store jobs are billed month-end as one entity and are excluded.', ML, y, { maxWidth: CW });
    doc.setFont("helvetica", "normal"); y += 8;

    // The specific jobs still needing an invoice (this week + week before),
    // oldest first — a chase-list for finance.
    const todoRows = [
      ...(cur.todo ?? []).map(t => ({ ...t, wk: "This week" })),
      ...(prev.todo ?? []).map(t => ({ ...t, wk: "Week before" })),
    ].sort((a, b) => (a.age ?? 0) < (b.age ?? 0) ? 1 : -1);
    if (todoRows.length) {
      if (y > 220) { doc.addPage(); y = 16; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...DARK);
      doc.text("Still to invoice — chase these", ML, y + 2);
      y += 6;
      autoTable(doc, {
        startY: y,
        head: [["Client", "Inspection date", "Days waiting", "From"]],
        body: todoRows.map(t => [
          t.client,
          t.date ? fmtDate(t.date) : "—",
          t.age === null ? "—" : `${t.age} days`,
          t.wk,
        ]),
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 2.6, valign: "middle", lineColor: [226, 232, 240], textColor: DARK },
        headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: ML, right: MR },
        columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" }, 2: { halign: "right", fontStyle: "bold" }, 3: { halign: "right" } },
        didParseCell: (d: any) => {
          if (d.section === "body" && d.column.index === 2) {
            const t = todoRows[d.row.index];
            if (t && t.age !== null) d.cell.styles.textColor = t.age > 14 ? RED : t.age > 7 ? AMBER : DARK;
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    } else {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...GREEN);
      doc.text("Nothing outstanding — every job from both weeks that needed an invoice has one.", ML, y);
      doc.setFont("helvetica", "normal"); doc.setTextColor(...DARK); y += 9;
    }
  }

  /* ══ 3. WHO'S DOING THE WORK — per person: invoices uploaded, documents sent,
     and how fast (approved → invoice). This week. ══ */
  const people = data.admin_people ?? [];
  if (people.length) {
    if (y > 200) { doc.addPage(); y = 16; }
    header("4. Who's Doing the Work");
    intro('For this week, per person: how many invoices they uploaded, how many documents they sent to clients (both counted per job), and how fast they are — the average number of days from the inspection date to the invoice being uploaded. Shorter is better. If someone uploaded no invoices, the speed cell says so.');
    const teamInv = people.reduce((a, p) => a + p.invoices, 0);
    const teamSent = people.reduce((a, p) => a + p.sent, 0);
    // Team average speed, weighted by each person's timed-invoice count.
    const _twd = people.reduce((a, p) => a + (p.avg_days !== null ? p.avg_days * p.days_count : 0), 0);
    const _twn = people.reduce((a, p) => a + (p.avg_days !== null ? p.days_count : 0), 0);
    const teamAvg = _twn > 0 ? Math.round((_twd / _twn) * 10) / 10 : null;
    autoTable(doc, {
      startY: y,
      head: [["Person", "Invoices uploaded", "Documents sent", "Avg days: inspection to invoice"]],
      body: people.map(p => [
        p.name,
        String(p.invoices),
        String(p.sent),
        p.avg_days !== null ? `${p.avg_days} days` : (p.invoices === 0 ? "No invoices uploaded" : "Not enough data"),
      ]),
      foot: [["Whole team", String(teamInv), String(teamSent), teamAvg !== null ? `${teamAvg} days` : "—"]],
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 3, valign: "middle", lineColor: [226, 232, 240], textColor: DARK },
      headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 8.5 },
      footStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: 8.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: ML, right: MR },
      columnStyles: {
        0: { fontStyle: "bold" },
        1: { halign: "right", fontStyle: "bold" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
      didParseCell: (d: any) => {
        // Speed cell: green <=7 days, amber up to 14, red if slower.
        if (d.section === "body" && d.column.index === 3) {
          const p = people[d.row.index];
          if (p && p.avg_days !== null) {
            d.cell.styles.fontStyle = "bold";
            d.cell.styles.textColor = p.avg_days <= 7 ? GREEN : p.avg_days <= 14 ? AMBER : RED;
          } else {
            d.cell.styles.textColor = GRAY;
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 5;
    doc.setFont("helvetica", "italic"); doc.setFontSize(7); doc.setTextColor(...DARK);
    doc.text('Speed colour: green = 7 days or fewer, amber = 8–14 days, red = over 14 days.', ML, y, { maxWidth: CW });
    doc.setFont("helvetica", "normal"); y += 9;
  }

  /* ══ 4. COMMODITIES INSPECTED — last week vs the week before ══ */
  const cw = data.commodity_week ?? [];
  if (cw.length) {
    if (y > 205) { doc.addPage(); y = 16; }
    header("5. Commodities Inspected — Last Week vs the Week Before");
    intro('Which commodities were inspected last week, and how many, next to the week before. Green = more than the week before, red = fewer. This is inspection volume by product type. Corporate-store jobs are billed month-end as one entity and are excluded here.');
    const teamCur = cw.reduce((a, c) => a + c.count, 0);
    const teamPrev = cw.reduce((a, c) => a + c.prev, 0);
    const chgCell = (c: number, p: number) => {
      const d = c - p;
      if (d === 0) return "no change";
      const pct = p > 0 ? ` (${d > 0 ? "+" : ""}${Math.round(d * 100 / p)}%)` : "";
      return `${d > 0 ? "+" : ""}${d}${pct}`;
    };
    // Friendly commodity names
    const niceName = (c: string) => ({ RAW: "Raw meat", PMP: "PMP (processed)", EGGS: "Eggs", POULTRY: "Poultry" } as Record<string, string>)[c] || c;
    autoTable(doc, {
      startY: y,
      head: [["Commodity", "Last week", "Week before", "Change"]],
      body: cw.map(c => [niceName(c.commodity), String(c.count), String(c.prev), chgCell(c.count, c.prev)]),
      foot: [["All commodities", String(teamCur), String(teamPrev), chgCell(teamCur, teamPrev)]],
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 3, valign: "middle", lineColor: [226, 232, 240], textColor: DARK },
      headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 8.5 },
      footStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: 8.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: ML, right: MR },
      columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right" }, 3: { halign: "right" } },
      didParseCell: (d: any) => {
        if (d.column.index === 3 && (d.section === "body" || d.section === "foot")) {
          const s = String(d.cell.raw || "");
          if (s.startsWith("+")) d.cell.styles.textColor = d.section === "foot" ? [190, 240, 200] : GREEN;
          else if (s.startsWith("-")) d.cell.styles.textColor = d.section === "foot" ? [255, 180, 180] : RED;
          else d.cell.styles.textColor = d.section === "foot" ? [255, 255, 255] : GRAY;
          d.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  /* ── Footer on every page ── */
  const pages = doc.getNumberOfPages();
  for (let i = 2; i <= pages; i++) {
    doc.setPage(i);
    doc.setTextColor(...GRAY); doc.setFontSize(7);
    doc.text(`Food Safety Agency — Weekly Finance Report · ${periodLabel}`, ML, 292);
    doc.text(`Page ${i - 1} of ${pages - 1}`, W - MR, 292, { align: "right" });
  }

  return doc;
}
