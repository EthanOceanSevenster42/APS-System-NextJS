"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";

/* ── Types ───────────────────────────────────────────────────────────────── */
interface LogEntryDetails {
  filename?: string; file_size_display?: string; document_type?: string; upload_type?: string;
  file_path?: string; client_name?: string; inspection_id?: string; inspection_sequence?: string;
  inspector_name?: string; date_of_inspection?: string; commodity?: string; group_id?: string;
  inspections_affected?: number; compliance_status?: string;
}
interface LogEntry {
  id: number; timestamp: string; username: string; action: string; page: string;
  description: string; details: LogEntryDetails; ip_address: string; location: string;
}
interface EditHistoryEntry {
  id: number; edited_at: string; edited_by: string; object_type: string; client_name: string;
  date_of_inspection: string; change_count: number; changes: Record<string, { label: string; old: string; new: string }>;
}
interface DeletionDoc { document_type: string; uploaded_by: string | null; uploaded_date: string | null; }
interface DeletionEntry {
  id: number; deleted_at: string; deleted_by: string; original_id: number;
  inspection_group_ref: number | null; client_name: string; commodity: string;
  product_name: string; inspector_name: string; date_of_inspection: string;
  document_count: number; documents: DeletionDoc[]; snapshot: Record<string, unknown>;
  source: string; restored_at: string; restored_by: string; restored_to_id: number | null;
}
interface Stats {
  total_events: number; events_today: number; active_users: number; file_uploads: number;
  logins: number; record_edits: number; record_deletions: number; action_counts: Record<string, number>;
}
interface SystemLogsResponse {
  success: boolean; total: number; total_pages: number; page_num: number;
  logs: LogEntry[]; edit_history: EditHistoryEntry[]; edit_history_total: number;
  deletions: DeletionEntry[]; deletions_total: number;
  all_users: string[]; all_pages: string[]; stats: Stats;
}

/* Fields worth showing first when a deleted record is expanded. Anything else
   in the snapshot is still shown, just after these. */
const SNAPSHOT_PRIMARY: { key: string; label: string }[] = [
  { key: "commodity", label: "Commodity" },
  { key: "product_name", label: "Product" },
  { key: "product_class", label: "Product Class" },
  { key: "lab", label: "Lab" },
  { key: "town", label: "Town" },
  { key: "inspector_name", label: "Inspector" },
  { key: "date_of_inspection", label: "Inspection Date" },
  { key: "km_traveled", label: "KM Traveled" },
  { key: "hours", label: "Hours" },
  { key: "bought_sample", label: "Sample Amount (R)" },
  { key: "is_sample_taken", label: "Sample Taken" },
  { key: "approved_status", label: "Approved Status" },
  { key: "invoice_number", label: "Invoice Number" },
  { key: "comment", label: "Comment" },
];

/* ── Filament (FSA teal) tokens ──────────────────────────────────────────── */
const F = {
  card: "#ffffff", cardShadow: "0 0 0 1px rgba(17,24,39,0.05), 0 1px 2px 0 rgba(0,0,0,0.05)",
  heading: "#111827", muted: "#6b7280", faint: "#9ca3af", strong: "#374151",
  border: "#e5e7eb", hair: "#f3f4f6", primary: "#007890", primary50: "#e0f2f5", inputRing: "#d1d5db",
};

