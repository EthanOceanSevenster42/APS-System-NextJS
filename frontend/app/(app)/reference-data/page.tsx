"use client";

// Reference Data & Fees (Ethan, 2026-09-29). Everything here lives on the
// inspector app's server; this page reads and saves it there, and every
// tablet picks a change up on its next sync. Laid out like User Management:
// a centred header on the background, summary cards, then white cards.
// One row of equal tabs picks the area (the fees, the clients and premises
// every commodity shares, then each commodity); a short list picks the
// table; a row is added or changed in a pop-up form, as users are.

import { useCallback, useEffect, useMemo, useState } from "react";

// Matched to moc-pty.com: its dark blue, a deeper shade for hover and
// selection, a pale tint of it, and the site's light blue accent.
const PRIMARY = "#054B70";
const PRIMARY_DARK = "#033650";
const PRIMARY_TINT = "#e8f0f5";
const ACCENT = "#8BB7C4";
const ALLOWED_ROLES = new Set(["admin", "super_admin", "developer"]);

type Value = string | number | boolean | null;
type Row = Record<string, Value> & { id: number };

interface TableRef { key: string; label: string; rows: number }
interface Group { commodity: string; tables: TableRef[] }
interface Area { key: string; label: string; title: string; icon: string; tables: TableRef[] }
interface Option { value: Value; label: string }
interface FieldMeta {
  name: string;
  label: string;
  kind: "string" | "text" | "int" | "decimal" | "bool" | "choice" | "fk" | "date" | "datetime";
  required: boolean;
  choices?: Option[];
  options?: Option[];
}
interface TablePage {
  key: string;
  label: string;
  fields: FieldMeta[];
  can_change: boolean;
  can_add: boolean;
  total: number;
  page: number;
  page_size: number;
  rows: Row[];
}
interface RowForm { mode: "add" | "edit"; row: Row | null; draft: Record<string, Value> }
type Tariff = Record<string, number | string | null>;

const FEES = "fees";

// A client is the same client whichever commodity is inspected, and so is
// its premises. These lists ship with the egg data but are not egg lists,
// so they get an area of their own instead of sitting under Eggs.
const SHARED_AREA = "Clients & premises";
const SHARED_LABELS: Record<string, string> = {
  "eggs.clients": "Clients",
  "eggs.facilities": "Premises",
  "eggs.facility_types": "Premises types",
};

const AREA_LABELS: Record<string, string> = {
  "Processed Meat Products": "Processed meat",
  "Certain Raw Processed Meat Products": "Raw processed meat",
};

const AREA_ICONS: Record<string, string> = {
  "Eggs": "fas fa-egg",
  "Poultry": "fas fa-drumstick-bite",
  "Processed Meat Products": "fas fa-hotdog",
  "Certain Raw Processed Meat Products": "fas fa-bacon",
};

// [field, label, unit]: "R" fees in rand, "h" hours, "%" the VAT percentage.
// `column` stacks the short Tax box under time and travel, so the three
// columns come out about the same height.
const TARIFF_SECTIONS: { title: string; icon: string; column: number; fields: [string, string, "R" | "h" | "%"][] }[] = [
  {
    title: "Inspection time and travel",
    icon: "fas fa-clock",
    column: 0,
    fields: [
      ["normal_hour", "Normal time (08:00 – 16:00), per hour", "R"],
      ["overtime_hour", "Overtime (Mon – Sat), per hour", "R"],
      ["sunday_hour", "Sunday & public holidays, per hour", "R"],
      ["per_kilometre", "Travel, per kilometre", "R"],
      ["minimum_chargeable_hours", "Minimum time charged", "h"],
    ],
  },
  {
    title: "Laboratory: processed meat products",
    icon: "fas fa-flask",
    column: 1,
    fields: [
      ["pmp_fat", "Fat content", "R"],
      ["pmp_protein", "Protein content", "R"],
      ["pmp_calcium", "Calcium determination (MRM only)", "R"],
      ["pmp_physical", "Physical test (coated products)", "R"],
    ],
  },
  {
    title: "Laboratory: certain raw processed meat products",
    icon: "fas fa-vial",
    column: 2,
    fields: [
      ["raw_fat", "Fat content", "R"],
      ["raw_protein", "Protein content (meat content)", "R"],
      ["raw_soya", "Soya content", "R"],
      ["raw_starch", "Starch content", "R"],
      ["raw_dna", "Meat species identification (DNA)", "R"],
      ["raw_calcium", "Calcium determination (MRM only)", "R"],
    ],
  },
  { title: "Tax", icon: "fas fa-percent", column: 0, fields: [["vat_rate", "VAT (not added to the RFI total)", "%"]] },
];

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/fsa-reference/${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errors = (data as { errors?: Record<string, unknown> }).errors;
    const detail = (data as { detail?: string }).detail;
    throw Object.assign(new Error(errors ? describeErrors(errors) : detail || `Error ${res.status}`), { errors });
  }
  return data as T;
}

