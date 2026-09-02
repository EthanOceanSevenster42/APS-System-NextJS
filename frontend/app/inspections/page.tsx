"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import MultiSelectDropdown from "@/components/ui/MultiSelectDropdown";

interface Product {
  id: number;
  commodity: string;
  product_name: string;
  product_class: string;
  dna: boolean;
  fat: boolean;
  protein: boolean;
  calcium: boolean;
  is_direction_present_for_this_inspection: boolean;
  is_product_compliant: boolean;
  is_sample_taken: boolean;
  needs_retest: string;
  coa_uploaded: boolean;
  compliance_uploaded: boolean;
  composition_uploaded: boolean;
  occurrence_uploaded: boolean;
  retest_uploaded: boolean;
  other_uploaded: boolean;
  lab_form_uploaded: boolean;
  lab?: string;
}

function normalizeProduct(p: Partial<Product> & { id: number }): Product {
  return {
    id: p.id,
    commodity: p.commodity || '',
    product_name: p.product_name || '',
    product_class: p.product_class || '',
    dna: p.dna ?? false,
    fat: p.fat ?? false,
    protein: p.protein ?? false,
    calcium: p.calcium ?? false,
    is_direction_present_for_this_inspection: p.is_direction_present_for_this_inspection ?? false,
    is_product_compliant: p.is_product_compliant ?? true,
    is_sample_taken: p.is_sample_taken ?? false,
    needs_retest: p.needs_retest || '',
    coa_uploaded: p.coa_uploaded ?? false,
    compliance_uploaded: p.compliance_uploaded ?? false,
    composition_uploaded: p.composition_uploaded ?? false,
    occurrence_uploaded: p.occurrence_uploaded ?? false,
    retest_uploaded: p.retest_uploaded ?? false,
    other_uploaded: p.other_uploaded ?? false,
    lab_form_uploaded: p.lab_form_uploaded ?? false,
    lab: p.lab || '',
  };
}

interface FileItem {
  name: string;
  path: string;
  url: string;
  download_url?: string;
  relative_path?: string;
  size: number;
  type?: string;
  category?: string;
}

interface Inspection {
  id: number;
  client_name: string;
  town?: string;
  inspector_name?: string;
  date_of_inspection: string;
  approved_status?: string;
  sent_date?: string;
  sent_by_name?: string;
  has_rfi?: boolean;
  has_invoice?: boolean;
  has_lab?: boolean;
  has_compliance?: boolean;
  is_occurrence_report?: boolean;
  inspection_compliance_status?: string;
  email?: string;
  group_id?: string;
  km_traveled?: number;
  hours?: number;
  group_type?: string;
  facility_type?: string;
  corporate_group?: string;
  internal_account_code?: string;
  registration_code?: string;
  physical_address?: string;
  telephone?: string;
  time_of_visit?: string;
  comment?: string;
  has_lab_form?: boolean;
  created_at?: string;
  capture_lag_days?: number | null;
  late_capture?: boolean;
  approval_lag_days?: number | null;
  late_approval?: boolean;
  products?: Product[];
}

/* Where an inspection sits in the back-office process, from the fields the
   list already returns — no extra request. Answers Nicole's "where is each
   inspection, document or sample in the process, and who owns the next step".
   The order mirrors the real flow: approve → send docs → COA (if sampled) →
   invoice → done. A sample only blocks on COA when one was actually taken. */
type Stage = { key: string; label: string; owner: string; hint: string; color: string; bg: string };
function processStage(s: Inspection): Stage {
  const sampled = (s.products || []).some(p => p.is_sample_taken);
  const corporate = s.group_type === "Corporate Store";
  // Only PMP and RAW commodities are invoiced/RFI'd — a poultry/eggs-only job
  // never needs an invoice.
  const billable = (s.products || []).some(p => ["PMP", "RAW"].includes((p.commodity || "").toUpperCase()));
  // Occurrence reports are recorded for information only — they don't go through
  // approval, sending or invoicing, so they're never "outstanding".
  if (s.is_occurrence_report)
    return { key: "occurrence", label: "Occurrence report", owner: "—",
             hint: "Occurrence reports are recorded for information — no approval, sending or invoicing needed.", color: "#6b7280", bg: "#f3f4f6" };
  // Inspectors approve their own inspections, so an unapproved one is waiting on
  // the specific inspector who did it — show their name, not a generic role.
  if (s.approved_status !== "APPROVED")
    return { key: "approval", label: "Needs approval", owner: s.inspector_name || "Inspector",
             hint: `${s.inspector_name || "The inspector"} still needs to approve this inspection.`, color: "#7c3aed", bg: "#faf5ff" };
  if (!s.sent_date)
    return { key: "sent", label: "Not sent to client", owner: "Office",
             hint: "Approved, but the report has not been emailed to the client yet.", color: "#d97706", bg: "#fffbeb" };
  if (sampled && !s.has_lab)
    return { key: "coa", label: "Waiting for lab (COA)", owner: "Lab",
             hint: "A sample was taken — waiting for the lab to upload the COA.", color: "#2563eb", bg: "#eff6ff" };
  // Invoice needed only for PMP/RAW jobs, and never for corporate stores
  // (invoiced centrally) or poultry/eggs-only jobs (not invoiced at all).
  if (!s.has_invoice && !corporate && billable)
    return { key: "invoice", label: "Needs invoice", owner: "Finance",
             hint: "Sent to the client, but no invoice has been uploaded yet.", color: "#0891b2", bg: "#ecfeff" };
  return { key: "complete", label: "Done", owner: "—",
           hint: "Approved, sent, and fully processed. Nothing outstanding.", color: "#15803d", bg: "#f0fdf4" };
}

/* Colour per commodity for the little chips shown on each group row, so the
   commodities in a visit are visible without expanding it. */
const COMMODITY_STYLE: Record<string, { bg: string; c: string }> = {
  POULTRY: { bg: "#fef3c7", c: "#92400e" },
  EGGS:    { bg: "#fef9c3", c: "#854d0e" },
  PMP:     { bg: "#e0e7ff", c: "#3730a3" },
  RAW:     { bg: "#fee2e2", c: "#991b1b" },
};
/* Distinct commodities in a group, each with how many products it covers. */
function groupCommodities(s: Inspection): { name: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const p of s.products || []) {
    const cm = (p.commodity || "").toUpperCase();
    if (cm) counts[cm] = (counts[cm] || 0) + 1;
  }
  const order = ["POULTRY", "EGGS", "PMP", "RAW"];
  const rank = (n: string) => { const i = order.indexOf(n); return i < 0 ? 99 : i; };
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => rank(a.name) - rank(b.name));
}

