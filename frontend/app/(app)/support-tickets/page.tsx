"use client";

/**
 * Support Tickets, inside the platform shell.
 *
 * The board existed only as a legacy Django template carrying its own
 * sidebar, so opening it threw people out of the app into a different
 * looking site. The API behind it was already written and unused
 * (Ethan, 2026-10-13); this renders the same data where the rest of the
 * platform lives.
 */

import { useCallback, useEffect, useState } from "react";

type Ticket = {
  id: number;
  title: string;
  issue_type: string;
  description: string;
  status: string;
  priority: string;
  created_by: string;
  assigned_to: string;
  created_at: string;
};

type Stats = {
  open?: number;
  in_progress?: number;
  resolved_today?: number;
  high_priority?: number;
  total?: number;
};

const STATUSES = ["open", "in-progress", "resolved"];

const statusStyle: Record<string, { bg: string; fg: string; label: string }> = {
  open: { bg: "#fee2e2", fg: "#991b1b", label: "Open" },
  "in-progress": { bg: "#fef3c7", fg: "#92400e", label: "In Progress" },
  resolved: { bg: "#dcfce7", fg: "#166534", label: "Resolved" },
};

const priorityStyle: Record<string, { bg: string; fg: string }> = {
  high: { bg: "#fee2e2", fg: "#991b1b" },
  medium: { bg: "#e0f2fe", fg: "#075985" },
  low: { bg: "#f3f4f6", fg: "#4b5563" },
};

function when(iso: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function SupportTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [open, setOpen] = useState<Ticket | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (status) p.set("status", status);
      if (priority) p.set("priority", priority);
      const res = await fetch(`/api/support-tickets?${p.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || `HTTP ${res.status}`);
      setTickets(data.tickets || []);
      setStats(data.stats || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [search, status, priority]);

  useEffect(() => {
    load();
  }, [load]);

  async function setTicketStatus(t: Ticket, next: string) {
    setBusy(t.id);
    try {
      const res = await fetch(`/api/support-tickets/${t.id}/update-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      alert("Could not update: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  }

  const tiles: { label: string; value: number; colour: string }[] = [
    { label: "Open", value: stats.open ?? 0, colour: "#dc2626" },
    { label: "In Progress", value: stats.in_progress ?? 0, colour: "#d97706" },
    { label: "Resolved today", value: stats.resolved_today ?? 0, colour: "#16a34a" },
    { label: "High priority", value: stats.high_priority ?? 0, colour: "#dc2626" },
    { label: "Total", value: stats.total ?? 0, colour: "#007890" },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#111827" }}>Support Tickets</h1>
        <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>
          Issues raised by the team, newest first.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {tiles.map((t) => (
          <div
            key={t.label}
            style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px" }}
          >
            <div style={{ fontSize: 26, fontWeight: 700, color: t.colour, lineHeight: 1.1 }}>{t.value}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 14,
          marginBottom: 16,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or description..."
          style={{
            flex: "1 1 240px",
            minWidth: 200,
            padding: "8px 10px",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            fontSize: 14,
          }}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusStyle[s]?.label || s}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
        >
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        {(search || status || priority) && (
          <button
            onClick={() => {
              setSearch("");
              setStatus("");
              setPriority("");
            }}
            style={{
              padding: "8px 14px",
              background: "#f3f4f6",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          Could not load tickets: {error}
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#f9fafb", textAlign: "left" }}>
              {["#", "Title", "Status", "Priority", "Raised by", "Assigned to", "Created", ""].map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: "10px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#6b7280",
                    borderBottom: "1px solid #e5e7eb",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>
                  Loading...
                </td>
              </tr>
            )}
            {!loading && tickets.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>
                  No tickets match those filters.
                </td>
              </tr>
            )}
            {!loading &&
              tickets.map((t) => {
                const st = statusStyle[t.status] || { bg: "#f3f4f6", fg: "#374151", label: t.status };
                const pr = priorityStyle[t.priority] || priorityStyle.low;
                return (
                  <tr key={t.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 12px", color: "#6b7280", whiteSpace: "nowrap" }}>#{t.id}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <button
                        onClick={() => setOpen(t)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          color: "#007890",
                          fontWeight: 600,
                          fontSize: 14,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        {t.title}
                      </button>
                      {t.issue_type && <div style={{ fontSize: 12, color: "#9ca3af" }}>{t.issue_type}</div>}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        style={{
                          background: st.bg,
                          color: st.fg,
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        style={{
                          background: pr.bg,
                          color: pr.fg,
                          padding: "2px 8px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                          textTransform: "capitalize",
                        }}
                      >
                        {t.priority}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#374151", whiteSpace: "nowrap" }}>
                      {t.created_by || "-"}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#374151", whiteSpace: "nowrap" }}>
                      {t.assigned_to || "-"}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#6b7280", whiteSpace: "nowrap" }}>
                      {when(t.created_at)}
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <select
                        value={t.status}
                        disabled={busy === t.id}
                        onChange={(e) => setTicketStatus(t, e.target.value)}
                        style={{
                          padding: "4px 8px",
                          border: "1px solid #d1d5db",
                          borderRadius: 6,
                          fontSize: 12,
                          cursor: busy === t.id ? "wait" : "pointer",
                        }}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {statusStyle[s].label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {open && (
        <div
          onClick={() => setOpen(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 12,
              maxWidth: 640,
              width: "100%",
              maxHeight: "80vh",
              overflow: "auto",
              padding: 24,
            }}
          >
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              #{open.id} &middot; {when(open.created_at)} &middot; {open.created_by}
            </div>
            <h2 style={{ margin: "6px 0 12px", fontSize: 20, fontWeight: 700 }}>{open.title}</h2>
            <p style={{ whiteSpace: "pre-wrap", color: "#374151", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              {open.description || "No description was given."}
            </p>
            <div style={{ marginTop: 20, textAlign: "right" }}>
              <button
                onClick={() => setOpen(null)}
                style={{
                  padding: "8px 18px",
                  background: "#007890",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