/** The server's field errors, each under the field's label when it is known. */
function describeErrors(errors: Record<string, unknown>, fields: FieldMeta[] = []): string {
  return Object.entries(errors)
    .map(([k, v]) => `${fields.find(f => f.name === k)?.label ?? k}: ${Array.isArray(v) ? v.join(" ") : String(v)}`)
    .join("; ");
}

function formMessage(e: unknown, fields: FieldMeta[]): string {
  const errors = (e as { errors?: Record<string, unknown> }).errors;
  return errors ? describeErrors(errors, fields) : (e as Error).message;
}

/** "Pmp product types" reads "Product types" once it sits under Processed meat. */
function tableLabel(t: TableRef): string {
  const plain = SHARED_LABELS[t.key] ?? t.label.replace(/^(pmp|raw rmp)\s+/i, "");
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

/** The server's groups as areas: the shared lists first, whichever group the
 *  server put them in, then each commodity with what is left. */
function toAreas(groups: Group[]): Area[] {
  const shared: TableRef[] = [];
  const areas: Area[] = [];
  for (const g of groups) {
    const own: TableRef[] = [];
    for (const t of g.tables) {
      (g.commodity === SHARED_AREA || t.key in SHARED_LABELS ? shared : own).push({ ...t, label: tableLabel(t) });
    }
    if (own.length && g.commodity !== SHARED_AREA) {
      areas.push({
        key: g.commodity,
        label: AREA_LABELS[g.commodity] ?? g.commodity,
        title: g.commodity,
        icon: AREA_ICONS[g.commodity] ?? "fas fa-folder",
        tables: own,
      });
    }
  }
  const order = Object.keys(SHARED_LABELS);
  shared.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return shared.length
    ? [{ key: SHARED_AREA, label: SHARED_AREA, title: "Shared by every commodity", icon: "fas fa-building", tables: shared }, ...areas]
    : areas;
}

/** Tariff figures as they are typed: two decimals for rand, VAT as a percentage. */
function tariffToDraft(t: Tariff): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const section of TARIFF_SECTIONS) {
    for (const [name, , unit] of section.fields) {
      const raw = Number(t[name] ?? 0);
      draft[name] = unit === "%" ? String(Math.round(raw * 10000) / 100) : unit === "R" ? raw.toFixed(2) : String(raw);
    }
  }
  return draft;
}

function draftToTariff(d: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const section of TARIFF_SECTIONS) {
    for (const [name, , unit] of section.fields) {
      const n = Number(d[name]);
      out[name] = unit === "%" ? n / 100 : n;
    }
  }
  return out;
}

function shown(field: FieldMeta, value: Value): string {
  if (value === null || value === undefined || value === "") return "—";
  const list = field.choices ?? field.options;
  if (list) {
    const hit = list.find(o => String(o.value) === String(value));
    if (hit) return hit.label;
  }
  return String(value);
}

function Cell({ field, value }: { field: FieldMeta; value: Value }) {
  if (field.kind === "bool") {
    return value
      ? <span className="rd-pill rd-pill-yes"><i className="fas fa-check" /> Yes</span>
      : <span className="rd-pill rd-pill-no">No</span>;
  }
  const text = shown(field, value);
  return <span className={text === "—" ? "rd-muted" : undefined} title={text.length > 40 ? text : undefined}>
    {text.length > 60 ? `${text.slice(0, 60)}…` : text}
  </span>;
}