function ClientSearchInput({ value, onChange, options, onEnter }: { value: string; onChange: (v: string) => void; options: string[]; onEnter?: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const filtered = value
    ? options.filter(o => o.toLowerCase().includes(value.toLowerCase()))
    : options;
  const showDropdown = open && filtered.length > 0;

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <i className="fas fa-search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: focused ? "#007890" : "#6b7280", fontSize: 14, pointerEvents: "none" }} />
        <input
          type="text"
          className="ir-form-control"
          placeholder="Search or select client..."
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => { setFocused(true); setOpen(true); }}
          onBlur={() => setFocused(false)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); setOpen(false); onEnter?.(); } }}
          style={{ paddingLeft: 35, paddingRight: 32 }}
          autoComplete="off"
        />
        {value ? (
          <button onClick={() => { onChange(""); setOpen(false); }} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 13, padding: 2 }}>
            <i className="fas fa-times" />
          </button>
        ) : (
          <i className="fas fa-chevron-down" onClick={() => setOpen(o => !o)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: 11, cursor: "pointer" }} />
        )}
      </div>
      {showDropdown && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: "1px solid #d1d5db", borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 9999, maxHeight: 220, overflowY: "auto" }}>
          {filtered.slice(0, 50).map(opt => (
            <div
              key={opt}
              onMouseDown={e => { e.preventDefault(); onChange(opt); setOpen(false); }}
              style={{ padding: "8px 12px", fontSize: "0.78rem", color: "#374151", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f0f9fb")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              {opt}
            </div>
          ))}
          {filtered.length > 50 && (
            <div style={{ padding: "6px 12px", fontSize: "0.7rem", color: "#9ca3af", textAlign: "center" }}>
              {filtered.length - 50} more — type to narrow
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Capture-lag traffic light: blue = same day, green = 1 day (in time),
// orange = 2 days (at the limit), red = over 2 days (late).
function lagStyle(lag: number): { color: string; label: string } {
  const label = `${lag} ${lag === 1 ? "day" : "days"}`;
  if (lag > 2) return { color: "#dc2626", label };   // late — issue
  if (lag === 2) return { color: "#ea580c", label }; // at the max — becoming an issue
  if (lag === 1) return { color: "#15803d", label }; // captured next day — in time
  return { color: "#2563eb", label };                // captured same day
}

const LAB_NAME_TO_CODE: Record<string, string> = {
  "Food Safety Laboratory": "lab_a",
  "Merieux NutriSciences": "lab_b",
  "AGRI Food Laboratory (SGS)": "lab_c",
  "SANBI": "lab_d",
  "SMT": "lab_e",
  "ARC": "lab_f",
};

function IrMultiSelect({ label, options, selected, onChange, searchable, optionLabels }: { label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void; searchable?: boolean; optionLabels?: Record<string, string> }) {
  return (
    <div className="ir-filter-field">
      <label className="ir-form-label">{label}</label>
      <MultiSelectDropdown label={label} options={options} selected={selected} onChange={onChange} searchable={searchable} optionLabels={optionLabels} />
    </div>
  );
}

function CorpInvoiceGroupPicker({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const filtered = search ? options.filter(o => o.toLowerCase().includes(search.toLowerCase())) : options;

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => { if (open && searchRef.current) searchRef.current.focus(); }, [open]);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen(o => !o);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button ref={btnRef} type="button" className="ir-form-control" onClick={handleToggle}
        style={{ width: "100%", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: open ? "#f9fafb" : "white", color: value ? "#1f2937" : "#6b7280" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value || "-- Select Business --"}</span>
        <i className={`fas fa-chevron-${open ? "up" : "down"}`} style={{ fontSize: 10, color: "#9ca3af" }} />
      </button>
      {open && (
        <div style={{ position: "fixed", top: dropPos.top, left: dropPos.left, width: dropPos.width, background: "white", border: "1px solid #e5e7eb", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 10001, overflow: "hidden" }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>
            <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search business..."
              style={{ width: "100%", padding: "6px 8px", fontSize: "0.82rem", border: "1px solid #e5e7eb", borderRadius: 4, outline: "none", boxSizing: "border-box" }}
              onFocus={e => (e.currentTarget.style.borderColor = "#007890")} onBlur={e => (e.currentTarget.style.borderColor = "#e5e7eb")} />
          </div>
          <div style={{ maxHeight: 250, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "10px 12px", fontSize: 13, color: "#9ca3af" }}>No matches</div>
            ) : filtered.map(g => (
              <div key={g} onClick={() => { onChange(g); setOpen(false); setSearch(""); }}
                style={{ padding: "8px 12px", cursor: "pointer", fontSize: "0.82rem", color: "#1f2937", background: g === value ? "#f0fafb" : "transparent", fontWeight: g === value ? 600 : 400 }}
                onMouseEnter={e => { if (g !== value) e.currentTarget.style.background = "#f9fafb"; }}
                onMouseLeave={e => { e.currentTarget.style.background = g === value ? "#f0fafb" : "transparent"; }}>
                {g}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const perf = {
  pageStart: Date.now(),
  log(label: string, start: number, extra?: Record<string, unknown>) {
    const elapsed = Date.now() - start;
    const sincePageLoad = Date.now() - perf.pageStart;
    console.log(
      `%c[PERF] ${label}%c ${elapsed}ms (page +${sincePageLoad}ms)`,
      "color: #007890; font-weight: bold",
      "color: #6b7280",
      extra || ""
    );
  },
};

export default function InspectionsPage() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [clientSearch, setClientSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const PAGE_SIZE = 50;
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showUndeliverable, setShowUndeliverable] = useState(false);
  const [duplicateGroupsCount, setDuplicateGroupsCount] = useState(0);
  const [undeliverableCount, setUndeliverableCount] = useState(0);
  const [undeliverableEmails, setUndeliverableEmails] = useState<string[]>([]);

  // Full filter option lists from backend (all inspectors across all pages)
  const [allInspectors, setAllInspectors] = useState<string[]>([]);
  const [allCorpGroups, setAllCorpGroups] = useState<string[]>([]);
  const [allGroupTypes, setAllGroupTypes] = useState<string[]>([]);

  // Filter values (arrays for multi-select)
  const [inspectorFilter, setInspectorFilter] = useState<string[]>([]);
  const [corpGroupFilter, setCorpGroupFilter] = useState<string[]>([]);
  const [groupTypeFilter, setGroupTypeFilter] = useState<string[]>([]);
  const [sentStatusFilter, setSentStatusFilter] = useState<string[]>([]);
  const [complianceFilter, setComplianceFilter] = useState<string[]>([]);
  const [approvedFilter, setApprovedFilter] = useState<string[]>([]);
  const [fileStatusFilter, setFileStatusFilter] = useState<string[]>([]);
  const [rfiFilter, setRfiFilter] = useState<string[]>([]);
  const [invoiceFilter, setInvoiceFilter] = useState<string[]>([]);
  const [coaFileFilter, setCoaFileFilter] = useState<string[]>([]);
  const [complianceFileFilter, setComplianceFileFilter] = useState<string[]>([]);
  const [otherFileFilter, setOtherFileFilter] = useState<string[]>([]);
  const [emailFilter, setEmailFilter] = useState("");
  const [occurrenceFilter, setOccurrenceFilter] = useState<string[]>([]);
  const [sampledFilter, setSampledFilter] = useState<string[]>([]);
  const [commodityFilter, setCommodityFilter] = useState<string[]>([]);
  const [lateCaptureFilter, setLateCaptureFilter] = useState<string[]>([]);
  const [lateApprovalFilter, setLateApprovalFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("date_desc");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  // Missing-sample flags (super admins & lab technicians): group ids currently flagged
  const [flaggedGroups, setFlaggedGroups] = useState<Set<string>>(new Set());

  // Lab-tech specific filters
  const [retestFilter, setRetestFilter] = useState<string[]>([]);
  const [coaStatusFilter, setCoaStatusFilter] = useState<string[]>([]);
  const [labFilter, setLabFilter] = useState<string[]>([]);
  const [testTypeFilter, setTestTypeFilter] = useState<string[]>([]);

  // Applied filter state — only updated when "Apply Filters" is clicked
  const [appliedFilters, setAppliedFilters] = useState({
    inspector: [] as string[],
    corporateGroup: [] as string[],
    groupType: [] as string[],
    occurrence: [] as string[],
    sampled: [] as string[],
    commodity: [] as string[],
    sentStatus: [] as string[],
    compliance: [] as string[],
    approved: [] as string[],
    fileStatus: [] as string[],
    rfi: [] as string[],
    invoice: [] as string[],
    coaFile: [] as string[],
    complianceFile: [] as string[],
    otherFile: [] as string[],
    email: "",
    retest: [] as string[],
    coaStatus: [] as string[],
    lab: [] as string[],
    testType: [] as string[],
    lateCapture: [] as string[],
    lateApproval: [] as string[],
    sort: "date_desc",
  });

  // Upload state
  const [uploadingKeys, setUploadingKeys] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadRef = useRef<{
    inspectionId: number;
    groupId: string;
    documentType: string;
    productId: number;
    complianceStatus?: string;
  } | null>(null);

  // Compliance modal state
  const [complianceModal, setComplianceModal] = useState<{
    show: boolean;
    type: 'product' | 'coa';
    inspectionId: number;
    groupId: string;
    productId: number;
    documentType: string;
  } | null>(null);

  // Filesystem file info cache per group (keyed by group_id)
  const [groupFiles, setGroupFiles] = useState<Record<string, Record<string, FileItem[]>>>({});

  // Files modal state
  const [filesModal, setFilesModal] = useState<{
    visible: boolean;
    clientName: string;
    inspectionDate: string;
    groupId: string;
    files: Record<string, FileItem[]>;
    loading: boolean;
  }>({ visible: false, clientName: "", inspectionDate: "", groupId: "", files: {}, loading: false });

  // Corporate invoice modal state
  interface CorpInvoiceItem {
    client_name: string;
    inspector_name: string;
    invoice_date: string;
    item_code: string;
    description: string;
    quantity: number;
    unit_amount: number;
    total: number;
    account_code: string;
    city: string;
    corporate_group?: string;
    tax_rate?: string;
  }
  interface CorpMonthSummary { month: string; label: string; items: CorpInvoiceItem[]; total: number; stores: number; }
  const [corpInvoiceModal, setCorpInvoiceModal] = useState(false);
  const [corpInvoiceGroup, setCorpInvoiceGroup] = useState("");
  const [corpInvoiceMonths, setCorpInvoiceMonths] = useState<CorpMonthSummary[]>([]);
  const [corpInvoiceSelected, setCorpInvoiceSelected] = useState<CorpMonthSummary | null>(null);
  const [corpInvoiceLoading, setCorpInvoiceLoading] = useState(false);
  const [corpInvoiceFile, setCorpInvoiceFile] = useState<string | null>(null);
  const [corpInvoiceUploading, setCorpInvoiceUploading] = useState(false);
  const corpInvoiceFileRef = useRef<HTMLInputElement>(null);
  const [corpEmails, setCorpEmails] = useState<{id: number; email: string; label: string}[]>([]);
  const [corpEmailInput, setCorpEmailInput] = useState("");
  const [corpEmailLoading, setCorpEmailLoading] = useState(false);
  const [corpInvoiceSending, setCorpInvoiceSending] = useState(false);
  const [corpSendConfirm, setCorpSendConfirm] = useState(false);
  const [corpAllInvoices, setCorpAllInvoices] = useState<{corporate_group: string; corporate_group_raw: string; month: string; filename: string}[]>([]);
  const [corpAllInvoicesLoading, setCorpAllInvoicesLoading] = useState(false);
  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  const fetchAllCorpInvoices = async () => {
    setCorpAllInvoicesLoading(true);
    try {
      const res = await fetch("/api/corporate-invoice-file");
      const data = await res.json();
      if (data.success) setCorpAllInvoices(data.invoices || []);
    } catch { /* ignore */ }
    finally { setCorpAllInvoicesLoading(false); }
  };

  const checkCorpInvoiceFile = async (group: string, month: string) => {
    try {
      const res = await fetch(`/api/corporate-invoice-file?corporate_group=${encodeURIComponent(group)}&month=${month}`);
      const data = await res.json();
      setCorpInvoiceFile(data.has_file ? data.filename : null);
    } catch { setCorpInvoiceFile(null); }
  };

  const uploadCorpInvoiceFile = async (file: File) => {
    if (!corpInvoiceSelected || !corpInvoiceGroup) return;
    setCorpInvoiceUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("corporate_group", corpInvoiceGroup);
      fd.append("month", corpInvoiceSelected.month);
      const res = await fetch("/api/corporate-invoice-file", { method: "POST", body: fd });
      const data = await res.json();
      if (data.success) {
        setCorpInvoiceFile(data.filename);
        showToast("Invoice uploaded");
      } else {
        alert("Upload failed: " + (data.error || "Unknown error"));
      }
    } catch (e) { alert("Upload error: " + String(e)); }
    finally { setCorpInvoiceUploading(false); }
  };

  const fetchCorpInvoiceMonths = async (group: string) => {
    if (!group) return;
    setCorpInvoiceLoading(true);
    setCorpInvoiceSelected(null); setCorpInvoiceFile(null);
    setCorpInvoiceMonths([]);
    try {
      // Fetch last 12 months of data for this corporate group
      const now = new Date();
      const dateFrom = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const dateTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const res = await fetch(`/api/export-sheet?date_from=${dateFrom}&date_to=${dateTo}&corporate_group=${encodeURIComponent(group)}`);
      const data = await res.json();
      if (data.success && data.items?.length) {
        // Group items by month
        const byMonth = new Map<string, CorpInvoiceItem[]>();
        (data.items as CorpInvoiceItem[]).forEach(item => {
          // invoice_date is DD/MM/YYYY
          const parts = item.invoice_date?.split("/");
          if (parts?.length === 3) {
            const key = `${parts[2]}-${parts[1]}`; // YYYY-MM
            if (!byMonth.has(key)) byMonth.set(key, []);
            byMonth.get(key)!.push(item);
          }
        });
        const months: CorpMonthSummary[] = [];
        byMonth.forEach((items, month) => {
          const [y, m] = month.split("-").map(Number);
          const stores = new Set(items.map(i => i.client_name)).size;
          months.push({
            month,
            label: `${MONTH_NAMES[m - 1]} ${y}`,
            items,
            total: items.reduce((s, i) => s + (i.total || 0), 0),
            stores,
          });
        });
        months.sort((a, b) => b.month.localeCompare(a.month)); // newest first
        setCorpInvoiceMonths(months);
      }
    } catch (err) {
      console.error("Corp invoice fetch failed:", err);
    } finally {
      setCorpInvoiceLoading(false);
    }
  };

  const exportCorpInvoiceExcel = async () => {
    if (!corpInvoiceSelected) return;
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Food Safety Agency";
      const ws = wb.addWorksheet("Invoice Data");

      const headers = [
        "*ContactName", "EmailAddress", "POAddressLine1", "POAddressLine2",
        "POAddressLine3", "POAddressLine4", "POCity", "PORegion",
        "POPostalCode", "POCountry", "*InvoiceNumber", "Reference",
        "*InvoiceDate", "*DueDate", "Total", "InventoryItemCode",
        "*Description", "*Quantity", "*UnitAmount", "Discount",
        "*AccountCode", "*TaxType", "Tax Amount", "TrackingName1",
        "TrackingOption1", "TrackingName2", "TrackingOption2",
        "Currency", "BrandingTheme",
      ];

      const colWidths = [25, 20, 20, 20, 20, 20, 15, 15, 12, 15, 20, 20, 12, 12, 12, 15, 50, 10, 12, 10, 15, 25, 12, 15, 15, 15, 15, 10, 15];
      ws.columns = headers.map((h, i) => ({ header: h, key: h, width: colWidths[i] || 15 }));

      const headerRow = ws.getRow(1);
      headerRow.eachCell((cell: unknown) => {
        const c = cell as { fill: unknown; font: unknown };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
        c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      });
      headerRow.commit();

      const corpAbbrev = corpInvoiceGroup.replace(/[^A-Za-z]/g, "").substring(0, 3).toUpperCase();
      const [ym, mm] = corpInvoiceSelected.month.split("-");
      const invNumber = `FSA-CORP-${corpAbbrev}-${ym.slice(2)}${mm}`;

      corpInvoiceSelected.items.forEach(item => {
        ws.addRow([
          corpInvoiceGroup, "", "", "", "", "",
          item.city || "", "", "", "",
          invNumber, corpInvoiceSelected.label,
          item.invoice_date || "", "", "",
          item.item_code || "", item.description || "",
          item.quantity || 0, item.unit_amount || 0, "",
          item.account_code || "", item.tax_rate || "Tax Exempt", "",
          "", "", "", "", "", "",
        ]);
      });

      // Summary sheet
      const ss = wb.addWorksheet("Summary");
      ss.columns = [
        { header: "Store", key: "store", width: 35 },
        { header: "Line Items", key: "items", width: 12 },
        { header: "Subtotal", key: "subtotal", width: 15 },
      ];
      const sHeaderRow = ss.getRow(1);
      sHeaderRow.eachCell((cell: unknown) => {
        const c = cell as { fill: unknown; font: unknown };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
        c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      });
      sHeaderRow.commit();

      const storeMap = new Map<string, { count: number; total: number }>();
      corpInvoiceSelected.items.forEach(item => {
        const name = item.client_name || "Unknown";
        const cur = storeMap.get(name) || { count: 0, total: 0 };
        cur.count++;
        cur.total += item.total || 0;
        storeMap.set(name, cur);
      });
      storeMap.forEach((val, name) => ss.addRow([name, val.count, val.total]));
      const totalRow = ss.addRow(["TOTAL", corpInvoiceSelected.items.length, corpInvoiceSelected.total]);
      totalRow.eachCell((cell: unknown) => { (cell as { font: unknown }).font = { bold: true }; });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Corporate_Invoice_${corpInvoiceGroup.replace(/\s+/g, "_")}_${corpInvoiceSelected.month}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Excel export failed: " + String(e));
    }
  };

  // ── Corporate invoice email helpers ──
  const fetchCorpEmails = async (group: string) => {
    if (!group) { setCorpEmails([]); return; }
    try {
      const res = await fetch(`/api/corporate-group-emails?corporate_group=${encodeURIComponent(group)}`);
      const data = await res.json();
      if (data.success) setCorpEmails(data.emails || []);
    } catch { setCorpEmails([]); }
  };

  const addCorpEmail = async () => {
    const email = corpEmailInput.trim().toLowerCase();
    if (!email || !corpInvoiceGroup) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert("Invalid email address"); return; }
    setCorpEmailLoading(true);
    try {
      const res = await fetch("/api/corporate-group-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corporate_group: corpInvoiceGroup, email }),
      });
      const data = await res.json();
      if (data.success) {
        setCorpEmails(prev => [...prev, data.email]);
        setCorpEmailInput("");
      } else {
        alert(data.error || "Failed to add email");
      }
    } catch (e) { alert("Error: " + String(e)); }
    finally { setCorpEmailLoading(false); }
  };

  const removeCorpEmail = async (id: number) => {
    try {
      const res = await fetch("/api/corporate-group-emails/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) setCorpEmails(prev => prev.filter(e => e.id !== id));
    } catch (e) { alert("Error: " + String(e)); }
  };

  const sendCorpInvoice = async () => {
    if (!corpInvoiceGroup || !corpInvoiceSelected || !corpInvoiceFile) return;
    setCorpInvoiceSending(true);
    try {
      const res = await fetch("/api/send-corporate-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corporate_group: corpInvoiceGroup, month: corpInvoiceSelected.month }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || "Invoice sent successfully");
      } else {
        showToast("Send failed: " + (data.error || "Unknown error"));
      }
    } catch (e) { showToast("Send error: " + String(e)); }
    finally { setCorpInvoiceSending(false); setCorpSendConfirm(false); }
  };

  const fetchInspections = useCallback((duplicates?: boolean, from?: string, to?: string, page?: number, search?: string, filters?: {
    inspector?: string[]; corporateGroup?: string[];
    groupType?: string[]; occurrence?: string[]; sampled?: string[]; commodity?: string[]; sentStatus?: string[];
    compliance?: string[]; approved?: string[]; email?: string;
    rfi?: string[]; invoice?: string[]; coaFile?: string[]; complianceFile?: string[]; otherFile?: string[];
    retest?: string[]; coaStatus?: string[]; lab?: string[]; testType?: string[]; lateCapture?: string[];
    lateApproval?: string[];
    sort?: string;
  }) => {
    setLoading(true);
    const p = new URLSearchParams();
    if (duplicates) p.set("show_duplicates", "true");
    if (from) p.set("date_from", from);
    if (to) p.set("date_to", to);
    if (search) p.set("client_search", search);
    // Send all filters to backend
    if (filters) {
      if (filters.inspector?.length) filters.inspector.forEach(v => p.append("inspector", v));
      if (filters.corporateGroup?.length) filters.corporateGroup.forEach(v => p.append("corporate_group", v));
      if (filters.groupType?.length) filters.groupType.forEach(v => p.append("group_type", v));
      if (filters.occurrence?.length) filters.occurrence.forEach(v => p.append("occurrence", v));
      if (filters.sampled?.length) filters.sampled.forEach(v => p.append("sampled", v));
      if (filters.commodity?.length) filters.commodity.forEach(v => p.append("commodity", v));
      if (filters.sentStatus?.length) filters.sentStatus.forEach(v => p.append("sent_status", v));
      if (filters.compliance?.length) filters.compliance.forEach(v => p.append("compliance", v));
      if (filters.approved?.length) filters.approved.forEach(v => p.append("approved", v));
      if (filters.email?.trim()) p.set("email", filters.email.trim());
      if (filters.rfi?.length) filters.rfi.forEach(v => p.append("has_rfi", v));
      if (filters.invoice?.length) filters.invoice.forEach(v => p.append("has_invoice", v));
      if (filters.coaFile?.length) filters.coaFile.forEach(v => p.append("has_coa", v));
      if (filters.complianceFile?.length) filters.complianceFile.forEach(v => p.append("has_compliance", v));
      if (filters.otherFile?.length) filters.otherFile.forEach(v => p.append("has_other", v));
      if (filters.retest?.length) filters.retest.forEach(v => p.append("needs_retest", v));
      if (filters.coaStatus?.length) filters.coaStatus.forEach(v => p.append("coa_uploaded", v));
      if (filters.lab?.length) filters.lab.forEach(v => p.append("lab", LAB_NAME_TO_CODE[v] || v));
      if (filters.testType?.length) filters.testType.forEach(v => p.append("test_type", v));
      if (filters.lateCapture?.length) filters.lateCapture.forEach(v => p.append("late_capture", v));
      if (filters.lateApproval?.length) filters.lateApproval.forEach(v => p.append("late_approval", v));
      if (filters.sort && filters.sort !== "date_desc") p.set("sort", filters.sort);
    }
    p.set("page", String(page ?? currentPage));
    p.set("page_size", String(PAGE_SIZE));
    const qs = `?${p.toString()}`;
    const fetchStart = Date.now();
    console.log(`%c[PERF] fetchInspections START%c ${qs}`, "color: #007890; font-weight: bold", "color: #6b7280");
    fetch(`/api/inspections${qs}`)
      .then(r => {
        perf.log("fetchInspections RESPONSE", fetchStart, { status: r.status, headers: Object.fromEntries(r.headers.entries()) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const parseStart = Date.now();
        return r.json().then(data => {
          perf.log("fetchInspections JSON PARSE", parseStart, { size: JSON.stringify(data).length });
          return data;
        });
      })
      .then(data => {
        const renderStart = Date.now();
        const results = (data.results || data || []).map((r: Inspection) => ({
          ...r,
          products: r.products?.map(normalizeProduct) || [],
        }));
        setInspections(results);
        setTotal(data.count || results.length);
        if (data.total_pages !== undefined) setTotalPages(data.total_pages);
        if (data.duplicate_groups_count !== undefined) setDuplicateGroupsCount(data.duplicate_groups_count);
        if (data.undeliverable_count !== undefined) setUndeliverableCount(data.undeliverable_count);
        if (data.all_inspectors) setAllInspectors(data.all_inspectors);
        if (data.all_corporate_groups) setAllCorpGroups(data.all_corporate_groups);
        if (data.all_group_types) setAllGroupTypes(data.all_group_types);
        perf.log("fetchInspections TOTAL", fetchStart, { count: results.length, total: data.count });
        requestAnimationFrame(() => {
          perf.log("fetchInspections RENDER COMPLETE", renderStart, { rowCount: results.length });
        });
      })
      .catch(err => console.error("Fetch inspections failed:", err))
      .finally(() => setLoading(false));
  }, [currentPage]);

  const [bouncedEmails, setBouncedEmails] = useState<Set<string>>(new Set());

  const fetchUndeliverable = useCallback((page?: number) => {
    setLoading(true);
    const pg = page ?? 1;
    const fetchStart = Date.now();
    console.log(`%c[PERF] fetchUndeliverable START%c page=${pg}`, "color: #e67e22; font-weight: bold", "color: #6b7280");
    fetch(`/api/inspections?show_undeliverable=true&page=${pg}&page_size=${PAGE_SIZE}`)
      .then(r => {
        perf.log("fetchUndeliverable RESPONSE", fetchStart, { status: r.status });
        return r.json();
      })
      .then(data => {
        const results = (data.results || data || []).map((r: Inspection) => ({
          ...r,
          products: r.products?.map(normalizeProduct) || [],
        }));
        setInspections(results);
        setTotal(data.count || results.length);
        if (data.total_pages !== undefined) setTotalPages(data.total_pages);
        if (data.undeliverable_count !== undefined) setUndeliverableCount(data.undeliverable_count);
        if (data.bounced_emails) setBouncedEmails(new Set(data.bounced_emails.map((e: string) => e.toLowerCase())));
        perf.log("fetchUndeliverable TOTAL", fetchStart, { count: results.length });
      })
      .catch(err => console.error("Fetch undeliverable failed:", err))
      .finally(() => setLoading(false));
  }, []);

  // Sync debouncedSearch with clientSearch (used when Apply Filters is clicked)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(clientSearch), 400);
    return () => clearTimeout(timer);
  }, [clientSearch]);

  // Initial load on mount — check URL params for pre-applied filters (e.g. from Lab Analytics)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const urlCoa = sp.getAll("has_coa");
    const urlRetest = sp.getAll("needs_retest");
    const urlSampled = sp.getAll("sampled");
    const urlInspector = sp.getAll("inspector");
    const urlLate = sp.getAll("late_capture");
    const urlLateApproval = sp.getAll("late_approval");
    const urlSort = sp.get("sort") || "";
    const urlClientSearch = sp.get("client_search") || "";
    if (urlClientSearch) {
      setClientSearch(urlClientSearch);
      setDebouncedSearch(urlClientSearch);
    }
    if (urlCoa.length || urlRetest.length || urlSampled.length || urlInspector.length || urlLate.length || urlLateApproval.length || urlSort) {
      if (urlCoa.length) setCoaFileFilter(urlCoa);
      if (urlRetest.length) setRetestFilter(urlRetest);
      if (urlSampled.length) setSampledFilter(urlSampled);
      if (urlInspector.length) setInspectorFilter(urlInspector);
      if (urlLate.length) setLateCaptureFilter(urlLate);
      if (urlLateApproval.length) setLateApprovalFilter(urlLateApproval);
      if (urlSort) setSortBy(urlSort);
      const af = {
        ...appliedFilters,
        coaFile: urlCoa,
        retest: urlRetest,
        sampled: urlSampled,
        inspector: urlInspector,
        lateCapture: urlLate,
        lateApproval: urlLateApproval,
        sort: urlSort || "date_desc",
      };
      setAppliedFilters(af);
      fetchInspections(false, "", "", 1, urlClientSearch, af);
    } else {
      fetchInspections(false, "", "", 1, urlClientSearch);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Background sync: refresh undeliverable count silently on page load
  useEffect(() => {
    const start = Date.now();
    console.log("%c[PERF] undeliverable count bg sync START", "color: #9b59b6; font-weight: bold");
    fetch("/api/inspections?show_undeliverable=true&page=1&page_size=1")
      .then(r => r.json())
      .then(data => {
        if (data.undeliverable_count !== undefined) setUndeliverableCount(data.undeliverable_count);
        perf.log("undeliverable count bg sync DONE", start, { count: data.undeliverable_count });
      })
      .catch((err) => { console.error("[PERF] undeliverable count bg sync FAILED", err); });
  }, []);

  useEffect(() => {
    const start = Date.now();
    console.log("%c[PERF] /api/me auth check START", "color: #e74c3c; font-weight: bold");
    fetch("/api/me", { credentials: "include" })
      .then(r => {
        perf.log("/api/me RESPONSE", start, { status: r.status });
        return r.json();
      })
      .then(d => {
        perf.log("/api/me COMPLETE", start, { authenticated: d.authenticated, role: d.role });
        if (!d.authenticated) {
          window.location.href = "/login";
          return;
        }
        setRole(d.role || "inspector");
        // Lab techs see all inspections (no default sampled filter)
      })
      .catch(() => { window.location.href = "/login"; });
  }, []);

  const roleLoaded = role !== null;
  const isLabTech = role === "lab_technician";
  const isLabTechRestricted = false; // Lab techs now see everything
  const isAdmin = role === "admin";
  const isInspector = role === "inspector" || role === "inspector_manager";
  // Inspectors approve their own inspections — this is the intended workflow.
  // An earlier version of this file blocked them and claimed approval was a
  // management-only action; that was wrong. "Days to approval" is meant to
  // measure the inspector's own capture-to-approval turnaround, which is
  // exactly what the late-approval reporting tracks.
  const canEditApproval = role === "super_admin" || role === "developer"
    || role === "inspector_manager" || role === "inspector";
  // Admin-level roles can upload every document type, regardless of commodity
  const canUploadAll = role === "admin" || role === "super_admin" || role === "developer";
  // Only admin-level roles may delete inspection records
  const canDelete = role === "admin" || role === "super_admin" || role === "developer";
  // Super admins & lab technicians can flag a visit as "inspector didn't add the correct sampling info"
  const canFlag = role === "super_admin" || role === "developer" || role === "lab_technician";
  // Back-office roles review clients auto-created by inspectors (Clients Approval page)
  const canApproveClients = role === "admin" || role === "super_admin" || role === "developer" || role === "inspector_manager";

  // Pending-approval count for the Clients Approval nav badge
  const [pendingClientCount, setPendingClientCount] = useState(0);
  useEffect(() => {
    if (!canApproveClients) return;
    fetch("/api/clients-approval?count_only=1", { cache: "no-store" })
      .then(r => r.json())
      .then(d => { if (typeof d.count === "number") setPendingClientCount(d.count); })
      .catch(() => {});
  }, [canApproveClients]);

  // Load which groups already have an open missing-sample flag
  useEffect(() => {
    if (!canFlag) return;
    fetch("/api/sample-discrepancies/open-groups", { cache: "no-store" })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.group_ids)) setFlaggedGroups(new Set(d.group_ids.map(String))); })
      .catch(() => {});
  }, [canFlag]);

  // Show toast notification
  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const toggleSampleFlag = useCallback(async (s: Inspection) => {
    const gid = String(s.group_id || s.id);
    const wasFlagged = flaggedGroups.has(gid);
    setFlaggedGroups(prev => { const n = new Set(prev); wasFlagged ? n.delete(gid) : n.add(gid); return n; });
    try {
      const res = await fetch("/api/sample-discrepancies/toggle-group", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: gid, inspector_name: s.inspector_name, client_name: s.client_name, date_of_inspection: s.date_of_inspection }),
      });
      const data = await res.json().catch(() => ({}));
      if (!wasFlagged && data?.flagged) {
        showToast(data.reminder_email_sent
          ? `Flagged — a friendly reminder was emailed to ${s.inspector_name || "the inspector"}.`
          : "Flagged. No matching inspector email was found, so no reminder was sent.");
      }
    } catch { /* revert on error */ setFlaggedGroups(prev => { const n = new Set(prev); wasFlagged ? n.add(gid) : n.delete(gid); return n; }); }
  }, [flaggedGroups, showToast]);

  // Core upload function
  const performUpload = useCallback(async (file: File, inspectionId: number, groupId: string, documentType: string, productId: number, complianceStatus?: string) => {
    const key = `${documentType}-${productId}`;
    setUploadingKeys(prev => new Set(prev).add(key));
    console.log(`[Upload] Starting: type=${documentType}, file=${file.name}, inspectionId=${inspectionId}, groupId=${groupId}, productId=${productId}, compliance=${complianceStatus}`);

    try {
      // Validate PDF
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        alert('Only PDF files are allowed. Please select a PDF document.');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('document_type', documentType);
      // RFI and Invoice are group-level uploads; everything else is per-inspection
      const isGroupUpload = documentType === 'rfi' || documentType === 'invoice';
      if (isGroupUpload) {
        if (groupId) formData.append('group_id', groupId);
      } else {
        // Per-inspection upload: send inspection_id so only this record is updated
        if (inspectionId) formData.append('inspection_id', String(inspectionId));
        // For lab/retest, backend needs group_id for folder path but we use inspection_id for DB update
        if (groupId && (documentType === 'lab' || documentType === 'lab_form' || documentType === 'retest')) {
          formData.append('group_id', groupId);
        }
      }
      if (complianceStatus) formData.append('compliance_status', complianceStatus);
      if (complianceStatus) formData.append('product_compliance_status', complianceStatus);

      console.log(`[Upload] Sending to /api/upload-document:`, Object.fromEntries(formData.entries()));
      const res = await fetch('/api/upload-document', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      console.log(`[Upload] Response:`, data);

      if (data.success) {
        // Toast removed — button turns green to indicate success

        console.log(`[Upload] Success! Updating local state for groupId=${groupId}, inspectionId=${inspectionId}, productId=${productId}, docType=${documentType}`);

        // Update local state to reflect the upload
        setInspections(prev => prev.map(insp => {
          if (insp.group_id !== groupId && insp.id !== inspectionId) return insp;

          const updated = { ...insp };

          // Update group-level flags (only for group-level uploads)
          if (documentType === 'rfi') updated.has_rfi = true;
          if (documentType === 'invoice') updated.has_invoice = true;
          // Per-product uploads: set group flag true since at least one product has the file
          if (documentType === 'lab' || documentType === 'coa') updated.has_lab = true;
          if (documentType === 'compliance' || documentType === 'composition') updated.has_compliance = true;
          if (documentType === 'lab_form') updated.has_lab_form = true;

          // Update product-level flags — ONLY the specific product
          if (updated.products) {
            console.log(`[Upload] Products in group:`, updated.products.map(p => `id=${p.id} name=${p.product_name}`));
            console.log(`[Upload] Target productId=${productId}`);
            updated.products = updated.products.map(p => {
              if (p.id !== productId) {
                console.log(`[Upload] Skipping product ${p.id} (${p.product_name}) - not target`);
                return p;
              }
              console.log(`[Upload] Updating product ${p.id} (${p.product_name}) with ${documentType}=true`);
              const up = { ...p };
              if (documentType === 'coa' || documentType === 'lab') up.coa_uploaded = true;
              if (documentType === 'compliance') up.compliance_uploaded = true;
              if (documentType === 'composition') up.composition_uploaded = true;
              if (documentType === 'occurrence') up.occurrence_uploaded = true;
              if (documentType === 'retest') up.retest_uploaded = true;
              if (documentType === 'other') up.other_uploaded = true;
              if (documentType === 'lab_form') up.lab_form_uploaded = true;
              if (complianceStatus) {
                up.is_product_compliant = complianceStatus === 'compliant';
              }
              return up;
            });
          }

          return updated;
        }));
      } else {
        alert('Upload failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Upload error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploadingKeys(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  }, [showToast]);

  // Handle file input change
  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const pending = pendingUploadRef.current;
    if (file && pending) {
      performUpload(file, pending.inspectionId, pending.groupId, pending.documentType, pending.productId, pending.complianceStatus);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
    pendingUploadRef.current = null;
  }, [performUpload]);

  // Send inspection documents via email
  const [sendingId, setSendingId] = useState<number | null>(null);
  const handleSendDocuments = useCallback(async (inspection: Inspection) => {
    if (!inspection.group_id) {
      alert('No group ID found for this inspection.');
      return;
    }
    if (sendingId) return; // prevent double-click
    console.log(`[Send] Starting for inspection ${inspection.id}, group_id=${inspection.group_id}`, inspection);
    setSendingId(inspection.id);
    try {
      const res = await fetch('/api/send-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: inspection.group_id,
          inspection_group_id: inspection.group_id,
          client_name: inspection.client_name,
          inspection_date: inspection.date_of_inspection,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Documents sent successfully!');
        setInspections(prev => prev.map(item =>
          item.group_id === inspection.group_id
            ? { ...item, sent_date: data.sent_time || new Date().toISOString(), sent_by_name: data.sent_by || '' }
            : item
        ));
      } else {
        alert('Send failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Send error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSendingId(null);
    }
  }, [sendingId, showToast]);

  // Trigger file picker for a specific upload
  const triggerUpload = useCallback((inspectionId: number, groupId: string, documentType: string, productId: number) => {
    // For compliance and composition uploads, show compliance status modal first
    if (documentType === 'compliance' || documentType === 'composition') {
      setComplianceModal({
        show: true, type: 'product',
        inspectionId, groupId, productId, documentType,
      });
      return;
    }

    // For COA/Lab uploads, show COA compliance modal first
    if (documentType === 'lab') {
      setComplianceModal({
        show: true, type: 'coa',
        inspectionId, groupId, productId, documentType,
      });
      return;
    }

    // Direct upload for other types
    pendingUploadRef.current = { inspectionId, groupId, documentType, productId };
    fileInputRef.current?.click();
  }, []);

  // Handle compliance status selection from modal
  const handleComplianceSelect = useCallback((status: string) => {
    if (!complianceModal) return;
    const { inspectionId, groupId, productId, documentType } = complianceModal;
    setComplianceModal(null);

    // Now trigger the file picker with the compliance status stored
    pendingUploadRef.current = { inspectionId, groupId, documentType, productId, complianceStatus: status };
    fileInputRef.current?.click();
  }, [complianceModal]);

  // Open files modal for an inspection group
  const openFilesModal = useCallback(async (groupId: string, clientName: string, inspectionDate: string) => {
    setFilesModal({ visible: true, clientName, inspectionDate, groupId, files: {}, loading: true });
    try {
      const res = await fetch("/api/inspection-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId, client_name: clientName, inspection_date: inspectionDate }),
      });
      const data = await res.json();
      if (data.success) {
        setFilesModal(prev => ({ ...prev, files: data.files || {}, loading: false }));
      } else {
        setFilesModal(prev => ({ ...prev, loading: false }));
        console.error("Failed to load files:", data.error);
      }
    } catch (err) {
      setFilesModal(prev => ({ ...prev, loading: false }));
      console.error("Error loading files:", err);
    }
  }, []);

  const toggleGroup = useCallback((id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Fetch filesystem file info when expanding (if not already cached)
        const insp = inspections.find(s => String(s.id) === id);
        if (insp && !groupFiles[insp.group_id || id]) {
          const gid = insp.group_id || String(insp.id);
          fetch("/api/inspection-files", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ group_id: gid, client_name: insp.client_name, inspection_date: insp.date_of_inspection }),
          })
            .then(r => r.json())
            .then(data => {
              if (data.success && data.files) {
                setGroupFiles(prev => ({ ...prev, [gid]: data.files }));
                // Update inspection flags based on filesystem
                const f = data.files;
                setInspections(prev => prev.map(s => {
                  if (String(s.id) !== id) return s;
                  return {
                    ...s,
                    has_rfi: s.has_rfi || (f.rfi && f.rfi.length > 0),
                    has_invoice: s.has_invoice || (f.invoice && f.invoice.length > 0),
                    has_lab: s.has_lab || (f.coa && f.coa.length > 0) || (f.lab && f.lab.length > 0),
                    has_compliance: s.has_compliance || (f.compliance && f.compliance.length > 0) || (f.composition && f.composition.length > 0),
                    has_lab_form: s.has_lab_form || (f.lab_form && f.lab_form.length > 0),
                    products: s.products?.map(p => {
                      const hasLabFiles = (f.coa && f.coa.length > 0) || (f.lab && f.lab.length > 0);
                      return {
                        ...p,
                        coa_uploaded: p.coa_uploaded || (p.is_sample_taken && hasLabFiles),
                        composition_uploaded: p.composition_uploaded || (f.composition && f.composition.length > 0),
                        occurrence_uploaded: p.occurrence_uploaded || (f.occurrence && f.occurrence.length > 0),
                        retest_uploaded: p.retest_uploaded || (f.retest && f.retest.length > 0),
                        other_uploaded: p.other_uploaded || (f.other && f.other.length > 0),
                        lab_form_uploaded: p.lab_form_uploaded || (f.lab_form && f.lab_form.length > 0),
                      };
                    }),
                  };
                }));
              }
            })
            .catch(err => console.error("Error fetching file info:", err));
        }
      }
      return next;
    });
  }, [inspections, groupFiles]);

  // Filter options: use full lists from backend, fallback to current page
  const inspectorOptions = allInspectors.length > 0 ? allInspectors : [...new Set(inspections.map(i => i.inspector_name).filter(Boolean))].sort() as string[];
  const corpGroupOptions = allCorpGroups.length > 0 ? allCorpGroups : [...new Set(inspections.map(i => i.corporate_group).filter(Boolean))].sort() as string[];
  const groupTypeOptions = ["Corporate Store", "Franchise Store", "Individual / Independent Owner"];
  const clientOptions = useMemo(() => [...new Set(inspections.map(i => i.client_name).filter(Boolean))].sort() as string[], [inspections]);


  // Server-side filtering — backend handles all filters, no client-side filtering needed
  const filteredInspections = inspections;

  // Server-side pagination — inspections are already the current page
  const paginatedInspections = filteredInspections;
  const safeCurrentPage = currentPage;

  // When page changes, re-fetch from server
  const goToPage = (page: number) => {
    setCurrentPage(page);
    if (showUndeliverable) {
      fetchUndeliverable(page);
    } else {
      fetchInspections(showDuplicates, dateFrom, dateTo, page, debouncedSearch, appliedFilters);
    }
  };

  const expandAll = () => setExpandedGroups(new Set(filteredInspections.map(i => String(i.id))));
  const collapseAll = () => setExpandedGroups(new Set());

  const truncate = (str: string, len: number) =>
    str.length > len ? str.substring(0, len) + "..." : str;

  const isPoultryOrEggs = (commodity: string) => {
    const upper = (commodity || "").toUpperCase();
    return upper === "POULTRY" || upper === "EGGS";
  };

  const isPmpOrRaw = (commodity: string) => {
    const upper = (commodity || "").toUpperCase();
    return upper === "PMP" || upper === "RAW";
  };

  const inspectionHasPmpOrRaw = (s: Inspection) => {
    return (s.products || []).some(p => isPmpOrRaw(p.commodity));
  };

  const groupNeedsRfi = (s: Inspection): boolean => {
    const products = s.products || [];
    if (products.length === 0) return true;
    return products.some(p => isPmpOrRaw(p.commodity));
  };

  const getSampleBadge = (product: Product, isOccurrence: boolean, _hasCompliance: boolean) => {
    if (isPoultryOrEggs(product.commodity)) return null;
    if (isOccurrence || !product.coa_uploaded) {
      return { label: "Sample: N/A", bg: "#9ca3af" };
    }
    if (product.is_sample_taken) {
      return product.is_direction_present_for_this_inspection
        ? { label: "Sample: Non-Compliant (Sampled)", bg: "#ef4444" }
        : { label: "Sample: Compliant (Sampled)", bg: "#22c55e" };
    }
    return product.is_direction_present_for_this_inspection
      ? { label: "Sample: Non-Compliant", bg: "#ef4444" }
      : { label: "Sample: Compliant", bg: "#22c55e" };
  };

  const getProductBadge = (product: Product, isOccurrence: boolean, hasCompliance: boolean) => {
    if (isOccurrence) {
      return { label: "Product: N/A", bg: "#9ca3af" };
    }
    if (hasCompliance || product.composition_uploaded) {
      return product.is_product_compliant
        ? { label: "Product: Compliant", bg: "#22c55e" }
        : { label: "Product: Non-Compliant", bg: "#ef4444" };
    }
    return { label: "Product: N/A", bg: "#9ca3af" };
  };

  const getRetestBadge = (product: Product) => {
    if (isPoultryOrEggs(product.commodity)) return null;
    const val = (product.needs_retest || "").toUpperCase();
    if (val === "YES") return { label: "Needs Retest: Yes", bg: "#22c55e" };
    if (val === "NO") return { label: "Needs Retest: No", bg: "#ef4444" };
    return { label: "Needs Retest: N/A", bg: "#9ca3af" };
  };

  const UploadBtn = ({ label, uploaded, onClick, uploadKey }: { label: string; uploaded: boolean; onClick: () => void; uploadKey?: string }) => {
    const isUploading = uploadKey ? uploadingKeys.has(uploadKey) : false;
    return (
      <button
        style={{
          padding: "6px 14px",
          background: isUploading ? "#f59e0b" : uploaded ? "#22c55e" : "#6c757d",
          color: "white",
          border: "none",
          borderRadius: 4,
          cursor: isUploading ? "wait" : "pointer",
          fontSize: 9,
          opacity: isUploading ? 0.8 : 1,
        }}
        disabled={isUploading}
        onClick={e => { e.stopPropagation(); onClick(); }}
      >
        {isUploading ? "Uploading..." : label}
      </button>
    );
  };

  const DisabledBtn = ({ label }: { label: string }) => (
    <button
      style={{
        padding: "6px 14px",
        background: "#d1d5db",
        color: "#9ca3af",
        border: "none",
        borderRadius: 4,
        cursor: "not-allowed",
        fontSize: 9,
      }}
      disabled
    >
      {label}
    </button>
  );

  const renderDetailRow = (s: Inspection) => {
    const products = s.products || [];
    const isOccurrence = !!s.is_occurrence_report;

    console.log(`[DEBUG] renderDetailRow: client=${s.client_name}, isOccurrence=${isOccurrence}, products.length=${products.length}, roleLoaded=${roleLoaded}, role=${role}, isLabTech=${isLabTech}, s.id=${s.id}, s.comment=${s.comment ? 'yes' : 'no'}`);

    return (
      <div className="ir-detail-content" style={{ background: "#f8fafc" }}>
        {/* Main Layout: Facility info on left, Products list on right */}
        <div className="ir-detail-layout" style={{ display: "flex", gap: 12, padding: 8, alignItems: "flex-start" }}>

          {/* LEFT PANEL - Facility Info */}
          <div className="ir-detail-left" style={{
            flex: "0 0 180px",
            background: "white",
            borderRadius: 8,
            padding: 10,
            boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
            borderLeft: "3px solid #007890",
          }}>
            <div style={{ fontSize: 11, color: "#007890", fontWeight: 600, marginBottom: 4 }}>Facility</div>
            <div style={{ fontSize: 11, color: "#374151", fontWeight: 500 }}>
              {truncate(s.client_name || "", 22)}
            </div>
            {s.town && (
              <div style={{ fontSize: 8, color: "#6b7280", margin: "2px 0" }}>
                <i className="fas fa-map-marker-alt" style={{ width: 10, color: "#007890" }} />
                <span style={{ fontWeight: 500 }}>{s.town}</span>
              </div>
            )}
            {s.inspector_name && (
              <div style={{ fontSize: 8, color: "#6b7280", margin: "2px 0" }}>
                <i className="fas fa-user" style={{ width: 10, color: "#007890" }} />
                <span style={{ fontWeight: 600 }}>{s.inspector_name}</span>
              </div>
            )}

            {s.group_type && (
              <div style={{ fontSize: 8, color: "#6b7280", marginBottom: 2 }}>
                <span style={{ padding: "1px 4px", background: "#e5e7eb", borderRadius: 2 }}>{s.group_type}</span>
              </div>
            )}
            {s.facility_type && (
              <div style={{ fontSize: 8, color: "#6b7280", marginBottom: 2 }}>
                <span style={{ padding: "1px 4px", background: "#dbeafe", color: "#1e40af", borderRadius: 2 }}>{s.facility_type}</span>
              </div>
            )}
            {s.internal_account_code && (
              <div style={{ fontSize: 8, color: "#6b7280", marginBottom: 2 }} title="Internal account code">
                <i className="fas fa-id-badge" style={{ width: 10, color: "#007890" }} />
                <span style={{ fontWeight: 600 }}>Account: {s.internal_account_code}</span>
              </div>
            )}

            {isOccurrence && (
              <>
                <div style={{ margin: "4px 0" }}>
                  <span style={{ fontSize: 8, padding: "2px 6px", background: "#fef3c7", color: "#92400e", borderRadius: 3, fontWeight: 600 }}>
                    <i className="fas fa-exclamation-triangle" style={{ marginRight: 2 }} />OCCURRENCE REPORT
                  </span>
                </div>
                {/* Occurrence Report Details */}
                <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #fcd34d" }}>
                  {s.registration_code && (
                    <div style={{ fontSize: 8, color: "#6b7280", marginBottom: 3 }}>
                      <i className="fas fa-id-card" style={{ width: 12, color: "#f59e0b" }} />
                      <span style={{ fontWeight: 500 }}>Reg:</span> {s.registration_code}
                    </div>
                  )}
                  {s.physical_address && (
                    <div style={{ fontSize: 8, color: "#6b7280", marginBottom: 3 }}>
                      <i className="fas fa-map-marker-alt" style={{ width: 12, color: "#f59e0b" }} />
                      {truncate(s.physical_address, 30)}
                    </div>
                  )}
                  {s.telephone && (
                    <div style={{ fontSize: 8, color: "#6b7280", marginBottom: 3 }}>
                      <i className="fas fa-phone" style={{ width: 12, color: "#f59e0b" }} />
                      {s.telephone}
                    </div>
                  )}
                  {s.time_of_visit && (
                    <div style={{ fontSize: 8, color: "#6b7280", marginBottom: 3 }}>
                      <i className="fas fa-clock" style={{ width: 12, color: "#f59e0b" }} />
                      <span style={{ fontWeight: 500 }}>Time:</span> {s.time_of_visit}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Emails */}
            <div style={{ marginBottom: 6 }}>
              {s.email ? (
                <div style={{ fontSize: 8, color: "#3b82f6", wordBreak: "break-all" }}>{s.email}</div>
              ) : (
                <div style={{ fontSize: 8, color: "#6b7280" }}>-</div>
              )}
            </div>

            {/* Km + Hours (not for occurrence, not for lab tech) */}
            {!isOccurrence && roleLoaded && !isLabTechRestricted && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, borderTop: "1px solid #e5e7eb", paddingTop: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 9, color: "#374151", fontWeight: 500, minWidth: 40 }}>Km:</span>
                  <input
                    type="number"
                    style={{ width: 65, fontSize: 9, padding: 3, border: "1px solid #e5e7eb", borderRadius: 3 }}
                    value={s.km_traveled != null ? s.km_traveled : ""}
                    placeholder="0"
                    onClick={e => e.stopPropagation()}
                    onChange={e => {
                      const raw = e.target.value;
                      setInspections(prev => prev.map(i => i.id === s.id ? { ...i, km_traveled: raw === "" ? 0 : parseFloat(raw) || 0 } : i));
                    }}
                    onBlur={async e => {
                      const val = parseFloat(e.target.value) || 0;
                      try {
                        await fetch("/api/edit-inspection-group/", {
                          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
                          body: JSON.stringify({ inspection_id: s.id, km_traveled: val }),
                        });
                      } catch (err) { console.error("Failed to save km:", err); }
                    }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 9, color: "#374151", fontWeight: 500, minWidth: 40 }}>Hours:</span>
                  <input
                    type="number"
                    style={{ width: 65, fontSize: 9, padding: 3, border: "1px solid #e5e7eb", borderRadius: 3 }}
                    value={s.hours != null ? s.hours : ""}
                    placeholder="0"
                    onClick={e => e.stopPropagation()}
                    onChange={e => {
                      const raw = e.target.value;
                      setInspections(prev => prev.map(i => i.id === s.id ? { ...i, hours: raw === "" ? 0 : parseFloat(raw) || 0 } : i));
                    }}
                    onBlur={async e => {
                      const val = parseFloat(e.target.value) || 0;
                      try {
                        await fetch("/api/edit-inspection-group/", {
                          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
                          body: JSON.stringify({ inspection_id: s.id, hours: val }),
                        });
                      } catch (err) { console.error("Failed to save hours:", err); }
                    }}
                  />
                </div>
              </div>
            )}

            {/* Missing-sample flag — visible only to super admins & lab technicians */}
            {canFlag && !isOccurrence && (
              <div style={{ marginTop: 8, borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
                <button
                  onClick={e => { e.stopPropagation(); toggleSampleFlag(s); }}
                  title="Flag this visit: inspector didn't add the correct sampling information"
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    padding: "6px 8px", borderRadius: 5, fontSize: 9, fontWeight: 600, cursor: "pointer", border: "none",
                    background: flaggedGroups.has(String(s.group_id || s.id)) ? "#fee2e2" : "#f3f4f6",
                    color: flaggedGroups.has(String(s.group_id || s.id)) ? "#b91c1c" : "#374151",
                    boxShadow: flaggedGroups.has(String(s.group_id || s.id)) ? "0 0 0 1px rgba(220,38,38,0.25)" : "0 0 0 1px #e5e7eb",
                  }}
                >
                  <i className={flaggedGroups.has(String(s.group_id || s.id)) ? "fas fa-flag" : "far fa-flag"} style={{ fontSize: 9 }} />
                  {flaggedGroups.has(String(s.group_id || s.id)) ? "Flagged: no sampling info" : "Flag: no sampling info added"}
                </button>
              </div>
            )}

            {/* RFI + Invoice buttons (not for lab tech) */}
            {products.length > 0 && roleLoaded && !isLabTechRestricted && (
              <div style={{ display: "flex", gap: 4, marginTop: 8, borderTop: "1px solid #e5e7eb", paddingTop: 6 }}>
                {isOccurrence ? (
                  <>
                    <DisabledBtn label="RFI" />
                    <DisabledBtn label="Invoice" />
                  </>
                ) : (
                  <>
                    <UploadBtn
                      label="RFI"
                      uploaded={!!s.has_rfi}
                      uploadKey={`rfi-${products[0].id}`}
                      onClick={() => triggerUpload(products[0].id, s.group_id || '', 'rfi', products[0].id)}
                    />
                    {!isInspector && (
                      <UploadBtn
                        label="Invoice"
                        uploaded={!!s.has_invoice}
                        uploadKey={`invoice-${products[0].id}`}
                        onClick={() => triggerUpload(products[0].id, s.group_id || '', 'invoice', products[0].id)}
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* RIGHT PANEL - Products List (hidden for occurrence reports) */}
          <div style={{ flex: 1, display: isOccurrence ? "none" : "flex", flexDirection: "column", gap: 6, overflowX: "auto" }}>
            {products.length > 0 ? (
              products.map((product, idx) => {
                // For occurrence reports, only show first product row
                if (isOccurrence && idx > 0) return null;

                const sampleBadge = getSampleBadge(product, isOccurrence, !!s.has_compliance);
                const productBadge = getProductBadge(product, isOccurrence, !!s.has_compliance);
                const retestBadge = getRetestBadge(product);
                const hidePoultryEggs = isPoultryOrEggs(product.commodity);

                return (
                  <div key={product.id} className="ir-product-row" style={{
                    display: "flex", gap: 6, flexWrap: isOccurrence ? "wrap" : "nowrap", alignItems: "stretch",
                    background: "white", borderRadius: 6, padding: 6,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                  }}>
                    {/* Product Info + Test Flags */}
                    <div className="ir-product-info" style={{
                      flex: "0 0 180px",
                      background: product.is_direction_present_for_this_inspection ? "#fef2f2" : "#f0fdf4",
                      borderRadius: 4,
                      borderLeft: `3px solid ${product.is_direction_present_for_this_inspection ? "#ef4444" : "#22c55e"}`,
                      padding: 6,
                    }}>
                      <div style={{ fontSize: 9, color: "#6b7280" }}>
                        Commodity: <span style={{ fontWeight: 600, color: "#374151" }}>{truncate(product.commodity || "N/A", 12)}</span>
                      </div>
                      <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 2 }}>
                        Product: <span style={{ fontWeight: 600, color: "#374151" }}>{truncate(product.product_name || "N/A", 16)}</span>
                      </div>
                      {!hidePoultryEggs && (
                        <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 4, wordBreak: "break-word" }}>
                          Class: <span style={{ fontWeight: 600, color: "#374151" }}>{product.product_class || "N/A"}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" }}>
                        {sampleBadge && (
                          <span style={{ fontSize: 7, padding: "2px 4px", background: sampleBadge.bg, color: "white", borderRadius: 2 }}>
                            {sampleBadge.label}
                          </span>
                        )}
                        {productBadge && (
                          <span style={{ fontSize: 7, padding: "2px 4px", background: productBadge.bg, color: "white", borderRadius: 2 }}>
                            {productBadge.label}
                          </span>
                        )}
                        {retestBadge && (
                          <span style={{ fontSize: 7, padding: "2px 4px", background: retestBadge.bg, color: "white", borderRadius: 2 }}>
                            {retestBadge.label}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* DNA/Fat/Protein/Calcium Grid - hide for POULTRY/EGGS */}
                    {!hidePoultryEggs && (
                      <div className="ir-product-tests" style={{
                        flex: "0 0 135px",
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 5,
                        fontSize: 11,
                        padding: 8,
                        background: "#f9fafb",
                        borderRadius: 4,
                      }}>
                        <div>
                          <span style={{ color: "#6b7280" }}>DNA:</span>{" "}
                          <span style={{ color: product.dna ? "#22c55e" : "#ef4444", fontWeight: 500 }}>{product.dna ? "Y" : "N"}</span>
                        </div>
                        <div>
                          <span style={{ color: "#6b7280" }}>Fat:</span>{" "}
                          <span style={{ color: product.fat ? "#22c55e" : "#ef4444", fontWeight: 500 }}>{product.fat ? "Y" : "N"}</span>
                        </div>
                        <div>
                          <span style={{ color: "#6b7280" }}>Pro:</span>{" "}
                          <span style={{ color: product.protein ? "#22c55e" : "#ef4444", fontWeight: 500 }}>{product.protein ? "Y" : "N"}</span>
                        </div>
                        <div>
                          <span style={{ color: "#6b7280" }}>Cal:</span>{" "}
                          <span style={{ color: product.calcium ? "#22c55e" : "#ef4444", fontWeight: 500 }}>{product.calcium ? "Y" : "N"}</span>
                        </div>
                      </div>
                    )}

                    {/* Upload Buttons */}
                    <div style={{ flex: 1, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {isOccurrence ? (
                        <>
                          {roleLoaded && !isLabTechRestricted && <DisabledBtn label="Compliance" />}
                          {roleLoaded && !isLabTechRestricted && <DisabledBtn label="Composition" />}
                          <DisabledBtn label="COA/Lab" />
                          <DisabledBtn label="Lab Form" />
                          <DisabledBtn label="Retest" />
                          <UploadBtn
                            label="Occurrence"
                            uploaded={product.occurrence_uploaded}
                            uploadKey={`occurrence-${product.id}`}
                            onClick={() => triggerUpload(product.id, s.group_id || '', 'occurrence', product.id)}
                          />
                          <DisabledBtn label="Other" />
                        </>
                      ) : (
                        <>
                          {roleLoaded && !isLabTechRestricted && (
                            <UploadBtn
                              label="Compliance"
                              uploaded={product.compliance_uploaded ?? false}
                              uploadKey={`compliance-${product.id}`}
                              onClick={() => triggerUpload(product.id, s.group_id || '', 'compliance', product.id)}
                            />
                          )}
                          {roleLoaded && !isLabTechRestricted && (
                            <UploadBtn
                              label="Composition"
                              uploaded={product.composition_uploaded}
                              uploadKey={`composition-${product.id}`}
                              onClick={() => triggerUpload(product.id, s.group_id || '', 'composition', product.id)}
                            />
                          )}
                          {((!hidePoultryEggs && !isInspector) || canUploadAll) && (
                            <>
                              <UploadBtn
                                label="COA/Lab"
                                uploaded={product.coa_uploaded}
                                uploadKey={`lab-${product.id}`}
                                onClick={() => triggerUpload(product.id, s.group_id || '', 'lab', product.id)}
                              />
                              <UploadBtn
                                label="Lab Form"
                                uploaded={product.lab_form_uploaded ?? false}
                                uploadKey={`lab_form-${product.id}`}
                                onClick={() => triggerUpload(product.id, s.group_id || '', 'lab_form', product.id)}
                              />
                              <UploadBtn
                                label="Retest"
                                uploaded={product.retest_uploaded}
                                uploadKey={`retest-${product.id}`}
                                onClick={() => triggerUpload(product.id, s.group_id || '', 'retest', product.id)}
                              />
                            </>
                          )}
                          <UploadBtn
                            label="Other"
                            uploaded={product.other_uploaded}
                            uploadKey={`other-${product.id}`}
                            onClick={() => triggerUpload(product.id, s.group_id || '', 'other', product.id)}
                          />
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            ) : isOccurrence ? (
              <div style={{
                flex: 1, background: "white", borderRadius: 4,
                boxShadow: "0 1px 2px rgba(0,0,0,0.1)", padding: 8,
              }}>
                <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, color: "#92400e" }}>Occurrence Report</span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {roleLoaded && !isLabTechRestricted && <DisabledBtn label="Compliance" />}
                  {roleLoaded && !isLabTechRestricted && <DisabledBtn label="Composition" />}
                  <DisabledBtn label="COA/Lab" />
                  <DisabledBtn label="Lab Form" />
                  <DisabledBtn label="Retest" />
                  <UploadBtn
                    label="Occurrence"
                    uploaded={false}
                    uploadKey={`occurrence-${s.id}`}
                    onClick={() => triggerUpload(s.id, s.group_id || '', 'occurrence', s.id)}
                  />
                  <DisabledBtn label="Other" />
                </div>
              </div>
            ) : (
              <div style={{
                flex: 1, background: "white", borderRadius: 4,
                boxShadow: "0 1px 2px rgba(0,0,0,0.1)", padding: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ color: "#9ca3af", fontSize: 11 }}>No inspection records</span>
              </div>
            )}
          </div>

          {/* Occurrence: Upload Buttons + Description - always visible below */}
          {isOccurrence && (
            <div style={{ width: "100%", marginTop: 8 }}>
              {/* Upload Buttons */}
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                {roleLoaded && !isLabTechRestricted && <DisabledBtn label="Compliance" />}
                {roleLoaded && !isLabTechRestricted && <DisabledBtn label="Composition" />}
                <DisabledBtn label="COA/Lab" />
                <DisabledBtn label="Lab Form" />
                <DisabledBtn label="Retest" />
                <UploadBtn
                  label="Occurrence"
                  uploaded={products.length > 0 ? products[0].occurrence_uploaded : false}
                  uploadKey={`occurrence-occ-${s.id}`}
                  onClick={() => {
                    const pid = products.length > 0 ? products[0].id : s.id;
                    triggerUpload(pid, s.group_id || '', 'occurrence', pid);
                  }}
                />
                <DisabledBtn label="Other" />
              </div>
              {/* Description */}
              <div style={{ padding: "8px 10px", background: "#fffbeb", borderRadius: 6, border: "1px solid #fde68a", fontSize: 9, color: s.comment ? "#374151" : "#9ca3af", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, color: "#92400e", marginBottom: 3, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  <i className="fas fa-file-alt" style={{ marginRight: 4 }} />Description
                </div>
                {s.comment || <em>No description provided</em>}
              </div>
            </div>
          )}

        </div>
      </div>
    );
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 36, height: 36, border: "3px solid #e2e8f0", borderTopColor: "#007890", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
        <div style={{ fontSize: 14, color: "#64748b" }}>Loading...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .ir-mobile-cards { display: none; }
        .ir-desktop-table { display: block; }
        @media (max-width: 768px) {
          .ir-mobile-cards { display: block; }
          .ir-desktop-table { display: none !important; }
        }
      `}</style>
      {/* Hidden file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        style={{ display: "none" }}
        onChange={handleFileSelected}
      />

      {/* Toast notification */}
      {toastMessage && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#1f2937", color: "white",
          padding: "10px 24px", borderRadius: 8,
          zIndex: 9999, fontSize: 13, fontWeight: 500,
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          display: "flex", alignItems: "center", gap: 8,
          animation: "fadeIn 0.3s ease",
        }}>
          <i className="fas fa-check-circle" style={{ color: "#22c55e", fontSize: 16 }} />
          {toastMessage}
        </div>
      )}

      {/* Compliance Status Modal (for Compliance/Composition uploads) */}
      {complianceModal?.show && complianceModal.type === 'product' && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 9999,
        }} onClick={() => setComplianceModal(null)}>
          <div style={{
            background: "white", borderRadius: 12, padding: 24,
            maxWidth: 400, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 8px", fontSize: 18, color: "#1f2937" }}>Product Compliance Status</h3>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#6b7280" }}>
              Select the compliance status for this {complianceModal.documentType} document:
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                style={{
                  flex: 1, padding: "12px 16px", background: "#22c55e", color: "white",
                  border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600,
                }}
                onClick={() => handleComplianceSelect('compliant')}
              >
                Compliant
              </button>
              <button
                style={{
                  flex: 1, padding: "12px 16px", background: "#ef4444", color: "white",
                  border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600,
                }}
                onClick={() => handleComplianceSelect('non-compliant')}
              >
                Non-Compliant
              </button>
            </div>
            <button
              style={{
                marginTop: 12, width: "100%", padding: "8px", background: "#e5e7eb",
                color: "#374151", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13,
              }}
              onClick={() => setComplianceModal(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* COA Compliance Status Modal (for COA/Lab uploads) */}
      {complianceModal?.show && complianceModal.type === 'coa' && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 9999,
        }} onClick={() => setComplianceModal(null)}>
          <div style={{
            background: "white", borderRadius: 12, padding: 24,
            maxWidth: 400, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 8px", fontSize: 18, color: "#1f2937" }}>COA/Lab Compliance Status</h3>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#6b7280" }}>
              Select the compliance status for this COA/Lab result:
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                style={{
                  flex: 1, padding: "12px 16px", background: "#22c55e", color: "white",
                  border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600,
                }}
                onClick={() => handleComplianceSelect('compliant')}
              >
                Compliant
              </button>
              <button
                style={{
                  flex: 1, padding: "12px 16px", background: "#ef4444", color: "white",
                  border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600,
                }}
                onClick={() => handleComplianceSelect('non-compliant')}
              >
                Non-Compliant
              </button>
            </div>
            <button
              style={{
                marginTop: 12, width: "100%", padding: "8px", background: "#e5e7eb",
                color: "#374151", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13,
              }}
              onClick={() => setComplianceModal(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <style>{`
        :root {
          --primary: #007890;
          --primary-light: #e6f3f7;
          --border: #e5e7eb;
          --radius: 6px;
          --shadow-lg: 0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -1px rgba(0,0,0,0.06);
          --text: #1f2937;
          --text-light: #6b7280;
          --card-bg: #ffffff;
          --spacing: 5px;
        }
        .ir-container { width: 100%; padding: 5px 0; }
        .ir-header { padding: 10px 5px 20px; margin-bottom: 5px; width: 100%; text-align: center; }
        .ir-header h1 { color: white; font-size: 1.75rem; font-weight: 600; margin-bottom: 4px; text-shadow: 0 1px 4px rgba(0,0,0,0.5); }
        .ir-header h2 { color: white; font-size: 1rem; font-weight: 400; text-shadow: 0 1px 3px rgba(0,0,0,0.4); }
        .ir-card { background: #fff; border-radius: 6px; box-shadow: var(--shadow-lg); margin-bottom: 5px; border: 1px solid #e5e7eb; width: 100%; }
        .ir-card-header { padding: 16px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; }
        .ir-card-title { font-size: 1rem; font-weight: 600; color: #1f2937; display: flex; align-items: center; gap: 8px; }
        .ir-card-body { padding: 16px; overflow-x: auto; }
        .ir-action-bar { display: flex; gap: 12px; margin-bottom: 5px; width: 100%; flex-wrap: wrap; }
        .ir-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 16px; border-radius: 6px; border: none; font-weight: 500; font-size: 0.875rem; cursor: pointer; transition: all 0.15s ease; text-decoration: none; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .ir-btn-primary { background: #007890; color: white; }
        .ir-btn-primary:hover { background: #005a6b; }
        .ir-btn-secondary { background: #6b7280; color: white; }
        .ir-btn-secondary:hover { background: #4b5563; }
        .ir-btn-green { background: #22c55e; color: white; }
        .ir-btn-green:hover { background: #16a34a; }
        .ir-filter-form { display: flex; flex-direction: column; gap: 15px; }
        .ir-filter-row { display: flex; gap: 15px; flex-wrap: wrap; }
        .ir-filter-field { flex: 1; min-width: 150px; position: relative; }
        .ir-filter-top { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 12; margin-bottom: 14px; }
        .ir-filter-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-bottom: 14px; }
        .ir-filter-actions { display: flex; gap: 10px; align-items: center; padding-top: 10px; border-top: 1px solid #e5e7eb; flex-wrap: wrap; }
        .ir-form-label { font-size: 0.875rem; font-weight: 500; color: #6b7280; display: block; margin-bottom: 4px; }
        .ir-form-control { padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 0.875rem; color: #1f2937; background: #fff; width: 100%; box-sizing: border-box; }
        .ir-form-control:focus { outline: none; border-color: #007890; box-shadow: 0 0 0 3px #e6f3f7; }
        .ir-table { min-width: 100%; border-collapse: collapse; }
        .ir-table thead { background: #f9fafb; }
        .ir-table th { padding: 11px 12px; text-align: left; font-size: 0.75rem; font-weight: 600; color: #374151; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; }
        .ir-table th.center { text-align: center; }
        .ir-table td { padding: 11px 12px; font-size: 0.75rem; border-bottom: 1px solid #e5e7eb; color: #1f2937; vertical-align: middle; }
        .ir-table td.center { text-align: center; }
        .ir-badge { font-size: 9px; padding: 2px 4px; border-radius: 4px; font-weight: 600; display: inline-block; white-space: nowrap; }
        .ir-badge-green { background: #dcfce7; color: #166534; }
        .ir-badge-red { background: #fee2e2; color: #991b1b; }
        .ir-badge-grey { background: #e5e7eb; color: #9ca3af; }
        .ir-table-info { font-size: 0.875rem; color: #6b7280; margin-bottom: 12px; }
        .ir-approved-select { width: 98px; display: block; margin: 0 auto; padding: 2px 4px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.7rem; appearance: auto; -webkit-appearance: menulist; }
        .ir-detail-content { padding: 0; background: #f8fafc; border-top: 2px solid #e6f3f7; }
        @media (max-width: 768px) {
          .ir-header h1 { font-size: 1.1rem; }
          .ir-header h2 { font-size: 0.8rem; }
          .ir-header { padding: 8px 5px 12px; }
          .ir-filter-row { flex-direction: column; gap: 10px; }
          .ir-filter-field { min-width: 100%; }
          .ir-filter-top { grid-template-columns: 1fr !important; }
          .ir-filter-grid { grid-template-columns: 1fr 1fr !important; }
          .ir-filter-actions { flex-direction: column; align-items: stretch; }
          .ir-action-bar { gap: 6px; flex-wrap: wrap; }
          .ir-action-bar .ir-btn { padding: 6px 10px; font-size: 0.75rem; }
          .ir-card-header { padding: 10px; flex-wrap: wrap; gap: 8px; }
          .ir-card-body { padding: 6px; }
          .ir-table th, .ir-table td { padding: 4px 6px; font-size: 0.65rem; }
          .ir-table { min-width: 700px; }
          .ir-approved-select { width: 80px; font-size: 0.65rem; }
          .ir-detail-content { overflow-x: auto; }
          .ir-detail-layout { flex-direction: column !important; gap: 8px !important; padding: 6px !important; }
          .ir-detail-left { flex: 1 1 auto !important; width: 100% !important; }
          .ir-product-row { flex-wrap: wrap !important; }
          .ir-product-info { flex: 1 1 100% !important; min-width: 0 !important; }
          .ir-product-tests { flex: 1 1 100% !important; min-width: 0 !important; }
        }
        @media (max-width: 480px) {
          .ir-header h1 { font-size: 0.95rem; }
          .ir-header h2 { font-size: 0.7rem; }
          .ir-action-bar { gap: 4px; }
          .ir-action-bar .ir-btn { padding: 5px 8px; font-size: 0.7rem; gap: 4px; }
          .ir-table { min-width: 600px; }
          .ir-table th, .ir-table td { padding: 3px 4px; font-size: 0.6rem; }
          .ir-filter-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ padding: "5px 5px" }}>
        <div className="ir-container">

          {/* Header */}
          <div className="ir-header">
            <h1>Food Safety Agency (Pty) Ltd</h1>
            <h2>Claims Records Management</h2>
          </div>

          {/* Action Bar */}
          <div className="ir-action-bar">
            <a href="/" className="ir-btn ir-btn-primary"><i className="fas fa-home" /> Home</a>
            {roleLoaded && !isLabTechRestricted && <a href="/export-sheet" className="ir-btn ir-btn-secondary"><i className="fas fa-file-export" /> Export Sheet</a>}
            <button type="button" className="ir-btn ir-btn-secondary" onClick={expandAll}><i className="fas fa-expand-alt" /> Expand All</button>
            <button type="button" className="ir-btn ir-btn-secondary" onClick={collapseAll}><i className="fas fa-compress-alt" /> Collapse All</button>
            {roleLoaded && !isLabTechRestricted && <a href="/inspections/add" className="ir-btn ir-btn-green"><i className="fas fa-plus" /> Add Inspection</a>}
            {roleLoaded && !isLabTechRestricted && <a href="/clients" className="ir-btn" style={{ background: "#007890", color: "white" }}><i className="fas fa-users-cog" /> Client Allocation Sheet</a>}
            {roleLoaded && canApproveClients && (
              <a href="/clients-approval" className="ir-btn ir-btn-primary">
                <i className="fas fa-user-check" /> Clients Approval
                {pendingClientCount > 0 && (
                  <span style={{ background: "#dc2626", color: "white", borderRadius: 999, padding: "1px 7px", fontSize: 11, fontWeight: 700, marginLeft: 6 }}>
                    {pendingClientCount}
                  </span>
                )}
              </a>
            )}
          </div>

          {/* Filter Card */}
          <div className="ir-card">
            <div className="ir-card-header">
              <div className="ir-card-title"><i className="fas fa-filter" /> Filter Inspections</div>
            </div>
            <div className="ir-card-body" style={{ overflow: "visible" }}>
              {!roleLoaded ? (
                <div style={{ padding: "16px 0", display: "flex", alignItems: "center", gap: 10, color: "#6b7280", fontSize: 13 }}>
                  <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #e5e7eb", borderTopColor: "#007890", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                  Loading filters...
                </div>
              ) : (
              <form className="ir-filter-form" onSubmit={e => e.preventDefault()}>

                {/* Top row: Search fields + Dates */}
                <div className="ir-filter-top" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
                  <div className="ir-filter-field">
                    <label className="ir-form-label">Client Search</label>
                    <ClientSearchInput value={clientSearch} onChange={setClientSearch} options={clientOptions}
                      onEnter={() => {
                        setCurrentPage(1);
                        fetchInspections(showDuplicates, dateFrom, dateTo, 1, clientSearch, appliedFilters);
                      }}
                    />
                  </div>
                  <div className="ir-filter-field">
                    <label className="ir-form-label">Email</label>
                    <input type="text" className="ir-form-control" value={emailFilter} onChange={e => setEmailFilter(e.target.value)} placeholder="Filter by email..." />
                  </div>
                  <div className="ir-filter-field">
                    <label className="ir-form-label">Date From</label>
                    <input type="date" className="ir-form-control" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                  </div>
                  <div className="ir-filter-field">
                    <label className="ir-form-label">Date To</label>
                    <input type="date" className="ir-form-control" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                  </div>
                </div>

                {/* Sort + More filters toggle (always visible) */}
                <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
                  <div className="ir-filter-field" style={{ minWidth: 220 }}>
                    <label className="ir-form-label">Sort By</label>
                    <select value={sortBy}
                      onChange={e => { const v = e.target.value; setSortBy(v); const af = { ...appliedFilters, sort: v }; setAppliedFilters(af); setCurrentPage(1); fetchInspections(showDuplicates, dateFrom, dateTo, 1, debouncedSearch, af); }}
                      style={{ width: "100%", padding: "6px 10px", fontSize: "0.8rem", border: "1px solid #e5e7eb", borderRadius: 6, background: "white", color: "#1f2937", cursor: "pointer" }}>
                      <option value="date_desc">Inspection date — newest</option>
                      <option value="date_asc">Inspection date — oldest</option>
                      <option value="late_desc">Most days late</option>
                      <option value="late_asc">Least days late</option>
                      <option value="captured_desc">Recently captured</option>
                    </select>
                  </div>
                  <button type="button" onClick={() => setShowMoreFilters(v => !v)}
                    title={showMoreFilters ? "Hide the extra filters" : "Show all the extra filters"}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 14px", height: 34, fontSize: "0.8rem", fontWeight: 600, border: "1px solid #e5e7eb", borderRadius: 6, background: showMoreFilters ? "#e0f2fe" : "white", color: "#007890", cursor: "pointer" }}>
                    <i className="fas fa-sliders-h" />
                    {showMoreFilters ? "Fewer filters" : "More filters"}
                    <i className={`fas fa-chevron-${showMoreFilters ? "up" : "down"}`} style={{ fontSize: 10 }} />
                    {(() => { const c = [inspectorFilter, corpGroupFilter, groupTypeFilter, occurrenceFilter, sampledFilter, commodityFilter, sentStatusFilter, lateCaptureFilter, lateApprovalFilter, complianceFilter, approvedFilter, rfiFilter, invoiceFilter, coaFileFilter, complianceFileFilter, otherFileFilter, labFilter, testTypeFilter, retestFilter].filter(a => a && a.length > 0).length; return c > 0 ? <span style={{ background: "#007890", color: "white", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{c}</span> : null; })()}
                  </button>
                </div>

                {/* Collapsible advanced filters */}
                {showMoreFilters && (
                <div className="ir-filter-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 14 }}>
                  <IrMultiSelect label="Inspector" options={inspectorOptions} selected={inspectorFilter} onChange={setInspectorFilter} searchable />
                  <IrMultiSelect label="Business" options={corpGroupOptions} selected={corpGroupFilter} onChange={setCorpGroupFilter} searchable />
                  <IrMultiSelect label="Store Type" options={groupTypeOptions} selected={groupTypeFilter} onChange={setGroupTypeFilter} searchable />
                  <IrMultiSelect label="Occurrence" options={["OCCURRENCE", "INSPECTION"]} selected={occurrenceFilter} onChange={setOccurrenceFilter} />
                  <IrMultiSelect label="Sampled" options={["SAMPLED", "NOT_SAMPLED"]} selected={sampledFilter} onChange={setSampledFilter} />
                  <IrMultiSelect label="Commodity" options={["POULTRY", "EGGS", "PMP", "RAW"]} selected={commodityFilter} onChange={setCommodityFilter} />
                  <IrMultiSelect label="Sent Status" options={["SENT", "NOT_SENT"]} selected={sentStatusFilter} onChange={setSentStatusFilter} />
                  <IrMultiSelect label="Late Capture" options={["SAME_DAY", "NEXT_DAY", "AT_LIMIT", "LATE", "ON_TIME"]} optionLabels={{ SAME_DAY: "Same day", NEXT_DAY: "1 day — in time", AT_LIMIT: "2 days — at the limit", LATE: "Over 2 days — late", ON_TIME: "On time (≤ 2 days)" }} selected={lateCaptureFilter} onChange={setLateCaptureFilter} />
                  <IrMultiSelect label="Late Approval" options={["SAME_DAY", "NEXT_DAY", "AT_LIMIT", "LATE", "ON_TIME"]} optionLabels={{ SAME_DAY: "Approved same day", NEXT_DAY: "Approved in 1 day", AT_LIMIT: "Approved at 2 days — the limit", LATE: "Over 2 days — late", ON_TIME: "On time (≤ 2 days)" }} selected={lateApprovalFilter} onChange={setLateApprovalFilter} />
                  <IrMultiSelect label="Compliance" options={["COMPLIANT", "NON_COMPLIANT", "PENDING"]} selected={complianceFilter} onChange={setComplianceFilter} />
                  <IrMultiSelect label="Approved" options={["APPROVED", "PENDING"]} selected={approvedFilter} onChange={setApprovedFilter} />
                  <IrMultiSelect label="Has RFI" options={["HAS_RFI", "NO_RFI"]} selected={rfiFilter} onChange={setRfiFilter} />
                  <IrMultiSelect label="Has Invoice" options={["HAS_INVOICE", "NO_INVOICE"]} selected={invoiceFilter} onChange={setInvoiceFilter} />
                  <IrMultiSelect label="Has COA" options={["HAS_COA", "NO_COA"]} selected={coaFileFilter} onChange={setCoaFileFilter} />
                  <IrMultiSelect label="Has Compliance" options={["HAS_COMP", "NO_COMP"]} selected={complianceFileFilter} onChange={setComplianceFileFilter} />
                  <IrMultiSelect label="Has Other" options={["HAS_OTHER", "NO_OTHER"]} selected={otherFileFilter} onChange={setOtherFileFilter} />
                  {roleLoaded && (isLabTech || role === "super_admin" || role === "developer") && (
                    <>
                      <IrMultiSelect label="Lab" options={["Food Safety Laboratory", "Merieux NutriSciences", "AGRI Food Laboratory (SGS)", "SANBI", "SMT", "ARC"]} selected={labFilter} onChange={setLabFilter} />
                      <IrMultiSelect label="Test Type" options={["DNA", "FAT", "PROTEIN", "CALCIUM"]} selected={testTypeFilter} onChange={setTestTypeFilter} />
                      <IrMultiSelect label="Needs Retest" options={["NEEDS_RETEST", "NO_RETEST"]} selected={retestFilter} onChange={setRetestFilter} />
                    </>
                  )}
                </div>
                )}

                {/* Filter Actions */}
                <div className="ir-filter-actions">
                  <button type="button" className="ir-btn ir-btn-secondary" style={{ padding: "8px 16px", fontSize: 14 }}
                    onClick={() => {
                      setClientSearch(""); setDateFrom(""); setDateTo(""); setInspectorFilter([]); setCorpGroupFilter([]); setGroupTypeFilter([]); setSentStatusFilter([]); setComplianceFilter([]); setApprovedFilter([]); setFileStatusFilter([]); setRfiFilter([]); setInvoiceFilter([]); setCoaFileFilter([]); setComplianceFileFilter([]); setOtherFileFilter([]); setEmailFilter(""); setRetestFilter([]); setCoaStatusFilter([]); setLabFilter([]); setTestTypeFilter([]); setOccurrenceFilter([]); setSampledFilter([]); setCommodityFilter([]); setLateCaptureFilter([]); setLateApprovalFilter([]); setSortBy("date_desc");
                      setAppliedFilters({ inspector: [], corporateGroup: [], groupType: [], occurrence: [], sampled: [], commodity: [], sentStatus: [], compliance: [], approved: [], fileStatus: [], rfi: [], invoice: [], coaFile: [], complianceFile: [], otherFile: [], email: "", retest: [], coaStatus: [], lab: [], testType: [], lateCapture: [], lateApproval: [], sort: "date_desc" });
                      setCurrentPage(1);
                      fetchInspections(showDuplicates, "", "", 1, "");
                    }}>
                    <i className="fas fa-times" /> Clear All
                  </button>
                  <button type="button" className="ir-btn ir-btn-secondary" style={{ padding: "8px 16px", fontSize: 14 }}
                    onClick={() => {
                      const af = {
                        inspector: inspectorFilter, corporateGroup: corpGroupFilter,
                        groupType: groupTypeFilter, occurrence: occurrenceFilter, sampled: sampledFilter,
                        commodity: commodityFilter,
                        sentStatus: sentStatusFilter, compliance: complianceFilter, approved: approvedFilter,
                        fileStatus: fileStatusFilter, rfi: rfiFilter, invoice: invoiceFilter,
                        coaFile: coaFileFilter, complianceFile: complianceFileFilter, otherFile: otherFileFilter,
                        email: emailFilter, retest: retestFilter,
                        coaStatus: coaStatusFilter, lab: labFilter, testType: testTypeFilter,
                        lateCapture: lateCaptureFilter,
                        lateApproval: lateApprovalFilter,
                        sort: sortBy,
                      };
                      setAppliedFilters(af);
                      setCurrentPage(1);
                      fetchInspections(showDuplicates, dateFrom, dateTo, 1, debouncedSearch, af);
                    }}>
                    <i className="fas fa-filter" /> Apply Filters
                  </button>
                  {roleLoaded && !isLabTechRestricted && (showDuplicates ? (
                    <button type="button" className="ir-btn" style={{ padding: "8px 16px", fontSize: 14, background: "#dc2626", color: "#fff", borderRadius: 6 }}
                      onClick={() => { setShowDuplicates(false); setCurrentPage(1); fetchInspections(false, dateFrom, dateTo, 1, debouncedSearch, appliedFilters); }}>
                      <i className="fas fa-times" /> Clear Duplicates
                    </button>
                  ) : (
                    <button type="button" className="ir-btn" style={{ padding: "8px 16px", fontSize: 14, background: "#f59e0b", color: "#fff", borderRadius: 6 }}
                      onClick={() => { setShowDuplicates(true); setCurrentPage(1); fetchInspections(true, dateFrom, dateTo, 1, debouncedSearch, appliedFilters); }}>
                      <i className="fas fa-copy" /> View Duplicates
                      {duplicateGroupsCount > 0 && (
                        <span style={{ background: "#fff", color: "#f59e0b", borderRadius: 999, padding: "1px 7px", fontWeight: 700, marginLeft: 4, fontSize: 12 }}>{duplicateGroupsCount}</span>
                      )}
                    </button>
                  ))}
                  {roleLoaded && !isLabTechRestricted && (showUndeliverable ? (
                    <button type="button" className="ir-btn" style={{ padding: "8px 16px", fontSize: 14, background: "#dc2626", color: "#fff", borderRadius: 6 }}
                      onClick={() => { setShowUndeliverable(false); setShowDuplicates(false); setBouncedEmails(new Set()); setCurrentPage(1); fetchInspections(false, dateFrom, dateTo, 1, debouncedSearch, appliedFilters); }}>
                      <i className="fas fa-times" /> Clear Undeliverable
                    </button>
                  ) : (
                    <button type="button" className="ir-btn" style={{ padding: "8px 16px", fontSize: 14, background: "#ef4444", color: "#fff", borderRadius: 6 }}
                      onClick={() => { setShowUndeliverable(true); setShowDuplicates(false); setCurrentPage(1); fetchUndeliverable(1); }}>
                      <i className="fas fa-envelope-open-text" /> Undeliverable Emails
                      <span style={{ background: "#fff", color: "#ef4444", borderRadius: 999, padding: "1px 7px", fontWeight: 700, marginLeft: 4, fontSize: 12 }}>{undeliverableCount}</span>
                    </button>
                  ))}
                  {roleLoaded && (isAdmin || role === "super_admin" || role === "developer") && (
                    <button type="button" className="ir-btn" style={{ padding: "8px 16px", fontSize: 14, background: "#007890", color: "#fff", borderRadius: 6 }}
                      onClick={() => {
                        if (corpGroupFilter.length === 1) {
                          setCorpInvoiceGroup(corpGroupFilter[0]);
                          fetchCorpInvoiceMonths(corpGroupFilter[0]);
                        }
                        setCorpInvoiceModal(true);
                        fetchAllCorpInvoices();
                      }}>
                      <i className="fas fa-building" /> Corporate Invoice
                    </button>
                  )}
                </div>
              </form>
              )}
            </div>
          </div>

          {/* Table Card */}
          <div className="ir-card">
            <div className="ir-card-header">
              <div className="ir-card-title"><i className="fas fa-clipboard-check" /> Inspections List</div>
            </div>
            <div className="ir-card-body">
              <div className="ir-table-info" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <span>
                  {loading ? "Loading..." : filteredInspections.length < inspections.length
                    ? `Showing ${filteredInspections.length} of ${total} inspections (filtered)`
                    : `Showing ${(safeCurrentPage - 1) * PAGE_SIZE + 1}–${Math.min(safeCurrentPage * PAGE_SIZE, total)} of ${total} inspections`}
                </span>
                {/* Days Late colour legend */}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 12, fontSize: 11, color: "#6b7280", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600 }}>Days Late:</span>
                  {[
                    { color: "#2563eb", text: "Same day" },
                    { color: "#15803d", text: "1 day — in time" },
                    { color: "#ea580c", text: "2 days — at the limit" },
                    { color: "#dc2626", text: "Over 2 days — late" },
                  ].map(l => (
                    <span key={l.text} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: l.color, display: "inline-block" }} />
                      {l.text}
                    </span>
                  ))}
                  <span style={{ width: 1, height: 12, background: "#d1d5db", display: "inline-block" }} />
                  <span style={{ fontWeight: 600 }}>Files:</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <i className="fas fa-folder-open" style={{ color: "#007890" }} /> Normal inspection
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <i className="fas fa-folder-open" style={{ color: "#f97316" }} /> Occurrence report
                  </span>
                </span>
              </div>

              {/* Mobile Card Layout */}
              <div className="ir-mobile-cards">
                {loading ? (
                  <div style={{ textAlign: "center", padding: 32, color: "#6b7280" }}>
                    <div style={{ display: "inline-block", width: 18, height: 18, borderRadius: "50%", border: "3px solid #e5e7eb", borderTopColor: "#007890", animation: "spin 0.8s linear infinite", marginRight: 8 }} />Loading...
                  </div>
                ) : paginatedInspections.map(s => (
                  <div key={`mobile-${s.id}`} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", marginBottom: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                    {/* Card Header */}
                    <div
                      onClick={() => toggleGroup(String(s.id))}
                      style={{ background: "linear-gradient(135deg, #007890 0%, #005a6b 100%)", padding: "12px 14px", color: "white", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.client_name || "-"}</div>
                        <div style={{ fontSize: 11, opacity: 0.9 }}>{s.date_of_inspection ? new Date(s.date_of_inspection + "T12:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "-"}</div>
                        {s.is_occurrence_report && <span style={{ fontSize: 9, padding: "2px 6px", background: "#fef3c7", color: "#92400e", borderRadius: 4, fontWeight: 600, marginTop: 4, display: "inline-block" }}>OCCURRENCE REPORT</span>}
                      </div>
                      <i className={`fas fa-chevron-${expandedGroups.has(String(s.id)) ? "up" : "down"}`} style={{ fontSize: 14 }} />
                    </div>
                    {/* Card Body */}
                    <div style={{ padding: "10px 14px", fontSize: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: "#6b7280" }}>Inspector:</span>
                        <span style={{ fontWeight: 500 }}>{s.inspector_name || "-"}</span>
                      </div>
                      {s.town && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: "#6b7280" }}>Town:</span>
                        <span style={{ fontWeight: 500 }}>{s.town}</span>
                      </div>}
                      {s.internal_account_code && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: "#6b7280" }}>Account Code:</span>
                        <span style={{ fontWeight: 500, fontSize: 11, color: "#007890" }}>{s.internal_account_code}</span>
                      </div>}
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: "#6b7280" }}>Date of Inspection Captured:</span>
                        <span style={{ fontWeight: 500, color: s.late_capture ? "#dc2626" : undefined }} title={s.late_capture ? `Captured ${s.capture_lag_days} days after inspection (limit 2)` : undefined}>
                          {s.created_at ? new Date(s.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-"}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: "#6b7280" }}>Days Late:</span>
                        <span style={{ fontWeight: 700, color: s.capture_lag_days != null ? lagStyle(Math.max(0, s.capture_lag_days)).color : undefined }}>
                          {s.capture_lag_days != null ? <>{s.late_capture && <><i className="fas fa-exclamation-triangle" style={{ fontSize: 9 }} /> </>}{lagStyle(Math.max(0, s.capture_lag_days)).label}</> : "—"}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: "#6b7280" }}>Approval Days:</span>
                        <span style={{ fontWeight: 700, color: s.approval_lag_days != null ? lagStyle(Math.max(0, s.approval_lag_days)).color : undefined }}
                          title={s.approved_status === "APPROVED" ? "Days from capture to approval (limit 2)" : "Days waiting for approval so far (limit 2)"}>
                          {s.approval_lag_days != null ? <>{s.late_approval && <><i className="fas fa-exclamation-triangle" style={{ fontSize: 9 }} /> </>}{lagStyle(Math.max(0, s.approval_lag_days)).label}</> : "—"}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: "#6b7280" }}>Approved:</span>
                        <span style={{ textAlign: "right" }}>
                          <span className={`ir-badge ${s.approved_status === "APPROVED" ? "ir-badge-green" : "ir-badge-red"}`}>
                            {s.approved_status === "APPROVED" ? "Approved" : "Pending"}
                          </span>
                          {s.late_approval && (
                            <span style={{ display: "block", fontSize: "0.62rem", color: "#dc2626", fontWeight: 700, marginTop: 2 }}
                              title={s.approved_status === "APPROVED" ? `Approved ${s.approval_lag_days} days after capture (limit 2)` : `Waiting ${s.approval_lag_days} days for approval (limit 2)`}>
                              <i className="fas fa-exclamation-triangle" style={{ fontSize: 8 }} /> +{s.approval_lag_days}d late
                            </span>
                          )}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: "#6b7280" }}>Sent:</span>
                        <span className={`ir-badge ${s.sent_date ? "ir-badge-green" : "ir-badge-red"}`}>
                          {s.sent_date
                            ? `Sent: ${s.sent_by_name || "Unknown"} - ${new Date(s.sent_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`
                            : "Not Sent"}
                        </span>
                      </div>
                      {/* File Status Row */}
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6, marginBottom: 6 }}>
                        <span className={`ir-badge ${s.has_rfi ? "ir-badge-green" : groupNeedsRfi(s) ? "ir-badge-red" : "ir-badge-grey"}`}>RFI: {s.has_rfi ? "Yes" : groupNeedsRfi(s) ? "No" : "N/R"}</span>
                        <span className={`ir-badge ${s.has_invoice ? "ir-badge-green" : "ir-badge-red"}`}>Inv: {s.has_invoice ? "Yes" : "No"}</span>
                        <span className={`ir-badge ${s.has_lab ? "ir-badge-green" : "ir-badge-red"}`}>COA: {s.has_lab ? "Yes" : "No"}</span>
                        <span className={`ir-badge ${s.has_compliance ? "ir-badge-green" : "ir-badge-red"}`}>Comp: {s.has_compliance ? "Yes" : "No"}</span>
                      </div>
                      {s.email && <div style={{ fontSize: 11, color: "#3b82f6", wordBreak: "break-all" }}>{s.email}</div>}
                      {/* Action Buttons */}
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <button style={{ flex: 1, padding: "8px", background: "#007890", color: "white", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                          onClick={e => { e.stopPropagation(); openFilesModal(s.group_id || String(s.id), s.client_name, s.date_of_inspection); }}>
                          <i className="fas fa-folder-open" /> Files
                        </button>
                        {!isInspector && (
                          <button style={{ flex: 1, padding: "8px", background: s.sent_date ? "#6b7280" : "#22c55e", color: "white", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                            onClick={() => handleSendDocuments(s)}>
                            <i className="fas fa-paper-plane" /> {s.sent_date ? "Resend" : "Send"}
                          </button>
                        )}
                        <a href={`/inspections/edit-fsa/${s.products?.[0]?.id || s.id}`} style={{ flex: 1, padding: "8px", background: "#3b82f6", color: "white", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer", textAlign: "center", textDecoration: "none" }}
                          onClick={e => e.stopPropagation()}>
                          <i className="fas fa-edit" /> Edit
                        </a>
                        {canDelete && (
                          <button style={{ flex: 1, padding: "8px", background: "#ef4444", color: "white", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                            onClick={async e => {
                              e.stopPropagation();
                              if (!confirm(`Delete inspection for "${s.client_name}" on ${s.date_of_inspection ? new Date(s.date_of_inspection).toLocaleDateString("en-GB") : "unknown date"}?\n\nThis cannot be undone.`)) return;
                              try {
                                const res = await fetch("/api/delete-inspection-group/", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ group_id: s.group_id }),
                                });
                                const data = await res.json();
                                if (data.success) {
                                  setInspections(prev => prev.filter(i => i.id !== s.id));
                                  setTimeout(() => fetchInspections(showDuplicates, dateFrom, dateTo, currentPage, debouncedSearch, appliedFilters), 500);
                                } else {
                                  alert("Delete failed: " + (data.error || "Unknown error"));
                                }
                              } catch (err) {
                                alert("Delete error: " + (err instanceof Error ? err.message : String(err)));
                              }
                            }}>
                            <i className="fas fa-trash" /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Expanded Detail */}
                    {expandedGroups.has(String(s.id)) && (
                      <div style={{ borderTop: "2px solid #e6f3f7", background: "#f8fafc" }}>
                        {renderDetailRow(s)}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop Table Layout */}
              <div className="ir-desktop-table" style={{ overflowX: "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", borderRadius: 8 }}>
                <table className="ir-table" id="shipmentsTable">
                  <thead>
                    <tr>
                      <th style={{ width: "20%" }}>Facility</th>
                      <th className="center" style={{ width: 120 }} title="Where this inspection is in the back-office process, and who has the next action">Stage</th>
                      <th className="center" style={{ width: 1, whiteSpace: "nowrap", paddingLeft: 6, paddingRight: 6 }} title="Open the job's files">Files</th>
                      <th className="center" style={{ width: 118 }} title="RFI, Invoice, COA and Compliance on this job">Documents</th>
                      <th className="center" style={{ width: 108, whiteSpace: "normal", lineHeight: 1.3 }} title="Inspection date, and capture date with days late (limit 2)">Dates</th>
                      <th className="center" style={{ width: 92, whiteSpace: "normal", lineHeight: 1.3 }} title="Approval status and days taken to approve (limit 2)">Approval</th>
                      {roleLoaded && !isLabTechRestricted && <th style={{ width: 150, paddingLeft: 6, paddingRight: 6 }}>Email</th>}
                      <th className="center" style={{ width: 1, whiteSpace: "nowrap", paddingLeft: 6, paddingRight: 6 }}>Sent</th>
                      {roleLoaded && !isLabTechRestricted && <th className="center" style={{ width: 1, whiteSpace: "nowrap", paddingLeft: 4, paddingRight: 4 }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: "center", padding: 32, color: "#6b7280" }}>
                          <div style={{ display: "inline-block", width: 18, height: 18, borderRadius: "50%", border: "3px solid #e5e7eb", borderTopColor: "#007890", animation: "spin 0.8s linear infinite", verticalAlign: "middle", marginRight: 8 }} />Loading inspections...
                        </td>
                      </tr>
                    ) : paginatedInspections.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: "center", padding: 32, color: "#6b7280" }}>No inspections match the current filters</td>
                      </tr>
                    ) : paginatedInspections.map(s => {
                      const gid = String(s.id);
                      const isExpanded = expandedGroups.has(gid);
                      return (
                        <React.Fragment key={s.id}>
                          <tr onClick={() => toggleGroup(gid)}
                            style={{ cursor: "pointer", background: "white" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                            onMouseLeave={e => (e.currentTarget.style.background = "white")}>
                            <td>
                              <div style={{ maxWidth: 230 }}>
                                <div style={{ lineHeight: 1.45 }}>
                                  <span style={{ fontWeight: 600, color: s.is_occurrence_report ? "#f97316" : "#007890", fontSize: "0.75rem" }} title={s.is_occurrence_report ? "Occurrence report" : "Normal inspection"}>{s.client_name || "-"}</span>
                                  {showDuplicates && <span style={{ background: "#fef3c7", color: "#92400e", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99, marginLeft: 6, verticalAlign: "middle", display: "inline-block" }}>DUPLICATE</span>}
                                </div>
                                {s.inspector_name && <div style={{ fontSize: "0.65rem", color: "#6b7280", marginTop: 4 }}>{s.inspector_name}</div>}
                                {(() => {
                                  const comms = groupCommodities(s);
                                  if (comms.length === 0) return null;
                                  return (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }} title="Commodities inspected on this visit">
                                      {comms.map(cm => {
                                        const col = COMMODITY_STYLE[cm.name] || { bg: "#f3f4f6", c: "#374151" };
                                        return (
                                          <span key={cm.name} style={{ background: col.bg, color: col.c, fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, letterSpacing: 0.3 }}>
                                            {cm.name}{cm.count > 1 ? ` ×${cm.count}` : ""}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  );
                                })()}
                              </div>
                            </td>
                            {(() => { const st = processStage(s); return (
                              <td className="center" style={{ whiteSpace: "nowrap" }} title={st.hint}>
                                <span style={{ display: "inline-block", background: st.bg, color: st.color, border: `1px solid ${st.color}33`, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, lineHeight: 1.5 }}>
                                  {st.label}
                                </span>
                                {st.owner !== "—"
                                  ? <div style={{ fontSize: 10, color: st.color, fontWeight: 600, marginTop: 3 }} title={`Waiting on the ${st.owner} to act`}>
                                      <i className="fas fa-user-clock" style={{ fontSize: 9, marginRight: 3, opacity: 0.8 }} />Waiting on: {st.owner}
                                    </div>
                                  : <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 3 }}>{st.key === "occurrence" ? "No action needed" : "Nothing outstanding"}</div>}
                              </td>
                            ); })()}
                            <td className="center" style={{ paddingLeft: 6, paddingRight: 6 }}>
                              <button style={{ padding: "3px 8px", background: s.is_occurrence_report ? "#f97316" : "#007890", color: "white", border: "none", borderRadius: 3, cursor: "pointer", fontSize: 11 }}
                                title="Open files"
                                onClick={e => { e.stopPropagation(); openFilesModal(s.group_id || String(s.id), s.client_name, s.date_of_inspection); }}>
                                <i className="fas fa-folder-open" />
                              </button>
                            </td>
                            <td className="center">
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, width: 116, textAlign: "center", margin: "0 auto" }}>
                                  {roleLoaded && !isLabTechRestricted && (
                                    <span className={`ir-badge ${s.has_rfi ? "ir-badge-green" : groupNeedsRfi(s) ? "ir-badge-red" : "ir-badge-grey"}`} title={s.has_rfi ? "RFI on file" : groupNeedsRfi(s) ? "RFI missing" : "RFI not required"}>
                                      <i className={`fas fa-${s.has_rfi ? "check" : groupNeedsRfi(s) ? "times" : "minus"}`} style={{ fontSize: 8 }} /> RFI
                                    </span>
                                  )}
                                  {roleLoaded && !isLabTechRestricted && (
                                    <span className={`ir-badge ${s.has_invoice ? "ir-badge-green" : "ir-badge-red"}`} title={s.has_invoice ? "Invoice on file" : "Invoice missing"}>
                                      <i className={`fas fa-${s.has_invoice ? "check" : "times"}`} style={{ fontSize: 8 }} /> INV
                                    </span>
                                  )}
                                  <span className={`ir-badge ${s.has_lab ? "ir-badge-green" : "ir-badge-red"}`} title={s.has_lab ? "COA / lab result on file" : "No COA / lab result"}>
                                    <i className={`fas fa-${s.has_lab ? "check" : "times"}`} style={{ fontSize: 8 }} /> COA
                                  </span>
                                  {roleLoaded && !isLabTechRestricted && (
                                    <span className={`ir-badge ${s.has_compliance ? "ir-badge-green" : "ir-badge-red"}`} title={s.has_compliance ? "Compliance on file" : "Compliance missing"}>
                                      <i className={`fas fa-${s.has_compliance ? "check" : "times"}`} style={{ fontSize: 8 }} /> CMP
                                    </span>
                                  )}
                                </div>
                            </td>
                            <td style={{ fontSize: "0.65rem", whiteSpace: "nowrap" }}>
                              <div title="When the inspection took place">
                                <span style={{ color: "#9ca3af" }}>Inspection: </span>
                                <span style={{ color: "#374151", fontWeight: 600 }}>
                                  {s.date_of_inspection ? new Date(s.date_of_inspection + "T12:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-"}
                                </span>
                              </div>
                              <div style={{ marginTop: 3 }} title={s.late_capture ? `Captured ${s.capture_lag_days} days after inspection (limit 2)` : "When the inspection was captured"}>
                                <span style={{ color: "#9ca3af" }}>Capture: </span>
                                <span style={{ color: s.late_capture ? "#dc2626" : "#374151", fontWeight: 600 }}>
                                  {s.created_at ? new Date(s.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-"}
                                </span>
                              </div>
                              {s.capture_lag_days != null && (() => {
                                const n = Math.max(0, s.capture_lag_days);
                                return (
                                  <div style={{ marginTop: 3, textAlign: "center" }} title="Days between inspection and capture (limit 2)">
                                    <span style={{ fontWeight: 700, color: lagStyle(n).color }}>{n}</span>
                                    <span style={{ color: "#9ca3af" }}> {n === 1 ? "day late" : "days late"}</span>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="center">
                              {!canEditApproval ? (
                                <span className={`ir-badge ${s.approved_status === "APPROVED" ? "ir-badge-green" : "ir-badge-red"}`}>
                                  {s.approved_status === "APPROVED" ? "Approved" : "Pending"}
                                </span>
                              ) : (
                                <select className="ir-approved-select" onClick={e => e.stopPropagation()} value={s.approved_status || "PENDING"}
                                  onChange={async (e) => {
                                    const newStatus = e.target.value;
                                    setInspections(prev => prev.map(i => i.id === s.id ? { ...i, approved_status: newStatus } : i));
                                    try {
                                      const res = await fetch("/api/edit-inspection-group/", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        credentials: "include",
                                        body: JSON.stringify({ inspection_id: s.id, approved_status: newStatus }),
                                      });
                                      const data = await res.json();
                                      if (!data.success) console.error("Failed to update:", data.error);
                                    } catch (err) { console.error("Failed to update approved status:", err); }
                                  }}>
                                  <option value="PENDING">Pending</option>
                                  <option value="APPROVED">Approved</option>
                                </select>
                              )}
                              {s.approval_lag_days != null && (() => {
                                const n = Math.max(0, s.approval_lag_days);
                                return (
                                  <div style={{ fontSize: "0.62rem", fontWeight: 700, marginTop: 2, lineHeight: 1.25, color: lagStyle(n).color }}
                                    title={s.approved_status === "APPROVED" ? `Approved ${s.approval_lag_days} days after capture (limit 2)` : `Waiting ${s.approval_lag_days} days for approval (limit 2)`}>
                                    {s.late_approval && <i className="fas fa-exclamation-triangle" style={{ fontSize: 8 }} /> }{n} {n === 1 ? "day" : "days"} late for approval
                                  </div>
                                );
                              })()}
                            </td>
                            {roleLoaded && !isLabTechRestricted && (
                              <td style={{ fontSize: "0.72rem", color: "#6b7280", paddingLeft: 6, paddingRight: 6, maxWidth: 150 }} title={s.email || undefined}>
                                {s.email ? s.email.split(/[;,]/).map((e, ei) => {
                                  const trimmed = e.trim();
                                  const isBounced = showUndeliverable && bouncedEmails.has(trimmed.toLowerCase());
                                  return (
                                    <span key={ei} style={{ display: "block", overflowWrap: "anywhere" }}>
                                      <span style={isBounced ? { color: "#dc2626", fontWeight: 700, background: "#fef2f2", padding: "0 3px", borderRadius: 3 } : undefined}>
                                        {trimmed}
                                        {isBounced && <i className="fas fa-exclamation-triangle" style={{ fontSize: 9, marginLeft: 3, color: "#dc2626" }} />}
                                      </span>
                                    </span>
                                  );
                                }) : "-"}
                              </td>
                            )}
                            <td className="center" style={{ paddingLeft: 6, paddingRight: 6 }}>
                              {isInspector ? (
                                <span className={`ir-badge ${s.sent_date ? "ir-badge-green" : "ir-badge-red"}`}
                                  style={{ display: "inline-block", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "middle" }}
                                  title={s.sent_date ? `Sent by ${s.sent_by_name || "Unknown"} at ${new Date(s.sent_date).toLocaleString("en-GB")}` : "Not sent"}>
                                  <i className={`fas fa-${s.sent_date ? "check" : "times"}`} style={{ fontSize: 8 }} />{" "}
                                  {s.sent_date
                                    ? `${s.sent_by_name || "Unknown"} · ${new Date(s.sent_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`
                                    : "Not Sent"}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (!s.sent_date) {
                                      handleSendDocuments(s);
                                    } else {
                                      alert("Documents already sent.");
                                    }
                                  }}
                                  disabled={sendingId === s.id}
                                  title={s.sent_date ? `Documents sent by ${s.sent_by_name || "Unknown"} at ${new Date(s.sent_date).toLocaleString("en-GB")}` : "Send documents to client"}
                                  style={{
                                    padding: "3px 8px",
                                    border: "none",
                                    borderRadius: 4,
                                    cursor: s.sent_date ? "default" : sendingId === s.id ? "wait" : "pointer",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    whiteSpace: "nowrap",
                                    background: s.sent_date ? "#10b981" : sendingId === s.id ? "#fbbf24" : "#e5e7eb",
                                    color: s.sent_date ? "white" : sendingId === s.id ? "white" : "#6b7280",
                                    opacity: sendingId === s.id ? 0.8 : 1,
                                    maxWidth: s.sent_date ? 150 : undefined,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {s.sent_date
                                    ? `${s.sent_by_name || "Unknown"} · ${new Date(s.sent_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`
                                    : sendingId === s.id ? "Sending..." : "Send"}
                                </button>
                              )}
                            </td>
                            {roleLoaded && !isLabTechRestricted && (
                              <td className="center" style={{ paddingLeft: 4, paddingRight: 4, whiteSpace: "nowrap" }}>
                                <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                                  <a
                                    href={s.products && s.products.length > 0 ? `/inspections/edit-fsa/${s.products[0].id}/` : "#"}
                                    style={{ padding: "3px 6px", background: "#007890", color: "white", border: "none", borderRadius: 3, cursor: "pointer", fontSize: 11, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                                    onClick={e => e.stopPropagation()} title="Edit">
                                    <i className="fas fa-edit" />
                                  </a>
                                  {canDelete && (
                                    <button style={{ padding: "3px 6px", background: "#ef4444", color: "white", border: "none", borderRadius: 3, cursor: "pointer", fontSize: 11 }}
                                      title="Delete"
                                      onClick={async e => {
                                        e.stopPropagation();
                                        if (!confirm(`Delete inspection for "${s.client_name}" on ${s.date_of_inspection ? new Date(s.date_of_inspection).toLocaleDateString("en-GB") : "unknown date"}?\n\nThis cannot be undone.`)) return;
                                        try {
                                          console.log(`[Delete] Deleting group_id=${s.group_id}, client=${s.client_name}, id=${s.id}`);
                                          const res = await fetch("/api/delete-inspection-group/", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ group_id: s.group_id }),
                                          });
                                          console.log(`[Delete] Response status: ${res.status}`);
                                          const data = await res.json();
                                          console.log(`[Delete] Response data:`, data);
                                          if (data.success) {
                                            setInspections(prev => prev.filter(i => i.id !== s.id));
                                            // Refetch to get updated list from server
                                            setTimeout(() => fetchInspections(showDuplicates, dateFrom, dateTo, currentPage, debouncedSearch, appliedFilters), 500);
                                          } else {
                                            alert("Delete failed: " + (data.error || "Unknown error"));
                                          }
                                        } catch (err) {
                                          console.error(`[Delete] Error:`, err);
                                          alert("Delete error: " + (err instanceof Error ? err.message : String(err)));
                                        }
                                      }}>
                                      <i className="fas fa-trash" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={9} style={{ padding: 0 }}>
                                {renderDetailRow(s)}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "16px 0", borderTop: "1px solid #e5e7eb", marginTop: 8, flexWrap: "wrap" }}>
                  <button
                    disabled={safeCurrentPage === 1}
                    onClick={() => goToPage(1)}
                    style={{ padding: "5px 10px", fontSize: "0.75rem", border: "1px solid #d1d5db", borderRadius: 4, background: "#fff", color: safeCurrentPage === 1 ? "#d1d5db" : "#374151", cursor: safeCurrentPage === 1 ? "default" : "pointer" }}
                  >
                    <i className="fas fa-angle-double-left" />
                  </button>
                  <button
                    disabled={safeCurrentPage === 1}
                    onClick={() => goToPage(Math.max(1, safeCurrentPage - 1))}
                    style={{ padding: "5px 10px", fontSize: "0.75rem", border: "1px solid #d1d5db", borderRadius: 4, background: "#fff", color: safeCurrentPage === 1 ? "#d1d5db" : "#374151", cursor: safeCurrentPage === 1 ? "default" : "pointer" }}
                  >
                    <i className="fas fa-angle-left" />
                  </button>
                  {(() => {
                    const pages: number[] = [];
                    const maxVisible = 5;
                    let start = Math.max(1, safeCurrentPage - Math.floor(maxVisible / 2));
                    let end = Math.min(totalPages, start + maxVisible - 1);
                    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
                    for (let i = start; i <= end; i++) pages.push(i);
                    return pages.map(p => (
                      <button
                        key={p}
                        onClick={() => goToPage(p)}
                        style={{
                          padding: "5px 11px", fontSize: "0.75rem", borderRadius: 4, fontWeight: p === safeCurrentPage ? 700 : 400,
                          border: p === safeCurrentPage ? "1px solid #007890" : "1px solid #d1d5db",
                          background: p === safeCurrentPage ? "#007890" : "#fff",
                          color: p === safeCurrentPage ? "#fff" : "#374151",
                          cursor: "pointer",
                        }}
                      >
                        {p}
                      </button>
                    ));
                  })()}
                  <button
                    disabled={safeCurrentPage === totalPages}
                    onClick={() => goToPage(Math.min(totalPages, safeCurrentPage + 1))}
                    style={{ padding: "5px 10px", fontSize: "0.75rem", border: "1px solid #d1d5db", borderRadius: 4, background: "#fff", color: safeCurrentPage === totalPages ? "#d1d5db" : "#374151", cursor: safeCurrentPage === totalPages ? "default" : "pointer" }}
                  >
                    <i className="fas fa-angle-right" />
                  </button>
                  <button
                    disabled={safeCurrentPage === totalPages}
                    onClick={() => goToPage(totalPages)}
                    style={{ padding: "5px 10px", fontSize: "0.75rem", border: "1px solid #d1d5db", borderRadius: 4, background: "#fff", color: safeCurrentPage === totalPages ? "#d1d5db" : "#374151", cursor: safeCurrentPage === totalPages ? "default" : "pointer" }}
                  >
                    <i className="fas fa-angle-double-right" />
                  </button>
                  <span style={{ fontSize: "0.72rem", color: "#6b7280", marginLeft: 8 }}>
                    Page {safeCurrentPage} of {totalPages}
                  </span>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
      {/* Files Modal */}
      {filesModal.visible && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.6)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 9999,
          backdropFilter: "blur(2px)",
        }} onClick={() => setFilesModal(prev => ({ ...prev, visible: false }))}>
          <div style={{
            background: "#fff", borderRadius: 16,
            maxWidth: 900, width: "95%", maxHeight: "85vh", overflow: "hidden",
            boxShadow: "0 25px 60px rgba(0,0,0,0.3)",
            display: "flex", flexDirection: "column",
          }} onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={{ background: "linear-gradient(135deg, #007890 0%, #005a6b 100%)", padding: "18px 20px", color: "white" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.2 }}>
                    <i className="fas fa-folder-open" style={{ marginRight: 8, opacity: 0.9 }} />
                    {filesModal.clientName}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                    <i className="fas fa-calendar-alt" style={{ marginRight: 5, fontSize: 10 }} />
                    {filesModal.inspectionDate ? new Date(filesModal.inspectionDate + "T12:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "-"}
                  </div>
                </div>
                <button onClick={() => setFilesModal(prev => ({ ...prev, visible: false }))}
                  style={{ background: "rgba(255,255,255,0.15)", border: "none", fontSize: 18, cursor: "pointer", color: "white", padding: "4px 10px", borderRadius: 8, lineHeight: 1 }}>
                  &times;
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "16px 20px", overflow: "auto", flex: 1 }}>
            {filesModal.loading ? (
              <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", border: "4px solid #e5e7eb", borderTopColor: "#007890", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
                Loading files...
              </div>
            ) : (
              (() => {
                const categories: { key: string; label: string; color: string; icon: string }[] = [
                  { key: "rfi", label: "RFI", color: "#3b82f6", icon: "fa-file-alt" },
                  { key: "invoice", label: "Invoice", color: "#8b5cf6", icon: "fa-file-invoice-dollar" },
                  { key: "lab", label: "Lab / COA", color: "#06b6d4", icon: "fa-flask" },
                  { key: "lab_form", label: "Lab Form", color: "#14b8a6", icon: "fa-clipboard-list" },
                  { key: "retest", label: "Retest", color: "#f59e0b", icon: "fa-redo" },
                  { key: "compliance", label: "Compliance", color: "#22c55e", icon: "fa-check-double" },
                  { key: "occurrence", label: "Occurrence", color: "#ef4444", icon: "fa-exclamation-triangle" },
                  { key: "composition", label: "Composition", color: "#ec4899", icon: "fa-vial" },
                  { key: "other", label: "Other", color: "#6b7280", icon: "fa-paperclip" },
                ];
                const totalFiles = Object.values(filesModal.files).reduce((sum, arr) => sum + (arr?.length || 0), 0);
                return (
                  <>
                    {totalFiles === 0 ? (
                      <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
                        <i className="fas fa-folder-open" style={{ fontSize: 40, marginBottom: 12, color: "#d1d5db" }} /><br />
                        <span style={{ fontSize: 14, fontWeight: 500 }}>No files found</span><br />
                        <span style={{ fontSize: 12 }}>Upload files to see them here.</span>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
                        {totalFiles} file{totalFiles !== 1 ? "s" : ""} across {categories.filter(c => (filesModal.files[c.key] || []).length > 0).length} categor{categories.filter(c => (filesModal.files[c.key] || []).length > 0).length !== 1 ? "ies" : "y"}
                      </div>
                    )}
                    {categories.map(cat => {
                      const files = filesModal.files[cat.key] || [];
                      if (files.length === 0) return null;
                      return (
                        <div key={cat.key} style={{ marginBottom: 16, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                          {/* Category Header */}
                          <div style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "10px 14px", background: `${cat.color}10`, borderBottom: "1px solid #e5e7eb",
                          }}>
                            <div style={{ width: 28, height: 28, borderRadius: 6, background: cat.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <i className={`fas ${cat.icon}`} style={{ color: "white", fontSize: 12 }} />
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#1f2937" }}>{cat.label}</span>
                            <span style={{ fontSize: 11, color: "#6b7280", marginLeft: "auto" }}>
                              {files.length} file{files.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          {/* File List */}
                          {files.map((f, i) => {
                            const filePath = f.relative_path || f.path || "";
                            const viewUrl = `/api/serve-file?file=${encodeURIComponent(filePath)}&action=view`;
                            const downloadUrl = `/api/serve-file?file=${encodeURIComponent(filePath)}&action=download`;
                            const sizeLabel = f.size < 1024 ? `${f.size} B` : f.size < 1048576 ? `${(f.size / 1024).toFixed(1)} KB` : `${(f.size / 1048576).toFixed(1)} MB`;
                            return (
                              <div key={i} style={{
                                padding: "10px 14px",
                                borderBottom: i < files.length - 1 ? "1px solid #f3f4f6" : "none",
                                background: "#fff",
                              }}>
                                {/* File name + size */}
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                  <i className="fas fa-file-pdf" style={{ color: "#ef4444", fontSize: 16, flexShrink: 0 }} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{sizeLabel}</div>
                                  </div>
                                </div>
                                {/* Action buttons */}
                                <div style={{ display: "flex", gap: 6 }}>
                                  <a href={viewUrl} target="_blank" rel="noopener noreferrer"
                                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 8px", background: "#007890", color: "white", borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: "none" }}>
                                    <i className="fas fa-eye" style={{ fontSize: 10 }} />View
                                  </a>
                                  <a href={downloadUrl} download={f.name}
                                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 8px", background: "#3b82f6", color: "white", borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: "none" }}>
                                    <i className="fas fa-download" style={{ fontSize: 10 }} />Download
                                  </a>
                                  {/* Inspectors may upload documents but may NOT delete any of them. */}
                                  {!isInspector && (
                                    <button
                                      onClick={async () => {
                                        if (!confirm(`Delete "${f.name}"?`)) return;
                                        const res = await fetch("/api/delete-file", {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ file: filePath }),
                                        });
                                        const data = await res.json();
                                        if (data.success) {
                                          showToast(`Deleted: ${f.name}`);
                                          setFilesModal(prev => {
                                            const updated = { ...prev.files };
                                            Object.keys(updated).forEach(k => {
                                              updated[k] = updated[k].filter((_, fi) => !(k === cat.key && fi === i));
                                            });
                                            return { ...prev, files: updated };
                                          });
                                        } else {
                                          alert("Delete failed: " + (data.error || "Unknown error"));
                                        }
                                      }}
                                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 8px", background: "#ef4444", color: "white", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                                      <i className="fas fa-trash" style={{ fontSize: 10 }} />Delete
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </>
                );
              })()
            )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid #e5e7eb", background: "#f9fafb", display: "flex", gap: 8 }}>
              {Object.values(filesModal.files).some(arr => arr?.length > 0) && (
                <button
                  style={{
                    flex: 1, padding: "10px", background: "#007890",
                    color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
                  }}
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/download-all-files", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          client_name: filesModal.clientName,
                          inspection_date: filesModal.inspectionDate,
                          group_id: filesModal.groupId,
                        }),
                      });
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({ error: "Download failed" }));
                        alert(err.error || "Failed to download files");
                        return;
                      }
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${filesModal.clientName}_inspection_files.zip`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch (err) {
                      alert("Download error: " + (err instanceof Error ? err.message : String(err)));
                    }
                  }}
                >
                  <i className="fas fa-download" style={{ marginRight: 6 }} />Download All ({Object.values(filesModal.files).reduce((sum, arr) => sum + (arr?.length || 0), 0)})
                </button>
              )}
              <button
                style={{
                  flex: Object.values(filesModal.files).some(arr => arr?.length > 0) ? "none" : 1, minWidth: 90, padding: "10px 20px", background: "#e5e7eb",
                  color: "#374151", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
                }}
                onClick={() => setFilesModal(prev => ({ ...prev, visible: false }))}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Corporate Invoice Modal */}
      {corpInvoiceModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 9999,
        }} onClick={() => { setCorpInvoiceModal(false); setCorpInvoiceSelected(null); setCorpInvoiceFile(null); }}>
          <div style={{
            background: "#f3f4f6", borderRadius: 8, width: "96%", maxWidth: 1300,
            maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }} onClick={e => e.stopPropagation()}>

            {/* Top bar — matches ir-card-header style */}
            <div style={{ padding: "12px 16px", background: "#fff", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {corpInvoiceSelected && (
                  <button onClick={() => { setCorpInvoiceSelected(null); setCorpInvoiceFile(null); }}
                    style={{ background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 13, color: "#374151" }}>
                    <i className="fas fa-arrow-left" />
                  </button>
                )}
                <div className="ir-card-title">
                  <i className="fas fa-building" />
                  {corpInvoiceSelected
                    ? `${corpInvoiceGroup} — ${corpInvoiceSelected.label} Invoice`
                    : "Corporate Invoice"}
                </div>
              </div>
              <button onClick={() => { setCorpInvoiceModal(false); setCorpInvoiceSelected(null); setCorpInvoiceFile(null); }}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280", padding: "2px 8px", lineHeight: 1 }}>
                &times;
              </button>
            </div>

            {/* Phase 1: Group selector + month list */}
            {!corpInvoiceSelected && (
              <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
                {/* Group selector card */}
                <div className="ir-card" style={{ marginBottom: 12 }}>
                  <div className="ir-card-body" style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                    <div style={{ flex: 1 }}>
                      <label className="ir-form-label" style={{ marginBottom: 4, display: "block" }}>Business</label>
                      <CorpInvoiceGroupPicker
                        options={(allCorpGroups.length > 0 ? allCorpGroups : corpGroupOptions) as string[]}
                        value={corpInvoiceGroup}
                        onChange={(v) => { setCorpInvoiceGroup(v); if (v) fetchCorpInvoiceMonths(v); }}
                      />
                    </div>
                  </div>
                </div>

                {/* Month list card */}
                <div className="ir-card">
                  <div className="ir-card-header">
                    <div className="ir-card-title"><i className="fas fa-file-invoice-dollar" /> {corpInvoiceGroup ? "Monthly Invoices" : "All Uploaded Invoices"}</div>
                  </div>
                  <div className="ir-card-body">
                    {corpInvoiceLoading ? (
                      <div style={{ textAlign: "center", padding: 32, color: "#6b7280" }}>
                        <div style={{ display: "inline-block", width: 18, height: 18, borderRadius: "50%", border: "3px solid #e5e7eb", borderTopColor: "#007890", animation: "spin 0.8s linear infinite", marginRight: 8 }} />Loading...
                      </div>
                    ) : !corpInvoiceGroup ? (
                      /* Show all uploaded invoices across all groups */
                      corpAllInvoicesLoading ? (
                        <div style={{ textAlign: "center", padding: 32, color: "#6b7280" }}>
                          <div style={{ display: "inline-block", width: 18, height: 18, borderRadius: "50%", border: "3px solid #e5e7eb", borderTopColor: "#007890", animation: "spin 0.8s linear infinite", marginRight: 8 }} />Loading...
                        </div>
                      ) : corpAllInvoices.length === 0 ? (
                        <div className="ir-table-info" style={{ textAlign: "center", padding: 32 }}>No uploaded invoices found.</div>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table className="ir-table">
                            <thead>
                              <tr>
                                <th>Business</th>
                                <th>Month</th>
                                <th>File</th>
                                <th className="center" style={{ width: 140 }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {corpAllInvoices.map((inv, idx) => {
                                const [y, m] = inv.month.split("-");
                                const monthLabel = `${MONTH_NAMES[parseInt(m) - 1] || m} ${y}`;
                                return (
                                  <tr key={idx}>
                                    <td><span style={{ fontWeight: 600, color: "#007890" }}>{inv.corporate_group}</span></td>
                                    <td>{monthLabel}</td>
                                    <td style={{ fontSize: 12, color: "#64748b" }}>{inv.filename}</td>
                                    <td className="center" style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                                      <a href={`/api/corporate-invoice-file?corporate_group=${encodeURIComponent(inv.corporate_group_raw)}&month=${inv.month}&download=1`}
                                        target="_blank" rel="noopener noreferrer"
                                        style={{ padding: "4px 10px", background: "#007890", color: "#fff", borderRadius: 5, fontSize: 11, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                        <i className="fas fa-eye" style={{ fontSize: 9 }} />View
                                      </a>
                                      <button onClick={async () => {
                                        if (!confirm(`Delete ${inv.corporate_group} - ${monthLabel} invoice?`)) return;
                                        await fetch("/api/corporate-invoice-file", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ corporate_group: inv.corporate_group_raw, month: inv.month }) });
                                        fetchAllCorpInvoices();
                                      }}
                                        style={{ padding: "4px 10px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                        <i className="fas fa-trash" style={{ fontSize: 9 }} />Delete
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )
                    ) : corpInvoiceMonths.length === 0 ? (
                      <div className="ir-table-info" style={{ textAlign: "center", padding: 32 }}>No invoices found for {corpInvoiceGroup}.</div>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table className="ir-table">
                          <thead>
                            <tr>
                              <th>Month</th>
                              <th className="center" style={{ width: 90 }}>Stores</th>
                              <th className="center" style={{ width: 100 }}>Line Items</th>
                              <th style={{ width: 140, textAlign: "right" }}>Total</th>
                              <th className="center" style={{ width: 60 }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {corpInvoiceMonths.map(m => (
                              <tr key={m.month} onClick={() => { setCorpInvoiceSelected(m); checkCorpInvoiceFile(corpInvoiceGroup, m.month); fetchCorpEmails(corpInvoiceGroup); }}
                                style={{ cursor: "pointer" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "#f0fdf4")}
                                onMouseLeave={e => (e.currentTarget.style.background = "")}>
                                <td>
                                  <span style={{ fontWeight: 600, color: "#007890" }}>{m.label} Invoice</span>
                                </td>
                                <td className="center">{m.stores}</td>
                                <td className="center">{m.items.length}</td>
                                <td style={{ textAlign: "right", fontWeight: 600 }}>R{m.total.toFixed(2)}</td>
                                <td className="center"><i className="fas fa-chevron-right" style={{ fontSize: 10, color: "#94a3b8" }} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Phase 2: Selected month detail */}
            {corpInvoiceSelected && (() => {
              const sel = corpInvoiceSelected;
              return (
                <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
                  {/* Action bar card */}
                  <div className="ir-card" style={{ marginBottom: 12 }}>
                    <div className="ir-card-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                      <div className="ir-table-info" style={{ margin: 0 }}>
                        {sel.stores} store{sel.stores !== 1 ? "s" : ""} &middot; {sel.items.length} line items &middot; <b style={{ color: "#007890" }}>Total: R{sel.total.toFixed(2)}</b>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {corpInvoiceFile ? (
                          <>
                            <a href={`/api/corporate-invoice-file?corporate_group=${encodeURIComponent(corpInvoiceGroup)}&month=${sel.month}&download=1`} target="_blank" rel="noopener noreferrer"
                              style={{ padding: "6px 14px", background: "#007890", color: "#fff", borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
                              <i className="fas fa-eye" style={{ fontSize: 10 }} />View Invoice
                            </a>
                            <button onClick={() => corpInvoiceFileRef.current?.click()} disabled={corpInvoiceUploading}
                              style={{ padding: "6px 14px", background: "#6b7280", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                              <i className={`fas ${corpInvoiceUploading ? "fa-spinner fa-spin" : "fa-sync"}`} style={{ fontSize: 10 }} />Replace
                            </button>
                          </>
                        ) : (
                          <button onClick={() => corpInvoiceFileRef.current?.click()} disabled={corpInvoiceUploading}
                            style={{ padding: "6px 14px", background: "#007890", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <i className={`fas ${corpInvoiceUploading ? "fa-spinner fa-spin" : "fa-upload"}`} style={{ fontSize: 10 }} />
                            {corpInvoiceUploading ? "Uploading..." : "Upload Invoice"}
                          </button>
                        )}
                        <input ref={corpInvoiceFileRef} type="file" accept=".pdf" style={{ display: "none" }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadCorpInvoiceFile(f); e.target.value = ""; }} />
                        <button onClick={exportCorpInvoiceExcel}
                          style={{ padding: "6px 14px", background: "#10b981", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <i className="fas fa-file-excel" style={{ fontSize: 10 }} />Export Excel
                        </button>
                        <button onClick={() => setCorpSendConfirm(true)}
                          disabled={!corpInvoiceFile || corpEmails.length === 0 || corpInvoiceSending}
                          style={{
                            padding: "6px 14px", background: (!corpInvoiceFile || corpEmails.length === 0) ? "#d1d5db" : "#7c3aed",
                            color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600,
                            cursor: (!corpInvoiceFile || corpEmails.length === 0) ? "not-allowed" : "pointer",
                            display: "inline-flex", alignItems: "center", gap: 5,
                            opacity: corpInvoiceSending ? 0.7 : 1,
                          }}
                          title={!corpInvoiceFile ? "Upload an invoice PDF first" : corpEmails.length === 0 ? "Add email recipients first" : `Send to ${corpEmails.length} recipient(s)`}>
                          <i className={`fas ${corpInvoiceSending ? "fa-spinner fa-spin" : "fa-paper-plane"}`} style={{ fontSize: 10 }} />
                          {corpInvoiceSending ? "Sending..." : "Send Invoice"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Email Recipients Card */}
                  <div className="ir-card" style={{ marginBottom: 12 }}>
                    <div className="ir-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div className="ir-card-title"><i className="fas fa-envelope" /> Email Recipients</div>
                      <span style={{ fontSize: 11, color: "#6b7280" }}>{corpEmails.length} recipient{corpEmails.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="ir-card-body">
                      {corpEmails.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                          {corpEmails.map(e => (
                            <span key={e.id} style={{
                              display: "inline-flex", alignItems: "center", gap: 6,
                              background: "#ede9fe", color: "#5b21b6", borderRadius: 16,
                              padding: "4px 10px 4px 12px", fontSize: 12, fontWeight: 500,
                            }}>
                              {e.email}
                              <button onClick={() => removeCorpEmail(e.id)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#7c3aed", fontSize: 14, lineHeight: 1, padding: "0 2px", fontWeight: 700 }}
                                title="Remove email">&times;</button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input type="email" value={corpEmailInput} onChange={e => setCorpEmailInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCorpEmail(); } }}
                          placeholder="Add email address..."
                          className="ir-form-control" style={{ flex: 1, fontSize: 12, padding: "6px 10px" }} />
                        <button onClick={addCorpEmail} disabled={!corpEmailInput.trim() || corpEmailLoading}
                          style={{
                            padding: "6px 14px", background: "#007890", color: "#fff", border: "none", borderRadius: 6,
                            fontSize: 12, fontWeight: 600, cursor: !corpEmailInput.trim() ? "not-allowed" : "pointer",
                            opacity: !corpEmailInput.trim() ? 0.5 : 1, whiteSpace: "nowrap",
                          }}>
                          <i className={`fas ${corpEmailLoading ? "fa-spinner fa-spin" : "fa-plus"}`} style={{ fontSize: 10, marginRight: 4 }} />Add
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Invoice table card */}
                  <div className="ir-card">
                    <div className="ir-card-header">
                      <div className="ir-card-title"><i className="fas fa-clipboard-check" /> Invoice Line Items</div>
                    </div>
                    <div className="ir-card-body">
                      <div style={{ overflowX: "auto" }}>
                        <table className="ir-table">
                          <thead>
                            <tr>
                              <th>Store</th>
                              <th style={{ width: 100 }}>Date</th>
                              <th style={{ width: 90 }}>Code</th>
                              <th>Description</th>
                              <th className="center" style={{ width: 70 }}>Qty</th>
                              <th style={{ width: 90, textAlign: "right" }}>Rate</th>
                              <th style={{ width: 100, textAlign: "right" }}>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sel.items.map((item, idx) => (
                              <tr key={idx}>
                                <td><span style={{ fontWeight: 600, color: "#007890", fontSize: "0.75rem" }}>{item.client_name}</span></td>
                                <td style={{ whiteSpace: "nowrap" }}>{item.invoice_date}</td>
                                <td style={{ whiteSpace: "nowrap" }}>{item.item_code}</td>
                                <td style={{ color: "#475569", maxWidth: 350, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</td>
                                <td className="center">{item.quantity?.toFixed(2)}</td>
                                <td style={{ textAlign: "right" }}>R{item.unit_amount?.toFixed(2)}</td>
                                <td style={{ textAlign: "right", fontWeight: 600 }}>R{item.total?.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: "#e6f3f7" }}>
                              <td colSpan={6} style={{ padding: "10px 12px", fontWeight: 700, textAlign: "right", color: "#007890", fontSize: "0.85rem", borderTop: "2px solid #007890" }}>Invoice Total</td>
                              <td style={{ padding: "10px 12px", fontWeight: 700, textAlign: "right", color: "#007890", fontSize: "0.85rem", borderTop: "2px solid #007890" }}>R{sel.total.toFixed(2)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Send Invoice Confirmation Modal */}
      {corpSendConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} onClick={() => !corpInvoiceSending && setCorpSendConfirm(false)} />
          <div style={{ position: "relative", background: "#fff", borderRadius: 12, padding: "28px 32px", maxWidth: 420, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className="fas fa-paper-plane" style={{ color: "#7c3aed", fontSize: 14 }} />
              </div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Send Invoice</h3>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#64748b" }}>
              This will send the invoice for <strong>{corpInvoiceGroup}</strong> ({corpInvoiceSelected?.month ? (() => { const [y, m] = corpInvoiceSelected.month.split("-"); return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`; })() : ""}) to the following {corpEmails.length === 1 ? "recipient" : `${corpEmails.length} recipients`}:
            </p>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px", marginBottom: 20, maxHeight: 140, overflowY: "auto" }}>
              {corpEmails.map(e => (
                <div key={e.id} style={{ fontSize: 13, color: "#334155", padding: "3px 0", display: "flex", alignItems: "center", gap: 6 }}>
                  <i className="fas fa-envelope" style={{ fontSize: 10, color: "#94a3b8" }} />{e.email}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setCorpSendConfirm(false)} disabled={corpInvoiceSending}
                style={{ padding: "8px 18px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={sendCorpInvoice} disabled={corpInvoiceSending}
                style={{ padding: "8px 18px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, opacity: corpInvoiceSending ? 0.7 : 1 }}>
                <i className={`fas ${corpInvoiceSending ? "fa-spinner fa-spin" : "fa-paper-plane"}`} style={{ fontSize: 11 }} />
                {corpInvoiceSending ? "Sending..." : "Confirm & Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