const ACTION_COLORS: Record<string, { bg: string; color: string }> = {
  VIEW: { bg: "#dbeafe", color: "#1d4ed8" }, LOGIN: { bg: "#dcfce7", color: "#15803d" },
  LOGOUT: { bg: "#fef3c7", color: "#b45309" }, CREATE: { bg: "#d1fae5", color: "#047857" },
  UPDATE: { bg: "#cffafe", color: "#0e7490" }, DELETE: { bg: "#fee2e2", color: "#dc2626" },
  FILE_UPLOAD: { bg: "#e0e7ff", color: "#4338ca" }, EXPORT: { bg: "#f3e8ff", color: "#7c3aed" },
  SETTINGS: { bg: "#fff7ed", color: "#c2410c" }, USER_MANAGEMENT: { bg: "#fdf4ff", color: "#a21caf" },
  PASSWORD_RESET: { bg: "#fef2f2", color: "#b91c1c" },
};
const ALL_ACTIONS = ["LOGIN", "LOGOUT", "FILE_UPLOAD", "UPDATE", "CREATE", "DELETE", "EXPORT", "SETTINGS", "USER_MANAGEMENT", "PASSWORD_RESET", "VIEW"];
const ACTION_LABELS: Record<string, string> = {
  VIEW: "View Page", LOGIN: "Login", LOGOUT: "Logout", CREATE: "Create", UPDATE: "Update",
  DELETE: "Delete", FILE_UPLOAD: "File Upload", EXPORT: "Export", SETTINGS: "Settings",
  USER_MANAGEMENT: "User Mgmt", PASSWORD_RESET: "Password Reset",
};
const ALL_DOC_TYPES = ["COMPLIANCE", "COMPOSITION", "RFI", "INVOICE", "COA", "LAB", "LAB_FORM", "RETEST", "OCCURRENCE", "OTHER"];
const PAGE_LABELS: Record<string, string> = {
  "/home/": "Home", "/inspections/": "Inspection Records", "/system-logs/": "System Logs",
  "/settings/": "Settings", "/user-management/": "User Management", "/clients/": "Clients",
  "/training/": "Training", "/login/": "Login", "/logout/": "Logout",
};
function friendlyPage(page: string): string {
  if (!page) return "-";
  if (PAGE_LABELS[page]) return PAGE_LABELS[page];
  for (const [url, label] of Object.entries(PAGE_LABELS)) if (page.includes(url.replace(/^\/|\/$/g, ""))) return label;
  if (page.includes("client-allocation")) return "Client Allocation";
  if (page.includes("server-view")) return "Server View";
  return page;
}
function fmtTs(iso: string): string {
  const d = new Date(iso); if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDate(iso: string): string {
  const d = new Date(iso); if (isNaN(d.getTime())) return iso;
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d.getDate()).padStart(2,"0")} ${m[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtDt(iso: string): string {
  if (!iso) return "-"; const d = new Date(iso); if (isNaN(d.getTime())) return iso;
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d.getDate()).padStart(2,"0")} ${m[d.getMonth()]} ${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

/* ── Filament components ─────────────────────────────────────────────────── */
function Section({ title, description, action, children, noPad }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode; noPad?: boolean; }) {
  return (
    <section style={{ background: F.card, borderRadius: 12, boxShadow: F.cardShadow, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 20px", borderBottom: `1px solid ${F.hair}`, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600, color: F.heading }}>{title}</h3>
          {description && <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: F.muted }}>{description}</p>}
        </div>
        {action}
      </div>
      <div style={{ padding: noPad ? 0 : 20 }}>{children}</div>
    </section>
  );
}
function Stat({ label, value, icon, tint, color }: { label: string; value: React.ReactNode; icon: string; tint: string; color: string; }) {
  return (
    <div style={{ background: F.card, borderRadius: 12, boxShadow: F.cardShadow, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 500, color: F.muted }}>{label}</span>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: tint, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className={icon} style={{ color, fontSize: "0.85rem" }} />
        </div>
      </div>
      <div style={{ fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.02em", color: F.primary, marginTop: 8, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}
const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "none", background: F.primary, color: "#fff", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", boxShadow: "0 1px 2px 0 rgba(0,0,0,0.05)", whiteSpace: "nowrap" };
const btnSecondary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, background: "#fff", color: F.strong, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", boxShadow: "0 0 0 1px rgba(17,24,39,0.1), 0 1px 2px 0 rgba(0,0,0,0.05)", border: "none", whiteSpace: "nowrap" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "7px 10px", borderRadius: 8, fontSize: "0.8rem", color: F.strong, background: "#fff", border: "none", boxShadow: `0 0 0 1px ${F.inputRing}`, boxSizing: "border-box", outline: "none" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.7rem", fontWeight: 600, color: F.strong, marginBottom: 4 };

/* ── Component ───────────────────────────────────────────────────────────── */
export default function SystemLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [editHistory, setEditHistory] = useState<EditHistoryEntry[]>([]);
  const [deletions, setDeletions] = useState<DeletionEntry[]>([]);
  const [deletionsTotal, setDeletionsTotal] = useState(0);
  // Restore is a two-click action: the first click arms the row, the second runs it.
  const [armedRestore, setArmedRestore] = useState<number | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [allUsers, setAllUsers] = useState<string[]>([]);
  const [allPages, setAllPages] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [editHistoryTotal, setEditHistoryTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [userFilter, setUserFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState("");
  const [pageFilter, setPageFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pageNum, setPageNum] = useState(1);
  const [activeView, setActiveView] = useState<"logs" | "history" | "deletions">("logs");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const toggleRow = (id: number) => setExpandedRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const filtersRef = useRef({ userFilter, actionFilter, docTypeFilter, pageFilter, dateFrom, dateTo });
  filtersRef.current = { userFilter, actionFilter, docTypeFilter, pageFilter, dateFrom, dateTo };

  const doFetch = useCallback(async (opts: { pageNum?: number; clear?: boolean } = {}) => {
    setLoading(true); setError("");
    try {
      const f = opts.clear ? { userFilter: "", actionFilter: "", docTypeFilter: "", pageFilter: "", dateFrom: "", dateTo: "" } : filtersRef.current;
      const params = new URLSearchParams();
      if (f.userFilter) params.set("user", f.userFilter);
      if (f.actionFilter) params.set("action", f.actionFilter);
      if (f.docTypeFilter) params.set("doc_type", f.docTypeFilter);
      if (f.pageFilter) params.set("page_filter", f.pageFilter);
      if (f.dateFrom) params.set("date_from", f.dateFrom);
      if (f.dateTo) params.set("date_to", f.dateTo);
      params.set("page_num", String(opts.pageNum ?? pageNum));
      const res = await fetch(`/api/system-logs?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SystemLogsResponse = await res.json();
      setLogs(data.logs ?? []); setEditHistory(data.edit_history ?? []);
      setDeletions(data.deletions ?? []); setDeletionsTotal(data.deletions_total ?? 0);
      setAllUsers(data.all_users ?? []); setAllPages(data.all_pages ?? []);
      setStats(data.stats ?? null); setTotal(data.total ?? 0);
      setTotalPages(data.total_pages ?? 1); setEditHistoryTotal(data.edit_history_total ?? 0);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to fetch logs"); }
    finally { setLoading(false); }
  }, [pageNum]);

  useEffect(() => { doFetch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = () => { setPageNum(1); doFetch({ pageNum: 1 }); };
  const handleClear = () => {
    setUserFilter(""); setActionFilter(""); setDocTypeFilter(""); setPageFilter(""); setDateFrom(""); setDateTo(""); setPageNum(1);
    doFetch({ pageNum: 1, clear: true });
  };
  const handlePage = (n: number) => { setPageNum(n); doFetch({ pageNum: n }); };

  const handleRestore = async (d: DeletionEntry) => {
    setRestoringId(d.id); setRestoreMsg(null);
    try {
      const res = await fetch("/api/restore-deleted-inspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive_id: d.id }),
      });
      const data = await res.json();
      if (data.success) {
        const docs: string[] = data.documents_to_reupload ?? [];
        setRestoreMsg({
          ok: true,
          text: `Restored "${d.client_name}" as inspection #${data.restored_id}.`
            + (docs.length ? ` ${docs.length} file(s) must be re-uploaded: ${docs.join(", ")}.` : ""),
        });
        doFetch();
      } else {
        setRestoreMsg({ ok: false, text: data.error || "Restore failed." });
      }
    } catch (err) {
      setRestoreMsg({ ok: false, text: err instanceof Error ? err.message : "Restore failed." });
    } finally {
      setRestoringId(null); setArmedRestore(null);
    }
  };

  // Activity-by-type: sorted breakdown
  const actionRows = stats ? Object.entries(stats.action_counts).sort((a, b) => b[1] - a[1]) : [];
  const maxAction = actionRows.length ? actionRows[0][1] : 1;

  return (
    <>
      <style>{`
        .sl-table { width:100%; border-collapse:collapse; font-size:0.8rem; }
        .sl-table th { text-align:left; padding:11px 18px; font-size:0.68rem; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.04em; background:#fafafa; border-bottom:1px solid #f3f4f6; white-space:nowrap; }
        .sl-table td { padding:12px 18px; font-size:0.8rem; color:#374151; border-top:1px solid #f3f4f6; vertical-align:top; }
        .sl-table tbody tr:hover { background:#f9fafb; }
        .sl-badge { display:inline-block; padding:2px 9px; border-radius:6px; font-size:0.68rem; font-weight:600; }
        .sl-change { margin-bottom:4px; padding:4px 8px; background:#f9fafb; border-radius:6px; border-left:3px solid #007890; font-size:0.72rem; }
        .sl-old { background:#fee2e2; color:#991b1b; padding:1px 5px; border-radius:3px; font-family:monospace; }
        .sl-new { background:#dcfce7; color:#166534; padding:1px 5px; border-radius:3px; font-family:monospace; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 900px) { .sl-stats { grid-template-columns: repeat(2, 1fr) !important; } .sl-filter-grid { grid-template-columns: 1fr 1fr !important; } }
      `}</style>

      <div style={{ padding: "32px 32px 48px" }}>
        {/* Header (over FSA photo) */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em", color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,0.5)" }}>
            <i className="fas fa-shield-halved" style={{ marginRight: 10, color: "#5ee8ff" }} />System Logs
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "0.875rem", color: "rgba(255,255,255,0.9)", textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>Activity tracking, audit trail & monitoring.</p>
        </div>

        {/* Stat widgets */}
        <div className="sl-stats" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 20 }}>
          <Stat label="Total events" value={stats?.total_events ?? "—"} icon="fas fa-list" tint={F.primary50} color={F.primary} />
          <Stat label="Events today" value={stats?.events_today ?? "—"} icon="fas fa-calendar-day" tint="#dbeafe" color="#2563eb" />
          <Stat label="Active users" value={stats?.active_users ?? "—"} icon="fas fa-users" tint="#dcfce7" color="#16a34a" />
          <Stat label="File uploads" value={stats?.file_uploads ?? "—"} icon="fas fa-file-arrow-up" tint="#e0e7ff" color="#4338ca" />
          <Stat label="Record edits" value={stats?.record_edits ?? "—"} icon="fas fa-pen-to-square" tint="#f3e8ff" color="#7c3aed" />
        </div>

        {/* Activity by type */}
        <Section title="Activity by type" description="Breakdown of all matching events by action">
          {actionRows.length === 0 ? (
            <div style={{ fontSize: "0.82rem", color: F.muted }}>No activity for the current filters.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "10px 24px" }}>
              {actionRows.map(([action, count]) => {
                const ac = ACTION_COLORS[action] ?? { bg: "#f3f4f6", color: "#374151" };
                return (
                  <div key={action}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: "0.78rem", fontWeight: 500, color: F.strong }}>{ACTION_LABELS[action] || action}</span>
                      <span style={{ fontSize: "0.78rem", fontWeight: 700, color: F.heading }}>{count.toLocaleString()}</span>
                    </div>
                    <div style={{ height: 7, borderRadius: 4, background: F.hair, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.max(3, (count / maxAction) * 100)}%`, background: ac.color, borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Filters */}
        <Section title="Filter logs" action={
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleApply} style={btnPrimary}><i className="fas fa-magnifying-glass" /> Apply</button>
            <button onClick={handleClear} style={btnSecondary}><i className="fas fa-xmark" /> Clear</button>
          </div>
        }>
          <div className="sl-filter-grid" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
            <div><label style={labelStyle}>User</label>
              <select value={userFilter} onChange={e => setUserFilter(e.target.value)} style={inputStyle}>
                <option value="">All Users</option>{allUsers.map(u => <option key={u} value={u}>{u}</option>)}
              </select></div>
            <div><label style={labelStyle}>Action</label>
              <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={inputStyle}>
                <option value="">All Actions</option>{ALL_ACTIONS.map(a => <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>)}
              </select></div>
            <div><label style={labelStyle}>Document Type</label>
              <select value={docTypeFilter} onChange={e => setDocTypeFilter(e.target.value)} style={inputStyle}>
                <option value="">All Documents</option>{ALL_DOC_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
              </select></div>
            <div><label style={labelStyle}>Page</label>
              <select value={pageFilter} onChange={e => setPageFilter(e.target.value)} style={inputStyle}>
                <option value="">All Pages</option>{allPages.map(p => <option key={p} value={p}>{friendlyPage(p)}</option>)}
              </select></div>
            <div><label style={labelStyle}>Date From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} /></div>
            <div><label style={labelStyle}>Date To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} /></div>
          </div>
        </Section>

        {/* Logs / Edit History */}
        <Section
          noPad
          title={activeView === "logs" ? "Activity log" : activeView === "history" ? "Inspection edit history" : "Deleted inspections"}
          description={
            activeView === "logs" ? `Showing ${logs.length} of ${total.toLocaleString()} events`
              : activeView === "history" ? `${editHistoryTotal} total edits (latest 200)`
                : `${deletionsTotal} deleted inspection${deletionsTotal === 1 ? "" : "s"} archived (latest 200) — expand a row to see the full record`
          }
          action={
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setActiveView("logs")} style={activeView === "logs" ? btnPrimary : btnSecondary}><i className="fas fa-list" /> Logs</button>
              <button onClick={() => setActiveView("history")} style={activeView === "history" ? btnPrimary : btnSecondary}><i className="fas fa-clock-rotate-left" /> Edit History</button>
              <button onClick={() => setActiveView("deletions")} style={activeView === "deletions" ? btnPrimary : btnSecondary}><i className="fas fa-trash-can-arrow-up" /> Deletions</button>
            </div>
          }
        >
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40, color: F.muted, fontSize: "0.85rem" }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${F.border}`, borderTopColor: F.primary, animation: "spin 0.8s linear infinite", marginRight: 10 }} />
              Loading logs…
            </div>
          ) : error ? (
            <div style={{ padding: 40, textAlign: "center", color: "#dc2626", fontSize: "0.85rem" }}>
              <i className="fas fa-triangle-exclamation" style={{ fontSize: 24, display: "block", marginBottom: 10 }} />{error}
              <div><button onClick={handleApply} style={{ ...btnPrimary, marginTop: 12 }}>Retry</button></div>
            </div>
          ) : activeView === "logs" ? (
            <div style={{ overflowX: "auto" }}>
              <table className="sl-table">
                <thead><tr>{["Timestamp", "User", "Action", "Page", "Description", "IP"].map(c => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: F.faint }}><i className="fas fa-list" style={{ fontSize: 26, display: "block", marginBottom: 10, opacity: 0.5 }} />No logs found.</td></tr>
                  ) : logs.map(log => {
                    const ac = ACTION_COLORS[log.action?.toUpperCase()] ?? { bg: "#f3f4f6", color: "#374151" };
                    const isUpload = log.action?.toUpperCase() === "FILE_UPLOAD";
                    const hasDetails = isUpload && log.details && Object.keys(log.details).length > 0;
                    const isExp = expandedRows.has(log.id);
                    const d = log.details || {};
                    return (
                      <React.Fragment key={log.id}>
                        <tr onClick={() => hasDetails && toggleRow(log.id)} style={{ cursor: hasDetails ? "pointer" : "default" }}>
                          <td style={{ whiteSpace: "nowrap", color: F.muted }}>
                            {hasDetails && <i className={`fas fa-chevron-${isExp ? "down" : "right"}`} style={{ marginRight: 6, fontSize: 9, color: F.faint }} />}
                            {fmtTs(log.timestamp)}
                          </td>
                          <td style={{ fontWeight: 500, color: F.heading, whiteSpace: "nowrap" }}>{log.username}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <span className="sl-badge" style={{ background: ac.bg, color: ac.color }}>{ACTION_LABELS[log.action?.toUpperCase()] || log.action || "-"}</span>
                            {isUpload && d.document_type && <span className="sl-badge" style={{ background: "#e0e7ff", color: "#4338ca", marginLeft: 4 }}>{d.document_type}</span>}
                          </td>
                          <td style={{ color: F.strong, whiteSpace: "nowrap" }}>{friendlyPage(log.page)}</td>
                          <td style={{ color: F.muted, maxWidth: 380 }}>
                            {isUpload && hasDetails ? (
                              <div style={{ lineHeight: 1.5 }}>
                                <div style={{ fontWeight: 500, color: F.heading }}>{d.client_name || d.group_id || "-"}</div>
                                <div style={{ color: "#4338ca", fontFamily: "monospace", fontSize: "0.7rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 340 }} title={d.filename}>{d.filename}</div>
                              </div>
                            ) : <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", maxWidth: 380 }}>{log.description || "-"}</span>}
                          </td>
                          <td style={{ color: F.muted, fontFamily: "monospace", fontSize: "0.72rem", whiteSpace: "nowrap" }}>{log.ip_address || "-"}</td>
                        </tr>
                        {isExp && hasDetails && (
                          <tr><td colSpan={6} style={{ padding: 0, background: "#f8fafc", borderTop: `2px solid ${F.primary}` }}>
                            <div style={{ padding: "12px 24px 12px 40px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 24px", fontSize: "0.75rem" }}>
                              {d.file_size_display && <div><b>Size:</b> {d.file_size_display}</div>}
                              {d.inspector_name && <div><b>Inspector:</b> {d.inspector_name}</div>}
                              {d.commodity && <div><b>Commodity:</b> {d.commodity}</div>}
                              {d.inspection_id && <div><b>Inspection ID:</b> <span style={{ fontFamily: "monospace" }}>{d.inspection_id}</span></div>}
                              {d.date_of_inspection && <div><b>Inspection Date:</b> {d.date_of_inspection}</div>}
                              {d.file_path && <div style={{ gridColumn: "1 / -1", color: "#9ca3af", fontFamily: "monospace", fontSize: "0.68rem", wordBreak: "break-all" }}>{d.file_path}</div>}
                            </div>
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "14px 20px", borderTop: `1px solid ${F.hair}` }}>
                  <button onClick={() => pageNum > 1 && handlePage(1)} disabled={pageNum === 1} style={{ ...btnSecondary, opacity: pageNum === 1 ? 0.5 : 1 }}>First</button>
                  <button onClick={() => pageNum > 1 && handlePage(pageNum - 1)} disabled={pageNum === 1} style={{ ...btnSecondary, opacity: pageNum === 1 ? 0.5 : 1 }}>Prev</button>
                  <span style={{ fontSize: "0.8rem", color: F.muted, padding: "0 4px" }}>Page {pageNum} of {totalPages}</span>
                  <button onClick={() => pageNum < totalPages && handlePage(pageNum + 1)} disabled={pageNum === totalPages} style={{ ...btnSecondary, opacity: pageNum === totalPages ? 0.5 : 1 }}>Next</button>
                  <button onClick={() => pageNum < totalPages && handlePage(totalPages)} disabled={pageNum === totalPages} style={{ ...btnSecondary, opacity: pageNum === totalPages ? 0.5 : 1 }}>Last</button>
                </div>
              )}
            </div>
          ) : activeView === "history" ? (
            <div style={{ overflowX: "auto" }}>
              <table className="sl-table">
                <thead><tr>{["When", "Edited By", "Type", "Client / Facility", "Date", "Fields", "Changes"].map(c => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {editHistory.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: F.faint }}><i className="fas fa-clock-rotate-left" style={{ fontSize: 26, display: "block", marginBottom: 10, opacity: 0.5 }} />No edit history yet.</td></tr>
                  ) : editHistory.map(eh => (
                    <tr key={eh.id}>
                      <td style={{ color: F.muted, whiteSpace: "nowrap" }}>{fmtDt(eh.edited_at)}</td>
                      <td style={{ fontWeight: 500, color: F.heading, whiteSpace: "nowrap" }}>{eh.edited_by}</td>
                      <td><span className="sl-badge" style={{ background: eh.object_type === "group" ? "#e0f2fe" : "#ede9fe", color: eh.object_type === "group" ? "#0369a1" : "#6d28d9" }}>{eh.object_type === "group" ? "Group" : "Row"}</span></td>
                      <td style={{ fontWeight: 500, color: F.strong }}>{eh.client_name || "-"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{eh.date_of_inspection ? fmtDate(eh.date_of_inspection) : "-"}</td>
                      <td style={{ textAlign: "center" }}><span className="sl-badge" style={{ background: "#f3f4f6", color: "#374151" }}>{eh.change_count}</span></td>
                      <td>{Object.entries(eh.changes || {}).map(([field, diff]) => (
                        <div key={field} className="sl-change"><b>{diff.label}</b>: <span className="sl-old">{diff.old || "—"}</span> <span style={{ color: "#9ca3af" }}>→</span> <span className="sl-new">{diff.new || "—"}</span></div>
                      ))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              {restoreMsg && (
                <div style={{
                  margin: "12px 20px 0", padding: "10px 14px", borderRadius: 8, fontSize: "0.78rem",
                  background: restoreMsg.ok ? "#ecfdf5" : "#fef2f2",
                  color: restoreMsg.ok ? "#047857" : "#b91c1c",
                  border: `1px solid ${restoreMsg.ok ? "#a7f3d0" : "#fecaca"}`,
                }}>
                  <i className={`fas ${restoreMsg.ok ? "fa-circle-check" : "fa-circle-exclamation"}`} style={{ marginRight: 7 }} />
                  {restoreMsg.text}
                </div>
              )}
              <table className="sl-table">
                <thead><tr>{["When", "Deleted By", "Client / Facility", "Commodity", "Product", "Date", "Files", "Status"].map(c => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {deletions.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: "center", padding: 40, color: F.faint }}><i className="fas fa-trash-can-arrow-up" style={{ fontSize: 26, display: "block", marginBottom: 10, opacity: 0.5 }} />No inspections have been deleted.</td></tr>
                  ) : deletions.map(d => {
                    const isExp = expandedRows.has(d.id);
                    const snap = d.snapshot || {};
                    const primaryKeys = new Set(SNAPSHOT_PRIMARY.map(f => f.key));
                    const rest = Object.entries(snap)
                      .filter(([k, v]) => !primaryKeys.has(k) && v !== null && v !== "" && v !== false)
                      .sort(([a], [b]) => a.localeCompare(b));
                    return (
                      <React.Fragment key={d.id}>
                        <tr onClick={() => toggleRow(d.id)} style={{ cursor: "pointer" }}>
                          <td style={{ color: F.muted, whiteSpace: "nowrap" }}>
                            <i className={`fas fa-chevron-${isExp ? "down" : "right"}`} style={{ marginRight: 6, fontSize: 9, color: F.faint }} />
                            {fmtDt(d.deleted_at)}
                          </td>
                          <td style={{ fontWeight: 500, color: F.heading, whiteSpace: "nowrap" }}>{d.deleted_by}</td>
                          <td style={{ fontWeight: 500, color: F.strong }}>{d.client_name || "-"}</td>
                          <td><span className="sl-badge" style={{ background: "#fee2e2", color: "#dc2626" }}>{d.commodity || "-"}</span></td>
                          <td style={{ color: F.muted }}>{d.product_name || "-"}</td>
                          <td style={{ whiteSpace: "nowrap" }}>{d.date_of_inspection ? fmtDate(d.date_of_inspection) : "-"}</td>
                          <td style={{ textAlign: "center" }}>
                            <span className="sl-badge" style={{ background: d.document_count ? "#fef3c7" : "#f3f4f6", color: d.document_count ? "#b45309" : "#9ca3af" }}>{d.document_count}</span>
                          </td>
                          <td style={{ whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                            {d.restored_at ? (
                              <span className="sl-badge" style={{ background: "#dcfce7", color: "#15803d" }} title={`Restored by ${d.restored_by} as #${d.restored_to_id}`}>
                                <i className="fas fa-check" style={{ marginRight: 4 }} />Restored #{d.restored_to_id}
                              </span>
                            ) : restoringId === d.id ? (
                              <span style={{ fontSize: "0.75rem", color: F.muted }}><i className="fas fa-spinner fa-spin" /> Restoring…</span>
                            ) : armedRestore === d.id ? (
                              <span style={{ display: "inline-flex", gap: 6 }}>
                                <button onClick={() => handleRestore(d)} style={{ ...btnPrimary, padding: "5px 10px", fontSize: "0.72rem", background: "#047857" }}>Confirm</button>
                                <button onClick={() => setArmedRestore(null)} style={{ ...btnSecondary, padding: "5px 10px", fontSize: "0.72rem" }}>Cancel</button>
                              </span>
                            ) : (
                              <button onClick={() => { setArmedRestore(d.id); setRestoreMsg(null); }} style={{ ...btnSecondary, padding: "5px 10px", fontSize: "0.72rem" }}>
                                <i className="fas fa-rotate-left" /> Restore
                              </button>
                            )}
                          </td>
                        </tr>
                        {isExp && (
                          <tr><td colSpan={8} style={{ padding: 0, background: "#f8fafc", borderTop: `2px solid #dc2626` }}>
                            <div style={{ padding: "14px 24px 16px 40px" }}>
                              <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: F.faint, marginBottom: 8 }}>
                                Deleted record — was inspection #{d.original_id}
                                {d.inspection_group_ref ? ` in group #${d.inspection_group_ref}` : ""}
                                {d.source ? ` · via ${d.source}` : ""}
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "6px 24px", fontSize: "0.75rem" }}>
                                {SNAPSHOT_PRIMARY.map(f => (
                                  <div key={f.key}><b style={{ color: F.strong }}>{f.label}:</b>{" "}
                                    <span style={{ color: F.muted }}>{String(snap[f.key] ?? "—") || "—"}</span></div>
                                ))}
                              </div>

                              {d.documents.length > 0 && (
                                <>
                                  <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: F.faint, margin: "14px 0 6px" }}>
                                    Files that were attached ({d.documents.length}) — these were deleted with the record and need re-uploading
                                  </div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                    {d.documents.map((doc, i) => (
                                      <span key={i} className="sl-badge" style={{ background: "#fef3c7", color: "#b45309" }}
                                        title={`${doc.uploaded_by || "Unknown"}${doc.uploaded_date ? " · " + fmtDate(doc.uploaded_date) : ""}`}>
                                        {doc.document_type?.toUpperCase()}
                                      </span>
                                    ))}
                                  </div>
                                </>
                              )}

                              {rest.length > 0 && (
                                <details style={{ marginTop: 14 }}>
                                  <summary style={{ cursor: "pointer", fontSize: "0.7rem", fontWeight: 600, color: F.primary }}>
                                    All {rest.length} other stored fields
                                  </summary>
                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "4px 24px", fontSize: "0.72rem", marginTop: 8 }}>
                                    {rest.map(([k, v]) => (
                                      <div key={k}><b style={{ color: F.strong }}>{k}:</b>{" "}
                                        <span style={{ color: F.muted, wordBreak: "break-word" }}>{String(v)}</span></div>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