function Input({ field, value, onChange, disabled }: {
  field: FieldMeta; value: Value; onChange: (v: Value) => void; disabled: boolean;
}) {
  const list = field.choices ?? field.options;
  if (list) {
    return (
      <select className="rd-input" value={value === null ? "" : String(value)} disabled={disabled}
        onChange={e => {
          const raw = e.target.value;
          const hit = list.find(o => String(o.value) === raw);
          onChange(raw === "" ? null : hit ? hit.value : raw);
        }}>
        <option value="">—</option>
        {list.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    );
  }
  if (field.kind === "text") {
    return <textarea className="rd-input" rows={3} value={value === null ? "" : String(value)}
      disabled={disabled} onChange={e => onChange(e.target.value)} />;
  }
  const numeric = field.kind === "int" || field.kind === "decimal" || field.kind === "fk";
  return (
    <input className="rd-input" disabled={disabled}
      type={numeric ? "number" : field.kind === "date" ? "date" : "text"}
      step={field.kind === "decimal" ? "any" : undefined}
      placeholder={field.kind === "fk" ? "Row ID" : undefined}
      value={value === null ? "" : String(value)}
      onChange={e => onChange(numeric ? (e.target.value === "" ? null : e.target.value) : e.target.value)} />
  );
}

const STYLES = `
.rd-header { text-align: center; color: white; margin: 8px 0 22px; text-shadow: 0 1px 3px rgba(0,0,0,0.35); }
.rd-header h1 { font-size: 1.45rem; font-weight: 700; margin: 0; display: inline-flex; align-items: center; gap: 10px; }
.rd-header p { font-size: 0.85rem; margin: 6px 0 0; opacity: 0.95; }
.rd-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px; }
.rd-card { background: #fff; border-radius: 12px; box-shadow: 0 0 0 1px rgba(17,24,39,0.05), 0 1px 2px 0 rgba(0,0,0,0.05); }
.rd-stat { padding: 18px; min-height: 124px; box-sizing: border-box; }
.rd-stat-top { display: flex; align-items: center; justify-content: space-between; }
.rd-stat-label { font-size: 0.75rem; font-weight: 500; color: #6b7280; }
.rd-stat-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
.rd-stat-value { font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; color: ${PRIMARY}; margin-top: 8px; line-height: 1.1; }
.rd-stat-sub { font-size: 0.7rem; color: #9ca3af; margin-top: 4px; }
.rd-areas { display: grid; grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); gap: 6px; padding: 6px; margin-bottom: 20px; }
.rd-area { display: flex; align-items: center; gap: 10px; height: 46px; box-sizing: border-box; padding: 0 14px; border: none; border-radius: 8px; background: none; color: #374151; font-size: 0.82rem; font-weight: 600; cursor: pointer; text-align: left; min-width: 0; }
.rd-area:hover { background: ${PRIMARY_TINT}; color: ${PRIMARY}; }
.rd-area.active { background: ${PRIMARY}; color: white; }
.rd-area i { flex: 0 0 16px; text-align: center; }
.rd-area-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.4; }
.rd-area-count { flex: 0 0 auto; font-size: 0.66rem; font-weight: 600; background: ${PRIMARY_TINT}; color: ${PRIMARY}; border-radius: 10px; padding: 1px 8px; }
.rd-area.active .rd-area-count { background: rgba(255,255,255,0.18); color: white; }
@media (max-width: 600px) { .rd-areas { grid-template-columns: 1fr 1fr; } .rd-area { padding: 0 10px; gap: 8px; } .rd-area-count { display: none; } }
.rd-layout { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 20px; align-items: start; }
@media (max-width: 1000px) { .rd-layout { grid-template-columns: 1fr; } }
.rd-card-header { padding: 14px 20px; border-bottom: 1px solid #f3f4f6; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; min-height: 44px; }
.rd-card-title { font-size: 0.95rem; font-weight: 600; color: #111827; display: flex; align-items: center; gap: 8px; }
.rd-card-sub { font-size: 0.72rem; color: #6b7280; margin-top: 2px; }
.rd-badge { background: ${PRIMARY}; color: white; border-radius: 10px; padding: 1px 8px; font-size: 0.68rem; font-weight: 600; }
.rd-nav { padding: 8px; }
.rd-tab { display: flex; align-items: center; gap: 8px; width: 100%; height: 38px; box-sizing: border-box; margin: 0 0 4px; padding: 0 12px; border: 1px solid transparent; border-radius: 8px; background: none; text-align: left; font-size: 0.8rem; cursor: pointer; color: #374151; }
.rd-tab:hover { background: ${PRIMARY_TINT}; }
.rd-tab.active { background: ${PRIMARY}; border-color: ${PRIMARY}; color: white; font-weight: 600; }
.rd-tab-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.4; padding: 2px 0; }
.rd-tab-end { flex: 0 0 52px; text-align: right; font-size: 0.7rem; color: #9ca3af; }
.rd-tab.active .rd-tab-end { color: ${ACCENT}; }
.rd-input { width: 100%; box-sizing: border-box; padding: 7px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.82rem; color: #111827; background: white; font-family: inherit; }
.rd-input:focus { outline: none; border-color: ${PRIMARY}; box-shadow: 0 0 0 3px rgba(5,75,112,0.14); }
.rd-btn { display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: 34px; min-width: 96px; box-sizing: border-box; padding: 0 14px; border-radius: 6px; border: none; font-size: 0.75rem; font-weight: 500; cursor: pointer; white-space: nowrap; }
.rd-btn:disabled { opacity: 0.5; cursor: default; }
.rd-btn-primary { background: ${PRIMARY}; color: white; }
.rd-btn-primary:hover:not(:disabled) { background: ${PRIMARY_DARK}; }
.rd-btn-light { background: ${PRIMARY_TINT}; color: ${PRIMARY}; }
.rd-btn-light:hover:not(:disabled) { background: #dbe8ef; }
.rd-btn-edit { background: ${PRIMARY}; color: white; height: 28px; min-width: 64px; padding: 0 10px; font-size: 0.7rem; }
.rd-btn-edit:hover:not(:disabled) { background: ${PRIMARY_DARK}; }
.rd-table-wrap { overflow-x: auto; }
.rd-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
.rd-table th { background: #fafafa; color: #6b7280; text-align: left; padding: 10px 14px; font-weight: 600; white-space: nowrap; border-bottom: 1px solid #f3f4f6; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.04em; }
.rd-table td { padding: 10px 14px; border-top: 1px solid #f3f4f6; color: #374151; vertical-align: middle; }
.rd-table tbody tr:hover { background: #f9fafb; }
.rd-table tbody tr.clickable { cursor: pointer; }
.rd-muted { color: #9ca3af; }
.rd-pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; font-size: 0.66rem; font-weight: 600; }
.rd-pill-yes { background: rgba(16,185,129,0.12); color: #059669; }
.rd-pill-no { background: #f3f4f6; color: #6b7280; }
.rd-footer { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; padding: 12px 20px; border-top: 1px solid #f3f4f6; font-size: 0.75rem; color: #6b7280; }
.rd-fees { padding: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 16px; align-items: start; }
@media (max-width: 420px) { .rd-fees { grid-template-columns: 1fr; padding: 14px; } .rd-fee-input { width: 130px; } }
.rd-fee-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.rd-fee-group { border: 1px solid #f3f4f6; border-radius: 10px; padding: 14px 16px; }
.rd-fee-title { font-size: 0.8rem; font-weight: 600; color: ${PRIMARY}; display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.rd-fee-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 5px 0; }
.rd-fee-label { font-size: 0.78rem; color: #374151; }
.rd-fee-input { display: flex; align-items: center; border: 1px solid #d1d5db; border-radius: 6px; overflow: hidden; width: 150px; flex-shrink: 0; background: white; }
.rd-fee-input:focus-within { border-color: ${PRIMARY}; box-shadow: 0 0 0 3px rgba(5,75,112,0.14); }
.rd-fee-input span { padding: 6px 8px; background: #f9fafb; color: #6b7280; font-size: 0.75rem; border-right: 1px solid #e5e7eb; }
.rd-fee-input span.after { border-right: none; border-left: 1px solid #e5e7eb; }
.rd-fee-input input { border: none; outline: none; padding: 6px 8px; width: 100%; font-size: 0.8rem; text-align: right; }
.rd-fee-input.changed { border-color: #f59e0b; }
.rd-note { margin: 0 20px 20px; padding: 10px 14px; border-radius: 8px; background: ${PRIMARY_TINT}; color: ${PRIMARY}; font-size: 0.75rem; display: flex; gap: 8px; align-items: flex-start; }
.rd-empty { padding: 48px 20px; text-align: center; color: #9ca3af; font-size: 0.85rem; }
.rd-toast { position: fixed; bottom: 22px; right: 22px; padding: 11px 16px; border-radius: 8px; color: white; font-size: 0.8rem; max-width: 440px; box-shadow: 0 6px 18px rgba(0,0,0,0.18); z-index: 10001; display: flex; gap: 8px; align-items: flex-start; }
.rd-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 16px; }
.rd-modal { background: #fff; border-radius: 12px; width: 100%; max-width: 640px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
.rd-modal-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 18px 24px 14px; border-bottom: 1px solid #e5e7eb; }
.rd-modal-title { font-size: 1.05rem; font-weight: 700; color: #111827; margin: 0; display: flex; align-items: center; gap: 8px; }
.rd-modal-close { background: none; border: none; font-size: 1.4rem; line-height: 1; cursor: pointer; color: #6b7280; width: 30px; height: 30px; border-radius: 6px; flex-shrink: 0; }
.rd-modal-close:hover { background: #f3f4f6; }
.rd-modal-body { padding: 18px 24px; overflow-y: auto; }
.rd-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
@media (max-width: 560px) { .rd-form-grid { grid-template-columns: 1fr; } }
.rd-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.rd-field.wide { grid-column: 1 / -1; }
.rd-field-label { font-size: 0.75rem; font-weight: 600; color: #374151; }
.rd-field-label em { color: #dc2626; font-style: normal; }
.rd-check-row { display: flex; align-items: center; gap: 9px; height: 34px; padding: 0 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.82rem; color: #374151; cursor: pointer; }
.rd-check-row input { width: 16px; height: 16px; margin: 0; accent-color: ${PRIMARY}; }
.rd-form-error { margin-bottom: 14px; padding: 10px 14px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; font-size: 0.78rem; display: flex; gap: 8px; align-items: flex-start; }
.rd-modal-actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 24px; border-top: 1px solid #e5e7eb; }
.rd-modal-hint { font-size: 0.7rem; color: #6b7280; }
`;

export default function ReferenceDataPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [area, setArea] = useState<string>(FEES);
  const [selected, setSelected] = useState<string | null>(null);
  const [tariff, setTariff] = useState<Tariff | null>(null);
  const [tariffDraft, setTariffDraft] = useState<Record<string, string>>({});
  const [table, setTable] = useState<TablePage | null>(null);
  const [form, setForm] = useState<RowForm | null>(null);
  const [formError, setFormError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 5000);
  };

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (!d.authenticated) { window.location.href = "/login"; return; }
        setAllowed(ALLOWED_ROLES.has(d.role));
      })
      .catch(() => setAllowed(false));
  }, []);

  useEffect(() => {
    if (!allowed) return;
    call<{ groups: Group[] }>("").then(d => setGroups(d.groups)).catch(e => showToast(e.message, false));
    call<Tariff>("tariff/").then(t => { setTariff(t); setTariffDraft(tariffToDraft(t)); })
      .catch(e => showToast(e.message, false));
  }, [allowed]);

  const loadTable = useCallback(async (key: string, q: string, p: number) => {
    setBusy(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q.trim()) params.set("q", q.trim());
      setTable(await call<TablePage>(`${key}/?${params}`));
    } catch (e) {
      showToast((e as Error).message, false);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (allowed && selected) loadTable(selected, query, page);
    // The search box loads on Enter or the Search button, not on every key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, selected, page, loadTable]);

  // Escape closes the row form.
  useEffect(() => {
    if (!form) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) setForm(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [form, busy]);

  const areas = useMemo(() => toAreas(groups), [groups]);
  const totals = useMemo(() => ({
    tables: groups.reduce((n, g) => n + g.tables.length, 0),
    rows: groups.reduce((n, g) => n + g.tables.reduce((m, t) => m + t.rows, 0), 0),
  }), [groups]);

  const savedDraft = tariff ? tariffToDraft(tariff) : {};
  const tariffChanged = Object.keys(tariffDraft).some(k => tariffDraft[k] !== savedDraft[k]);

  const saveTariff = async () => {
    setBusy(true);
    try {
      const saved = await call<Tariff>("tariff/", { method: "PUT", body: JSON.stringify(draftToTariff(tariffDraft)) });
      setTariff(saved);
      setTariffDraft(tariffToDraft(saved));
      showToast("RFI fees saved. Every tablet bills with them from its next sync.");
    } catch (e) {
      showToast((e as Error).message, false);
    } finally {
      setBusy(false);
    }
  };

  const openTable = (key: string) => {
    setSelected(key);
    setPage(1);
    setQuery("");
    setTable(null);
  };

  const chooseArea = (key: string) => {
    setArea(key);
    if (key === FEES) { setSelected(null); setTable(null); return; }
    const first = areas.find(a => a.key === key)?.tables[0];
    if (first) openTable(first.key);
  };

  const openAdd = () => {
    if (!table) return;
    setFormError("");
    setForm({ mode: "add", row: null, draft: Object.fromEntries(table.fields.map(f => [f.name, f.kind === "bool" ? f.name === "is_active" : null])) });
  };

  const openEdit = (row: Row) => {
    setFormError("");
    setForm({ mode: "edit", row, draft: { ...row } });
  };

  const saveForm = async () => {
    if (!table || !form) return;
    setFormError("");
    if (form.mode === "edit" && form.row) {
      const row = form.row;
      const change: Record<string, Value> = {};
      for (const f of table.fields) {
        if (form.draft[f.name] !== row[f.name]) change[f.name] = form.draft[f.name];
      }
      if (!Object.keys(change).length) { setForm(null); return; }
      setBusy(true);
      try {
        const saved = await call<Row>(`${table.key}/${row.id}/`, { method: "PATCH", body: JSON.stringify(change) });
        setTable({ ...table, rows: table.rows.map(r => (r.id === row.id ? saved : r)) });
        setForm(null);
        showToast("Saved. The tablets pick it up on their next sync.");
      } catch (e) {
        setFormError(formMessage(e, table.fields));
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      await call<Row>(`${table.key}/`, { method: "POST", body: JSON.stringify(form.draft) });
      setForm(null);
      showToast("Row added. The tablets pick it up on their next sync.");
      await loadTable(table.key, query, page);
      setGroups(prev => prev.map(g => ({ ...g, tables: g.tables.map(t => t.key === table.key ? { ...t, rows: t.rows + 1 } : t) })));
    } catch (e) {
      setFormError(formMessage(e, table.fields));
    } finally {
      setBusy(false);
    }
  };

  if (allowed === null) return <div className="rd-empty">Loading…</div>;

  const current = areas.find(a => a.key === area);
  const currentTable = current?.tables.find(t => t.key === selected);
  const tableName = currentTable?.label ?? table?.label ?? "";
  const pages = table ? Math.max(1, Math.ceil(table.total / table.page_size)) : 1;
  const hasActiveFlag = table?.fields.some(f => f.name === "is_active");
  const lastChanged = tariff?.updated_at ? new Date(String(tariff.updated_at)).toLocaleString("en-ZA") : "";
  const formChanged = form?.mode === "edit" && form.row && table
    ? table.fields.some(f => form.draft[f.name] !== form.row![f.name])
    : true;

  return (
    <>
      <style>{STYLES}</style>
      <div style={{ padding: "20px 24px 40px" }}>
        <div className="rd-header">
          <h1><i className="fas fa-sliders-h" /> Reference Data &amp; Fees</h1>
          <p>What the inspector tablets use. A change is saved on the inspector server and reaches every tablet on its next sync.</p>
        </div>

        {!allowed ? (
          <div className="rd-card rd-empty">Only admins can change the reference data and fees.</div>
        ) : (
          <>
            <div className="rd-stats">
              <div className="rd-card rd-stat">
                <div className="rd-stat-top"><span className="rd-stat-label">Reference tables</span>
                  <div className="rd-stat-icon" style={{ background: PRIMARY_TINT }}><i className="fas fa-table" style={{ color: PRIMARY }} /></div></div>
                <div className="rd-stat-value">{totals.tables}</div>
                <div className="rd-stat-sub">across {groups.filter(g => g.commodity !== SHARED_AREA).length} commodities</div>
              </div>
              <div className="rd-card rd-stat">
                <div className="rd-stat-top"><span className="rd-stat-label">Rows held</span>
                  <div className="rd-stat-icon" style={{ background: PRIMARY_TINT }}><i className="fas fa-list" style={{ color: PRIMARY }} /></div></div>
                <div className="rd-stat-value">{totals.rows.toLocaleString("en-ZA")}</div>
                <div className="rd-stat-sub">sizes, products, checklists, directories</div>
              </div>
              <div className="rd-card rd-stat">
                <div className="rd-stat-top"><span className="rd-stat-label">Normal hourly rate</span>
                  <div className="rd-stat-icon" style={{ background: PRIMARY_TINT }}><i className="fas fa-file-invoice-dollar" style={{ color: PRIMARY }} /></div></div>
                <div className="rd-stat-value">{tariff ? `R${Number(tariff.normal_hour).toFixed(2)}` : "—"}</div>
                <div className="rd-stat-sub">{tariff ? `R${Number(tariff.per_kilometre).toFixed(2)} per km travelled` : ""}</div>
              </div>
              <div className="rd-card rd-stat">
                <div className="rd-stat-top"><span className="rd-stat-label">Fees last changed</span>
                  <div className="rd-stat-icon" style={{ background: PRIMARY_TINT }}><i className="fas fa-history" style={{ color: PRIMARY }} /></div></div>
                <div className="rd-stat-value" style={{ fontSize: "1rem", marginTop: 14 }}>{lastChanged || "—"}</div>
                <div className="rd-stat-sub">tablets update on their next sync</div>
              </div>
            </div>

            <div className="rd-card rd-areas" role="tablist">
              <button role="tab" aria-selected={area === FEES} className={`rd-area${area === FEES ? " active" : ""}`} onClick={() => chooseArea(FEES)}>
                <i className="fas fa-file-invoice-dollar" />
                <span className="rd-area-label">RFI fees and rates</span>
              </button>
              {areas.map(a => (
                <button key={a.key} role="tab" aria-selected={area === a.key} title={a.title}
                  className={`rd-area${area === a.key ? " active" : ""}`} onClick={() => chooseArea(a.key)}>
                  <i className={a.icon} />
                  <span className="rd-area-label">{a.label}</span>
                  <span className="rd-area-count">{a.tables.length}</span>
                </button>
              ))}
            </div>

            {area === FEES ? (
              <div className="rd-card">
                <div className="rd-card-header">
                  <div>
                    <div className="rd-card-title"><i className="fas fa-file-invoice-dollar" /> RFI fees and rates</div>
                    <div className="rd-card-sub">What the Request for Invoice bills, in rand, excluding VAT.</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="rd-btn rd-btn-light" disabled={!tariffChanged || busy} onClick={() => tariff && setTariffDraft(tariffToDraft(tariff))}>
                      <i className="fas fa-undo" /> Undo changes
                    </button>
                    <button className="rd-btn rd-btn-primary" disabled={!tariffChanged || busy} onClick={saveTariff}>
                      <i className="fas fa-save" /> {busy ? "Saving…" : "Save fees"}
                    </button>
                  </div>
                </div>
                <div className="rd-fees">
                  {[0, 1, 2].map(column => (
                    <div key={column} className="rd-fee-col">
                      {TARIFF_SECTIONS.filter(s => s.column === column).map(s => (
                        <div key={s.title} className="rd-fee-group">
                          <div className="rd-fee-title"><i className={s.icon} /> {s.title}</div>
                          {s.fields.map(([name, label, unit]) => (
                            <div key={name} className="rd-fee-row">
                              <span className="rd-fee-label">{label}</span>
                              <div className={`rd-fee-input${tariffDraft[name] !== savedDraft[name] ? " changed" : ""}`}>
                                {unit === "R" && <span>R</span>}
                                <input type="number" min="0" step={unit === "R" ? "0.01" : "0.5"} value={tariffDraft[name] ?? ""}
                                  onChange={e => setTariffDraft(prev => ({ ...prev, [name]: e.target.value }))}
                                  onBlur={e => { if (unit === "R" && e.target.value !== "") setTariffDraft(prev => ({ ...prev, [name]: Number(e.target.value).toFixed(2) })); }} />
                                {unit === "%" && <span className="after">%</span>}
                                {unit === "h" && <span className="after">hrs</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="rd-note">
                  <i className="fas fa-info-circle" style={{ marginTop: 2 }} />
                  <span>Each tablet brings these down at the start of its next sync and prints its Requests for Invoice with them. Time is charged in half-hour steps after the minimum.</span>
                </div>
              </div>
            ) : (
              <div className="rd-layout">
                <div className="rd-card">
                  <div className="rd-card-header">
                    <div>
                      <div className="rd-card-title"><i className={current?.icon ?? "fas fa-database"} /> {current?.label ?? "Tables"}</div>
                      <div className="rd-card-sub">
                        {area === SHARED_AREA ? "One list for every commodity" : `${current?.tables.length ?? 0} tables`}
                      </div>
                    </div>
                  </div>
                  <div className="rd-nav">
                    {current?.tables.map(t => (
                      <button key={t.key} title={t.label} className={`rd-tab${selected === t.key ? " active" : ""}`} onClick={() => openTable(t.key)}>
                        <span className="rd-tab-label">{t.label}</span>
                        <span className="rd-tab-end">{t.rows.toLocaleString("en-ZA")}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rd-card">
                  {table ? (
                    <>
                      <div className="rd-card-header">
                        <div>
                          <div className="rd-card-title">{tableName} <span className="rd-badge">{table.total.toLocaleString("en-ZA")}</span></div>
                          <div className="rd-card-sub">
                            {table.can_change ? "Click a row to change it. " : ""}Rows are never deleted{hasActiveFlag ? "; switch Active off to retire one" : ""}.
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <input className="rd-input" style={{ width: 220 }} placeholder="Search this table…" value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") { setPage(1); loadTable(table.key, query, 1); } }} />
                          <button className="rd-btn rd-btn-light" onClick={() => { setPage(1); loadTable(table.key, query, 1); }}>
                            <i className="fas fa-search" /> Search
                          </button>
                          {table.can_add && (
                            <button className="rd-btn rd-btn-primary" disabled={busy} onClick={openAdd}>
                              <i className="fas fa-plus" /> Add row
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="rd-table-wrap">
                        <table className="rd-table">
                          <thead>
                            <tr>
                              <th style={{ width: 60 }}>ID</th>
                              {table.fields.map(f => <th key={f.name}>{f.label}</th>)}
                              {table.can_change && <th style={{ width: 90 }} />}
                            </tr>
                          </thead>
                          <tbody>
                            {table.rows.map(row => (
                              <tr key={row.id} className={table.can_change ? "clickable" : undefined}
                                onClick={() => { if (table.can_change && !busy) openEdit(row); }}>
                                <td className="rd-muted">{row.id}</td>
                                {table.fields.map(f => <td key={f.name}><Cell field={f} value={row[f.name] ?? null} /></td>)}
                                {table.can_change && (
                                  <td style={{ textAlign: "right" }}>
                                    <button className="rd-btn rd-btn-edit" disabled={busy}><i className="fas fa-pen" /> Edit</button>
                                  </td>
                                )}
                              </tr>
                            ))}
                            {!table.rows.length && (
                              <tr><td colSpan={table.fields.length + 2} className="rd-empty">No rows{query ? " match that search" : ""}.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="rd-footer">
                        <span>
                          {table.total
                            ? `Showing ${((page - 1) * table.page_size + 1).toLocaleString("en-ZA")}–${Math.min(page * table.page_size, table.total).toLocaleString("en-ZA")} of ${table.total.toLocaleString("en-ZA")}`
                            : "Nothing to show"}
                        </span>
                        {pages > 1 && (
                          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <button className="rd-btn rd-btn-light" disabled={page <= 1 || busy} onClick={() => setPage(p => p - 1)}><i className="fas fa-chevron-left" /> Previous</button>
                            <span>Page {page} of {pages}</span>
                            <button className="rd-btn rd-btn-light" disabled={page >= pages || busy} onClick={() => setPage(p => p + 1)}>Next <i className="fas fa-chevron-right" /></button>
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="rd-empty">{busy ? "Loading…" : "Choose a table on the left."}</div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {form && table && (
        <div className="rd-modal-backdrop" onMouseDown={() => { if (!busy) setForm(null); }}>
          <form className="rd-modal" role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}
            onSubmit={e => { e.preventDefault(); saveForm(); }}>
            <div className="rd-modal-header">
              <div>
                <h3 className="rd-modal-title">
                  <i className={`fas fa-${form.mode === "add" ? "plus" : "pen"}`} style={{ color: PRIMARY }} />
                  {form.mode === "add" ? `Add to ${tableName}` : `Edit ${tableName}`}
                </h3>
                <div className="rd-card-sub">
                  {current?.title}{form.row ? ` · row ${form.row.id}` : ""}
                </div>
              </div>
              <button type="button" className="rd-modal-close" aria-label="Close" disabled={busy} onClick={() => setForm(null)}>&times;</button>
            </div>
            <div className="rd-modal-body">
              {formError && (
                <div className="rd-form-error">
                  <i className="fas fa-exclamation-circle" style={{ marginTop: 2 }} />
                  <span>{formError}</span>
                </div>
              )}
              <div className="rd-form-grid">
                {table.fields.map(f => f.kind === "bool" ? (
                  <div key={f.name} className="rd-field">
                    <span className="rd-field-label">{f.label}</span>
                    <label className="rd-check-row">
                      <input type="checkbox" checked={Boolean(form.draft[f.name])} disabled={busy}
                        onChange={e => setForm({ ...form, draft: { ...form.draft, [f.name]: e.target.checked } })} />
                      {form.draft[f.name] ? "Yes" : "No"}
                    </label>
                  </div>
                ) : (
                  <label key={f.name} className={`rd-field${f.kind === "text" ? " wide" : ""}`}>
                    <span className="rd-field-label">{f.label}{f.required && <em> *</em>}</span>
                    <Input field={f} disabled={busy} value={form.draft[f.name] ?? null}
                      onChange={v => setForm({ ...form, draft: { ...form.draft, [f.name]: v } })} />
                  </label>
                ))}
              </div>
            </div>
            <div className="rd-modal-actions">
              <span className="rd-modal-hint">The tablets pick this up on their next sync.</span>
              <span style={{ display: "flex", gap: 8 }}>
                <button type="button" className="rd-btn rd-btn-light" disabled={busy} onClick={() => setForm(null)}>Cancel</button>
                <button type="submit" className="rd-btn rd-btn-primary" disabled={busy || !formChanged}>
                  <i className={`fas fa-${form.mode === "add" ? "check" : "save"}`} /> {busy ? "Saving…" : form.mode === "add" ? "Add row" : "Save"}
                </button>
              </span>
            </div>
          </form>
        </div>
      )}

      {toast && (
        <div className="rd-toast" style={{ background: toast.ok ? PRIMARY : "#dc2626" }}>
          <i className={`fas fa-${toast.ok ? "check-circle" : "exclamation-circle"}`} style={{ marginTop: 2 }} />
          <span>{toast.msg}</span>
        </div>
      )}
    </>
  );
}
