"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import dynamic from "next/dynamic";
import InspectorDashboard from "@/components/InspectorDashboard";
import MultiSelectDropdown from "@/components/ui/MultiSelectDropdown";

// chart.js is heavy (~380KB); load it lazily in its own chunk so it is not in
// the analytics route's initial JS bundle. The wrappers inject the datalabels
// plugin per-chart. ssr:false is fine — this whole page is client-rendered.
const DLBar = dynamic(() => import("@/components/charts").then(m => m.DLBar), { ssr: false });
const DLLine = dynamic(() => import("@/components/charts").then(m => m.DLLine), { ssr: false });
const DLRadar = dynamic(() => import("@/components/charts").then(m => m.DLRadar), { ssr: false });

// ── Types ──────────────────────────────────────────────────────────────────────

interface AnalyticsData {
  totalInspections: number;
  complianceRate: number;
  activeInspectors: number;
  totalHours: number;
  avgHours: number;
  totalOccurrenceReports: number;
  complianceByCommodity: { commodity: string; total: number; compliant: number; non_compliant: number; compliance_rate: number }[];
  commodityAnalysis: { commodity: string; total_inspections: number }[];
  samplesByCommodity: { commodity: string; count: number }[];
  facilityTypeDistribution: { facility_type: string; count: number }[];
  monthlyCommodityTrends: { month: string; commodity: string; count: number }[];
  monthlyComplianceTrend: { month: string; commodity: string; total: number; compliant: number; compliance_rate: number }[];
  weeklyComplianceTrend: { week: string; total: number; compliant: number; compliance_rate: number }[];
  dailyComplianceTrend: { day: string; commodity: string; total: number; compliant: number; non_compliant?: number; compliance_rate: number }[];
  timeAllocation: { inspector_name: string; total_hours: number }[];
  inspectionsList: { date_of_inspection: string; inspector_name: string; client_name: string; commodity: string; facility_type: string; is_sample_taken: boolean; approved_status: string; town: string }[];
  inspectorPerformance: { inspector_name: string; total_inspections: number; compliant: number; non_compliant: number }[];
  occurrenceReports: { inspector_name: string; count: number }[];
  directionsPerInspector: { inspector_name: string; total: number; directions: number; non_compliant_products: number }[];
  facilitiesPerInspector: { inspector_name: string; facilities: number; visits: number; inspections: number }[];
  travelPerInspector: { inspector_name: string; total_km: number; total_hours: number; inspection_count: number; avg_km: number }[];
  inspectorCommodityMatrix: { inspector_name: string; commodity: string; count: number }[];
  inspectorSampleMatrix: { inspector_name: string; commodity: string; count: number }[];
  approvalPerInspector: { inspector_name: string; total: number; approved: number; pending: number }[];
  monthlyInspectorTrend: { day: string; inspector_name: string; count: number; total_km: number; total_hours: number; samples: number }[];
  inspectorFinancials: { inspector_name: string; total_inspections: number; total_hours: number; total_km: number; total_samples: number; inspection_time: number; revenue_hours: number; revenue_km: number; revenue_samples: number; total_revenue: number; months_active?: number }[];
  financialSummary: { total_revenue: number; hourly_rate: number; km_rate: number; sample_rate: number };
  monthlyOccurrenceTrend: { month: string; count: number }[];
  monthlyTravelTrend: { month: string; total_km: number }[];
  monthlyDocSendTrend: { month: string; avg_days: number; count: number }[];
  weeklyDocSendTrend: { week: string; avg_days: number; count: number }[];
  dailyDocSendTrend: { day: string; avg_days: number; count: number }[];
  monthlyInvoiceTrend: { month: string; avg_days: number; count: number }[];
  weeklyInvoiceTrend: { week: string; avg_days: number; count: number }[];
  dailyInvoiceTrend: { day: string; avg_days: number; count: number }[];
  monthlyInspectionsTrend: { month: string; count: number }[];
  monthlyCoaTrend: { month: string; avg_days: number; count: number }[];
  weeklyCoaTrend: { week: string; avg_days: number; count: number }[];
  dailyCoaTrend: { day: string; avg_days: number; count: number }[];
  monthlyApprovalTrend: { month: string; avg_days: number; count: number }[];
  weeklyApprovalTrend: { week: string; avg_days: number; count: number }[];
  dailyApprovalTrend: { day: string; avg_days: number; count: number }[];
  outstandingByStage: { stage: string; responsible: string; count: number; parallel?: boolean }[];
  outstandingTotal: number;
  completedTotal: number;
  monthlyTravelHoursTrend: { month: string; total_hours: number }[];
  dailyTravelTrend: { day: string; total_km: number; total_hours: number }[];
  docSendTime: { name: string; avg_days: number; count: number }[];
  invoiceUploadTime: { name: string; avg_days: number; count: number }[];
  coaAnalysisTime: { commodity: string; avg_days: number; count: number }[];
  approvalTime: { inspector_name: string; avg_days: number; count: number }[];
  travelTimePerInspector: { inspector_name: string; total_hours: number }[];
  filterOptions: { inspectors: string[]; commodities: string[]; years: number[] };
  inspectorTargets: Record<string, { eggs: number; poultry: number; raw: number; pmp: number; raw_samples: number; pmp_samples: number; total_samples: number }>;
  nonInspectorNames: string[];
  salaries?: Record<string, { salary: number; employee_number: string }>;
  quarterlyTargets?: Record<string, { inspector_name: string; year: number; quarter: number; eggs: number; poultry: number; raw: number; pmp: number; raw_samples: number; pmp_samples: number }>;
  documentTypeCounts?: Record<string, number>;
}

interface QuarterlyTarget {
  inspector_name: string; year: number; quarter: number;
  eggs: number; poultry: number; raw: number; pmp: number;
  raw_samples: number; pmp_samples: number;
}

interface Filters {
  date_from: string;
  date_to: string;
  year: string[];
  month: string[];
  inspector: string[];
  commodity: string[];
}

interface UserInfo {
  authenticated: boolean;
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  role: "inspector" | "inspector_manager" | "admin" | "super_admin" | "lab_technician" | "developer" | "financial";
}

// ── Constants ──────────────────────────────────────────────────────────────────

const COMMODITY_COLORS: Record<string, string> = {
  EGG: "#f59e0b",
  PMP: "#007890",
  POULTRY: "#10b981",
  RAW: "#ef4444",
};

const CHART_PALETTE = [
  "#007890", "#10b981", "#f59e0b", "#ef4444", "#005a6b",
  "#22c55e", "#0891b2", "#7c3aed", "#f97316", "#059669",
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type PanelKey = "overview" | "inspectors" | "compliance" | "operations" | "timelines" | "financial";

const PANELS: { key: PanelKey; label: string; icon: string }[] = [
  { key: "overview", label: "Overview", icon: "fas fa-tachometer-alt" },
  { key: "inspectors", label: "Inspectors", icon: "fas fa-user-tie" },
  { key: "compliance", label: "Compliance", icon: "fas fa-shield-alt" },
  { key: "operations", label: "Operations", icon: "fas fa-route" },
  { key: "timelines", label: "Timelines", icon: "fas fa-file-alt" },
  { key: "financial", label: "Financial", icon: "fas fa-chart-bar" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtMonth(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-ZA", { month: "long" });
  } catch {
    return iso;
  }
}

function fmtDay(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}

function fmtRand(v: number): string {
  return "R" + v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function colorForCommodity(c: string): string {
  const key = c?.toUpperCase?.() ?? "";
  if (key.includes("EGG")) return COMMODITY_COLORS.EGG;
  if (key.includes("PMP")) return COMMODITY_COLORS.PMP;
  if (key.includes("POULTRY")) return COMMODITY_COLORS.POULTRY;
  if (key.includes("RAW")) return COMMODITY_COLORS.RAW;
  return "#6b7280";
}

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** Look up salary by inspector full name. Salaries are keyed by lowercase last name (e.g. "dlamini"). */
function lookupSalary(salaries: Record<string, { salary: number; employee_number: string }>, fullName: string): number {
  // Try exact full name lowercase first
  const exact = salaries[fullName.toLowerCase()];
  if (exact) return exact.salary ?? 0;
  // Try last name (last word)
  const parts = fullName.trim().split(/\s+/);
  if (parts.length > 1) {
    const lastName = parts[parts.length - 1].toLowerCase();
    const byLast = salaries[lastName];
    if (byLast) return byLast.salary ?? 0;
  }
  // Try first name
  if (parts.length > 0) {
    const firstName = parts[0].toLowerCase();
    const byFirst = salaries[firstName];
    if (byFirst) return byFirst.salary ?? 0;
  }
  return 0;
}

/** Exclude EGG and POULTRY from samples data — they don't take samples */
const EXCLUDED_SAMPLE_COMMODITIES = ["EGG", "EGGS", "POULTRY"];
function isSampleCommodity(commodity: string): boolean {
  return !EXCLUDED_SAMPLE_COMMODITIES.includes(commodity?.toUpperCase?.() ?? "");
}

// ── Shared Chart Defaults ──────────────────────────────────────────────────────

const lineDefaults = { tension: 0.35, fill: false, pointRadius: 5, pointHoverRadius: 8, borderWidth: 3, spanGaps: true };

function baseChartOptions(title?: string, yLabel?: string, opts?: { datalabels?: boolean; datalabelColor?: string; datalabelSuffix?: string; datalabelFormatter?: (v: number) => string }): Record<string, unknown> {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const showLabels = !isMobile && opts?.datalabels !== false; // hide on mobile
  const suffix = opts?.datalabelSuffix ?? "";
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top" as const, labels: { boxWidth: isMobile ? 8 : 12, font: { size: isMobile ? 9 : 11 }, padding: isMobile ? 6 : 10 } },
      title: title ? { display: true, text: title, font: { size: isMobile ? 11 : 13 } } : { display: false },
      datalabels: showLabels ? {
        anchor: "end" as const,
        align: "end" as const,
        offset: -2,
        font: { size: 9, weight: "bold" as const },
        color: opts?.datalabelColor ?? "#fff",
        formatter: opts?.datalabelFormatter ?? ((v: unknown) => { const n = Number(v); return !n || isNaN(n) ? "" : (Number.isInteger(n) ? String(n) + suffix : n.toFixed(1) + suffix); }),
        clamp: true,
        clip: false,
      } : { display: false },
    },
    layout: { padding: { right: 10 } },
    scales: {
      x: { ticks: { font: { size: isMobile ? 7 : 9 }, maxRotation: isMobile ? 70 : 60, minRotation: isMobile ? 45 : 30 } },
      y: { beginAtZero: true, ticks: { font: { size: isMobile ? 8 : 9 } }, title: yLabel ? { display: true, text: yLabel, font: { size: isMobile ? 9 : 10 } } : undefined },
    },
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="info-tooltip">
      <i className="fas fa-info-circle" style={{ color: "#9ca3af", fontSize: 13 }} />
      <span className="info-tooltip-text">{text}</span>
    </span>
  );
}

function Card({ title, icon, children, className = "", headerRight, subtitle, tooltip }: { title: string; icon?: string; children: React.ReactNode; className?: string; headerRight?: React.ReactNode; subtitle?: string; tooltip?: string }) {
  return (
    <div className={`analytics-card bg-white rounded-md border border-gray-200 ${className}`} style={{ boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)", marginBottom: 5, maxWidth: "100%" }}>
      <div className="border-b border-gray-200 flex items-center justify-between flex-wrap gap-2" style={{ padding: "12px 16px" }}>
        <div className="flex items-center gap-2">
          {icon && <i className={`${icon} text-[#007890]`} style={{ fontSize: "1rem" }} />}
          <h3 className="font-semibold text-gray-800" style={{ fontSize: "1rem", margin: 0 }}>{title}</h3>
          {tooltip && <InfoTooltip text={tooltip} />}
        </div>
        <div className="flex items-center gap-2">
          {subtitle && <span style={{ fontSize: "0.7rem", color: "#6b7280", fontStyle: "italic" }}>{subtitle}</span>}
          {headerRight}
        </div>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

function KpiCard({ label, value, color = "#007890", icon }: { label: string; value: string | number; color?: string; icon?: string }) {
  return (
    <div className="bg-white rounded-md border border-gray-200 text-center transition-all duration-200 hover:-translate-y-0.5" style={{ padding: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      {icon && <div style={{ fontSize: "1.1rem", color, marginBottom: 4 }}><i className={icon} /></div>}
      <div style={{ fontSize: "2rem", fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.25rem", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{label}</div>
    </div>
  );
}

function ChartWrap({ children, height = "300px" }: { children: React.ReactNode; height?: string }) {
  return <div className="analytics-chart-wrap" style={{ position: "relative", height, minHeight: 200, overflow: "visible" }}>{children}</div>;
}

// DLBar / DLLine / DLRadar are imported lazily from "@/components/charts" (see top of file).

// ── Main Page Component ────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [activePanel, setActivePanel] = useState<PanelKey>("overview");
  const [rawData, setRawData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const emptyFilters: Filters = { date_from: "", date_to: "", year: [], month: [], inspector: [], commodity: [] };
  const [pendingFilters, setPendingFilters] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [inspectorMetric, setInspectorMetric] = useState<"count" | "total_km" | "total_hours" | "samples">("count");
  const [salaries, setSalaries] = useState<Record<string, { salary: number; employee_number: string }>>({});
  const [quarterlyTargets, setQuarterlyTargets] = useState<Record<string, QuarterlyTarget>>({});
  const [targetYear, setTargetYear] = useState(new Date().getFullYear());
  const [targetQuarter, setTargetQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3));
  const [showTargetsModal, setShowTargetsModal] = useState(false);
  const [editingTarget, setEditingTarget] = useState<QuarterlyTarget>({ inspector_name: "", year: new Date().getFullYear(), quarter: Math.ceil((new Date().getMonth() + 1) / 3), eggs: 0, poultry: 0, raw: 0, pmp: 0, raw_samples: 0, pmp_samples: 0 });
  const [xeroStatus, setXeroStatus] = useState<{ connected: boolean; org_name?: string }>({ connected: false });
  const [xeroInvoices, setXeroInvoices] = useState<{ invoices: Array<Record<string, unknown>>; aging: Record<string, number>; total_count?: number }>({ invoices: [], aging: {} });
  const [xeroPage, setXeroPage] = useState(1);
  const [xeroSyncing, setXeroSyncing] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Close the Export dropdown when clicking anywhere outside it
  useEffect(() => {
    if (!exportMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-analytics-export]")) setExportMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [exportMenuOpen]);

  // ── User role & identity ────────────────────────────────────────────────────
  const [user, setUser] = useState<UserInfo | null>(null);
  useEffect(() => {
    fetch("/api/me", { credentials: "include" }).then(r => r.json()).then(d => {
      if (d.authenticated) setUser(d);
    }).catch(() => {});
  }, []);

  const userRole = user?.role ?? "developer";
  const isInspector = userRole === "inspector" || userRole === "inspector_manager";
  const isAdmin = userRole === "admin";
  // Inspector's display name for matching against data (e.g. "Lwandile Dlamini")
  const userFullName = user ? `${user.first_name} ${user.last_name}`.trim() : "";

  // Role-based: inspectors default to Financial tab, admins/inspectors see limited tabs
  useEffect(() => {
    if (isInspector) setActivePanel("financial");
  }, [isInspector]);

  // Panels visible based on role — inspectors only see Financial, admins see all but with own data
  const visiblePanels = useMemo(() => {
    if (isInspector) return PANELS.filter(p => p.key === "financial");
    return PANELS; // admins, super_admin, developer see all
  }, [isInspector]);

  const fetchData = useCallback(async (f?: Filters) => {
    setLoading(true);
    try {
      const active = f ?? filters;
      const p = new URLSearchParams();
      if (active.date_from) p.set("date_from", active.date_from);
      if (active.date_to) p.set("date_to", active.date_to);
      if (active.year.length > 0) p.set("year", active.year.join(","));
      if (active.month.length > 0) p.set("month", active.month.map(m => String(MONTHS.indexOf(m) + 1)).join(","));
      if (active.inspector.length > 0) p.set("inspector", active.inspector.join(","));
      if (active.commodity.length > 0) p.set("commodity", active.commodity.join(","));
      const qs = p.toString();
      const res = await fetch(`/api/analytics${qs ? "?" + qs : ""}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      if (json.salaries) setSalaries(json.salaries);
      if (json.quarterlyTargets) {
        const curQ = Math.ceil((new Date().getMonth() + 1) / 3);
        const curY = new Date().getFullYear();
        const reKeyed: Record<string, QuarterlyTarget> = {};
        for (const val of Object.values(json.quarterlyTargets) as QuarterlyTarget[]) {
          if (val.year === curY && val.quarter === curQ) {
            reKeyed[val.inspector_name] = val;
          }
        }
        setQuarterlyTargets(reKeyed);
      }
      setRawData(json);
    } catch (e) {
      console.error("Analytics fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Client-side filtered data derived from rawData + filters ───────────────
  const data = useMemo((): AnalyticsData | null => {
    if (!rawData) return null;

    // Role-based: admins see only their own inspector data (matched by name)
    const roleFilteredInspector = (isAdmin && userFullName) ? userFullName : "";

    const selInspectors = new Set(filters.inspector);
    // If admin role with a matched name, enforce that filter
    if (roleFilteredInspector) {
      // Find the matching inspector name from the data
      const match = (rawData.filterOptions?.inspectors ?? []).find(n =>
        n.toLowerCase() === roleFilteredInspector.toLowerCase() ||
        n.toLowerCase().includes(roleFilteredInspector.toLowerCase()) ||
        roleFilteredInspector.toLowerCase().includes(n.toLowerCase())
      );
      if (match) selInspectors.add(match);
    }
    const selCommodities = new Set(filters.commodity);
    const hasI = selInspectors.size > 0;
    const hasC = selCommodities.size > 0;

    const monthNums = filters.month.map(m => String(MONTHS.indexOf(m) + 1).padStart(2, "0"));

    const matchMonth = (m: string) => {
      if (!m) return true;
      const ym = m.substring(0, 7); // "2026-02-01" → "2026-02"
      if (filters.year.length > 0 && !filters.year.some(y => ym.startsWith(y))) return false;
      if (monthNums.length > 0 && !monthNums.some(mm => ym.endsWith(`-${mm}`))) return false;
      if (filters.date_from && ym < filters.date_from.substring(0, 7)) return false;
      if (filters.date_to && ym > filters.date_to.substring(0, 7)) return false;
      return true;
    };

    const matchDay = (d: string) => {
      if (!d) return true;
      const ds = d.substring(0, 10); // normalize "2026-02-01T00:00:00" → "2026-02-01"
      if (filters.date_from && ds < filters.date_from) return false;
      if (filters.date_to && ds > filters.date_to) return false;
      if (filters.year.length > 0 && !filters.year.some(y => ds.startsWith(y))) return false;
      if (monthNums.length > 0 && !monthNums.some(mm => ds.includes(`-${mm}-`))) return false;
      return true;
    };

    const fi = <T extends { inspector_name: string }>(arr: T[] = []) =>
      hasI ? arr.filter(r => selInspectors.has(r.inspector_name)) : arr;
    const fc = <T extends { commodity: string }>(arr: T[] = []) =>
      hasC ? arr.filter(r => selCommodities.has(r.commodity)) : arr;

    const filteredList = (rawData.inspectionsList ?? []).filter(s => {
      if (hasI && !selInspectors.has(s.inspector_name)) return false;
      if (hasC && !selCommodities.has(s.commodity)) return false;
      if (!matchDay(s.date_of_inspection)) return false;
      return true;
    });

    const filteredCompliance = fc(rawData.complianceByCommodity ?? []);
    const totalCompliant = filteredCompliance.reduce((s, r) => s + r.compliant, 0);
    // Rate basis is ASSESSED records (compliant + non-compliant), matching the API
    const totalForRate = filteredCompliance.reduce((s, r) => s + r.compliant + r.non_compliant, 0);
    const filteredTravel = fi(rawData.travelPerInspector ?? []);
    const filteredTime = fi(rawData.timeAllocation ?? []);
    const filteredOcc = fi(rawData.occurrenceReports ?? []);
    const filteredFin = fi(rawData.inspectorFinancials ?? []);

    const facilityTypeDist = (hasI || hasC)
      ? (() => {
          const counts: Record<string, number> = {};
          filteredList.forEach(s => { if (s.facility_type) counts[s.facility_type] = (counts[s.facility_type] || 0) + 1; });
          return Object.entries(counts).map(([facility_type, count]) => ({ facility_type, count }));
        })()
      : (rawData.facilityTypeDistribution ?? []);

    return {
      ...rawData,
      // Use API-computed values (which cover ALL records, not just the 200 in inspectionsList)
      // Only override if client-side inspector/commodity filters are applied
      totalInspections: (hasI || hasC) ? filteredList.length : rawData.totalInspections,
      complianceRate: (hasI || hasC) ? (totalForRate > 0 ? (totalCompliant / totalForRate) * 100 : 0) : rawData.complianceRate,
      activeInspectors: (hasI || hasC) ? new Set(filteredList.map(s => s.inspector_name)).size : rawData.activeInspectors,
      // Number() guards against Decimal sums arriving as strings (NaN protection)
      totalHours: filteredTime.reduce((s, r) => s + (Number(r.total_hours) || 0), 0),
      avgHours: filteredTime.length > 0 ? filteredTime.reduce((s, r) => s + (Number(r.total_hours) || 0), 0) / filteredTime.length : 0,
      totalOccurrenceReports: (hasI || hasC) ? filteredOcc.reduce((s, r) => s + r.count, 0) : rawData.totalOccurrenceReports,
      complianceByCommodity: filteredCompliance,
      commodityAnalysis: fc(rawData.commodityAnalysis ?? []),
      samplesByCommodity: fc(rawData.samplesByCommodity ?? []),
      facilityTypeDistribution: facilityTypeDist,
      timeAllocation: filteredTime,
      inspectionsList: filteredList,
      inspectorPerformance: fi(rawData.inspectorPerformance ?? []),
      occurrenceReports: filteredOcc,
      directionsPerInspector: fi(rawData.directionsPerInspector ?? []),
      facilitiesPerInspector: fi(rawData.facilitiesPerInspector ?? []),
      travelPerInspector: filteredTravel,
      inspectorCommodityMatrix: (rawData.inspectorCommodityMatrix ?? []).filter(r =>
        (!hasI || selInspectors.has(r.inspector_name)) && (!hasC || selCommodities.has(r.commodity))),
      inspectorSampleMatrix: (rawData.inspectorSampleMatrix ?? []).filter(r =>
        (!hasI || selInspectors.has(r.inspector_name)) && (!hasC || selCommodities.has(r.commodity))),
      approvalPerInspector: fi(rawData.approvalPerInspector ?? []),
      inspectorFinancials: filteredFin,
      financialSummary: { ...rawData.financialSummary, total_revenue: filteredFin.reduce((s, r) => s + (r.total_revenue || 0), 0) },
      docSendTime: (rawData.docSendTime ?? []).filter(r => !hasI || selInspectors.has((r as unknown as { name: string }).name)),
      invoiceUploadTime: (rawData.invoiceUploadTime ?? []).filter(r => !hasI || selInspectors.has((r as unknown as { name: string }).name)),
      coaAnalysisTime: fc(rawData.coaAnalysisTime ?? []),
      approvalTime: fi(rawData.approvalTime ?? []),
      travelTimePerInspector: fi(rawData.travelTimePerInspector ?? []),
      monthlyInspectorTrend: fi(rawData.monthlyInspectorTrend ?? []).filter(r => matchDay(r.day)),
      monthlyCommodityTrends: fc(rawData.monthlyCommodityTrends ?? []).filter(r => matchMonth(r.month)),
      monthlyComplianceTrend: fc(rawData.monthlyComplianceTrend ?? []).filter(r => matchMonth(r.month)),
      weeklyComplianceTrend: rawData.weeklyComplianceTrend ?? [],
      dailyComplianceTrend: (() => {
        const raw = rawData.dailyComplianceTrend ?? [];
        const afterCommodity = fc(raw);
        const afterDay = afterCommodity.filter(r => matchDay(r.day));
        console.log("[DailyCompliance] raw from API:", raw.length, "items, first 3:", raw.slice(0, 3));
        console.log("[DailyCompliance] after commodity filter:", afterCommodity.length);
        console.log("[DailyCompliance] after matchDay filter:", afterDay.length, "| date_from:", filters.date_from, "| date_to:", filters.date_to);
        if (raw.length > 0 && afterDay.length === 0) {
          console.log("[DailyCompliance] matchDay is filtering everything out! Sample day values:", raw.slice(0, 5).map(r => r.day));
        }
        return afterDay;
      })(),
      monthlyOccurrenceTrend: (rawData.monthlyOccurrenceTrend ?? []).filter(r => matchMonth(r.month)),
      monthlyTravelTrend: (rawData.monthlyTravelTrend ?? []).filter(r => matchMonth(r.month)),
      monthlyDocSendTrend: (rawData.monthlyDocSendTrend ?? []).filter(r => matchMonth(r.month)),
      weeklyDocSendTrend: rawData.weeklyDocSendTrend ?? [],
      monthlyInvoiceTrend: (rawData.monthlyInvoiceTrend ?? []).filter(r => matchMonth(r.month)),
      weeklyInvoiceTrend: rawData.weeklyInvoiceTrend ?? [],
      monthlyInspectionsTrend: (rawData.monthlyInspectionsTrend ?? []).filter(r => matchMonth(r.month)),
      monthlyCoaTrend: (rawData.monthlyCoaTrend ?? []).filter(r => matchMonth(r.month)),
      weeklyCoaTrend: rawData.weeklyCoaTrend ?? [],
      monthlyApprovalTrend: (rawData.monthlyApprovalTrend ?? []).filter(r => matchMonth(r.month)),
      weeklyApprovalTrend: rawData.weeklyApprovalTrend ?? [],
      monthlyTravelHoursTrend: (rawData.monthlyTravelHoursTrend ?? []).filter(r => matchMonth(r.month)),
      outstandingByStage: rawData.outstandingByStage ?? [],
      outstandingTotal: rawData.outstandingTotal ?? 0,
      completedTotal: rawData.completedTotal ?? 0,
    };
  }, [rawData, filters, isAdmin, userFullName]);

  // Also fetch salaries separately (for when saving updates)
  const refreshSalaries = () => {
    fetch("/api/inspector-salaries").then(r => r.json()).then(d => {
      if (d.salaries) setSalaries(d.salaries);
    }).catch(() => {});
  };

  // Fetch quarterly targets for selected year/quarter
  const refreshQuarterlyTargets = (y?: number, q?: number) => {
    const yr = y ?? targetYear;
    const qr = q ?? targetQuarter;
    fetch(`/api/quarterly-targets?year=${yr}&quarter=${qr}`).then(r => r.json()).then(d => {
      if (d.targets) setQuarterlyTargets(d.targets);
    }).catch(() => {});
  };

  useEffect(() => { refreshQuarterlyTargets(); }, [targetYear, targetQuarter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch Xero status & invoices
  useEffect(() => {
    fetch("/api/xero/status").then(r => r.json()).then(d => setXeroStatus(d)).catch(() => {});
    fetch("/api/xero/invoices").then(r => r.json()).then(d => {
      if (d.invoices) setXeroInvoices(d);
    }).catch(() => {});
  }, []);

  const handleXeroSync = async () => {
    setXeroSyncing(true);
    try {
      await fetch("/api/xero/sync", { method: "POST" });
      const r = await fetch("/api/xero/invoices");
      const d = await r.json();
      if (d.invoices) setXeroInvoices(d);
    } catch {}
    setXeroSyncing(false);
  };

  const handleXeroConnect = async () => {
    try {
      const r = await fetch("/api/xero/connect");
      const d = await r.json();
      if (d.redirect) window.location.href = d.redirect;
    } catch {}
  };

  const handleXeroDisconnect = async () => {
    try {
      await fetch("/api/xero/disconnect", { method: "POST" });
      setXeroStatus({ connected: false });
      setXeroInvoices({ invoices: [], aging: {} });
    } catch {}
  };

  // Expense log (localStorage, matching Django)
  const [expenseLog, setExpenseLog] = useState<Array<{ id: string; inspector: string; amount: number; description: string; date: string }>>([]);
  useEffect(() => {
    try { const raw = localStorage.getItem("EXPENSE_LOG"); if (raw) setExpenseLog(JSON.parse(raw)); } catch {}
  }, []);
  const saveExpenses = (log: typeof expenseLog) => { setExpenseLog(log); localStorage.setItem("EXPENSE_LOG", JSON.stringify(log)); };

  // Salary modal
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [editingSalaries, setEditingSalaries] = useState<Record<string, number>>({});
  const openSalaryModal = () => {
    const init: Record<string, number> = {};
    (data?.inspectorFinancials ?? []).forEach(r => {
      const key = r.inspector_name.toLowerCase();
      init[r.inspector_name] = salaries[key]?.salary ?? 0;
    });
    setEditingSalaries(init);
    setShowSalaryModal(true);
  };
  const saveSalaries = async () => {
    try {
      const r = await fetch("/api/inspector-salaries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ salaries: editingSalaries }) });
      const d = await r.json();
      if (d.salaries) setSalaries(d.salaries);
      else refreshSalaries();
    } catch {}
    setShowSalaryModal(false);
  };

  // Save quarterly target
  const saveQuarterlyTarget = async () => {
    if (!editingTarget.inspector_name) return;
    try {
      await fetch("/api/quarterly-targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingTarget) });
      refreshQuarterlyTargets(editingTarget.year, editingTarget.quarter);
    } catch {}
    setShowTargetsModal(false);
  };

  const applyTargetToAll = async () => {
    if (!rawData?.filterOptions?.inspectors) return;
    for (const inspector of rawData.filterOptions.inspectors) {
      try {
        await fetch("/api/quarterly-targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...editingTarget, inspector_name: inspector }) });
      } catch {}
    }
    refreshQuarterlyTargets(editingTarget.year, editingTarget.quarter);
    setShowTargetsModal(false);
  };

  // Expense modal
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [newExpense, setNewExpense] = useState({ inspector: "", amount: "", description: "", date: "" });

  const handleApply = () => { setFilters(pendingFilters); fetchData(pendingFilters); };
  const handleReset = () => {
    setPendingFilters(emptyFilters);
    setFilters(emptyFilters);
    fetchData(emptyFilters);
  };

  // ── Export: Excel ───────────────────────────────────────────────────────────
  const handleExtractExcel = () => {
    if (!data) return;
    import("xlsx").then(XLSX => {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Inspections List
      if (data.inspectionsList?.length) {
        const ws1 = XLSX.utils.json_to_sheet(data.inspectionsList);
        XLSX.utils.book_append_sheet(wb, ws1, "Inspections");
      }

      // Sheet 2: Financial Summary
      const kmRate = data.financialSummary?.km_rate ?? 4.5;
      const finRows = (data.inspectorFinancials ?? []).map(r => {
        // Match the on-page table: salary scaled to months worked in range
        const sal = lookupSalary(salaries, r.inspector_name) * (r.months_active || 1);
        const exp = expenseLog.filter(e => e.inspector === r.inspector_name).reduce((s, e) => s + e.amount, 0);
        const mgmt = (sal + exp) * 0.20;
        const cost = sal + exp + mgmt;
        return {
          Inspector: r.inspector_name,
          Inspections: r.total_inspections,
          "Billable Hrs": r.total_hours,
          KM: r.total_km,
          "On-Site Hrs": r.inspection_time,
          "Rev (Hours)": Math.round(r.revenue_hours),
          "Rev (KM)": Math.round(r.revenue_km),
          "Rev (Samples)": Math.round(r.revenue_samples),
          "Total Revenue": Math.round(r.total_revenue),
          "Salary (CTC)": Math.round(sal),
          Expenses: Math.round(exp),
          "Management Fees": Math.round(mgmt),
          "Total Cost": Math.round(cost),
          "Rev/Hr": r.total_hours > 0 ? Math.round(r.total_revenue / r.total_hours) : 0,
          "Cost/Hr": r.total_hours > 0 ? Math.round(cost / r.total_hours) : 0,
          Profit: Math.round(r.total_revenue - cost),
        };
      });
      if (finRows.length) {
        const ws2 = XLSX.utils.json_to_sheet(finRows);
        XLSX.utils.book_append_sheet(wb, ws2, "Financial");
      }

      // Sheet 3: Compliance
      if (data.complianceByCommodity?.length) {
        const ws3 = XLSX.utils.json_to_sheet(data.complianceByCommodity);
        XLSX.utils.book_append_sheet(wb, ws3, "Compliance");
      }

      // Sheet 4: Travel
      if (data.travelPerInspector?.length) {
        const ws4 = XLSX.utils.json_to_sheet(data.travelPerInspector);
        XLSX.utils.book_append_sheet(wb, ws4, "Travel");
      }

      // Sheet 5: Inspector Performance
      if (data.inspectorPerformance?.length) {
        const ws5 = XLSX.utils.json_to_sheet(data.inspectorPerformance);
        XLSX.utils.book_append_sheet(wb, ws5, "Inspector Performance");
      }

      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Analytics_Report_${dateStr}.xlsx`);
    });
  };

  // ── Export: PDF (jsPDF — direct generation, no backend needed) ──────────
  const [pdfLoading, setPdfLoading] = useState(false);
  const handleExportPdf = async () => {
    if (!data) return;
    setPdfLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsPDFModule: any = await import("jspdf");
      const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
      // autoTable attaches itself to jsPDF prototype as a side-effect
      const autoTableModule: any = await import("jspdf-autotable");
      const autoTable = autoTableModule.default || autoTableModule.autoTable || autoTableModule;

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const W = 297, H = 210; // A4 landscape dimensions in mm
      const ML = 15, MR = 15, MT = 20, MB = 18; // margins
      const CW = W - ML - MR; // content width

      // ── Brand colors ──
      const TEAL: [number, number, number] = [0, 120, 144];
      const DARK: [number, number, number] = [15, 23, 42];
      const WHITE: [number, number, number] = [255, 255, 255];
      const GRAY: [number, number, number] = [107, 114, 128];
      const GRAY_LIGHT: [number, number, number] = [156, 163, 175];
      const GREEN: [number, number, number] = [5, 150, 105];
      const RED: [number, number, number] = [220, 38, 38];
      const AMBER: [number, number, number] = [245, 158, 11];
      const BLUE: [number, number, number] = [59, 130, 246];
      const ROW_ALT: [number, number, number] = [248, 250, 252];
      const ROW_WHITE: [number, number, number] = [255, 255, 255];

      const hex = (r: number, g: number, b: number) => `#${[r, g, b].map(v => v.toString(16).padStart(2, "0")).join("")}`;

      // ── Filter description ──
      const filterDesc = [
        filters.year.length > 0 && `Year: ${filters.year.join(", ")}`,
        filters.month.length > 0 && `Month: ${filters.month.join(", ")}`,
        filters.inspector.length > 0 && `Inspector: ${filters.inspector.join(", ")}`,
        filters.commodity.length > 0 && `Commodity: ${filters.commodity.join(", ")}`,
        filters.date_from && `From: ${filters.date_from}`,
        filters.date_to && `To: ${filters.date_to}`,
      ].filter(Boolean).join("  |  ") || "All Data — No Filters Applied";

      // ── Fetch logo as data URL ──
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
      } catch { /* skip logo */ }

      // ── Capture charts at high DPI with data labels enabled for PDF ──
      // chart.js is lazy-loaded; by export time it's already in memory, so this
      // dynamic import resolves instantly and gives us the Chart registry.
      const { Chart: ChartJS } = await import("chart.js");
      const allChartImages: string[] = [];
      const allChartCanvases = Array.from(document.querySelectorAll("canvas"));
      const HI_DPR = 8;
      for (const cvs of allChartCanvases) {
        try {
          const chartInstance = ChartJS.getChart(cvs);
          if (chartInstance) {
            // Save originals
            const origDPR = chartInstance.options.devicePixelRatio;
            const origDL = JSON.parse(JSON.stringify(chartInstance.options.plugins?.datalabels ?? {}));
            const origPointRadius = chartInstance.config.data.datasets.map((ds: any) => ds.pointRadius);

            // Enable data labels + bigger points for PDF readability
            chartInstance.options.devicePixelRatio = HI_DPR;
            (chartInstance.options.plugins as Record<string, unknown>).datalabels = {
              display: true,
              anchor: "end" as const,
              align: "top" as const,
              offset: 2,
              font: { size: 8, weight: "bold" as const },
              color: "#1f2937",
              formatter: (v: unknown) => { if (v === null || v === undefined) return ""; const n = Number(v); return isNaN(n) ? "" : n.toFixed(1) + "%"; },
            };
            chartInstance.config.data.datasets.forEach((ds: any) => {
              if (ds.pointRadius !== undefined) ds.pointRadius = 6;
            });

            chartInstance.update("none");
            const dataUrl = cvs.toDataURL("image/png", 1.0);
            if (dataUrl && dataUrl.length > 100) allChartImages.push(dataUrl);

            // Restore originals
            chartInstance.options.devicePixelRatio = origDPR;
            (chartInstance.options.plugins as Record<string, unknown>).datalabels = origDL;
            chartInstance.config.data.datasets.forEach((ds: any, idx: number) => {
              if (origPointRadius[idx] !== undefined) ds.pointRadius = origPointRadius[idx];
            });
            chartInstance.update("none");
          } else {
            const dataUrl = cvs.toDataURL("image/png", 1.0);
            if (dataUrl && dataUrl.length > 100) allChartImages.push(dataUrl);
          }
        } catch { /* skip cross-origin canvases */ }
      }
      // Keep only Compliance Trend (first) and Inspections (second)
      const chartImages = allChartImages.slice(0, 2);
      const chartCanvases = allChartCanvases.slice(0, 2);

      // ── Commodity color lookup ──
      const commodityColor = (c: string): [number, number, number] => {
        const k = (c ?? "").toUpperCase();
        if (k.includes("EGG")) return AMBER;
        if (k.includes("PMP")) return BLUE;
        if (k.includes("POULTRY")) return [16, 185, 129];
        if (k.includes("RAW")) return [239, 68, 68];
        return TEAL;
      };

      // ══════════════════════════════════════════════════════════════════
      // PAGE 1: COVER PAGE
      // ══════════════════════════════════════════════════════════════════
      doc.setFillColor(...DARK);
      doc.rect(0, 0, W, H, "F");

      // Subtle decorative accent lines
      doc.setDrawColor(...TEAL);
      doc.setLineWidth(0.8);
      doc.line(ML, 50, W - MR, 50);
      doc.line(ML, H - 50, W - MR, H - 50);

      // Logo
      if (logoDataUrl) {
        try { doc.addImage(logoDataUrl, "PNG", W / 2 - 18, 58, 36, 32); } catch { /* skip */ }
      }

      // Company name
      const logoBottom = logoDataUrl ? 98 : 75;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(28);
      doc.setTextColor(...WHITE);
      doc.text("FOOD SAFETY AGENCY (PTY) LTD", W / 2, logoBottom, { align: "center" });

      // Subtitle
      doc.setFont("helvetica", "normal");
      doc.setFontSize(18);
      doc.setTextColor(...TEAL);
      doc.text("Analytics Report", W / 2, logoBottom + 12, { align: "center" });

      // Decorative teal bar
      doc.setFillColor(...TEAL);
      doc.rect(W / 2 - 30, logoBottom + 18, 60, 1.2, "F");

      // Date
      doc.setFontSize(12);
      doc.setTextColor(...GRAY_LIGHT);
      const reportDate = new Date().toLocaleDateString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      doc.text(reportDate, W / 2, logoBottom + 30, { align: "center" });

      // Filters
      doc.setFontSize(9);
      doc.setTextColor(...GRAY);
      doc.text(filterDesc, W / 2, logoBottom + 38, { align: "center", maxWidth: CW - 40 });

      // Confidential badge at bottom
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      doc.text("CONFIDENTIAL — For authorized personnel only", W / 2, H - 30, { align: "center" });

      // ══════════════════════════════════════════════════════════════════
      // PAGE 2: KPI SUMMARY (dedicated page)
      // ══════════════════════════════════════════════════════════════════
      doc.addPage();

      // KPI card helper — large cards for dedicated page
      const drawKpiCard = (x: number, cy: number, w: number, h: number, label: string, value: string, color: [number, number, number]) => {
        // Card background
        doc.setFillColor(246, 248, 250);
        doc.roundedRect(x, cy, w, h, 2, 2, "F");
        // Color accent bar at top
        doc.setFillColor(...color);
        doc.rect(x, cy, w, 2.5, "F");
        // Value — large and centered
        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(...color);
        doc.text(value, x + w / 2, cy + h / 2 + 1, { align: "center" });
        // Label below value
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...GRAY);
        doc.text(label.toUpperCase(), x + w / 2, cy + h / 2 + 11, { align: "center" });
      };

      // Title at the top
      let y = MT + 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(...DARK);
      doc.text("Key Performance Indicators", ML, y);
      doc.setDrawColor(...TEAL);
      doc.setLineWidth(0.7);
      doc.line(ML, y + 2.5, ML + 78, y + 2.5);
      y += 12;

      // Calculate card dimensions to fill the page
      const cardGap = 5;
      const availableH = H - MB - y - 4; // space below title to bottom margin
      const cardH = (availableH - cardGap) / 2; // two rows with gap between
      const cardW = (CW - 4 * cardGap) / 5;

      // Row 1: 5 KPI cards
      const kpiRow1 = [
        { label: "Total Inspections", value: String(data!.totalInspections ?? 0), color: TEAL },
        { label: "Compliance Rate", value: `${Number(data!.complianceRate ?? 0).toFixed(1)}%`, color: GREEN },
        { label: "Active Inspectors", value: String(data!.activeInspectors ?? 0), color: AMBER },
        { label: "Total Hours", value: Number(data!.totalHours ?? 0).toFixed(1), color: BLUE },
        { label: "Total Revenue", value: `R${Number(data!.financialSummary?.total_revenue ?? 0).toLocaleString("en-ZA")}`, color: GREEN },
      ];
      kpiRow1.forEach((kpi, i) => {
        drawKpiCard(ML + i * (cardW + cardGap), y, cardW, cardH, kpi.label, kpi.value, kpi.color);
      });
      y += cardH + cardGap;

      // Row 2: 4 KPI cards, centered
      const totalKmVal = (data!.travelPerInspector ?? []).reduce((s, t) => s + (t.total_km || 0), 0);
      const totalSamplesVal = (data!.samplesByCommodity ?? []).reduce((s, d) => s + (d.count || 0), 0);
      const kpiRow2 = [
        { label: "Occurrence Reports", value: String(data!.totalOccurrenceReports ?? 0), color: RED },
        { label: "Total KM Traveled", value: totalKmVal.toLocaleString("en-ZA"), color: BLUE },
        { label: "Days Worked", value: String((data! as unknown as Record<string, unknown>).daysWorked ?? 0), color: TEAL },
        { label: "Total Samples", value: String(totalSamplesVal), color: GREEN },
      ];
      const row2TotalW = 4 * cardW + 3 * cardGap;
      const row2OffsetX = ML + (CW - row2TotalW) / 2;
      kpiRow2.forEach((kpi, i) => {
        drawKpiCard(row2OffsetX + i * (cardW + cardGap), y, cardW, cardH, kpi.label, kpi.value, kpi.color);
      });

      // ══════════════════════════════════════════════════════════════════
      // PAGE 3: COMPLIANCE BY COMMODITY (full page)
      // ══════════════════════════════════════════════════════════════════
      if (data!.complianceByCommodity?.length) {
        doc.addPage();
        y = MT + 4;

        // Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(...DARK);
        doc.text("Compliance by Commodity", ML, y);
        doc.setDrawColor(...TEAL);
        doc.setLineWidth(0.7);
        doc.line(ML, y + 2.5, ML + 78, y + 2.5);
        y += 14;

        // Calculate bar sizing to fill the page evenly
        const numItems = data!.complianceByCommodity.length;
        const availBarSpace = H - MB - y - 4;
        const barSpacing = Math.min(availBarSpace / numItems, 24);
        const barH = barSpacing * 0.6;
        const barMaxW = CW - 100;
        const labelW = 45;

        for (const item of data!.complianceByCommodity) {
          const color = commodityColor(item.commodity);
          const filledW = (item.compliance_rate / 100) * barMaxW;

          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(...DARK);
          doc.text(item.commodity, ML, y + barH / 2 + 1.5);

          const barX = ML + labelW;
          doc.setFillColor(229, 231, 235);
          doc.roundedRect(barX, y, barMaxW, barH, 2, 2, "F");

          if (filledW > 0) {
            doc.setFillColor(...color);
            doc.roundedRect(barX, y, Math.max(filledW, 4), barH, 2, 2, "F");
          }

          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(...color);
          doc.text(`${item.compliance_rate.toFixed(1)}%`, barX + barMaxW + 4, y + barH / 2 + 1.5);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(...GRAY_LIGHT);
          doc.text(`(${item.compliant}/${item.compliant + item.non_compliant} assessed)`, barX + barMaxW + 22, y + barH / 2 + 1.5);

          y += barSpacing;
        }
      }

      // ══════════════════════════════════════════════════════════════════
      // PAGE 4: CHARTS & TRENDS (own page, fill it)
      // ══════════════════════════════════════════════════════════════════
      if (chartImages.length > 0) {
        doc.addPage();
        y = MT + 4;

        const calcSize = (idx: number, maxW: number, maxH: number) => {
          const cvs = chartCanvases[idx];
          const ar = cvs ? cvs.width / cvs.height : 2;
          let w = maxW, h = w / ar;
          if (h > maxH) { h = maxH; w = h * ar; }
          if (w > maxW) { w = maxW; h = w / ar; }
          return { w, h };
        };

        // Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(...DARK);
        doc.text("Charts & Trends", ML, y);
        doc.setDrawColor(...TEAL);
        doc.setLineWidth(0.7);
        doc.line(ML, y + 2.5, ML + 55, y + 2.5);
        y += 12;

        // Each chart gets full width; if it doesn't fit, start a new page
        const chartCount = Math.min(chartImages.length, 8);
        const pageAvailH = H - MT - MB - 4;

        for (let i = 0; i < chartCount; i++) {
          try {
            const ar = chartCanvases[i] ? chartCanvases[i].width / chartCanvases[i].height : 2;
            let cH = CW / ar;
            if (cH > pageAvailH) cH = pageAvailH;

            // If chart won't fit in remaining space, start new page
            if (y + cH + 4 > H - MB) { doc.addPage(); y = MT + 4; }

            doc.addImage(chartImages[i], "PNG", ML, y, CW, cH);
            y += cH + 8;
          } catch { /* skip */ }
        }
      }

      // ══════════════════════════════════════════════════════════════════
      // TABLE HELPERS
      // ══════════════════════════════════════════════════════════════════
      const tableMargin = { left: ML, right: MR, top: MT, bottom: MB };
      const baseStyles = { font: "helvetica", fontSize: 7.5 as number, cellPadding: 1.8, lineColor: [229, 231, 235] as [number, number, number], lineWidth: 0.15 };
      const baseHead = { fillColor: DARK, textColor: WHITE, fontStyle: "bold" as const, cellPadding: 2 };

      // Track flowing Y position across charts and tables
      let flowY = y; // carry forward from chart/KPI section

      // Returns Y for next section, adding page break only if needed
      const getNextY = () => {
        const fy = (doc as any).lastAutoTable?.finalY;
        const currentY = fy != null ? fy + 6 : flowY;
        if (currentY > H - MB - 25) { doc.addPage(); return MT + 4; }
        return currentY;
      };

      const drawTitle = (title: string, startY: number) => {
        // If title won't fit, start a new page
        if (startY + 10 > H - MB) { doc.addPage(); startY = MT + 4; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...DARK);
        doc.text(title, ML, startY);
        doc.setDrawColor(...TEAL);
        doc.setLineWidth(0.5);
        doc.line(ML, startY + 1.5, ML + 60, startY + 1.5);
        return startY + 4;
      };

      // ══════════════════════════════════════════════════════════════════
      // TABLE PAGES: FINANCIAL
      // ══════════════════════════════════════════════════════════════════
      const finData = (data!.inspectorFinancials ?? []).map(r => {
        // Match the on-page table: salary scaled to months worked in range
        const sal = lookupSalary(salaries, r.inspector_name ?? "") * (r.months_active || 1);
        const exp = expenseLog.filter(e => e.inspector === r.inspector_name).reduce((s, e) => s + (e.amount || 0), 0);
        const revT = r.total_revenue || 0;
        const mgmt = (sal + exp) * 0.20;
        const cost = sal + exp + mgmt;
        const profit = Math.round(revT - cost);
        return [
          r.inspector_name ?? "", String(r.total_inspections ?? 0),
          (r.total_hours || 0) > 0 ? (r.total_hours).toFixed(1) : "-",
          (r.total_km || 0) > 0 ? (r.total_km).toLocaleString() : "-",
          `R${Math.round(r.revenue_hours || 0).toLocaleString()}`,
          `R${Math.round(r.revenue_km || 0).toLocaleString()}`,
          `R${Math.round(r.revenue_samples || 0).toLocaleString()}`,
          `R${Math.round(revT).toLocaleString()}`,
          sal > 0 ? `R${Math.round(sal).toLocaleString()}` : "-",
          exp > 0 ? `R${Math.round(exp).toLocaleString()}` : "-",
          `R${Math.round(cost).toLocaleString()}`,
          profit >= 0 ? `R${profit.toLocaleString()}` : `-R${Math.abs(profit).toLocaleString()}`,
        ];
      });

      if (finData.length) {
        const fty = drawTitle("Revenue Per Inspector", getNextY());
        autoTable(doc, {
          startY: fty,
          head: [["Inspector", "Insp", "Hrs", "KM", "Rev(Hrs)", "Rev(KM)", "Rev(Sam)", "Revenue", "Salary", "Exp", "Cost", "Profit"]],
          body: finData,
          margin: tableMargin,
          styles: { ...baseStyles, fontSize: 7 },
          headStyles: { ...baseHead, fontSize: 7 },
          alternateRowStyles: { fillColor: ROW_ALT },
          bodyStyles: { fillColor: ROW_WHITE },
          columnStyles: { 0: { fontStyle: "bold" as const, cellWidth: 30 }, 11: { fontStyle: "bold" as const } },
          showHead: "everyPage",
          didParseCell: (hookData: { section: string; column: { index: number }; cell: { text: string[]; styles: { textColor: [number, number, number] } } }) => {
            if (hookData.section === "body" && hookData.column.index === 11) {
              const text = hookData.cell.text[0] ?? "";
              hookData.cell.styles.textColor = text.startsWith("-") ? RED : GREEN;
            }
          },
        });
      }

      // ══════════════════════════════════════════════════════════════════
      // TABLE: INSPECTOR PERFORMANCE
      // ══════════════════════════════════════════════════════════════════
      if (data!.inspectorPerformance?.length) {
        const pty = drawTitle("Inspector Performance", getNextY());
        autoTable(doc, {
          startY: pty,
          head: [["Inspector", "Total Inspections", "Compliant", "Non-Compliant", "Compliance %"]],
          body: (data!.inspectorPerformance || []).map(p => [
            p.inspector_name, String(p.total_inspections), String(p.compliant), String(p.non_compliant),
            (p.compliant + p.non_compliant) > 0 ? `${((p.compliant / (p.compliant + p.non_compliant)) * 100).toFixed(1)}%` : "0%",
          ]),
          margin: tableMargin,
          styles: baseStyles,
          headStyles: baseHead,
          alternateRowStyles: { fillColor: ROW_ALT },
          bodyStyles: { fillColor: ROW_WHITE },
          columnStyles: { 0: { fontStyle: "bold" as const, cellWidth: 55 }, 4: { fontStyle: "bold" as const } },
          showHead: "everyPage",
          didParseCell: (hookData: { section: string; column: { index: number }; cell: { styles: { textColor: [number, number, number] } } }) => {
            if (hookData.section === "body" && hookData.column.index === 4) {
              hookData.cell.styles.textColor = GREEN;
            }
          },
        });
      }

      // ══════════════════════════════════════════════════════════════════
      // TABLE: TRAVEL PER INSPECTOR
      // ══════════════════════════════════════════════════════════════════
      if (data!.travelPerInspector?.length) {
        const tty = drawTitle("Travel Per Inspector", getNextY());
        autoTable(doc, {
          startY: tty,
          head: [["Inspector", "Total KM", "Total Hours", "Inspections", "Avg KM/Inspection"]],
          body: (data!.travelPerInspector || []).map(t => [
            t.inspector_name ?? "", (t.total_km ?? 0).toLocaleString(),
            (t.total_hours ?? 0).toFixed(1), String(t.inspection_count ?? 0), (t.avg_km ?? 0).toFixed(1),
          ]),
          margin: tableMargin,
          styles: baseStyles,
          headStyles: baseHead,
          alternateRowStyles: { fillColor: ROW_ALT },
          bodyStyles: { fillColor: ROW_WHITE },
          columnStyles: { 0: { fontStyle: "bold" as const, cellWidth: 55 } },
          showHead: "everyPage",
        });
      }

      // ══════════════════════════════════════════════════════════════════
      // TABLE: APPROVAL STATUS
      // ══════════════════════════════════════════════════════════════════
      if (data!.approvalPerInspector?.length) {
        const aty = drawTitle("Approval Status Per Inspector", getNextY());
        autoTable(doc, {
          startY: aty,
          head: [["Inspector", "Total", "Approved", "Pending", "Approval Rate"]],
          body: (data!.approvalPerInspector || []).map(a => [
            a.inspector_name, String(a.total), String(a.approved), String(a.pending),
            a.total > 0 ? `${((a.approved / a.total) * 100).toFixed(1)}%` : "0%",
          ]),
          margin: tableMargin,
          styles: baseStyles,
          headStyles: baseHead,
          alternateRowStyles: { fillColor: ROW_ALT },
          bodyStyles: { fillColor: ROW_WHITE },
          columnStyles: { 0: { fontStyle: "bold" as const, cellWidth: 55 }, 4: { fontStyle: "bold" as const } },
          showHead: "everyPage",
          didParseCell: (hookData: { section: string; column: { index: number }; cell: { styles: { textColor: [number, number, number] } } }) => {
            if (hookData.section === "body" && hookData.column.index === 4) {
              hookData.cell.styles.textColor = GREEN;
            }
          },
        });
      }

      // ══════════════════════════════════════════════════════════════════
      // TABLE: COMPLIANCE BREAKDOWN
      // ══════════════════════════════════════════════════════════════════
      if (data!.complianceByCommodity?.length) {
        const cty = drawTitle("Compliance Breakdown", getNextY());
        autoTable(doc, {
          startY: cty,
          head: [["Commodity", "Total Inspections", "Compliant", "Non-Compliant", "Compliance Rate"]],
          body: (data!.complianceByCommodity || []).map(c => [
            c.commodity ?? "", String(c.total ?? 0), String(c.compliant ?? 0),
            String(c.non_compliant ?? 0), `${(c.compliance_rate ?? 0).toFixed(1)}%`,
          ]),
          margin: tableMargin,
          styles: baseStyles,
          headStyles: baseHead,
          alternateRowStyles: { fillColor: ROW_ALT },
          bodyStyles: { fillColor: ROW_WHITE },
          columnStyles: { 0: { fontStyle: "bold" as const, cellWidth: 55 }, 4: { fontStyle: "bold" as const } },
          showHead: "everyPage",
          didParseCell: (hookData: { section: string; column: { index: number }; cell: { styles: { textColor: [number, number, number] } } }) => {
            if (hookData.section === "body" && hookData.column.index === 4) {
              hookData.cell.styles.textColor = GREEN;
            }
          },
        });
      }

      // ══════════════════════════════════════════════════════════════════
      // HEADERS, FOOTERS, AND PAGE NUMBERS (post-processing)
      // ══════════════════════════════════════════════════════════════════
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);

        if (p === 1) continue; // skip cover page

        // ── Header ──
        // Logo (small)
        if (logoDataUrl) {
          try { doc.addImage(logoDataUrl, "PNG", ML, 4, 10, 9); } catch { /* skip */ }
        }
        // Company name
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...TEAL);
        doc.text("Food Safety Agency", ML + (logoDataUrl ? 12 : 0), 10);
        // Confidential tag
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        doc.setTextColor(...GRAY_LIGHT);
        doc.text("Confidential", W - MR, 10, { align: "right" });
        // Teal accent line
        doc.setDrawColor(...TEAL);
        doc.setLineWidth(0.4);
        doc.line(ML, 14, W - MR, 14);

        // ── Footer ──
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.line(ML, H - 12, W - MR, H - 12);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...GRAY_LIGHT);
        doc.text(
          `Food Safety Agency (Pty) Ltd  |  Analytics Report  |  ${new Date().toLocaleDateString("en-ZA")}`,
          W / 2, H - 8, { align: "center" }
        );
        doc.text(`Page ${p - 1} of ${totalPages - 1}`, W - MR, H - 8, { align: "right" });
      }

      // ── Save ──
      doc.save(`Analytics_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err: unknown) {
      console.error("PDF generation failed:", err);
      alert("PDF generation failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setPdfLoading(false);
    }
  };

  const dateRangeSet = pendingFilters.date_from !== "" || pendingFilters.date_to !== "" || pendingFilters.year.length > 0;

  // ── Derived data ───────────────────────────────────────────────────────────

  const totalKm = useMemo(() => data?.travelPerInspector?.reduce((s, t) => s + t.total_km, 0) ?? 0, [data]);
  const avgDocSend = useMemo(() => avg(data?.docSendTime?.map(d => d.avg_days) ?? []), [data]);
  // Count-weighted overall average days to approval. A plain mean of each
  // inspector's average would over-weight inspectors with few inspections; this
  // weights by how many inspections each inspector actually had.
  const avgApproval = useMemo(() => {
    const rows = data?.approvalTime ?? [];
    const totalCount = rows.reduce((s, d) => s + (d.count || 0), 0);
    if (!totalCount) return 0;
    return rows.reduce((s, d) => s + (d.avg_days || 0) * (d.count || 0), 0) / totalCount;
  }, [data]);
  const totalSamples = useMemo(() => data?.samplesByCommodity?.filter(d => isSampleCommodity(d.commodity)).reduce((s, d) => s + d.count, 0) ?? 0, [data]);

  // ── Render ─────────────────────────────────────────────────────────────────

  // Don't render until role is known (prevents flash of wrong UI)
  if (!user) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <div style={{ textAlign: "center", color: "#6b7280" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", borderTop: "3px solid #007890", borderRight: "3px solid #e5e7eb", borderBottom: "3px solid #e5e7eb", borderLeft: "3px solid #e5e7eb", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        Loading...
      </div>
    </div>
  );

  // Inspectors see their personal dashboard
  if (isInspector) return <InspectorDashboard />;

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 36, height: 36, borderTop: "3px solid #007890", borderRight: "3px solid #e2e8f0", borderBottom: "3px solid #e2e8f0", borderLeft: "3px solid #e2e8f0", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
        <div style={{ fontSize: 14, color: "#64748b" }}>Loading...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );

  return (
    <div className="analytics-page" style={{ padding: "28px 20px 32px", minHeight: "100vh", position: "relative", overflowX: "hidden", maxWidth: "100vw" }}>
      {/* Background image matching Django */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, width: "100vw", height: "100vh", background: "url('/background.jpg') no-repeat center center fixed", backgroundSize: "cover", opacity: 1, zIndex: -2, pointerEvents: "none" }} />
      {/* Panel Tabs */}
      <div className="analytics-tabs flex flex-wrap" style={{ gap: 6, marginBottom: "1rem" }}>
        {visiblePanels.map((p) => (
          <button
            key={p.key}
            onClick={() => setActivePanel(p.key)}
            className="flex items-center transition-all duration-200"
            style={{
              gap: 10,
              padding: "7px 12px",
              borderRadius: 6,
              border: "none",
              borderLeft: activePanel === p.key ? "3px solid #fff" : "3px solid transparent",
              background: activePanel === p.key ? "#007890" : "#ffffff",
              color: activePanel === p.key ? "#ffffff" : "#64748b",
              fontWeight: activePanel === p.key ? 600 : 500,
              fontSize: "0.875rem",
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              minHeight: 36,
            }}
          >
            <i className={p.icon} style={{ width: 18, textAlign: "center", fontSize: "0.85rem" }} />
            {p.label}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-md border border-gray-200" style={{ boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)", padding: "0.75rem 1rem", marginBottom: "1rem" }}>
        <div className="analytics-filter-bar flex flex-wrap items-end" style={{ gap: "0.75rem" }}>
          <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
            <label style={{ fontSize: "0.7rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Date From</label>
            <input type="date" value={pendingFilters.date_from} onChange={(e) => setPendingFilters({ ...pendingFilters, date_from: e.target.value })}
              style={{ padding: "6px 10px", fontSize: "0.8rem", border: "1px solid #e5e7eb", borderRadius: 6, outline: "none", width: "100%" }} />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
            <label style={{ fontSize: "0.7rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Date To</label>
            <input type="date" value={pendingFilters.date_to} onChange={(e) => setPendingFilters({ ...pendingFilters, date_to: e.target.value })}
              style={{ padding: "6px 10px", fontSize: "0.8rem", border: "1px solid #e5e7eb", borderRadius: 6, outline: "none", width: "100%" }} />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[100px]">
            <label style={{ fontSize: "0.7rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Year</label>
            <MultiSelectDropdown
              label="Year"
              options={(rawData?.filterOptions?.years ?? []).map(String)}
              selected={pendingFilters.year}
              onChange={(v) => setPendingFilters({ ...pendingFilters, year: v })}
              placeholder="All Years"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
            <label style={{ fontSize: "0.7rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Month</label>
            <MultiSelectDropdown
              label="Month"
              options={MONTHS}
              selected={pendingFilters.month}
              onChange={(v) => setPendingFilters({ ...pendingFilters, month: v })}
              placeholder="All Months"
            />
          </div>
          {/* Inspector filter — hidden for inspector/admin roles (they see only own data) */}
          {!isInspector && !isAdmin && (
            <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
              <label style={{ fontSize: "0.7rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Inspector</label>
              <MultiSelectDropdown
                label="Inspector"
                options={rawData?.filterOptions?.inspectors ?? []}
                selected={pendingFilters.inspector}
                onChange={(v) => setPendingFilters({ ...pendingFilters, inspector: v })}
                placeholder="All Inspectors"
              />
            </div>
          )}
          {(isInspector || isAdmin) && userFullName && (
            <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
              <label style={{ fontSize: "0.7rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Inspector</label>
              <div style={{ padding: "6px 10px", fontSize: "0.8rem", border: "1px solid #e5e7eb", borderRadius: 6, background: "#f3f4f6", color: "#374151", fontWeight: 500 }}>
                <i className="fas fa-user" style={{ marginRight: 6, color: "#007890" }} />{userFullName}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1 flex-1 min-w-[130px]">
            <label style={{ fontSize: "0.7rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Commodity</label>
            <MultiSelectDropdown
              label="Commodity"
              options={rawData?.filterOptions?.commodities ?? []}
              selected={pendingFilters.commodity}
              onChange={(v) => setPendingFilters({ ...pendingFilters, commodity: v })}
              placeholder="All Commodities"
            />
          </div>
          <div className="analytics-filter-btns" style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flexShrink: 0 }}>
            <button onClick={handleApply}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 6, border: "none", fontWeight: 500, fontSize: "0.75rem", cursor: "pointer", background: "#007890", color: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <i className="fas fa-filter" /> Apply Filters
            </button>
            <button onClick={handleReset}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 6, border: "none", fontWeight: 500, fontSize: "0.75rem", cursor: "pointer", background: "#6b7280", color: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <i className="fas fa-times" /> Clear Filters
            </button>
            {/* Single Export button with a dropdown of options */}
            <div style={{ position: "relative" }} data-analytics-export>
              <button onClick={() => setExportMenuOpen(o => !o)}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 6, border: "none", fontWeight: 500, fontSize: "0.75rem", cursor: "pointer", background: "#007890", color: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                <i className="fas fa-file-export" /> Export <i className="fas fa-chevron-down" style={{ fontSize: "0.6rem" }} />
              </button>
              {exportMenuOpen && (
                <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.12)", minWidth: 190, zIndex: 1000, overflow: "hidden" }}>
                  <button onClick={() => { setExportMenuOpen(false); handleExtractExcel(); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "#1f2937" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#e6f3f7"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                    <i className="fas fa-file-excel" style={{ color: "#059669" }} /> Export to Excel
                  </button>
                  <div style={{ height: 1, background: "#e5e7eb" }} />
                  <button onClick={() => { if (pdfLoading) return; setExportMenuOpen(false); handleExportPdf(); }} disabled={pdfLoading}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: pdfLoading ? "wait" : "pointer", fontSize: "0.8rem", color: "#1f2937", opacity: pdfLoading ? 0.6 : 1 }}
                    onMouseEnter={e => { if (!pdfLoading) (e.currentTarget as HTMLElement).style.background = "#e6f3f7"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                    <i className={pdfLoading ? "fas fa-spinner fa-spin" : "fas fa-file-pdf"} style={{ color: "#d13438" }} /> {pdfLoading ? "Generating PDF..." : "Export as PDF"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ background: "rgba(255,255,255,0.97)", borderRadius: 12, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)", padding: "1rem" }}>
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-[#007890] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-500 font-medium">Loading analytics...</span>
          </div>
        </div>
      ) : !data ? (
        <div className="text-center py-20 text-gray-400">Failed to load analytics data.</div>
      ) : (
        <div style={{ animation: "panel-in 0.2s ease" }}>
          <style>{`
            @keyframes panel-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
            .info-tooltip { position: relative; display: inline-block; margin-left: 6px; cursor: help; }
            .info-tooltip-text { visibility: hidden; opacity: 0; position: absolute; z-index: 9999; top: calc(100% + 8px); left: 0; background: #1e293b; color: #fff; padding: 10px 14px; border-radius: 6px; font-size: 12px; font-weight: 400; line-height: 1.5; white-space: normal; width: 260px; transition: opacity 0.2s; pointer-events: none; box-shadow: 0 4px 12px rgba(0,0,0,0.25); }
            .info-tooltip:hover .info-tooltip-text { visibility: visible; opacity: 1; }
            .info-tooltip-text::before { content: ''; position: absolute; bottom: 100%; left: 16px; border-width: 6px; border-style: solid; border-color: transparent transparent #1e293b transparent; }
            @media (max-width: 768px) {
              .md\\:grid-cols-2 { grid-template-columns: 1fr !important; }
              .md\\:grid-cols-3 { grid-template-columns: 1fr !important; }
              .analytics-page { padding: 10px 8px 20px !important; overflow-x: hidden; }
              .analytics-page h1 { font-size: 1.2rem !important; }
              .analytics-filter-bar { flex-direction: column !important; gap: 8px !important; }
              .analytics-filter-bar > div { min-width: 100% !important; flex: unset !important; }
              .analytics-filter-btns { flex-wrap: wrap !important; width: 100% !important; gap: 6px !important; }
              .analytics-filter-btns button { flex: 1 1 45%; min-width: 0; padding: 8px 10px !important; font-size: 0.7rem !important; }
              .analytics-tabs { gap: 3px !important; overflow-x: auto; -webkit-overflow-scrolling: touch; flex-wrap: nowrap !important; padding-bottom: 4px; }
              .analytics-tabs button { font-size: 0.7rem !important; padding: 6px 8px !important; min-height: 30px !important; white-space: nowrap; flex-shrink: 0; }
              .analytics-tabs button i { display: none; }
              .analytics-modal { width: 95% !important; max-height: 85vh !important; }
              .analytics-kpi-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 8px !important; }
              .analytics-card { overflow: hidden !important; }
              .analytics-card > div:last-child { padding: 10px !important; overflow-x: auto; }
              .analytics-card > div:first-child { padding: 10px 12px !important; }
              .analytics-card > div:first-child h3 { font-size: 0.85rem !important; }
              .analytics-card table { font-size: 0.7rem !important; }
              .analytics-card table th, .analytics-card table td { padding: 6px 4px !important; }
              .analytics-chart-wrap { min-height: 180px !important; height: 250px !important; }
              .analytics-radar-wrap { height: 400px !important; min-height: 380px !important; }
              .analytics-fin-btns { flex-wrap: wrap !important; gap: 6px !important; }
              .analytics-fin-btns select { width: 100% !important; min-width: unset !important; }
              .analytics-fin-btns button { font-size: 10px !important; padding: 5px 8px !important; flex: 1 1 auto; }
              .grid { gap: 10px !important; }
            }
            @media (max-width: 480px) {
              .analytics-page { padding: 6px 4px 16px !important; }
              .analytics-tabs button { font-size: 0.6rem !important; padding: 5px 6px !important; }
              .analytics-kpi-grid { grid-template-columns: 1fr 1fr !important; }
              .analytics-filter-btns button { flex: 1 1 100%; }
              .analytics-chart-wrap { height: 200px !important; }
              .analytics-radar-wrap { height: 350px !important; min-height: 330px !important; }
              .analytics-card > div:last-child { padding: 8px !important; }
              .analytics-fin-btns button { font-size: 9px !important; padding: 4px 6px !important; }
            }
          `}</style>
          {activePanel === "overview" && <OverviewPanel data={data} totalKm={totalKm} avgDocSend={avgDocSend} avgApproval={avgApproval} totalSamples={totalSamples} filters={filters} />}
          {activePanel === "inspectors" && <InspectorsPanel data={data} inspectorMetric={inspectorMetric} setInspectorMetric={setInspectorMetric} quarterlyTargets={quarterlyTargets} targetYear={targetYear} targetQuarter={targetQuarter} setTargetYear={setTargetYear} setTargetQuarter={setTargetQuarter} onSetTargets={() => { setEditingTarget(t => ({ ...t, year: targetYear, quarter: targetQuarter, inspector_name: "", eggs: 0, poultry: 0, raw: 0, pmp: 0, raw_samples: 0, pmp_samples: 0 })); setShowTargetsModal(true); }} filterInspector={filters.inspector.length === 1 ? filters.inspector[0] : ""} />}
          {activePanel === "compliance" && <CompliancePanel data={data} />}
          {activePanel === "operations" && <OperationsPanel data={data} />}
          {activePanel === "timelines" && <TimelinesPanel data={data} />}
          {activePanel === "financial" && <FinancialPanel data={data} salaries={salaries} expenseLog={expenseLog} xeroStatus={xeroStatus} xeroInvoices={xeroInvoices} xeroPage={xeroPage} setXeroPage={setXeroPage} xeroSyncing={xeroSyncing} onXeroSync={handleXeroSync} onXeroConnect={handleXeroConnect} onXeroDisconnect={handleXeroDisconnect} onOpenSalaryModal={openSalaryModal} onOpenExpenseModal={() => setShowExpenseModal(true)} userRole={userRole} userFullName={userFullName} />}

          {/* Salary Modal */}
          {showSalaryModal && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowSalaryModal(false)}>
              <div style={{ background: "white", borderRadius: 12, padding: "16px 20px", maxWidth: 1100, width: "95%", maxHeight: "95vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}><i className="fas fa-money-check-alt" style={{ marginRight: 8, color: "#007890" }} />Edit Salaries (CTC)</h3>
                  <button onClick={() => setShowSalaryModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>&times;</button>
                </div>

                <div style={{ marginBottom: 12, padding: "10px 12px", background: "#e6f3f7", borderRadius: 6, border: "1px solid #b2d8e2", display: "flex", alignItems: "center", gap: 8 }}>
                  <i className="fas fa-info-circle" style={{ color: "#007890" }} />
                  <span style={{ fontSize: "0.78rem", color: "#005a6b" }}>Update monthly salary (Cost to Company) for each inspector.</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                  {Object.entries(editingSalaries).map(([name, val]) => (
                    <div key={name} style={{ display: "flex", gap: 10, padding: "8px 12px", background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb", alignItems: "center" }}>
                      <span style={{ flex: 1, fontSize: "0.78rem", fontWeight: 500, color: "#374151" }}>{name}</span>
                      <div style={{ position: "relative", width: 120 }}>
                        <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: "0.75rem", fontWeight: 500 }}>R</span>
                        <input type="number" step="0.01" min="0" value={val} onChange={e => setEditingSalaries({ ...editingSalaries, [name]: Number(e.target.value) })}
                          style={{ width: "100%", padding: "5px 8px 5px 22px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: "0.75rem", textAlign: "right" }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => setShowSalaryModal(false)} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #e5e7eb", background: "white", cursor: "pointer", fontSize: "0.82rem", fontWeight: 500 }}>Cancel</button>
                  <button onClick={saveSalaries} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#007890", color: "white", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600 }}>
                    <i className="fas fa-save" style={{ marginRight: 6 }} />Save Salaries
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Expense Modal */}
          {showExpenseModal && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowExpenseModal(false)}>
              <div style={{ background: "white", borderRadius: 12, padding: "16px 20px", maxWidth: 550, width: "92%", maxHeight: "95vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}><i className="fas fa-receipt" style={{ marginRight: 8, color: "#007890" }} />Log Expense</h3>
                  <button onClick={() => setShowExpenseModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>&times;</button>
                </div>

                <div style={{ marginBottom: 12, padding: "10px 12px", background: "#e6f3f7", borderRadius: 6, border: "1px solid #b2d8e2", display: "flex", alignItems: "center", gap: 8 }}>
                  <i className="fas fa-info-circle" style={{ color: "#007890" }} />
                  <span style={{ fontSize: "0.78rem", color: "#005a6b" }}>{expenseLog.length} expense{expenseLog.length !== 1 ? "s" : ""} logged</span>
                </div>

                <div style={{ display: "flex", gap: 10, marginBottom: 12, padding: "10px 12px", background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 600, color: "#374151", marginBottom: 3 }}>Inspector</label>
                    <select value={newExpense.inspector} onChange={e => setNewExpense({ ...newExpense, inspector: e.target.value })} style={{ width: "100%", padding: "5px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: "0.78rem" }}>
                      <option value="">Select inspector...</option>
                      {data?.filterOptions?.inspectors?.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 600, color: "#374151", marginBottom: 3 }}>Date</label>
                    <input type="date" value={newExpense.date} onChange={e => setNewExpense({ ...newExpense, date: e.target.value })} style={{ width: "100%", padding: "5px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: "0.78rem" }} />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginBottom: 12, padding: "10px 12px", background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 600, color: "#374151", marginBottom: 3 }}>Amount (R)</label>
                    <input type="number" step="0.01" min="0" placeholder="0.00" value={newExpense.amount} onChange={e => setNewExpense({ ...newExpense, amount: e.target.value })} style={{ width: "100%", padding: "5px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: "0.78rem" }} />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 600, color: "#374151", marginBottom: 3 }}>Description</label>
                    <input type="text" placeholder="e.g. Fuel, equipment, travel..." value={newExpense.description} onChange={e => setNewExpense({ ...newExpense, description: e.target.value })} style={{ width: "100%", padding: "5px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: "0.78rem" }} />
                  </div>
                </div>

                <button onClick={() => {
                  if (!newExpense.inspector || !newExpense.amount) return;
                  const entry = { id: Date.now().toString(), inspector: newExpense.inspector, amount: Number(newExpense.amount), description: newExpense.description, date: newExpense.date || new Date().toISOString().slice(0, 10) };
                  saveExpenses([...expenseLog, entry]);
                  setNewExpense({ inspector: "", amount: "", description: "", date: "" });
                }} disabled={!newExpense.inspector || !newExpense.amount} style={{ width: "100%", padding: "8px 16px", borderRadius: 6, border: "none", background: !newExpense.inspector || !newExpense.amount ? "#e5e7eb" : "#007890", color: !newExpense.inspector || !newExpense.amount ? "#9ca3af" : "white", cursor: !newExpense.inspector || !newExpense.amount ? "not-allowed" : "pointer", fontWeight: 600, fontSize: "0.82rem", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 }}>
                  <i className="fas fa-plus" /> Add Expense
                </button>

                {/* Expense List */}
                {expenseLog.length > 0 && (
                  <div style={{ borderTop: "1px solid #f0f0f0", padding: "16px 24px 20px" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 10 }}>Logged Expenses</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {expenseLog.map(e => (
                        <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "#fafafa", borderRadius: 8, border: "1px solid #f0f0f0" }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <i className="fas fa-receipt" style={{ color: "#d97706", fontSize: 13 }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#1f2937" }}>{e.inspector}</span>
                              <span style={{ fontSize: "0.7rem", color: "#9ca3af" }}>{e.date}</span>
                            </div>
                            {e.description && <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.description}</div>}
                          </div>
                          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#d97706", flexShrink: 0 }}>{fmtRand(e.amount)}</span>
                          <button onClick={() => saveExpenses(expenseLog.filter(x => x.id !== e.id))} style={{ background: "none", border: "none", color: "#d1d5db", cursor: "pointer", padding: 4, fontSize: 13, lineHeight: 1, borderRadius: 4, transition: "color 0.15s" }} onMouseEnter={e => (e.target as HTMLElement).style.color = "#ef4444"} onMouseLeave={e => (e.target as HTMLElement).style.color = "#d1d5db"}>
                            <i className="fas fa-trash-alt" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, paddingTop: 10, borderTop: "1px solid #f0f0f0" }}>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#1f2937" }}>Total: <span style={{ color: "#d97706" }}>{fmtRand(expenseLog.reduce((s, e) => s + (e.amount || 0), 0))}</span></span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Targets Modal */}
          {showTargetsModal && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowTargetsModal(false)}>
              <div style={{ background: "white", borderRadius: 12, padding: 24, maxWidth: 550, width: "90%", maxHeight: "80vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: "0 0 16px", fontSize: "1.1rem", fontWeight: 600 }}><i className="fas fa-bullseye" style={{ marginRight: 8, color: "#007890" }} />Quarterly Inspector Targets</h3>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <select value={editingTarget.inspector_name} onChange={e => {
                    const name = e.target.value;
                    if (!name) { setEditingTarget(t => ({ ...t, inspector_name: "", eggs: 0, poultry: 0, raw: 0, pmp: 0, raw_samples: 0, pmp_samples: 0 })); return; }
                    // First check local state (matches table's year/quarter)
                    const local = quarterlyTargets[name];
                    if (local && local.year === editingTarget.year && local.quarter === editingTarget.quarter) {
                      setEditingTarget({ ...local });
                    } else {
                      // Fetch from API for the modal's year/quarter
                      fetch(`/api/quarterly-targets?year=${editingTarget.year}&quarter=${editingTarget.quarter}`).then(r => r.json()).then(d => {
                        const existing = d.targets?.[name];
                        if (existing) setEditingTarget({ ...existing });
                        else setEditingTarget(t => ({ ...t, inspector_name: name, eggs: 0, poultry: 0, raw: 0, pmp: 0, raw_samples: 0, pmp_samples: 0 }));
                      }).catch(() => setEditingTarget(t => ({ ...t, inspector_name: name, eggs: 0, poultry: 0, raw: 0, pmp: 0, raw_samples: 0, pmp_samples: 0 })));
                    }
                  }} style={{ flex: 1, padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: "0.85rem" }}>
                    <option value="">-- Select Inspector --</option>
                    {(data?.filterOptions?.inspectors ?? []).filter(n => !data?.nonInspectorNames?.includes(n)).map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <select value={editingTarget.year} onChange={e => {
                    const yr = Number(e.target.value);
                    const name = editingTarget.inspector_name;
                    fetch(`/api/quarterly-targets?year=${yr}&quarter=${editingTarget.quarter}`).then(r => r.json()).then(d => {
                      const existing = d.targets?.[name];
                      if (existing) setEditingTarget({ ...existing });
                      else setEditingTarget(prev => ({ ...prev, year: yr, eggs: 0, poultry: 0, raw: 0, pmp: 0, raw_samples: 0, pmp_samples: 0 }));
                    }).catch(() => setEditingTarget(prev => ({ ...prev, year: yr })));
                  }} style={{ padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: "0.85rem" }}>
                    {(data?.filterOptions?.years ?? [new Date().getFullYear()]).map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select value={editingTarget.quarter} onChange={e => {
                    const qr = Number(e.target.value);
                    const name = editingTarget.inspector_name;
                    fetch(`/api/quarterly-targets?year=${editingTarget.year}&quarter=${qr}`).then(r => r.json()).then(d => {
                      const existing = d.targets?.[name];
                      if (existing) setEditingTarget({ ...existing });
                      else setEditingTarget(prev => ({ ...prev, quarter: qr, eggs: 0, poultry: 0, raw: 0, pmp: 0, raw_samples: 0, pmp_samples: 0 }));
                    }).catch(() => setEditingTarget(prev => ({ ...prev, quarter: qr })));
                  }} style={{ padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: "0.85rem" }}>
                    {[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}
                  </select>
                </div>
                <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#374151", marginBottom: 8 }}>Inspection Targets</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                  {([["eggs", "Egg Inspections"], ["poultry", "Poultry Inspections"], ["raw", "RAW Inspections"], ["pmp", "PMP Inspections"], ["raw_samples", "RAW Samples"], ["pmp_samples", "PMP Samples"]] as [string, string][]).map(([key, label]) => {
                    const val = (editingTarget as unknown as Record<string, number>)[key];
                    return (
                    <div key={key}>
                      <label style={{ fontSize: "0.7rem", color: "#6b7280", display: "block", marginBottom: 2 }}>{label}</label>
                      <input type="number" min={0} placeholder="0" value={val || ""}
                        onChange={e => setEditingTarget(t => ({ ...t, [key]: e.target.value === "" ? 0 : Number(e.target.value) }))}
                        style={{ width: "100%", padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: "0.85rem" }} />
                    </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
                  <button onClick={applyTargetToAll} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#f59e0b", color: "white", cursor: "pointer", fontSize: "0.85rem", fontWeight: 500 }}>
                    <i className="fas fa-users" style={{ marginRight: 6 }} />Apply to All Inspectors
                  </button>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setShowTargetsModal(false)} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #e5e7eb", background: "white", cursor: "pointer", fontSize: "0.85rem" }}>Cancel</button>
                    <button onClick={saveQuarterlyTarget} style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#007890", color: "white", cursor: "pointer", fontSize: "0.85rem", fontWeight: 500 }}>Save Target</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// PANEL 1: Overview
// ════════════════════════════════════════════════════════════════════════════════

function OverviewPanel({ data, totalKm, avgDocSend, avgApproval, totalSamples, filters }: { data: AnalyticsData; totalKm: number; avgDocSend: number; avgApproval: number; totalSamples: number; filters: Filters }) {
  const periodLabel = (() => {
    const parts: string[] = [];
    if (filters.date_from && filters.date_to) parts.push(`${filters.date_from} to ${filters.date_to}`);
    else if (filters.date_from) parts.push(`From ${filters.date_from}`);
    else if (filters.date_to) parts.push(`Until ${filters.date_to}`);
    if (filters.year.length > 0 && !filters.date_from && !filters.date_to) parts.push(filters.year.join(", "));
    if (filters.month.length > 0) parts.push(filters.month.join(", "));
    if (filters.inspector.length > 0) parts.push(filters.inspector.join(", "));
    if (filters.commodity.length > 0) parts.push(filters.commodity.join(", "));
    return parts.length > 0 ? parts.join(" | ") : "All Time";
  })();
  // Daily compliance trend
  console.log("[OverviewPanel] dailyComplianceTrend received:", data.dailyComplianceTrend?.length, "items, first 3:", (data.dailyComplianceTrend || []).slice(0, 3));
  const dailyDays = [...new Set((data.dailyComplianceTrend || []).map((d) => d.day))].sort();
  const dailyCommodities = [...new Set((data.dailyComplianceTrend || []).map((d) => d.commodity))];
  console.log("[OverviewPanel] dailyDays:", dailyDays, "dailyCommodities:", dailyCommodities);
  const dailyChartData = {
    labels: dailyDays.map(fmtDay),
    datasets: dailyCommodities.map((c, i) => ({
      label: c,
      data: dailyDays.map((day) => {
        const row = (data.dailyComplianceTrend || []).find((r) => r.day === day && r.commodity === c);
        return row ? row.compliance_rate : null;
      }),
      borderColor: colorForCommodity(c) || CHART_PALETTE[i % CHART_PALETTE.length],
      backgroundColor: colorForCommodity(c) || CHART_PALETTE[i % CHART_PALETTE.length],
      ...lineDefaults,
    })),
  };

  // Monthly inspections
  const miLabels = (data.monthlyInspectionsTrend || []).map((d) => fmtMonth(d.month));
  const miData = {
    labels: miLabels,
    datasets: [{ label: "Inspections", data: (data.monthlyInspectionsTrend || []).map((d) => d.count), backgroundColor: "#007890", borderRadius: 4 }],
  };

  // Weekly compliance (aggregated) for Approval Rate chart
  const wcWeeks = (data.weeklyComplianceTrend || []).map((d) => d.week).sort();
  const wcRates = (data.weeklyComplianceTrend || []).sort((a, b) => a.week.localeCompare(b.week)).map((d) => d.compliance_rate);
  const wcIsSingle = wcWeeks.length <= 1;
  const wcData = {
    labels: wcWeeks.map((w) => { try { return new Date(w).toLocaleDateString("en-ZA", { day: "numeric", month: "short" }); } catch { return w; } }),
    datasets: [{
      label: "Approval Rate %",
      data: wcRates,
      ...(wcIsSingle
        ? { backgroundColor: "#10b981", borderRadius: 4 }
        : { borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.1)", ...lineDefaults, fill: true }),
    }],
  };

  // Occurrence trend
  const occData = {
    labels: (data.monthlyOccurrenceTrend || []).map((d) => fmtMonth(d.month)),
    datasets: [{ label: "Occurrences", data: (data.monthlyOccurrenceTrend || []).map((d) => d.count), backgroundColor: "#EC343C", borderRadius: 4 }],
  };

  // Facility types bar chart
  const ftSorted = [...(data.facilityTypeDistribution || [])].sort((a, b) => b.count - a.count);
  const ftData = {
    labels: ftSorted.map((d) => d.facility_type),
    datasets: [{
      label: "Inspections",
      data: ftSorted.map((d) => d.count),
      backgroundColor: ftSorted.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
      borderRadius: 4,
    }],
  };

  return (
    <div className="flex flex-col" style={{ gap: "1rem", marginBottom: "1rem" }}>
      {/* Period Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <i className="fas fa-calendar-check" style={{ color: "#007890", fontSize: 14 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Period: {periodLabel}</span>
      </div>

      {/* Primary KPIs */}
      <div className="analytics-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
        <KpiCard label="Total Inspections" value={data.totalInspections} />
        <KpiCard label="Compliance Rate" value={`${Number(data.complianceRate ?? 0).toFixed(1)}%`} color="#10b981" />
        <KpiCard label="Active Inspectors" value={data.activeInspectors} color="#f59e0b" />
        <KpiCard label="Total Revenue" value={fmtRand(data.financialSummary?.total_revenue ?? 0)} color="#10b981" />
      </div>

      {/* Secondary KPIs */}
      <div className="analytics-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
        <KpiCard label="Occurrence Reports" value={data.totalOccurrenceReports} color="#ef4444" icon="fas fa-exclamation-circle" />
        <KpiCard label="Total KM Traveled" value={totalKm.toLocaleString("en-ZA")} color="#007890" icon="fas fa-road" />
        <KpiCard label="Avg Days: Doc Send" value={Math.round(avgDocSend)} color="#f59e0b" icon="fas fa-paper-plane" />
        <KpiCard label="Avg Days: Approval" value={Math.round(avgApproval)} color="#8764b8" icon="fas fa-hourglass-half" />
        <KpiCard label="Total Samples Taken" value={totalSamples} color="#10b981" icon="fas fa-vial" />
      </div>

      {/* Compliance per commodity */}
      <Card title="Compliance Per Commodity" icon="fas fa-shield-alt" tooltip="Approval rate breakdown by commodity type (RAW, PMP, EGGS, POULTRY) for the selected period.">
        <div className="space-y-3">
          {(data.complianceByCommodity || []).map((c) => (
            <div key={c.commodity} className="flex items-center gap-3">
              <span className="font-semibold text-sm text-gray-800 w-20 flex-shrink-0">{c.commodity}</span>
              <div className="flex-1 bg-gray-200 rounded-full h-6 overflow-hidden relative">
                <div className="h-full rounded-full transition-all duration-500 flex items-center justify-center"
                  style={{ width: `${Math.max(Number(c.compliance_rate ?? 0), 3)}%`, backgroundColor: colorForCommodity(c.commodity) }}>
                  {(c.compliance_rate ?? 0) > 10 && <span className="text-[11px] font-bold" style={{ color: "#fff" }}>{Number(c.compliance_rate ?? 0).toFixed(1)}%</span>}
                </div>
              </div>
              <span className="text-xs text-gray-500 flex-shrink-0" style={{ minWidth: 70, textAlign: "right" }} title={`${c.compliant} compliant of ${c.compliant + c.non_compliant} assessed (${c.total} records total)`}>{Number(c.compliance_rate ?? 0).toFixed(1)}% ({c.compliant}/{c.compliant + c.non_compliant} assessed)</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Daily compliance trend */}
      <Card title="Daily Compliance Trend by Commodity" icon="fas fa-chart-line" tooltip="Daily compliance percentage trends across all commodity types over time.">
        <ChartWrap height="400px">
          <DLLine data={dailyChartData} options={(() => {
            const base = baseChartOptions(undefined, "Compliance %");
            return {
              ...base,
              interaction: { mode: "index" as const, intersect: false },
              plugins: {
                ...(base.plugins as Record<string, unknown>),
                tooltip: { enabled: true, mode: "index" as const, intersect: false, callbacks: { label: (ctx: { dataset: { label: string }; parsed: { y: number } }) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%` } },
                datalabels: { display: false },
              },
              scales: {
                x: { ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 30 }, grid: { color: "rgba(0,0,0,0.04)" } },
                y: { min: 0, max: 105, ticks: { font: { size: 10 }, stepSize: 10, callback: (v: number) => v <= 100 ? v + "%" : "" }, title: { display: true, text: "Compliance %", font: { size: 11 } }, grid: { color: "rgba(0,0,0,0.06)" } },
              },
            };
          })() as never} />
        </ChartWrap>
      </Card>

      {/* 2-col: Monthly Inspections, Occurrence Trend */}
      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: "1rem", marginBottom: "1rem" }}>
        <Card title="Monthly Inspections" icon="fas fa-chart-bar" tooltip="Total number of inspections completed each month.">
          <ChartWrap height="200px"><DLBar data={miData} options={baseChartOptions(undefined, undefined, { datalabels: true, datalabelColor: "#1f2937" }) as never} /></ChartWrap>
        </Card>
        <Card title="Occurrence Trend" icon="fas fa-exclamation-triangle" tooltip="Monthly trend of occurrence reports (non-compliance incidents) filed.">
          <ChartWrap height="200px"><DLBar data={occData} options={baseChartOptions(undefined, undefined, { datalabels: true, datalabelColor: "#1f2937" }) as never} /></ChartWrap>
        </Card>
      </div>

      {/* Facility Types — unique to Overview */}
      <Card title="Facility Types" icon="fas fa-building" tooltip="Distribution of inspections across different facility types (e.g. abattoir, farm, processor).">
        <ChartWrap height={`${Math.max(300, ftSorted.length * 40)}px`}><DLBar data={ftData} options={{
          ...baseChartOptions(undefined, undefined, { datalabels: true, datalabelColor: "#1f2937" }),
          indexAxis: "y" as const,
          scales: { x: { beginAtZero: true, ticks: { font: { size: 10 } } }, y: { ticks: { font: { size: 10 } } } },
        } as never} /></ChartWrap>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// PANEL 2: Inspectors
// ════════════════════════════════════════════════════════════════════════════════

function InspectorsPanel({ data, inspectorMetric, setInspectorMetric, quarterlyTargets, targetYear, targetQuarter, setTargetYear, setTargetQuarter, onSetTargets, filterInspector }: {
  data: AnalyticsData;
  inspectorMetric: "count" | "total_km" | "total_hours" | "samples";
  setInspectorMetric: (v: "count" | "total_km" | "total_hours" | "samples") => void;
  quarterlyTargets: Record<string, QuarterlyTarget>;
  targetYear: number;
  targetQuarter: number;
  setTargetYear: (y: number) => void;
  setTargetQuarter: (q: number) => void;
  onSetTargets: () => void;
  filterInspector?: string;
}) {
  const [radarInspector, setRadarInspector] = useState(filterInspector || "all");
  useEffect(() => { setRadarInspector(filterInspector || "all"); }, [filterInspector]);
  // Inspector-performance metrics only. KM Traveled / Hours are travel/operations
  // measures (they have their own charts on the Operations tab), so they're kept
  // out of this ranking to keep it about the inspectors' own output.
  const metricLabel: Record<string, string> = { count: "Inspections", samples: "Samples" };

  // Inspector totals for selected metric — ranked bar chart
  const inspectorTotals = [...new Set((data.monthlyInspectorTrend || []).map((d) => d.inspector_name))]
    .map((name) => {
      const rows = (data.monthlyInspectorTrend || []).filter((r) => r.inspector_name === name);
      const total = rows.reduce((s, r) => s + (Number(r[inspectorMetric]) || 0), 0);
      return { name, total };
    })
    .sort((a, b) => b.total - a.total);
  const rankData = {
    labels: inspectorTotals.map((d) => d.name),
    datasets: [{
      label: metricLabel[inspectorMetric],
      data: inspectorTotals.map((d) => Math.round(d.total * 10) / 10),
      backgroundColor: inspectorTotals.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
      borderRadius: 4,
    }],
  };
  const rankOpts = {
    ...baseChartOptions(),
    indexAxis: "y" as const,
    plugins: {
      ...((baseChartOptions() as Record<string, unknown>).plugins as Record<string, unknown>),
      legend: { display: false },
      datalabels: { anchor: "end" as const, align: "right" as const, font: { size: 10, weight: "bold" as const }, color: "#374151", formatter: (v: number) => v === 0 ? "" : String(v) },
    },
    layout: { padding: { right: 40 } },
    scales: {
      x: { beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: "#f3f4f6" } },
      y: { ticks: { font: { size: 11 } }, grid: { display: false } },
    },
  };

  // Compliance per inspector (horizontal stacked bar)
  const compData = {
    labels: (data.inspectorPerformance || []).map((d) => d.inspector_name),
    datasets: [
      { label: "Compliant", data: (data.inspectorPerformance || []).map((d) => d.compliant), backgroundColor: "#10b981" },
      { label: "Non-Compliant", data: (data.inspectorPerformance || []).map((d) => d.non_compliant), backgroundColor: "#ef4444" },
    ],
  };
  const stackedOpts = {
    ...baseChartOptions(),
    indexAxis: "y" as const,
    plugins: {
      ...((baseChartOptions() as Record<string, unknown>).plugins as Record<string, unknown>),
      datalabels: { anchor: "center" as const, align: "center" as const, font: { size: 9, weight: "bold" as const }, color: "#fff", formatter: (v: number) => v === 0 ? "" : String(v) },
    },
    scales: {
      x: { stacked: true, beginAtZero: true, ticks: { font: { size: 10 } } },
      y: { stacked: true, ticks: { font: { size: 10 } } },
    },
  };

  // Use quarterly targets (from DB) or fall back to inspectorTargets
  const allInspectors = data.filterOptions?.inspectors ?? [];
  const commodityList = ["EGG", "POULTRY", "RAW", "PMP"];

  // Compute quarter date range for filtering actuals. Built as YYYY-MM-DD from
  // local calendar parts, NOT via toISOString(): toISOString() converts to UTC,
  // so in SAST (UTC+2) the 1st of a quarter at local midnight becomes the last
  // day of the previous quarter, shifting both boundaries a day earlier and
  // miscounting inspections dated on a quarter edge (Ethan, 2026-10-05).
  const qStartMonth = (targetQuarter - 1) * 3; // 0-based: Q1=0, Q2=3, Q3=6, Q4=9
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const qEnd = new Date(targetYear, qStartMonth + 3, 0); // last day of quarter
  const qStartStr = `${targetYear}-${pad2(qStartMonth + 1)}-01`;
  const qEndStr = `${qEnd.getFullYear()}-${pad2(qEnd.getMonth() + 1)}-${pad2(qEnd.getDate())}`;

  // Narrow the complete inspectionsList to the selected quarter by its own
  // date range; getActual counts these per inspector and commodity.
  const quarterInspections = (data.inspectionsList || []).filter(i => {
    const d = i.date_of_inspection || "";
    return d >= qStartStr && d <= qEndStr;
  });

  // Build per-inspector per-commodity counts from quarterly inspections
  const _qCounts: Record<string, Record<string, number>> = {};
  quarterInspections.forEach(i => {
    const name = i.inspector_name || "";
    const c = (i.commodity || "").toUpperCase();
    if (!_qCounts[name]) _qCounts[name] = {};
    _qCounts[name][c] = (_qCounts[name][c] || 0) + 1;
  });

  // Actuals are always scoped to the selected quarter. inspectionsList is the
  // complete set for the period (the backend does not cap it), so counting it
  // by the quarter's own date range is accurate for every quarter — including
  // the current one. The previous code special-cased the current quarter to the
  // full-period commodity matrix, which made it show year-to-date (e.g. Q1+Q2+Q3
  // under Q3) while past quarters were correct. As the calendar advances the bug
  // simply moved to whatever quarter was current, so Q4 would have inherited it
  // (Ethan, 2026-10-05).
  function getActual(inspector: string, commodity: string): number {
    const c = commodity === "EGG" ? "EGGS" : commodity;
    return _qCounts[inspector]?.[c] || 0;
  }

  function getQTarget(inspector: string, commodity: string): number {
    const qt = quarterlyTargets[inspector];
    if (!qt) return 0;
    // Map commodity to QuarterlyTarget key: EGG->eggs, POULTRY->poultry, RAW->raw, PMP->pmp
    const keyMap: Record<string, keyof QuarterlyTarget> = { EGG: "eggs", EGGS: "eggs", POULTRY: "poultry", RAW: "raw", PMP: "pmp" };
    const key = keyMap[commodity.toUpperCase()] ?? (commodity.toLowerCase() as keyof QuarterlyTarget);
    return (qt[key] as number) ?? 0;
  }

  function getSampleActual(inspector: string, commodity: string): number {
    return (data.inspectorSampleMatrix || []).find(r => r.inspector_name === inspector && r.commodity.toUpperCase().includes(commodity))?.count ?? 0;
  }

  // Radar chart data — use quarterly targets for target ring, actuals for data
  const quarterLabel = `Q${targetQuarter}: ${["Jan-Mar", "Apr-Jun", "Jul-Sep", "Oct-Dec"][targetQuarter - 1]}`;
  const radarLabels = ["EGG", "POULTRY", "RAW", "PMP", "Raw Samples", "PMP Samples"];
  const radarInspectors = radarInspector === "all" ? allInspectors : [radarInspector];
  const radarDatasets = radarInspectors.map((inspector, i) => ({
    label: inspector,
    data: [
      getActual(inspector, "EGG"),
      getActual(inspector, "POULTRY"),
      getActual(inspector, "RAW"),
      getActual(inspector, "PMP"),
      getSampleActual(inspector, "RAW"),
      getSampleActual(inspector, "PMP"),
    ],
    borderColor: CHART_PALETTE[i % CHART_PALETTE.length],
    backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] + "22",
    pointBackgroundColor: CHART_PALETTE[i % CHART_PALETTE.length],
    borderWidth: 2,
  }));

  // Add target ring — use selected inspector's targets, or first available for "all"
  const targetSource = radarInspector !== "all"
    ? quarterlyTargets[radarInspector]
    : Object.values(quarterlyTargets)[0];
  if (targetSource) {
    radarDatasets.push({
      label: "Target",
      data: [targetSource.eggs, targetSource.poultry, targetSource.raw, targetSource.pmp, targetSource.raw_samples, targetSource.pmp_samples],
      borderColor: "#ef4444",
      backgroundColor: "rgba(239,68,68,0.08)",
      pointBackgroundColor: "#ef4444",
      borderWidth: 2,
    });
  }

  const radarChartData = { labels: radarLabels, datasets: radarDatasets };
  const radarOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: "top" as const, labels: { boxWidth: 10, font: { size: 9 }, padding: 8 } }, datalabels: { display: false } },
    layout: { padding: { top: 50 } },
    scales: { r: { beginAtZero: true, ticks: { font: { size: 10 } }, pointLabels: { font: { size: 11 } } } },
  };

  // Targets table: show all inspectors (not just those with targets)
  const targetInspectors = allInspectors.filter(n => !data.nonInspectorNames?.includes(n));

  return (
    <div className="flex flex-col" style={{ gap: "1rem", marginBottom: "1rem" }}>
      {/* Inspector Radar Chart */}
      <Card title={`Inspector Performance vs Targets (${quarterLabel})`} icon="fas fa-bullseye" tooltip="Radar chart comparing each inspector's actual performance against quarterly targets across all metrics."
        headerRight={
          <select value={radarInspector} onChange={e => setRadarInspector(e.target.value)}
            style={{ fontSize: 12, padding: "6px 12px", border: "1px solid #d1d5db", borderRadius: 6, background: "#f9fafb", minWidth: 160 }}>
            <option value="all">All Inspectors</option>
            {allInspectors.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        }
      >
        <div className="analytics-radar-wrap" style={{ position: "relative", height: "380px", minHeight: 300 }}>
          <DLRadar data={radarChartData} options={radarOpts as never} />
        </div>
      </Card>

      {/* Quarterly Targets */}
      <Card title="Inspector Quarterly Targets & Activity" icon="fas fa-clipboard-check" tooltip="Table showing each inspector's progress toward quarterly commodity targets with actual vs target counts."
        headerRight={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select value={targetYear} onChange={e => setTargetYear(Number(e.target.value))} style={{ fontSize: 11, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6 }}>
              {(data.filterOptions?.years ?? [new Date().getFullYear()]).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={targetQuarter} onChange={e => setTargetQuarter(Number(e.target.value))} style={{ fontSize: 11, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6 }}>
              {[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}
            </select>
            <button onClick={onSetTargets} style={{ fontSize: 12, padding: "6px 14px", border: "none", borderRadius: 6, background: "#007890", color: "white", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <i className="fas fa-bullseye" /> Set Targets
            </button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5px" }}>
            <thead>
              <tr>
                <th style={{ background: "#e6f3f7", padding: "0.6rem 0.75rem", fontWeight: 600, fontSize: "0.75rem", textAlign: "center", whiteSpace: "nowrap", borderBottom: "2px solid #e5e7eb", textTransform: "uppercase", letterSpacing: "0.3px" }}>Inspector</th>
                {commodityList.map((c) => (
                  <th key={c} style={{ background: "#e6f3f7", padding: "0.6rem 0.75rem", fontWeight: 600, fontSize: "0.75rem", textAlign: "center", whiteSpace: "nowrap", borderBottom: "2px solid #e5e7eb", textTransform: "uppercase", letterSpacing: "0.3px" }} colSpan={2}>{c}</th>
                ))}
              </tr>
              <tr>
                <th style={{ borderBottom: "1px solid #e5e7eb" }}></th>
                {commodityList.map((c) => (
                  <Fragment key={c}>
                    <th style={{ padding: "4px 6px", textAlign: "center", fontSize: "0.65rem", color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>Actual</th>
                    <th style={{ padding: "4px 6px", textAlign: "center", fontSize: "0.65rem", color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>Target</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {targetInspectors.map((inspector) => (
                <tr key={inspector} style={{ borderBottom: "1px solid #e5e7eb" }} className="hover:bg-gray-50">
                  <td style={{ padding: "0.5rem 0.75rem", fontWeight: 500, textAlign: "center" }}>{inspector}</td>
                  {commodityList.map((c) => {
                    const actual = getActual(inspector, c);
                    const target = getQTarget(inspector, c);
                    const met = actual >= target && target > 0;
                    return (
                      <Fragment key={c}>
                        <td style={{ padding: "0.5rem 0.5rem", textAlign: "center", fontWeight: 600, color: target > 0 ? (met ? "#059669" : "#ef4444") : "#374151" }}>{actual}</td>
                        <td style={{ padding: "0.5rem 0.5rem", textAlign: "center", color: "#ef4444", fontWeight: 500 }}>{target}</td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Inspector Performance Ranking */}
      <Card title="Inspector Performance Ranking" icon="fas fa-ranking-star" tooltip="Ranked comparison of all inspectors by selected metric — switch between inspections, KM, hours, or samples."
        headerRight={
          <select value={inspectorMetric} onChange={(e) => setInspectorMetric(e.target.value as typeof inspectorMetric)}
            style={{ fontSize: "12px", padding: "6px 28px 6px 12px", border: "1px solid #d1d5db", borderRadius: 6, background: "#f9fafb", color: "#374151", fontWeight: 500, cursor: "pointer" }}>
            {Object.entries(metricLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        }>
        <ChartWrap height={`${Math.max(250, inspectorTotals.length * 36)}px`}>
          <DLBar data={rankData} options={rankOpts as never} />
        </ChartWrap>
      </Card>

      <Card title="Facilities Per Inspector" icon="fas fa-store"
        tooltip="How many distinct businesses each inspector covered, how many visits they made, and how often they returned to the same facility. Two inspectors with the same inspection count can cover very different ground.">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                <th style={{ padding: "8px 10px", fontWeight: 600, color: "#374151" }}>Inspector</th>
                <th style={{ padding: "8px 10px", fontWeight: 600, color: "#374151", textAlign: "right" }}>Facilities</th>
                <th style={{ padding: "8px 10px", fontWeight: 600, color: "#374151", textAlign: "right" }}>Visits</th>
                <th style={{ padding: "8px 10px", fontWeight: 600, color: "#374151", textAlign: "right" }}>Inspections</th>
                <th style={{ padding: "8px 10px", fontWeight: 600, color: "#374151", textAlign: "right" }}>Visits per facility</th>
              </tr>
            </thead>
            <tbody>
              {[...(data.facilitiesPerInspector || [])]
                .sort((a, b) => b.facilities - a.facilities)
                .map((r, i) => {
                  const per = r.facilities > 0 ? r.visits / r.facilities : 0;
                  return (
                    <tr key={r.inspector_name} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 ? "#fcfcfb" : "white" }}>
                      <td style={{ padding: "8px 10px", color: "#111827" }}>{r.inspector_name}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "#0b0b0b" }}>{r.facilities}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#374151" }}>{r.visits}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#374151" }}>{r.inspections}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#52514e" }}>{per.toFixed(1)}</td>
                    </tr>
                  );
                })}
              {(data.facilitiesPerInspector || []).length === 0 && (
                <tr><td colSpan={5} style={{ padding: "14px 10px", color: "#898781" }}>No inspections in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// PANEL 3: Compliance
// ════════════════════════════════════════════════════════════════════════════════

function CompliancePanel({ data }: { data: AnalyticsData }) {
  const [trendView, setTrendView] = useState<"daily" | "weekly" | "monthly">("daily");
  const [trendOffset, setTrendOffset] = useState(0); // 0 = latest, negative = back in time

  const mergedDaily = data.dailyComplianceTrend || [];
  const mergedMonthly = data.monthlyComplianceTrend || [];

  // Build trend data based on selected view
  const buildTrendData = () => {
    if (trendView === "monthly") {
      const months = [...new Set(mergedMonthly.map((d) => d.month))].sort();
      const windowSize = 6;
      const end = months.length + trendOffset;
      const start = Math.max(0, end - windowSize);
      const visibleMonths = months.slice(start, end > 0 ? end : months.length);
      const commodities = [...new Set(mergedMonthly.map((d) => d.commodity))];
      return {
        labels: visibleMonths.map(fmtMonth),
        datasets: commodities.map((c, i) => ({
          label: c,
          data: visibleMonths.map((m) => {
            const row = mergedMonthly.find((r) => r.month === m && r.commodity === c);
            return row && row.total > 0 ? row.compliance_rate : null;
          }),
          borderColor: colorForCommodity(c) || CHART_PALETTE[i % CHART_PALETTE.length],
          backgroundColor: colorForCommodity(c) || CHART_PALETTE[i % CHART_PALETTE.length],
          ...lineDefaults,
        })),
        canBack: start > 0,
        canForward: trendOffset < 0,
      };
    } else if (trendView === "daily") {
      const todayStr = new Date().toISOString().slice(0, 10);
      const days = [...new Set(mergedDaily.map((d) => d.day))].sort().filter(d => d <= todayStr);
      // Rolling window over the most recent days that HAVE data — a calendar-month
      // window goes blank at the start of a new month. Each arrow click scrolls a week.
      const windowSize = 31;
      const step = 7;
      const end = Math.max(Math.min(windowSize, days.length), days.length + trendOffset * step);
      const start = Math.max(0, end - windowSize);
      const visibleDays = days.slice(start, end);
      const commodities = [...new Set(mergedDaily.map((d) => d.commodity))];
      return {
        labels: visibleDays.map(d => { const dt = new Date(d + "T12:00:00"); return `${dt.getDate()} ${dt.toLocaleString("en", { month: "short" })}`; }),
        datasets: commodities.map((c, i) => ({
          label: c,
          data: visibleDays.map((day) => {
            const row = mergedDaily.find((r) => r.day === day && r.commodity === c);
            return row && row.total > 0 ? row.compliance_rate : null;
          }),
          borderColor: colorForCommodity(c) || CHART_PALETTE[i % CHART_PALETTE.length],
          backgroundColor: colorForCommodity(c) || CHART_PALETTE[i % CHART_PALETTE.length],
          ...lineDefaults,
        })),
        canBack: start > 0,
        canForward: trendOffset < 0,
      };
    } else {
      // Weekly: group daily data by week
      const days = [...new Set(mergedDaily.map((d) => d.day))].sort();
      const commodities = [...new Set(mergedDaily.map((d) => d.commodity))];
      const weekMap: Record<string, Record<string, { total: number; compliant: number }>> = {};
      mergedDaily.forEach(d => {
        const dt = new Date(d.day + "T12:00:00");
        const weekStart = new Date(dt);
        weekStart.setDate(dt.getDate() - dt.getDay());
        const key = weekStart.toISOString().split("T")[0];
        if (!weekMap[key]) weekMap[key] = {};
        if (!weekMap[key][d.commodity]) weekMap[key][d.commodity] = { total: 0, compliant: 0 };
        // denominator = assessed records only, matching compliance_rate everywhere else
        weekMap[key][d.commodity].total += d.compliant + (d.non_compliant ?? 0);
        weekMap[key][d.commodity].compliant += d.compliant;
      });
      const weeks = Object.keys(weekMap).sort();
      const windowSize = 8;
      const end = weeks.length + trendOffset;
      const start = Math.max(0, end - windowSize);
      const visibleWeeks = weeks.slice(start, end > 0 ? end : weeks.length);
      return {
        labels: visibleWeeks.map(w => { const dt = new Date(w + "T12:00:00"); return `W${Math.ceil(dt.getDate()/7)} ${dt.toLocaleString("en", {month:"short"})}`; }),
        datasets: commodities.map((c, i) => ({
          label: c,
          data: visibleWeeks.map(w => {
            const d = weekMap[w]?.[c];
            return d && d.total > 0 ? Math.round((d.compliant / d.total) * 100 * 10) / 10 : null;
          }),
          borderColor: colorForCommodity(c) || CHART_PALETTE[i % CHART_PALETTE.length],
          backgroundColor: colorForCommodity(c) || CHART_PALETTE[i % CHART_PALETTE.length],
          ...lineDefaults,
        })),
        canBack: start > 0,
        canForward: trendOffset < 0,
      };
    }
  };

  const trendData = buildTrendData();
  const compTrend = { labels: trendData.labels, datasets: trendData.datasets };


  // Weekly compliance trend using real compliance percentages from monthlyComplianceTrend
  const compMonths = [...new Set((data.monthlyComplianceTrend || []).map((d) => d.month))].sort();
  const compCommodities = [...new Set((data.monthlyComplianceTrend || []).map((d) => d.commodity))];
  const weeklyData = {
    labels: compMonths.map(fmtMonth),
    datasets: compCommodities.map((c, i) => ({
      label: c,
      data: compMonths.map((m) => {
        const row = (data.monthlyComplianceTrend || []).find((r) => r.month === m && r.commodity === c);
        return row ? row.compliance_rate : 0;
      }),
      backgroundColor: colorForCommodity(c) || CHART_PALETTE[i % CHART_PALETTE.length],
    })),
  };
  const stackedOpts = {
    ...baseChartOptions(undefined, "Compliance %", { datalabelFormatter: (v: unknown) => { const n = Number(v); return !n || isNaN(n) ? "" : n.toFixed(1) + "%"; } }),
    scales: {
      x: { stacked: false, ticks: { font: { size: 10 }, maxRotation: 45 } },
      y: { beginAtZero: true, max: 100, ticks: { font: { size: 10 }, callback: (v: unknown) => v + "%" } },
    },
  };

  // Samples (exclude Eggs & Poultry)
  const filteredSamples = (data.samplesByCommodity || []).filter(d => isSampleCommodity(d.commodity));
  const samplesData = {
    labels: filteredSamples.map((d) => d.commodity),
    datasets: [{ label: "Samples", data: filteredSamples.map((d) => d.count), backgroundColor: filteredSamples.map((d) => colorForCommodity(d.commodity)) }],
  };

  // Time allocation (horizontal bar)
  const taData = {
    labels: (data.timeAllocation || []).map((d) => d.inspector_name),
    datasets: [{ label: "Hours", data: (data.timeAllocation || []).map((d) => d.total_hours), backgroundColor: "#007890" }],
  };
  const hBarOpts = {
    ...baseChartOptions(),
    indexAxis: "y" as const,
    plugins: {
      ...((baseChartOptions() as Record<string, unknown>).plugins as Record<string, unknown>),
      datalabels: { anchor: "end" as const, align: "right" as const, font: { size: 9, weight: "bold" as const }, color: "#374151", formatter: (v: unknown) => { const n = Number(v); return !n || isNaN(n) ? "" : n.toFixed(1); } },
    },
    scales: {
      x: { beginAtZero: true, ticks: { font: { size: 10 } } },
      y: { ticks: { font: { size: 10 } } },
    },
  };

  // Occurrence reports per inspector
  const orData = {
    labels: (data.occurrenceReports || []).map((d) => d.inspector_name),
    datasets: [{ label: "Reports", data: (data.occurrenceReports || []).map((d) => d.count), backgroundColor: "#EC343C", borderRadius: 4 }],
  };

  return (
    <div className="flex flex-col" style={{ gap: "1rem", marginBottom: "1rem" }}>
      <Card title="Commodity Compliance Trend (%)" icon="fas fa-chart-line" tooltip="Compliance rate trend for each commodity. Toggle between daily, weekly, and monthly views. Use arrows to scroll through time."
        headerRight={
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <button onClick={() => { setTrendOffset(o => o - 1); }} disabled={!trendData.canBack}
              style={{ padding: "3px 8px", border: "1px solid #e5e7eb", borderRadius: 4, background: trendData.canBack ? "#fff" : "#f3f4f6", cursor: trendData.canBack ? "pointer" : "default", fontSize: 12, color: trendData.canBack ? "#374151" : "#d1d5db" }}>
              <i className="fas fa-chevron-left" />
            </button>
            {(["daily", "weekly", "monthly"] as const).map(v => (
              <button key={v} onClick={() => { setTrendView(v); setTrendOffset(0); }}
                style={{ padding: "3px 10px", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: 11, fontWeight: trendView === v ? 700 : 400, background: trendView === v ? "#007890" : "#fff", color: trendView === v ? "#fff" : "#374151", cursor: "pointer" }}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
            <button onClick={() => { setTrendOffset(o => Math.min(o + 1, 0)); }} disabled={!trendData.canForward}
              style={{ padding: "3px 8px", border: "1px solid #e5e7eb", borderRadius: 4, background: trendData.canForward ? "#fff" : "#f3f4f6", cursor: trendData.canForward ? "pointer" : "default", fontSize: 12, color: trendData.canForward ? "#374151" : "#d1d5db" }}>
              <i className="fas fa-chevron-right" />
            </button>
          </div>
        }
      >
        <div style={{ overflowX: "auto", overflowY: "hidden" }}>
          <div style={{ minWidth: Math.max(600, compTrend.labels.length * 80), height: 400, position: "relative" }}>
            <DLLine data={compTrend} options={(() => {
              const base = baseChartOptions(undefined, "Compliance %");
              return {
                ...base,
                maintainAspectRatio: false,
                interaction: { mode: "index" as const, intersect: false },
                plugins: {
                  ...(base.plugins as Record<string, unknown>),
                  tooltip: {
                    enabled: true,
                    mode: "index" as const,
                    intersect: false,
                    callbacks: {
                      label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y.toFixed(1) + "%" : "N/A"}`,
                    },
                  },
                  datalabels: { display: false },
                },
              } as never;
            })()} />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: "1rem", marginBottom: "1rem" }}>
        <Card title="Monthly Compliance %" icon="fas fa-chart-line" tooltip="Monthly compliance rate per commodity — uses real approval percentages.">
          <ChartWrap height="280px"><DLBar data={weeklyData} options={{
            ...baseChartOptions(undefined, "Compliance %", { datalabels: false }),
            scales: { x: { stacked: false, ticks: { font: { size: 10 } } }, y: { beginAtZero: true, max: 100, ticks: { font: { size: 10 }, callback: (v: unknown) => v + "%" } } },
          } as never} /></ChartWrap>
        </Card>
        <Card title="Samples Taken" icon="fas fa-vial" tooltip="Total lab samples collected per commodity type.">
          <ChartWrap height="280px"><DLBar data={samplesData} options={baseChartOptions() as never} /></ChartWrap>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: "1rem", marginBottom: "1rem" }}>
        <Card title="Time Allocation (Billable Hours)" icon="fas fa-clock" tooltip="Distribution of billable hours worked across all inspectors.">
          <ChartWrap height={`${Math.max(280, (data.timeAllocation || []).length * 32)}px`}>
            <DLBar data={taData} options={hBarOpts as never} />
          </ChartWrap>
        </Card>
        <Card title={`Occurrence Reports (${data.totalOccurrenceReports})`} icon="fas fa-file-alt" tooltip="Number of occurrence reports filed per inspector.">
          <ChartWrap height="280px"><DLBar data={orData} options={baseChartOptions() as never} /></ChartWrap>
        </Card>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// PANEL 4: Operations
// ════════════════════════════════════════════════════════════════════════════════

function OperationsPanel({ data }: { data: AnalyticsData }) {
  const [opsView, setOpsView] = useState<"daily" | "weekly" | "monthly">("monthly");
  const opsLabel = opsView === "daily" ? "Daily" : opsView === "weekly" ? "Weekly" : "Monthly";

  // Build travel trend data based on selected view
  // Build travel trend data from weekly inspector trend data
  const _aggTravel = (raw: Array<Record<string, unknown>>) => {
    const km: Record<string, number> = {};
    const hrs: Record<string, number> = {};
    (raw || []).forEach(r => {
      const d = String(r.day || "");
      km[d] = (km[d] || 0) + (Number(r.total_km) || 0);
      hrs[d] = (hrs[d] || 0) + (Number(r.total_hours) || 0);
    });
    return { km, hrs, days: Object.keys(km).sort() };
  };
  const _weeklyTravel = _aggTravel(data.monthlyInspectorTrend || []);

  // For daily: use dedicated dailyTravelTrend from backend (not limited like inspectionsList)
  const _dailyTravel = (() => {
    const km: Record<string, number> = {};
    const hrs: Record<string, number> = {};
    (data.dailyTravelTrend || []).forEach(r => {
      const d = String(r.day || "").substring(0, 10);
      if (!d) return;
      km[d] = (km[d] || 0) + (r.total_km || 0);
      hrs[d] = (hrs[d] || 0) + (Number(r.total_hours) || 0);
    });
    return { km, hrs, days: Object.keys(km).sort() };
  })();

  const _src = opsView === "daily" ? _dailyTravel : _weeklyTravel;
  const _fmtLabel = (d: string) => {
    const dt = new Date(d + "T12:00:00");
    if (opsView === "daily") return `${dt.getDate()} ${dt.toLocaleString("en", { month: "short" })}`;
    return `W${Math.ceil(dt.getDate() / 7)} ${dt.toLocaleString("en", { month: "short" })}`;
  };

  const mtdData = opsView === "monthly" ? {
    labels: (data.monthlyTravelTrend || []).map((d) => fmtMonth(d.month)),
    datasets: [{ label: "KM", data: (data.monthlyTravelTrend || []).map((d) => d.total_km), borderColor: "#007890", backgroundColor: "rgba(0,120,144,0.15)", ...lineDefaults, fill: true }],
  } : {
    labels: _src.days.map(_fmtLabel),
    datasets: [{ label: "KM", data: _src.days.map(d => _src.km[d] || 0), borderColor: "#007890", backgroundColor: "rgba(0,120,144,0.15)", ...lineDefaults, fill: true }],
  };

  const thtData = opsView === "monthly" ? {
    labels: (data.monthlyTravelHoursTrend || []).map((d) => fmtMonth(d.month)),
    datasets: [{ label: "Hours", data: (data.monthlyTravelHoursTrend || []).map((d) => d.total_hours), borderColor: "#005a6b", backgroundColor: "rgba(0,90,107,0.1)", ...lineDefaults, fill: true }],
  } : {
    labels: _src.days.map(_fmtLabel),
    datasets: [{ label: "Hours", data: _src.days.map(d => _src.hrs[d] || 0), borderColor: "#005a6b", backgroundColor: "rgba(0,90,107,0.1)", ...lineDefaults, fill: true }],
  };

  // Travel distance per inspector (horizontal bar)
  const tdpData = {
    labels: (data.travelPerInspector || []).map((d) => d.inspector_name),
    datasets: [{ label: "KM", data: (data.travelPerInspector || []).map((d) => d.total_km), backgroundColor: "#007890" }],
  };
  const hBarOpts = {
    ...baseChartOptions(),
    indexAxis: "y" as const,
    plugins: {
      ...((baseChartOptions() as Record<string, unknown>).plugins as Record<string, unknown>),
      datalabels: { anchor: "end" as const, align: "right" as const, font: { size: 9, weight: "bold" as const }, color: "#374151", formatter: (v: unknown) => { const n = Number(v); return !n || isNaN(n) ? "" : (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1)); } },
    },
    scales: {
      x: { beginAtZero: true, ticks: { font: { size: 10 } } },
      y: { ticks: { font: { size: 10 } } },
    },
  };

  // Travel time per inspector (horizontal bar)
  const ttpData = {
    labels: (data.travelTimePerInspector || []).map((d) => d.inspector_name),
    datasets: [{ label: "Hours", data: (data.travelTimePerInspector || []).map((d) => d.total_hours), backgroundColor: "#005a6b" }],
  };

  // Toggle component
  const viewToggle = (
    <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid #d1d5db" }}>
      {(["daily", "weekly", "monthly"] as const).map((v, i) => (
        <button key={v} onClick={() => setOpsView(v)}
          style={{ padding: "5px 14px", fontSize: 12, fontWeight: opsView === v ? 700 : 400, background: opsView === v ? "#007890" : "#fff", color: opsView === v ? "#fff" : "#374151", border: "none", cursor: "pointer", borderLeft: i > 0 ? "1px solid #d1d5db" : "none" }}>
          <i className={`fas ${v === "daily" ? "fa-calendar-day" : v === "weekly" ? "fa-calendar-week" : "fa-calendar-alt"}`} style={{ marginRight: 4 }} />{v.charAt(0).toUpperCase() + v.slice(1)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col" style={{ gap: "1rem", marginBottom: "1rem" }}>
      {/* Toggle */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>{viewToggle}</div>

      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: "1rem", marginBottom: "1rem" }}>
        <Card title={`${opsLabel} Travel Distance (km)`} icon="fas fa-chart-area" tooltip="Total kilometres driven by all inspectors.">
          <ChartWrap height="180px"><DLLine data={mtdData} options={baseChartOptions(undefined, "KM", { datalabels: false }) as never} /></ChartWrap>
        </Card>
        <Card title={`Travel Hours Trend (${opsLabel})`} icon="fas fa-chart-line" tooltip="Trend of hours spent travelling by all inspectors.">
          <ChartWrap height="180px"><DLLine data={thtData} options={baseChartOptions(undefined, "Hours", { datalabels: false }) as never} /></ChartWrap>
        </Card>
      </div>
      <Card title="Travel Distance Per Inspector" icon="fas fa-route" tooltip="Total kilometres driven by each inspector for the selected period.">
        <ChartWrap height={`${Math.max(350, (data.travelPerInspector || []).length * 32)}px`}>
          <DLBar data={tdpData} options={hBarOpts as never} />
        </ChartWrap>
      </Card>
      <Card title="Travel Time Per Inspector (Hours)" icon="fas fa-car" tooltip="Total travel hours logged by each inspector.">
        <ChartWrap height={`${Math.max(350, (data.travelTimePerInspector || []).length * 32)}px`}>
          <DLBar data={ttpData} options={hBarOpts as never} />
        </ChartWrap>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// PANEL 5: Timelines
// ════════════════════════════════════════════════════════════════════════════════

function TimelinesPanel({ data }: { data: AnalyticsData }) {
  const [timelineView, setTimelineView] = useState<"daily" | "weekly" | "monthly">("weekly");
  // Days are always shown as whole numbers (no decimal point).
  const lineOpts = baseChartOptions(undefined, "Avg Days", { datalabelFormatter: (v: number) => { const n = Number(v); return !n || isNaN(n) ? "" : String(Math.round(n)); } });

  const isWeekly = timelineView === "weekly";
  const isDaily = timelineView === "daily";
  const viewLabel = isDaily ? "Daily" : isWeekly ? "Weekly" : "Monthly";

  const docSendTrend = isDaily ? {
    labels: (data.dailyDocSendTrend || data.weeklyDocSendTrend || []).map((d: Record<string, unknown>) => String(d.day || d.week)),
    datasets: [{ label: "Avg Days", data: (data.dailyDocSendTrend || data.weeklyDocSendTrend || []).map((d: Record<string, unknown>) => Number(d.avg_days)), borderColor: "#007890", backgroundColor: "rgba(0,120,144,0.1)", ...lineDefaults, fill: true }],
  } : isWeekly ? {
    labels: (data.weeklyDocSendTrend || []).map((d) => d.week),
    datasets: [{ label: "Avg Days", data: (data.weeklyDocSendTrend || []).map((d) => d.avg_days), borderColor: "#007890", backgroundColor: "rgba(0,120,144,0.1)", ...lineDefaults, fill: true }],
  } : {
    labels: (data.monthlyDocSendTrend || []).map((d) => fmtMonth(d.month)),
    datasets: [{ label: "Avg Days", data: (data.monthlyDocSendTrend || []).map((d) => d.avg_days), borderColor: "#007890", backgroundColor: "rgba(0,120,144,0.1)", ...lineDefaults, fill: true }],
  };
  const invoiceTrend = isDaily ? {
    labels: (data.dailyInvoiceTrend || data.weeklyInvoiceTrend || []).map((d: Record<string, unknown>) => String(d.day || d.week)),
    datasets: [{ label: "Avg Days", data: (data.dailyInvoiceTrend || data.weeklyInvoiceTrend || []).map((d: Record<string, unknown>) => Number(d.avg_days)), borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.1)", ...lineDefaults, fill: true }],
  } : isWeekly ? {
    labels: (data.weeklyInvoiceTrend || []).map((d) => d.week),
    datasets: [{ label: "Avg Days", data: (data.weeklyInvoiceTrend || []).map((d) => d.avg_days), borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.1)", ...lineDefaults, fill: true }],
  } : {
    labels: (data.monthlyInvoiceTrend || []).map((d) => fmtMonth(d.month)),
    datasets: [{ label: "Avg Days", data: (data.monthlyInvoiceTrend || []).map((d) => d.avg_days), borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.1)", ...lineDefaults, fill: true }],
  };
  const coaTrend = isDaily ? {
    labels: (data.dailyCoaTrend || data.weeklyCoaTrend || []).map((d: Record<string, unknown>) => String(d.day || d.week)),
    datasets: [{ label: "Avg Days", data: (data.dailyCoaTrend || data.weeklyCoaTrend || []).map((d: Record<string, unknown>) => Number(d.avg_days)), borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.1)", ...lineDefaults, fill: true }],
  } : isWeekly ? {
    labels: (data.weeklyCoaTrend || []).map((d) => d.week),
    datasets: [{ label: "Avg Days", data: (data.weeklyCoaTrend || []).map((d) => d.avg_days), borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.1)", ...lineDefaults, fill: true }],
  } : {
    labels: (data.monthlyCoaTrend || []).map((d) => fmtMonth(d.month)),
    datasets: [{ label: "Avg Days", data: (data.monthlyCoaTrend || []).map((d) => d.avg_days), borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.1)", ...lineDefaults, fill: true }],
  };
  const approvalTrend = isDaily ? {
    labels: (data.dailyApprovalTrend || data.weeklyApprovalTrend || []).map((d: Record<string, unknown>) => String(d.day || d.week)),
    datasets: [{ label: "Avg Days", data: (data.dailyApprovalTrend || data.weeklyApprovalTrend || []).map((d: Record<string, unknown>) => Number(d.avg_days)), borderColor: "#005a6b", backgroundColor: "rgba(0,90,107,0.1)", ...lineDefaults, fill: true }],
  } : isWeekly ? {
    labels: (data.weeklyApprovalTrend || []).map((d) => d.week),
    datasets: [{ label: "Avg Days", data: (data.weeklyApprovalTrend || []).map((d) => d.avg_days), borderColor: "#005a6b", backgroundColor: "rgba(0,90,107,0.1)", ...lineDefaults, fill: true }],
  } : {
    labels: (data.monthlyApprovalTrend || []).map((d) => fmtMonth(d.month)),
    datasets: [{ label: "Avg Days", data: (data.monthlyApprovalTrend || []).map((d) => d.avg_days), borderColor: "#005a6b", backgroundColor: "rgba(0,90,107,0.1)", ...lineDefaults, fill: true }],
  };

  const hBarOpts = {
    ...baseChartOptions(),
    indexAxis: "y" as const,
    plugins: {
      ...((baseChartOptions() as Record<string, unknown>).plugins as Record<string, unknown>),
      datalabels: { anchor: "end" as const, align: "right" as const, font: { size: 9, weight: "bold" as const }, color: "#374151", formatter: (v: unknown) => { const n = Number(v); return !n || isNaN(n) ? "" : String(Math.round(n)); } },
    },
    scales: {
      x: { beginAtZero: true, ticks: { font: { size: 10 } }, title: { display: true, text: "Avg Days", font: { size: 11 } } },
      y: { ticks: { font: { size: 10 } } },
    },
  };

  const docSendBar = {
    labels: (data.docSendTime || []).map((d) => d.name),
    datasets: [{ label: "Avg Days", data: (data.docSendTime || []).map((d) => d.avg_days), backgroundColor: "#0078d4" }],
  };
  const invoiceBar = {
    labels: (data.invoiceUploadTime || []).map((d) => d.name),
    datasets: [{ label: "Avg Days", data: (data.invoiceUploadTime || []).map((d) => d.avg_days), backgroundColor: "#f59e0b" }],
  };
  const coaBar = {
    labels: (data.coaAnalysisTime || []).map((d) => d.commodity),
    datasets: [{ label: "Avg Days", data: (data.coaAnalysisTime || []).map((d) => d.avg_days), backgroundColor: "#10b981" }],
  };
  const approvalBar = {
    labels: (data.approvalTime || []).map((d) => d.inspector_name),
    datasets: [{ label: "Avg Days", data: (data.approvalTime || []).map((d) => d.avg_days), backgroundColor: "#8764b8" }],
  };

  // Determine which sections have data
  const hasDocSendData = (data.docSendTime || []).length > 0 || (data.dailyDocSendTrend || data.weeklyDocSendTrend || data.monthlyDocSendTrend || []).length > 0;
  const hasInvoiceData = (data.invoiceUploadTime || []).length > 0 || (data.dailyInvoiceTrend || data.weeklyInvoiceTrend || data.monthlyInvoiceTrend || []).length > 0;
  const hasCoaData = (data.coaAnalysisTime || []).length > 0 || (data.dailyCoaTrend || data.weeklyCoaTrend || data.monthlyCoaTrend || []).length > 0;
  const hasApprovalData = (data.approvalTime || []).length > 0 || (data.dailyApprovalTrend || data.weeklyApprovalTrend || data.monthlyApprovalTrend || []).length > 0;

  const trendCards = [
    hasDocSendData && { title: `Doc Send Time Trend (${viewLabel})`, data: docSendTrend, tooltip: `${viewLabel} average days between inspection and document dispatch.` },
    hasInvoiceData && { title: `Invoice Upload Time Trend (${viewLabel})`, data: invoiceTrend, tooltip: `${viewLabel} average days between inspection and invoice upload.` },
    hasCoaData && { title: `COA Upload Time Trend (${viewLabel})`, data: coaTrend, tooltip: `${viewLabel} average days from sample collection to Certificate of Analysis upload.` },
    hasApprovalData && { title: `Approval Time Trend (${viewLabel})`, data: approvalTrend, tooltip: `${viewLabel} average days from document submission to final approval.` },
  ].filter(Boolean) as { title: string; data: typeof docSendTrend; tooltip: string }[];

  const barCards = [
    hasDocSendData && { title: "Avg Days to Send Documents", icon: "fas fa-paper-plane", data: docSendBar, tooltip: "Average days each inspector takes to send documents after an inspection." },
    hasInvoiceData && { title: "Avg Days to Upload Invoice", icon: "fas fa-file-invoice-dollar", data: invoiceBar, tooltip: "Average days each inspector takes to upload their invoice." },
    hasCoaData && { title: "Avg Days: Sample to COA Upload", icon: "fas fa-flask", data: coaBar, tooltip: "Average days from sample collection to COA upload per inspector." },
    hasApprovalData && { title: "Avg Days to Approval", icon: "fas fa-hourglass-half", data: approvalBar, tooltip: "Average days from submission to approval per inspector." },
  ].filter(Boolean) as { title: string; icon: string; data: typeof docSendBar; tooltip: string }[];

  if (!hasDocSendData && !hasInvoiceData && !hasCoaData && !hasApprovalData) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ padding: "3rem", color: "#9ca3af" }}>
        <i className="fas fa-clock" style={{ fontSize: "2.5rem", marginBottom: 12 }} />
        <p style={{ fontSize: "0.9rem" }}>No upload time data available for the selected period.</p>
      </div>
    );
  }

  // Count-weighted overall averages (in days) for the clear summary blocks.
  const wAvg = (rows: { avg_days: number; count: number }[]) => {
    const c = rows.reduce((s, r) => s + (r.count || 0), 0);
    return c ? rows.reduce((s, r) => s + (r.avg_days || 0) * (r.count || 0), 0) / c : 0;
  };
  const summaryStats = [
    hasApprovalData && { label: "Avg Days to Approval", value: wAvg(data.approvalTime || []), color: "#8764b8" },
    hasDocSendData && { label: "Avg Days to Send Docs", value: wAvg(data.docSendTime || []), color: "#0078d4" },
    hasInvoiceData && { label: "Avg Days to Invoice", value: wAvg(data.invoiceUploadTime || []), color: "#f59e0b" },
    hasCoaData && { label: "Avg Days: Sample → COA", value: wAvg(data.coaAnalysisTime || []), color: "#10b981" },
  ].filter(Boolean) as { label: string; value: number; color: string }[];

  return (
    <div className="flex flex-col" style={{ gap: "1rem", marginBottom: "1rem" }}>
      {/* Clear white summary blocks — average days for each stage (easy to read) */}
      <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: "0.75rem" }}>
        {summaryStats.map(s => (
          <div key={s.label} className="bg-white rounded-md border border-gray-200 text-center" style={{ padding: "0.9rem 0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: "1.9rem", fontWeight: 700, color: s.color, lineHeight: 1.15 }}>{Math.round(s.value)}</div>
            <div style={{ fontSize: "0.7rem", color: "#6b7280", marginTop: 2, fontWeight: 600 }}>days</div>
            <div style={{ fontSize: "0.72rem", color: "#374151", marginTop: 4, fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.4px" }}>{s.label}</div>
          </div>
        ))}
      </div>
      {/* Outstanding / incomplete actions + who is responsible for the next step */}
      {data.outstandingByStage && data.outstandingByStage.length > 0 && (
        <div className="bg-white rounded-md border border-gray-200" style={{ padding: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#111827", marginBottom: 2 }}>
            <i className="fas fa-list-check" style={{ color: "#007890", marginRight: 6 }} />Outstanding actions — who owns the next step
          </div>
          <div style={{ fontSize: "0.72rem", color: "#6b7280", marginBottom: 10 }}>
            Jobs that still need something done, and who needs to do it. This is the whole backlog — the filters above don&apos;t change these numbers.{" "}
            <b style={{ color: "#dc2626" }}>{data.outstandingTotal}</b> still to do · <b style={{ color: "#15803d" }}>{data.completedTotal}</b> done.
            Each job appears under just one office step — approval, then sending, then invoicing — whichever comes next.{" "}
            <b>Waiting for COA</b> is the lab&apos;s own queue (any sampled job with no result yet), so it&apos;s counted separately and a job can be here and in an office step at the same time.
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: "0.75rem" }}>
            {data.outstandingByStage.map((s, i) => {
              const c = ["#7c3aed", "#d97706", "#0891b2", "#2563eb"][i % 4];
              return (
                <div key={s.stage} style={{ borderTop: `3px solid ${c}`, border: "1px solid #e5e7eb", borderRadius: 8, padding: "0.75rem", textAlign: "center", background: s.parallel ? "#f8fafc" : "#fff" }}>
                  <div style={{ fontSize: "1.6rem", fontWeight: 800, color: c, lineHeight: 1.1 }}>{s.count}</div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#111827", marginTop: 3 }}>{s.stage}</div>
                  <div style={{ fontSize: "0.68rem", color: "#6b7280", marginTop: 4 }}>
                    <i className="fas fa-user-clock" style={{ marginRight: 3, opacity: 0.7 }} />Responsible: {s.responsible}
                  </div>
                  {s.parallel && <div style={{ fontSize: "0.6rem", color: "#94a3b8", marginTop: 2, fontStyle: "italic" }}>runs in parallel</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Weekly / Monthly toggle */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid #d1d5db" }}>
          {(["daily", "weekly", "monthly"] as const).map((v, i) => (
            <button key={v} onClick={() => setTimelineView(v)}
              style={{ padding: "5px 14px", fontSize: 12, fontWeight: timelineView === v ? 700 : 400, background: timelineView === v ? "#007890" : "#fff", color: timelineView === v ? "#fff" : "#374151", border: "none", cursor: "pointer", borderLeft: i > 0 ? "1px solid #d1d5db" : "none" }}>
              <i className={`fas ${v === "daily" ? "fa-calendar-day" : v === "weekly" ? "fa-calendar-week" : "fa-calendar-alt"}`} style={{ marginRight: 4 }} />{v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {/* Trend line charts - only show cards with data */}
      {trendCards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: "1rem", marginBottom: "1rem" }}>
          {trendCards.map(c => (
            <Card key={c.title} title={c.title} icon="fas fa-chart-line" tooltip={c.tooltip}>
              <ChartWrap height="180px"><DLLine data={c.data} options={lineOpts as never} /></ChartWrap>
            </Card>
          ))}
        </div>
      )}
      {/* Bar charts - only show cards with data */}
      {barCards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: "1rem", marginBottom: "1rem" }}>
          {barCards.map(c => (
            <Card key={c.title} title={c.title} icon={c.icon} tooltip={c.tooltip}>
              <ChartWrap height="280px"><DLBar data={c.data} options={hBarOpts as never} /></ChartWrap>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// PANEL 6: Financial
// ════════════════════════════════════════════════════════════════════════════════

interface FinancialPanelProps {
  data: AnalyticsData;
  salaries: Record<string, { salary: number; employee_number: string }>;
  expenseLog: Array<{ id: string; inspector: string; amount: number; description: string; date: string }>;
  xeroStatus: { connected: boolean; org_name?: string };
  xeroInvoices: { invoices: Array<Record<string, unknown>>; aging: Record<string, number>; total_count?: number };
  xeroPage: number;
  setXeroPage: (p: number) => void;
  xeroSyncing: boolean;
  onXeroSync: () => void;
  onXeroConnect: () => void;
  onXeroDisconnect: () => void;
  onOpenSalaryModal: () => void;
  onOpenExpenseModal: () => void;
  userRole?: string;
  userFullName?: string;
}

function FinancialPanel({ data, salaries, expenseLog, xeroStatus, xeroInvoices, xeroPage, setXeroPage, xeroSyncing, onXeroSync, onXeroConnect, onXeroDisconnect, onOpenSalaryModal, onOpenExpenseModal, userRole, userFullName }: FinancialPanelProps) {
  const isInspectorRole = userRole === "inspector";
  const isAdminRole = userRole === "admin";

  // Filter financial data: inspectors see only their own row, admins see only their row
  const allFin = data.inspectorFinancials ?? [];
  const fin = (isInspectorRole || isAdminRole) && userFullName
    ? allFin.filter(r => r.inspector_name.toLowerCase().includes(userFullName.toLowerCase()) || userFullName.toLowerCase().includes(r.inspector_name.toLowerCase()))
    : allFin;

  const [finPeriod, setFinPeriod] = useState("all");
  const [perfMetric, setPerfMetric] = useState("total_profit");

  // Filter financial data by period
  const filteredFin = useMemo(() => {
    if (finPeriod === "all") return fin;
    const now = new Date();
    const inspList = data.inspectionsList || [];
    let cutoff: Date;
    if (finPeriod === "daily") { cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
    else if (finPeriod === "weekly") { cutoff = new Date(now); cutoff.setDate(now.getDate() - 7); }
    else if (finPeriod === "120+") { cutoff = new Date(now); cutoff.setDate(now.getDate() - 120); }
    else { cutoff = new Date(now); cutoff.setDate(now.getDate() - Number(finPeriod)); }
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const is120Plus = finPeriod === "120+";
    // Get inspectors with inspections in the period
    const inspectorCounts: Record<string, { inspections: number; hours: number; km: number; samples: number }> = {};
    inspList.forEach(i => {
      const d = i.date_of_inspection || "";
      const inRange = is120Plus ? d < cutoffStr : d >= cutoffStr;
      if (!inRange) return;
      if (!inspectorCounts[i.inspector_name]) inspectorCounts[i.inspector_name] = { inspections: 0, hours: 0, km: 0, samples: 0 };
      inspectorCounts[i.inspector_name].inspections++;
    });
    // Scale fin proportionally based on filtered inspection count
    return fin.map(r => {
      const filtered = inspectorCounts[r.inspector_name];
      if (!filtered) return { ...r, total_inspections: 0, total_hours: 0, total_km: 0, total_samples: 0, inspection_time: 0, revenue_hours: 0, revenue_km: 0, revenue_samples: 0, total_revenue: 0, months_active: 0 };
      const ratio = r.total_inspections > 0 ? filtered.inspections / r.total_inspections : 0;
      return {
        ...r,
        total_inspections: filtered.inspections,
        total_hours: Math.round(r.total_hours * ratio * 10) / 10,
        total_km: Math.round(r.total_km * ratio),
        total_samples: Math.round(r.total_samples * ratio),
        inspection_time: Math.round(r.inspection_time * ratio * 10) / 10,
        revenue_hours: Math.round(r.revenue_hours * ratio),
        revenue_km: Math.round(r.revenue_km * ratio),
        revenue_samples: Math.round(r.revenue_samples * ratio),
        total_revenue: Math.round(r.total_revenue * ratio),
        // Scale salary period the same way as revenue so cost covers the same
        // slice of work — otherwise profit is overstated on any filter but "All Time".
        months_active: (r.months_active || 1) * ratio,
      };
    }).filter(r => r.total_inspections > 0);
  }, [fin, finPeriod, data.inspectionsList]);

  // Get expense total for an inspector
  const getExpenses = (name: string) => expenseLog.filter(e => e.inspector === name).reduce((s, e) => s + e.amount, 0);
  // Get salary for an inspector
  const getSalary = (name: string) => lookupSalary(salaries, name);

  // Build enriched rows
  const rows = filteredFin.map(r => {
    // Salary is monthly CTC — scale to the months the inspector actually
    // worked in the filtered range so cost covers the same period as revenue
    const monthsActive = r.months_active || 1;
    const salary = getSalary(r.inspector_name) * monthsActive;
    const expenses = getExpenses(r.inspector_name);
    const mgmtFees = (salary + expenses) * 0.20; // 20% of (salary + expenses)
    const totalCost = salary + expenses + mgmtFees;
    const revPerHr = r.total_hours > 0 ? Math.round(r.total_revenue / r.total_hours) : 0;
    const costPerHr = r.total_hours > 0 ? Math.round(totalCost / r.total_hours) : 0;
    const profit = r.total_revenue - totalCost;
    return { ...r, salary, expenses, mgmtFees, totalCost, revPerHr, costPerHr, profit };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      inspections: acc.inspections + r.total_inspections,
      hours: acc.hours + r.total_hours,
      km: acc.km + r.total_km,
      samples: acc.samples + r.total_samples,
      inspection_time: acc.inspection_time + r.inspection_time,
      revenue_hours: acc.revenue_hours + r.revenue_hours,
      revenue_km: acc.revenue_km + r.revenue_km,
      revenue_samples: acc.revenue_samples + r.revenue_samples,
      total_revenue: acc.total_revenue + r.total_revenue,
      salary: acc.salary + r.salary,
      expenses: acc.expenses + r.expenses,
      mgmtFees: acc.mgmtFees + r.mgmtFees,
      totalCost: acc.totalCost + r.totalCost,
      profit: acc.profit + r.profit,
    }),
    { inspections: 0, hours: 0, km: 0, samples: 0, inspection_time: 0, revenue_hours: 0, revenue_km: 0, revenue_samples: 0, total_revenue: 0, salary: 0, expenses: 0, mgmtFees: 0, totalCost: 0, profit: 0 }
  );
  const totalRevPerHr = totals.hours > 0 ? Math.round(totals.total_revenue / totals.hours) : 0;
  const totalCostPerHr = totals.hours > 0 ? Math.round(totals.totalCost / totals.hours) : 0;

  // Revenue sources stacked bar — sorted by total revenue descending
  const sortedFin = [...filteredFin].sort((a, b) => b.total_revenue - a.total_revenue);
  const revSourceData = {
    labels: sortedFin.map((d) => d.inspector_name),
    datasets: [
      { label: "Rev (Hours)", data: sortedFin.map((d) => d.revenue_hours), backgroundColor: "#007890" },
      { label: "Rev (KM)", data: sortedFin.map((d) => d.revenue_km), backgroundColor: "#f59e0b" },
      { label: "Rev (Samples)", data: sortedFin.map((d) => d.revenue_samples), backgroundColor: "#10b981" },
    ],
  };
  const stackedOpts = {
    ...baseChartOptions(),
    layout: { padding: { top: 30 } },
    plugins: {
      ...((baseChartOptions() as Record<string, unknown>).plugins as Record<string, unknown>),
      datalabels: {
        display: (ctx: { datasetIndex: number; chart: { data: { datasets: unknown[] } } }) => ctx.datasetIndex === ctx.chart.data.datasets.length - 1,
        anchor: "end" as const,
        align: "top" as const,
        font: { size: 11, weight: "bold" as const },
        color: "#1f2937",
        formatter: (_v: number, ctx: { dataIndex: number; chart: { data: { datasets: Array<{ data: number[] }> } } }) => {
          const total = ctx.chart.data.datasets.reduce((s, ds) => s + (ds.data[ctx.dataIndex] || 0), 0);
          return "R " + Math.round(total).toLocaleString();
        },
      },
    },
    scales: {
      x: { stacked: true, ticks: { font: { size: 10 }, maxRotation: 45, autoSkip: false } },
      y: { stacked: true, beginAtZero: true, ticks: { font: { size: 10 }, callback: (v: unknown) => "R " + Number(v).toLocaleString() } },
    },
  };

  // Inspector performance - metric selector
  const perfMetricLabel: Record<string, string> = {
    total_profit: "Profit", total_revenue: "Revenue", revenue_hours: "Revenue (Hours)",
    revenue_km: "Revenue (KM)", revenue_samples: "Revenue (Samples)",
    total_hours: "Billable Hours", total_km: "KM Traveled",
    inspection_time: "On-Site Hours", total_inspections: "Inspections",
  };
  const sortedRows = [...rows].sort((a, b) => {
    const av = perfMetric === "total_profit" ? a.profit : ((a as Record<string, unknown>)[perfMetric] as number ?? 0);
    const bv = perfMetric === "total_profit" ? b.profit : ((b as Record<string, unknown>)[perfMetric] as number ?? 0);
    return bv - av;
  });
  const perfValues = sortedRows.map(r => {
    if (perfMetric === "total_profit") return r.profit;
    return (r as Record<string, unknown>)[perfMetric] as number ?? 0;
  });
  const perfData = {
    labels: sortedRows.map(r => r.inspector_name),
    datasets: [{
      label: perfMetricLabel[perfMetric] ?? perfMetric,
      data: perfValues,
      backgroundColor: perfValues.map(v => v >= 0 ? "#10b981" : "#ef4444"),
    }],
  };
  const perfOpts = {
    ...baseChartOptions(),
    layout: { padding: { top: 30 } },
    plugins: {
      ...((baseChartOptions() as Record<string, unknown>).plugins as Record<string, unknown>),
      datalabels: {
        anchor: "end" as const,
        align: "top" as const,
        font: { size: 11, weight: "bold" as const },
        color: "#1f2937",
        formatter: (v: number) => {
          if (perfMetric.includes("revenue") || perfMetric.includes("profit") || perfMetric.includes("cost")) return "R " + Math.round(v).toLocaleString();
          return v.toLocaleString();
        },
      },
    },
    scales: {
      x: { ticks: { font: { size: 10 }, maxRotation: 45, autoSkip: false } },
      y: { beginAtZero: true, ticks: { font: { size: 10 }, callback: (v: unknown) => perfMetric.includes("revenue") || perfMetric.includes("profit") || perfMetric.includes("cost") ? "R " + Number(v).toLocaleString() : String(v) } },
    },
  };

  // Xero
  const XERO_PER_PAGE = 50;
  const xeroTotal = xeroInvoices.total_count ?? xeroInvoices.invoices.length;
  const xeroTotalPages = Math.max(1, Math.ceil(xeroTotal / XERO_PER_PAGE));
  const xeroSlice = xeroInvoices.invoices.slice((xeroPage - 1) * XERO_PER_PAGE, xeroPage * XERO_PER_PAGE);
  const aging = xeroInvoices.aging ?? {};
  const agingBuckets = [
    { label: "Current", key: "current", color: "#10b981" },
    { label: "1-30 Days", key: "1_30", color: "#3b82f6" },
    { label: "31-60 Days", key: "31_60", color: "#f59e0b" },
    { label: "61-90 Days", key: "61_90", color: "#f97316" },
    { label: "91-120 Days", key: "91_120", color: "#ef4444" },
    { label: "120+ Days", key: "120_plus", color: "#991b1b" },
  ];

  const fmtR = (v: unknown) => { const n = Number(v); return isNaN(n) ? "—" : "R" + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const fmtRInt = (v: number) => v === 0 ? "—" : "R" + v.toLocaleString("en-ZA");

  const thStyle: React.CSSProperties = { background: "#e6f3f7", padding: "0.25rem 0.2rem", fontWeight: 600, fontSize: "0.55rem", textAlign: "center", whiteSpace: "nowrap", borderBottom: "2px solid #e5e7eb", textTransform: "uppercase", letterSpacing: "0.1px" };
  const tdStyle: React.CSSProperties = { padding: "0.2rem 0.2rem", fontSize: "0.6rem", borderBottom: "1px solid #e5e7eb", textAlign: "center", fontVariantNumeric: "tabular-nums" };
  const totalStyle: React.CSSProperties = { ...tdStyle, fontWeight: 700, background: "#e6f3f7", borderTop: "2px solid #007890" };
  const costThStyle: React.CSSProperties = { ...thStyle, background: "#fff7ed" };
  const profitThStyle: React.CSSProperties = { ...thStyle, background: "#f0fdf4" };

  return (
    <div className="flex flex-col" style={{ gap: "1rem", marginBottom: "1rem" }}>
      {/* Revenue Table */}
      <Card title="Revenue Per Inspector" icon="fas fa-money-bill-wave" tooltip="Detailed revenue, cost, and profit breakdown per inspector including hours, KM, and samples revenue."
        headerRight={
          <div className="analytics-fin-btns" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select value={finPeriod} onChange={e => setFinPeriod(e.target.value)} style={{ fontSize: 11, padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, background: "white", color: "#374151", cursor: "pointer", minWidth: 130 }}>
              <option value="all">All Time</option>
              <option value="daily">Today</option>
              <option value="weekly">This Week</option>
              <option value="30">Last 30 Days</option>
              <option value="60">Last 60 Days</option>
              <option value="90">Last 90 Days</option>
              <option value="120">Last 120 Days</option>
              <option value="120+">120+ Days</option>
            </select>
            {!isInspectorRole && (
              <button onClick={onOpenExpenseModal} style={{ fontSize: 12, padding: "6px 14px", border: "1px solid #f59e0b", borderRadius: 6, background: "#f59e0b", color: "white", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <i className="fas fa-receipt" /> Log Expense
              </button>
            )}
            {!isInspectorRole && (
              <button onClick={onOpenSalaryModal} style={{ fontSize: 12, padding: "6px 14px", border: "1px solid #007890", borderRadius: 6, background: "#007890", color: "white", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <i className="fas fa-edit" /> Edit Salaries
              </button>
            )}
          </div>
        }
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: "left", position: "sticky", left: 0, zIndex: 1 }}>Inspector</th>
                <th style={thStyle} title="Total number of inspections completed">Insp</th>
                <th style={thStyle} title="Total billable hours">Bill Hrs</th>
                <th style={thStyle} title="Total kilometers traveled">KM</th>
                <th style={thStyle} title="On-site hours at facility">Site Hrs</th>
                <th style={thStyle} title="Revenue from hours">Rev(Hrs)</th>
                <th style={thStyle} title="Revenue from KM">Rev(KM)</th>
                <th style={thStyle} title="Revenue from samples">Rev(Smp)</th>
                <th style={thStyle} title="Total Revenue">Tot Rev</th>
                <th style={costThStyle} title="Salary cost for the filtered period (monthly CTC × months the inspector worked in range)">Salary</th>
                <th style={costThStyle} title="Logged expenses">Exp</th>
                <th style={costThStyle} title="Management Fees = 20% × (Salary+Expenses)">Mgmt</th>
                <th style={costThStyle} title="Total Cost">Tot Cost</th>
                <th style={profitThStyle} title="Revenue per hour">R/Hr</th>
                <th style={profitThStyle} title="Cost per hour">C/Hr</th>
                <th style={profitThStyle} title="Profit = Revenue − Cost">Profit</th>
                <th style={thStyle} title="Outstanding debtors amount">Debtors</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.inspector_name} className="hover:bg-[rgba(0,120,144,0.05)]">
                  <td style={{ ...tdStyle, textAlign: "left", fontWeight: 500, position: "sticky", left: 0, background: "white", zIndex: 1 }}>{r.inspector_name}</td>
                  <td style={tdStyle}>{r.total_inspections}</td>
                  <td style={tdStyle}>{r.total_hours > 0 ? r.total_hours.toFixed(1) : "-"}</td>
                  <td style={tdStyle}>{r.total_km > 0 ? r.total_km.toLocaleString("en-ZA") : "-"}</td>
                  <td style={tdStyle}>{r.inspection_time > 0 ? r.inspection_time.toFixed(1) : "-"}</td>
                  <td style={tdStyle}>{fmtRInt(Math.round(r.revenue_hours))}</td>
                  <td style={tdStyle}>{fmtRInt(Math.round(r.revenue_km))}</td>
                  <td style={tdStyle}>{fmtRInt(Math.round(r.revenue_samples))}</td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: "#059669" }}>{fmtRInt(Math.round(r.total_revenue))}</td>
                  <td style={{ ...tdStyle, color: "#dc2626" }}>{r.salary > 0 ? fmtRInt(Math.round(r.salary)) : "—"}</td>
                  <td style={{ ...tdStyle, color: r.expenses > 0 ? "#dc2626" : undefined }}>{r.expenses > 0 ? fmtRInt(Math.round(r.expenses)) : "—"}</td>
                  <td style={{ ...tdStyle, color: "#dc2626" }}>{r.mgmtFees > 0 ? fmtRInt(Math.round(r.mgmtFees)) : "—"}</td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: "#dc2626" }}>{r.totalCost > 0 ? fmtRInt(Math.round(r.totalCost)) : "—"}</td>
                  <td style={{ ...tdStyle, color: "#059669" }}>{r.revPerHr > 0 ? fmtRInt(r.revPerHr) : "—"}</td>
                  <td style={{ ...tdStyle, color: "#dc2626" }}>{r.costPerHr > 0 ? fmtRInt(r.costPerHr) : "—"}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: r.profit >= 0 ? "#059669" : "#dc2626" }}>{r.total_revenue > 0 || r.totalCost > 0 ? fmtRInt(Math.round(r.profit)) : "—"}</td>
                  <td style={{ ...tdStyle, color: "#6b7280" }}>—</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...totalStyle, textAlign: "left", position: "sticky", left: 0, zIndex: 1 }}>Total</td>
                <td style={totalStyle}>{totals.inspections}</td>
                <td style={totalStyle}>{totals.hours.toFixed(1)}</td>
                <td style={totalStyle}>{totals.km.toLocaleString("en-ZA")}</td>
                <td style={totalStyle}>{totals.inspection_time.toFixed(1)}</td>
                <td style={totalStyle}>{fmtRInt(Math.round(totals.revenue_hours))}</td>
                <td style={totalStyle}>{fmtRInt(Math.round(totals.revenue_km))}</td>
                <td style={totalStyle}>{fmtRInt(Math.round(totals.revenue_samples))}</td>
                <td style={{ ...totalStyle, color: "#059669" }}>{fmtRInt(Math.round(totals.total_revenue))}</td>
                <td style={{ ...totalStyle, color: "#dc2626" }}>{fmtRInt(Math.round(totals.salary))}</td>
                <td style={{ ...totalStyle, color: "#dc2626" }}>{totals.expenses > 0 ? fmtRInt(Math.round(totals.expenses)) : "R0"}</td>
                <td style={{ ...totalStyle, color: "#dc2626" }}>{fmtRInt(Math.round(totals.mgmtFees))}</td>
                <td style={{ ...totalStyle, color: "#dc2626" }}>{fmtRInt(Math.round(totals.totalCost))}</td>
                <td style={{ ...totalStyle, color: "#059669" }}>{fmtRInt(totalRevPerHr)}</td>
                <td style={{ ...totalStyle, color: "#dc2626" }}>{fmtRInt(totalCostPerHr)}</td>
                <td style={{ ...totalStyle, fontWeight: 700, color: totals.profit >= 0 ? "#059669" : "#dc2626" }}>{fmtRInt(Math.round(totals.profit))}</td>
                <td style={{ ...totalStyle, color: "#6b7280" }}>—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Revenue Sources — full width */}
      <Card title="Revenue Sources" icon="fas fa-chart-bar" tooltip="Shows where each inspector's revenue comes from: hours billed, kilometres driven, and samples collected.">
        <ChartWrap height="450px">
          <DLBar data={revSourceData} options={stackedOpts as never} />
        </ChartWrap>
      </Card>

      {/* Inspector Performance — full width */}
      <Card title="Inspector Performance" icon="fas fa-chart-line" tooltip="Compare inspectors side by side on any metric: profit, revenue, hours, kilometres, or inspections."
        headerRight={
          <select value={perfMetric} onChange={e => setPerfMetric(e.target.value)} style={{ minWidth: 160, fontSize: 11, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, background: "white" }}>
            {Object.entries(perfMetricLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        }
      >
        <ChartWrap height="450px">
          <DLBar data={perfData} options={perfOpts as never} />
        </ChartWrap>
      </Card>

    </div>
  );
}
