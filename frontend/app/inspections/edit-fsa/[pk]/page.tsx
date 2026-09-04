"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */
type CommodityKey = "POULTRY" | "RAW" | "PMP" | "EGGS";

interface ProductEntry {
  id?: number;
  commodity: CommodityKey;
  product_name: string;
  product_class: string;
  lab: string;
  is_sample_taken: boolean;
  fat: boolean;
  protein: boolean;
  calcium: boolean;
  dna: boolean;
  needs_retest: string;
  bought_sample: number;
  km_traveled?: number;
  hours?: number;
}

interface FormOptions {
  clients: { name: string; town?: string; email?: string; corporate_group?: string; group_type?: string; facility_type?: string }[];
  towns: string[];
  corporate_groups: string[];
  inspectors: string[];
}

const COMMODITY_CONFIG: { key: CommodityKey; label: string; icon: string }[] = [
  { key: "POULTRY", label: "Poultry",        icon: "fa-drumstick-bite" },
  { key: "RAW",     label: "Raw Meat",       icon: "fa-bacon"          },
  { key: "PMP",     label: "PMP (Processed)",icon: "fa-hamburger"      },
  { key: "EGGS",    label: "Eggs",           icon: "fa-egg"            },
];

const RAW_CLASSES = [
  "Raw species sausage / wors",
  "Extra Lean Mince", "Lean Mince", "Regular Mince",
  "Raw Flavoured Ground Meat", "Raw Flavoured Ground Meat & Offal",
  "Raw Flavoured mixed species Ground Meat", "Raw Flavoured mixed species Ground Meat & Offal",
  "Raw Boerewors", "Raw mixed species sausage / wors",
  "Ground Burger / Ground patty = Extra Lean", "Ground Burger / Ground patty = Lean", "Ground Burger / Ground patty = Regular",
  "Burger / Patty / Hamburger Patty / Meatball / Frikadel - Extra Lean",
  "Burger / Patty / Hamburger Patty / Meatball / Frikadel - Lean",
  "Burger / Patty / Hamburger Patty / Meatball / Frikadel - Regular",
  "Value burger / Value patty / Value hamburger / Value meatball / Value frikkadel",
  "Economy Burger / Econo Burger / Economy Patty / Econo Patty / Budget Burger",
  "Raw Banger / Griller", "Raw Braaiwors / Sizzler",
  "Ground Meat",
];
const PMP_CLASSES = [
  "Whole Muscle, uncured and heat / partial heat treated products",
  "Whole muscle, uncured, no or partial heat treated and air dried products",
  "Whole muscle, dry cured, no or partial heat treated products",
  "Whole muscle, cured and no or partial heat treated products",
  "Whole muscle, cured, no or partial heat treated and air dried products",
  "Whole muscle, dry cured, no or partial heat treated and dried products",
  "Whole muscle, cured, heat treated products",
  "Comminuted, cured and heat treated products",
  "Comminuted, uncured, no or partial heat treated and dried products",
  "Comminuted, cured, no or partial heat treated, dried and fermented products",
  "Comminuted, uncured and heat treated products",
  "Reformed, uncured and no or partial heat treated products",
  "Reformed, cured, heat treated products from single species",
  "Reformed, cured, heat treated products from mixed species",
  "Reformed, cured and no or partial heat treated products",
  "Liver spreads, pâté and terrines",
  "Products in aspic: Brawn",
  "Product in aspic: Souse, Other products containing cured meat pieces in aspic",
  "Products made from blood",
  "Coated Processed Meat Products",
  "Unspecified processed meat products",
];
const PRODUCT_CLASSES_BY_COMMODITY: Record<string, string[]> = {
  RAW: RAW_CLASSES,
  PMP: PMP_CLASSES,
  POULTRY: [],
  EGGS: [],
};

const LABS = ["Food Safety Lab","Merieux","AGRI Food Lab","SANBI","SMT","ARC"];

const GROUP_TYPES = ["Corporate Store","Franchise Store","Individual / Independent Owner"];
const FACILITY_TYPES = ["Retailer","Butchery","Re-Packer","Production Plant","Farm","Abattoir","Importer","Egg Producers"];

/* ------------------------------------------------------------------ */
/*  Autocomplete (same as add page)                                    */
/* ------------------------------------------------------------------ */
function Autocomplete({
  label, required, options, value, onChange, placeholder, strict,
}: {
  label: string; required?: boolean; options: string[]; value: string;
  onChange: (v: string) => void; placeholder?: string; strict?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const pickedRef = useRef(false);
  const query = open ? search : value;
  const filtered = options.filter(o =>
    o.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 50);
  const trimmed = search.trim();
  const exactMatch = trimmed && options.some(o => o.toLowerCase() === trimmed.toLowerCase());
  const showAddNew = !strict && open && trimmed && !exactMatch;

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className="form-group" style={{ position: "relative" }}>
      <label className="form-label">{label}{required && <span style={{ color: "#ef4444" }}> *</span>}</label>
      <input
        type="text"
        className="form-control"
        value={open ? search : value}
        placeholder={placeholder || `Search or add new ${label.toLowerCase()}...`}
        onFocus={() => { console.log(`[Autocomplete:${label}] FOCUS — current value="${value}"`); setOpen(true); setSearch(value); pickedRef.current = false; }}
        onChange={e => { console.log(`[Autocomplete:${label}] TYPING — search="${e.target.value}"`); setSearch(e.target.value); setOpen(true); }}
        onBlur={() => {
          console.log(`[Autocomplete:${label}] BLUR — search="${search}", value="${value}", pickedRef=${pickedRef.current}`);
          setTimeout(() => {
            if (!pickedRef.current && search !== value) {
              console.log(`[Autocomplete:${label}] BLUR COMMIT — setting to "${search}"`);
              onChange(search);
            }
            pickedRef.current = false;
          }, 150);
        }}
        onKeyDown={e => { if (e.key === "Enter" && trimmed) { console.log(`[Autocomplete:${label}] ENTER — committing "${trimmed}"`); e.preventDefault(); onChange(trimmed); setOpen(false); setSearch(""); } }}
        autoComplete="off"
      />
      {open && (filtered.length > 0 || showAddNew) && (
        <div className="client-dropdown" style={{ display: "block" }}>
          {showAddNew && (
            <div className="client-dropdown-item"
              style={{ borderBottom: "2px solid #f59e0b", background: "#fef3c7" }}
              onMouseDown={() => { pickedRef.current = true; }}
              onClick={() => { console.log(`[Autocomplete:${label}] ADD NEW clicked — "${trimmed}"`); onChange(trimmed); setOpen(false); setSearch(""); }}>
              <span style={{ color: "#92400e" }}>
                <i className="fas fa-plus-circle" style={{ marginRight: 6 }} />
                <strong>Add new: &quot;{trimmed}&quot;</strong>
              </span>
            </div>
          )}
          {filtered.map(o => (
            <div key={o} className="client-dropdown-item"
              onMouseDown={() => { pickedRef.current = true; }}
              onClick={() => { console.log(`[Autocomplete:${label}] DROPDOWN SELECT — "${o}"`); onChange(o); setOpen(false); setSearch(""); }}>
              <span className="client-name">{o}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                      */
/* ------------------------------------------------------------------ */
export default function EditInspectionPage() {
  const params = useParams();
  const pk = params?.pk as string;

  const [step, setStep] = useState(1); // 1=Basic, 2=Product, 3=Invoice, 4=Review
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [options, setOptions] = useState<FormOptions | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [isOccurrence, setIsOccurrence] = useState(false);

  // Step 1 fields
  const [dateOfInspection, setDateOfInspection] = useState("");
  const [clientName, setClientName] = useState("");
  const [town, setTown] = useState("");
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [additionalEmails, setAdditionalEmails] = useState<string[]>([""]);
  const [corporateGroup, setCorporateGroup] = useState("");
  const [groupType, setGroupType] = useState("");
  const [facilityType, setFacilityType] = useState("");
  const [commodities, setCommodities] = useState<Record<CommodityKey, number>>({ POULTRY: 0, RAW: 0, PMP: 0, EGGS: 0 });
  // Commodity counts as originally loaded from the DB. Used to warn before
  // removing a commodity that already has saved records/documents, and to tell
  // the backend which commodities the user deliberately removed.
  const [originalCommodities, setOriginalCommodities] = useState<Record<CommodityKey, number>>({ POULTRY: 0, RAW: 0, PMP: 0, EGGS: 0 });

  // Step 2 fields (products)
  const [products, setProducts] = useState<ProductEntry[]>([]);

  // Step 3 fields
  const [kmTraveled, setKmTraveled] = useState(0);
  const [hoursWorked, setHoursWorked] = useState(0);
  const [travelStart, setTravelStart] = useState("");
  const [travelEnd, setTravelEnd] = useState("");
  const [comment, setComment] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [dispensation, setDispensation] = useState(false);

  // Step 1 validation error
  const [step1Error, setStep1Error] = useState<string[]>([]);
  const [step2Error, setStep2Error] = useState<string[]>([]);
  const [step3Error, setStep3Error] = useState<string[]>([]);

  /* ---- Confirm dialog (replaces the browser's native window.confirm) ---- */
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    body: string;
    detail?: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);
  const confirmCancelRef = useRef<HTMLButtonElement>(null);

  // Focus Cancel (the safe choice) and let Escape dismiss, the way the native
  // dialog behaved.
  useEffect(() => {
    if (!confirmDialog) return;
    confirmCancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setConfirmDialog(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmDialog]);

  /* ---- Load data ---- */
  useEffect(() => {
    if (!pk) return;
    Promise.all([
      fetch(`/api/inspection-group/${pk}/`).then(r => r.json()),
      fetch("/api/inspection-form-data/").then(r => r.json()),
    ])
      .then(([g, f]) => {
        console.log(`[EditPage] LOADED inspection data:`, { client_name: g.client_name, town: g.town, corporate_group: g.corporate_group, group_type: g.group_type, facility_type: g.facility_type, date: g.date_of_inspection, products: g.products?.length });
        console.log(`[EditPage] LOADED form options:`, { clients: f.clients?.length, towns: f.towns?.length, corporate_groups: f.corporate_groups?.length });
        if (!g.success) throw new Error(g.error || "Failed to load inspection");
        if (!f.success) throw new Error(f.error || "Failed to load form options");

        setDateOfInspection(g.date_of_inspection || "");
        setClientName(g.client_name || "");
        setTown(g.town || "");
        setPrimaryEmail(g.client_email || "");
        // Parse additional emails into array (semicolon or comma separated)
        const addEmails = (g.additional_email || "").split(/[;,]/).map((e: string) => e.trim()).filter(Boolean);
        setAdditionalEmails(addEmails.length > 0 ? addEmails : [""]);
        setCorporateGroup(g.corporate_group || "");
        setGroupType(g.group_type || "");
        setFacilityType(g.facility_type || "");
        setKmTraveled(g.km_traveled || 0);
        setHoursWorked(g.hours || 0);
        setTravelStart(g.travel_start_time || "");
        setTravelEnd(g.travel_end_time || "");
        setComment(g.comment || "");
        setIsOccurrence(g.is_occurrence_report || false);

        // Build commodity counts from existing products
        const prods: ProductEntry[] = g.products || [];
        setProducts(prods);
        const counts: Record<CommodityKey, number> = { POULTRY: 0, RAW: 0, PMP: 0, EGGS: 0 };
        prods.forEach((p: ProductEntry) => {
          if (p.commodity in counts) counts[p.commodity as CommodityKey]++;
        });
        setCommodities(counts);
        setOriginalCommodities({ ...counts });

        setOptions({
          clients: f.clients || [],
          towns: f.towns || [],
          corporate_groups: f.corporate_groups || [],
          inspectors: f.inspectors || [],
        });
      })
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [pk]);

  /* ---- When commodities change (step 1 → step 2), rebuild product list ---- */
  const rebuildProducts = () => {
    const next: ProductEntry[] = [];
    for (const cfg of COMMODITY_CONFIG) {
      const count = commodities[cfg.key];
      const existing = products.filter(p => p.commodity === cfg.key);
      for (let i = 0; i < count; i++) {
        next.push(existing[i] ?? {
          commodity: cfg.key,
          product_name: "",
          product_class: "",
          lab: "",
          is_sample_taken: false,
          fat: false,
          protein: false,
          calcium: false,
          dna: false,
          needs_retest: "NO",
          bought_sample: 0,
        });
      }
    }
    setProducts(next);
  };

  const updateProduct = (idx: number, field: string, val: unknown) => {
    setProducts(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  const adjustCommodity = (key: CommodityKey, delta: number) => {
    const label = COMMODITY_CONFIG.find(c => c.key === key)?.label || key;
    const current = commodities[key];
    const next = Math.max(0, current + delta);
    // Removing a commodity that is already SAVED deletes that commodity's
    // inspection record and every file attached to it (RFI, COA, compliance,
    // lab results...). That is irreversible, so make the user confirm first.
    const apply = () => setCommodities(prev => ({ ...prev, [key]: Math.max(0, prev[key] + delta) }));
    if (delta < 0 && next < originalCommodities[key]) {
      const removingAll = next === 0;
      const losing = current - next;
      setConfirmDialog({
        title: removingAll ? `Remove ${label}?` : `Reduce ${label} to ${next}?`,
        body: removingAll
          ? `This permanently deletes the ${label} inspection record and every file attached to it.`
          : `This permanently deletes ${losing} ${label} ${losing === 1 ? "entry" : "entries"} `
            + `and every file attached to ${losing === 1 ? "it" : "them"}.`,
        detail: "COA / lab results, Lab Form, Composition, Compliance, Retest, Other",
        confirmLabel: removingAll ? `Remove ${label}` : "Reduce",
        onConfirm: apply,
      });
      return;   // the dialog applies the change if the user confirms
    }
    apply();
  };

  /* ---- Navigation ---- */
  const maxStep = isOccurrence ? 2 : 4; // occurrence: Basic + Review only

  const validateStep = (s: number): string[] => {
    if (s === 1) {
      const missing = [];
      if (!clientName.trim()) missing.push("Client Name");
      if (!town.trim()) missing.push("Town");
      if (!corporateGroup.trim()) missing.push("Business");
      if (!groupType.trim()) missing.push("Store Type");
      if (!facilityType.trim()) missing.push("Facility Type");
      if (!isOccurrence && !primaryEmail.trim()) missing.push("Client Email (Primary)");
      if (dateOfInspection && dateOfInspection > new Date().toISOString().split("T")[0]) missing.push("Date of Inspection cannot be in the future");
      return missing;
    }
    if (s === 2 && !isOccurrence) {
      const missing: string[] = [];
      products.forEach((p, i) => {
        if (!p.product_name.trim()) missing.push(`Product #${i + 1} name`);
        if (p.is_sample_taken && !p.fat && !p.protein && !p.calcium && !p.dna) {
          missing.push(`Product #${i + 1}: select at least one test (Fat/Protein/Calcium/DNA)`);
        }
      });
      return missing;
    }
    if (s === 3) {
      const missing: string[] = [];
      if (!kmTraveled || kmTraveled <= 0) missing.push("Kilometers Traveled");
      if (!hoursWorked || hoursWorked <= 0) missing.push("Hours Worked");
      if (!travelStart.trim()) missing.push("Travel Start Time");
      if (!travelEnd.trim()) missing.push("Travel End Time");
      return missing;
    }
    return [];
  };

  const goNext = () => {
    console.log(`[EditPage] goNext — current step=${step}, clientName="${clientName}", town="${town}"`);
    const errors = validateStep(step);
    if (step === 1) setStep1Error(errors);
    if (step === 2) setStep2Error(errors);
    if (step === 3) setStep3Error(errors);
    if (errors.length > 0) { console.log(`[EditPage] goNext BLOCKED — errors:`, errors); return; }

    if (step === 1 && !isOccurrence) rebuildProducts();
    setStep(s => Math.min(s + 1, maxStep));
  };

  const goPrev = () => { console.log(`[EditPage] goPrev — current step=${step}`); setStep(s => Math.max(s - 1, 1)); };

  /* ---- Submit ---- */
  const handleSave = async () => {
    console.log(`[EditPage] SAVE clicked — clientName="${clientName}", town="${town}", corporateGroup="${corporateGroup}", groupType="${groupType}", facilityType="${facilityType}"`);
    setSubmitting(true);
    try {
      // Commodities the user deliberately removed (confirmed via the warning in
      // adjustCommodity). Only these get deleted server-side — anything simply
      // absent from `products` is left alone, so nothing is lost by accident.
      const removedCommodities = (Object.keys(originalCommodities) as CommodityKey[])
        .filter(k => originalCommodities[k] > 0 && commodities[k] === 0);
      const payload = {
          inspection_id: Number(pk),
          client_name: clientName,
          town,
          date_of_inspection: dateOfInspection,
          corporate_group: corporateGroup,
          group_type: groupType,
          facility_type: facilityType,
          additional_email: [primaryEmail, ...additionalEmails].filter(e => e.trim()).join('; '),
          comment,
          km_traveled: kmTraveled,
          hours: hoursWorked,
          travel_start_time: travelStart,
          travel_end_time: travelEnd,
          products: isOccurrence ? [] : products,
          removed_commodities: removedCommodities,
          // The user was warned that removing a commodity deletes its files.
          confirm_delete_files: removedCommodities.length > 0,
      };
      console.log(`[EditPage] SAVE payload:`, JSON.stringify(payload, null, 2));
      const res = await fetch("/api/edit-inspection-group/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      console.log(`[EditPage] SAVE response:`, data);
      if (data.success) {
        window.location.href = "/inspections";
      } else {
        setToast({ msg: "Error: " + (data.error || "Unknown error"), ok: false });
      }
    } catch (e) {
      setToast({ msg: "Network error: " + (e instanceof Error ? e.message : String(e)), ok: false });
    } finally {
      setSubmitting(false);
    }
  };

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const isPoultryOrEggs = (c: string) => c === "POULTRY" || c === "EGGS";

  const stepLabels = isOccurrence
    ? ["Basic Info", "Review"]
    : ["Basic Info", "Product Info", "Invoice Info", "Review"];

  const stepNums = isOccurrence ? [1, 2] : [1, 2, 3, 4];

  /* ---------------------------------------------------------------- */
  /*  Loading / Error                                                  */
  /* ---------------------------------------------------------------- */
  if (loading) {
    return (
      <>
        <style>{pageStyles}</style>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", color: "white" }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              border: "4px solid rgba(255,255,255,0.2)",
              borderTopColor: "#fff",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 16px",
            }} />
            Loading inspection data...
          </div>
        </div>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <style>{pageStyles}</style>
        <div className="max-w-3xl mx-auto" style={{ padding: "40px 16px" }}>
          <div className="wizard-container" style={{ padding: 32, textAlign: "center" }}>
            <i className="fas fa-exclamation-triangle" style={{ fontSize: "2rem", color: "#ef4444", display: "block", marginBottom: 12 }} />
            <p style={{ color: "#ef4444", fontWeight: 600, marginBottom: 16 }}>{loadError}</p>
            <a href="/inspections" className="btn btn-secondary">← Back to Inspections</a>
          </div>
        </div>
      </>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                            */
  /* ---------------------------------------------------------------- */
  return (
    <>
      <style>{pageStyles}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 24, right: 24, zIndex: 10000,
          background: toast.ok ? "#059669" : "#dc2626",
          color: "#fff", padding: "14px 24px", borderRadius: 10,
          fontSize: "0.9rem", fontWeight: 500,
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <i className={`fas ${toast.ok ? "fa-check-circle" : "fa-exclamation-circle"}`} />
          {toast.msg}
        </div>
      )}

      <div className="max-w-3xl mx-auto" style={{ padding: "32px 16px" }}>

        {/* Header card */}
        <div className="header-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700, color: "#1f2937", display: "flex", alignItems: "center", gap: 10 }}>
              <i className="fas fa-edit" style={{ color: "#007890" }} />
              Edit Inspection
            </h1>
            {isOccurrence && (
              <span style={{ background: "#fef3c7", color: "#92400e", fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                <i className="fas fa-exclamation-triangle" /> Occurrence Report
              </span>
            )}
          </div>
          <a href="/inspections" className="btn btn-outline" style={{ fontSize: 14 }}>
            <i className="fas fa-arrow-left" /> Back
          </a>
        </div>

        {/* Wizard container */}
        <div className="wizard-container" style={{ padding: 32 }}>

          {/* Steps */}
          <div className="wizard-steps">
            {stepNums.map((n, i) => {
              const isActive = step === n;
              const isCompleted = step > n;
              return (
                <div key={n}
                  className={`step${isActive ? " active" : ""}${isCompleted ? " completed" : ""}`}
                  data-step={n}>
                  <div className="step-circle">
                    {isCompleted ? <i className="fas fa-check" style={{ fontSize: 16 }} /> : n}
                  </div>
                  <span className="step-label">{stepLabels[i]}</span>
                </div>
              );
            })}
          </div>

          {/* ===== STEP 1: BASIC INFO ===== */}
          <div className={`wizard-step-content${step === 1 ? " active" : ""}`} data-step={1}>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1f2937", marginBottom: 24 }}>
              <i className="fas fa-info-circle" style={{ color: "#007890", marginRight: 8 }} />
              Basic Information
            </h3>

            <div className="form-group">
              <label className="form-label">Date of Inspection</label>
              <input type="date" className="form-control" max={new Date().toISOString().split("T")[0]} value={dateOfInspection}
                onChange={e => setDateOfInspection(e.target.value)} />
            </div>

            <Autocomplete label="Client" required options={options?.clients.map(c => c.name) ?? []}
              value={clientName}
              onChange={v => {
                console.log(`[EditPage] Client onChange called — new value="${v}", old value="${clientName}"`);
                setClientName(v);
                const found = options?.clients.find(c => c.name === v);
                console.log(`[EditPage] Client lookup — found in options: ${!!found}`);
                if (found) {
                  if (found.town && !town) setTown(found.town);
                  if (found.email && !primaryEmail) setPrimaryEmail(found.email);
                  if (found.corporate_group && !corporateGroup) setCorporateGroup(found.corporate_group);
                  if (found.group_type && !groupType) setGroupType(found.group_type);
                  if (found.facility_type && !facilityType) setFacilityType(found.facility_type);
                }
              }}
              placeholder="Start typing to search clients..."
            />

            <Autocomplete label="Town" required options={options?.towns ?? []}
              value={town} onChange={v => { console.log(`[EditPage] Town onChange — new="${v}", old="${town}"`); setTown(v); }} placeholder="Start typing to search towns..." />

            <div className="form-group">
              <label className="form-label">Client Email (Primary){!isOccurrence && <span style={{ color: "#ef4444" }}> *</span>}</label>
              <input type="email" className="form-control" value={primaryEmail}
                onChange={e => setPrimaryEmail(e.target.value)} placeholder="primary@example.com" />
              <small style={{ color: "#6b7280", fontSize: 11 }}>Main client email. Documents will be sent to this address.</small>
            </div>

            <div className="form-group">
              <label className="form-label">Additional Emails</label>
              {additionalEmails.map((email, idx) => (
                <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                  <input type="text" className="form-control" value={email}
                    onChange={e => {
                      const updated = [...additionalEmails];
                      updated[idx] = e.target.value;
                      setAdditionalEmails(updated);
                    }}
                    placeholder={`Additional email ${idx + 1}`}
                    autoComplete="new-password"
                    style={{ flex: 1 }} />
                  {additionalEmails.length > 1 && (
                    <button type="button" onClick={() => setAdditionalEmails(additionalEmails.filter((_, i) => i !== idx))}
                      style={{ padding: "6px 10px", background: "#ef4444", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, flexShrink: 0 }}>
                      <i className="fas fa-times" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setAdditionalEmails([...additionalEmails, ""])}
                style={{ padding: "6px 12px", background: "#007890", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
                <i className="fas fa-plus" style={{ marginRight: 4 }} /> Add Email
              </button>
              <small style={{ display: "block", color: "#6b7280", fontSize: 11, marginTop: 4 }}>Documents will also be sent to these addresses.</small>
            </div>

            <div className="form-group">
              <label className="form-label">Business <span style={{ color: "#ef4444" }}>*</span></label>
              <select className="form-control" value={corporateGroup} onChange={e => { console.log(`[EditPage] Business changed — "${e.target.value}"`); setCorporateGroup(e.target.value); }}>
                <option value="">Select business (required)</option>
                {(options?.corporate_groups ?? []).map(g => <option key={g} value={g}>{g}</option>)}
                {corporateGroup && !(options?.corporate_groups ?? []).includes(corporateGroup) && corporateGroup !== "Not Applicable" && corporateGroup !== "Other" && (
                  <option key={corporateGroup} value={corporateGroup}>{corporateGroup}</option>
                )}
                <option value="Not Applicable">Not Applicable</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Store Type <span style={{ color: "#ef4444" }}>*</span></label>
              <select className="form-control" value={groupType} onChange={e => { console.log(`[EditPage] Store Type changed — "${e.target.value}"`); setGroupType(e.target.value); }}>
                <option value="">Select store type (required)</option>
                {GROUP_TYPES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Facility Type <span style={{ color: "#ef4444" }}>*</span></label>
              <select className="form-control" value={facilityType} onChange={e => { console.log(`[EditPage] Facility Type changed — "${e.target.value}"`); setFacilityType(e.target.value); }}>
                <option value="">Select facility type (required)</option>
                {FACILITY_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            {/* Commodity cards — not shown for occurrence reports */}
            {!isOccurrence && (
              <div className="form-group">
                <label className="form-label">Commodity Types</label>
                <div className="commodity-grid">
                  {COMMODITY_CONFIG.map(cfg => (
                    <div key={cfg.key}
                      className={`commodity-card${commodities[cfg.key] > 0 ? " selected" : ""}`}
                      data-value={cfg.key}>
                      <i className={`fas ${cfg.icon}`} />
                      <h4>{cfg.label}</h4>
                      <div className="commodity-counter">
                        <button type="button" className="decrement-btn"
                          onClick={() => adjustCommodity(cfg.key, -1)}
                          disabled={commodities[cfg.key] === 0}>−</button>
                        <span className="commodity-count">{commodities[cfg.key]}</span>
                        <button type="button" className="increment-btn"
                          onClick={() => adjustCommodity(cfg.key, 1)}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 1 validation */}
            {step1Error.length > 0 && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", color: "#991b1b", fontSize: 14, marginTop: 16 }}>
                <i className="fas fa-exclamation-triangle" style={{ marginRight: 8 }} />
                <strong>Missing Required Fields:</strong>
                <ul style={{ margin: "8px 0 0 24px", padding: 0, listStyleType: "disc" }}>
                  {step1Error.map(e => <li key={e}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>

          {/* ===== STEP 2: PRODUCT INFO ===== */}
          {!isOccurrence && (
            <div className={`wizard-step-content${step === 2 ? " active" : ""}`} data-step={2}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1f2937", marginBottom: 24 }}>
                <i className="fas fa-box" style={{ color: "#007890", marginRight: 8 }} />
                Product Info
              </h3>

              {products.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af" }}>
                  <i className="fas fa-box-open" style={{ fontSize: "2.5rem", display: "block", marginBottom: 12 }} />
                  No commodities selected. Go back and add at least one.
                </div>
              )}

              {products.map((p, idx) => {
                const cfg = COMMODITY_CONFIG.find(c => c.key === p.commodity)!;
                const sameCount = products.slice(0, idx).filter(x => x.commodity === p.commodity).length;
                const hideTests = isPoultryOrEggs(p.commodity);
                return (
                  <div key={idx} style={{
                    border: "2px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 20,
                    background: "#fff",
                  }}>
                    <h4 style={{ margin: "0 0 16px", fontWeight: 600, color: "#1f2937", display: "flex", alignItems: "center", gap: 8 }}>
                      <i className={`fas ${cfg.icon}`} style={{ color: "#007890" }} />
                      {cfg.label} #{sameCount + 1}
                    </h4>

                    <div className="product-fields-grid">
                      <div className="form-group">
                        <label className="form-label">Product Name <span style={{ color: "#ef4444" }}>*</span></label>
                        <input type="text" className="form-control" value={p.product_name}
                          onChange={e => updateProduct(idx, "product_name", e.target.value)}
                          placeholder="Enter product name" />
                      </div>
                      {(PRODUCT_CLASSES_BY_COMMODITY[p.commodity]?.length ?? 0) > 0 && (
                        <div className="form-group">
                          <label className="form-label">Product Class</label>
                          <select className="form-control" value={p.product_class}
                            onChange={e => updateProduct(idx, "product_class", e.target.value)}>
                            <option value="">-- Select --</option>
                            {(PRODUCT_CLASSES_BY_COMMODITY[p.commodity] || []).map(c => <option key={c} value={c}>{c}</option>)}
                            {p.product_class && !(PRODUCT_CLASSES_BY_COMMODITY[p.commodity] || []).includes(p.product_class) && (
                              <option value={p.product_class}>{p.product_class}</option>
                            )}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Sample Taken — only for non-POULTRY/EGGS */}
                    {!hideTests && (
                      <label className="checkbox-card sample-taken-card" style={{ marginBottom: 16 }}>
                        <input type="checkbox" checked={p.is_sample_taken}
                          onChange={e => {
                            const checked = e.target.checked;
                            updateProduct(idx, "is_sample_taken", checked);
                            // Clear test fields when sample is unticked
                            if (!checked) {
                              updateProduct(idx, "fat", false);
                              updateProduct(idx, "protein", false);
                              updateProduct(idx, "calcium", false);
                              updateProduct(idx, "dna", false);
                              updateProduct(idx, "lab", "");
                              updateProduct(idx, "needs_retest", "NO");
                            }
                          }} />
                        <div className="custom-check"><i className="fas fa-check" /></div>
                        <span className="checkbox-content">
                          <span style={{ fontWeight: 500 }}>Sample Taken</span>
                        </span>
                      </label>
                    )}

                    {/* Lab + Needs Retest — only when sample is taken */}
                    {!hideTests && p.is_sample_taken && (
                      <div className="product-fields-grid">
                        <div className="form-group">
                          <label className="form-label">Lab</label>
                          <select className="form-control" value={p.lab}
                            onChange={e => updateProduct(idx, "lab", e.target.value)}>
                            <option value="">-- Select --</option>
                            {LABS.map(l => <option key={l} value={l}>{l}</option>)}
                            {p.lab && !LABS.includes(p.lab) && (
                              <option value={p.lab}>{p.lab}</option>
                            )}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Needs Retest</label>
                          <select className="form-control" value={p.needs_retest}
                            onChange={e => updateProduct(idx, "needs_retest", e.target.value)}>
                            <option value="NO">No</option>
                            <option value="YES">Yes</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Tests — only when sample is taken */}
                    {!hideTests && p.is_sample_taken && (
                      <div>
                        <label className="form-label" style={{ marginBottom: 10 }}>Tests</label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          {(["fat", "protein", "calcium", "dna"] as const).map(t => (
                            <label key={t} className="checkbox-card testing-card">
                              <input type="checkbox" checked={p[t] as boolean}
                                onChange={e => updateProduct(idx, t, e.target.checked)} />
                              <div className="custom-check"><i className="fas fa-check" /></div>
                              <span className="checkbox-content">
                                <span style={{ fontWeight: 500 }}>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {step2Error.length > 0 && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", color: "#991b1b", fontSize: 14 }}>
                  <i className="fas fa-exclamation-triangle" style={{ marginRight: 8 }} />
                  <strong>Missing:</strong> {step2Error.join(", ")}
                </div>
              )}
            </div>
          )}

          {/* ===== STEP 3: INVOICE INFO ===== */}
          {!isOccurrence && (
            <div className={`wizard-step-content${step === 3 ? " active" : ""}`} data-step={3}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1f2937", marginBottom: 24 }}>
                <i className="fas fa-file-invoice" style={{ color: "#007890", marginRight: 8 }} />
                Invoice Info
              </h3>

              <div className="product-fields-grid">
                <div className="form-group">
                  <label className="form-label">Kilometers Traveled</label>
                  <input type="number" step="0.1" className="form-control" value={kmTraveled}
                    onChange={e => setKmTraveled(Number(e.target.value))} placeholder="0" min={0} />
                </div>
                <div className="form-group">
                  <label className="form-label">Hours Worked</label>
                  <input type="number" step="0.5" className="form-control" value={hoursWorked}
                    onChange={e => setHoursWorked(Number(e.target.value))} placeholder="0" min={0} />
                </div>
                <div className="form-group">
                  <label className="form-label">Travel Start</label>
                  <input type="time" className="form-control" value={travelStart}
                    onChange={e => setTravelStart(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Travel End</label>
                  <input type="time" className="form-control" value={travelEnd}
                    onChange={e => setTravelEnd(e.target.value)} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <label className="checkbox-card testing-card">
                  <input type="checkbox" checked={followUp} onChange={e => setFollowUp(e.target.checked)} />
                  <div className="custom-check"><i className="fas fa-check" /></div>
                  <span className="checkbox-content"><span style={{ fontWeight: 500 }}>Follow-up Required</span></span>
                </label>
                <label className="checkbox-card testing-card">
                  <input type="checkbox" checked={dispensation} onChange={e => setDispensation(e.target.checked)} />
                  <div className="custom-check"><i className="fas fa-check" /></div>
                  <span className="checkbox-content"><span style={{ fontWeight: 500 }}>Dispensation Application</span></span>
                </label>
              </div>

              <div className="form-group">
                <label className="form-label">Comments / Notes</label>
                <textarea className="form-control" rows={4} value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Optional notes..." style={{ resize: "vertical" }} />
              </div>

              {step3Error.length > 0 && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", color: "#991b1b", fontSize: 14 }}>
                  <i className="fas fa-exclamation-triangle" style={{ marginRight: 8 }} />
                  <strong>Missing:</strong> {step3Error.join(", ")}
                </div>
              )}
            </div>
          )}

          {/* ===== STEP 4 (or 2 for occurrence): REVIEW ===== */}
          <div className={`wizard-step-content${step === maxStep ? " active" : ""}`} data-step={maxStep}>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1f2937", marginBottom: 24 }}>
              <i className="fas fa-check-circle" style={{ color: "#007890", marginRight: 8 }} />
              Review &amp; Submit
            </h3>

            <div style={{ background: "#f9fafb", borderRadius: 12, padding: 24, marginBottom: 24 }}>
              <h4 style={{ fontWeight: 600, color: "#374151", marginBottom: 16 }}>Inspection Summary</h4>
              <div className="review-summary-grid">
                {[
                  ["Date",            dateOfInspection ? new Date(dateOfInspection + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "—"],
                  ["Client",          clientName || "—"],
                  ["Town",            town || "—"],
                  ["Email(s)",        [primaryEmail, ...additionalEmails].filter(e => e.trim()).join('; ') || "—"],
                  ["Business",        corporateGroup || "—"],
                  ["Store Type",      groupType || "—"],
                  ["Facility Type",   facilityType || "—"],
                  ["KM / Hours",      `${kmTraveled} km / ${hoursWorked} hrs`],
                  ["Travel Times",    travelStart && travelEnd ? `${travelStart} → ${travelEnd}` : "—"],
                ].map(([label, val]) => (
                  <div key={label} style={{ padding: 12, background: "white", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                    <span style={{ display: "block", fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</span>
                    <span style={{ fontWeight: 600, color: "#1f2937" }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {!isOccurrence && products.length > 0 && (
              <div style={{ background: "#f9fafb", borderRadius: 12, padding: 24 }}>
                <h4 style={{ fontWeight: 600, color: "#374151", marginBottom: 16 }}>Products ({products.length})</h4>
                {products.map((p, i) => {
                  const cfg = COMMODITY_CONFIG.find(c => c.key === p.commodity)!;
                  const tests = (["fat","protein","calcium","dna"] as const).filter(t => p[t]).map(t => t.charAt(0).toUpperCase() + t.slice(1));
                  return (
                    <div key={i} style={{
                      padding: "12px 16px", borderBottom: i < products.length - 1 ? "1px solid #e5e7eb" : "none",
                      display: "flex", alignItems: "center", gap: 12,
                    }}>
                      <i className={`fas ${cfg.icon}`} style={{ color: "#007890", width: 20 }} />
                      <div>
                        <div style={{ fontWeight: 600, color: "#1f2937", fontSize: 14 }}>{p.product_name || "(unnamed)"}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          {[p.product_class, p.lab, p.is_sample_taken ? "Sample taken" : null, ...tests].filter(Boolean).join(" · ") || "No details"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "14px 18px", color: "#166534", fontSize: 14, marginTop: 20 }}>
              <i className="fas fa-check-circle" style={{ marginRight: 8 }} />
              All required fields are filled. You can now save the inspection.
            </div>
          </div>

          {/* Navigation */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
            <button type="button" className="btn btn-outline" onClick={goPrev}
              style={{ visibility: step === 1 ? "hidden" : "visible" }}>
              <i className="fas fa-arrow-left" /> Back
            </button>
            <div style={{ display: "flex", gap: 12 }}>
              {step < maxStep && (
                <button type="button" className="btn btn-primary" onClick={goNext}>
                  Next <i className="fas fa-arrow-right" />
                </button>
              )}
              {step === maxStep && (
                <button type="button" className="btn btn-primary" onClick={handleSave} disabled={submitting}>
                  {submitting
                    ? <><i className="fas fa-spinner fa-spin" /> Saving...</>
                    : <><i className="fas fa-save" /> Save Inspection</>}
                </button>
              )}
            </div>
          </div>

        </div>{/* end wizard-container */}

        <div style={{ textAlign: "center", marginTop: 24, color: "white", fontSize: 13, opacity: 0.8 }}>
          Food Safety Agency (Pty) Ltd - Inspection Management System
        </div>

      </div>{/* end max-w-3xl */}

      {/* Confirm dialog — styled replacement for window.confirm */}
      {confirmDialog && (
        <div
          className="confirm-overlay"
          onClick={e => { if (e.target === e.currentTarget) setConfirmDialog(null); }}
        >
          <div className="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className="confirm-icon"><i className="fas fa-triangle-exclamation" /></div>
            <h3 className="confirm-title" id="confirm-title">{confirmDialog.title}</h3>
            <p className="confirm-body">{confirmDialog.body}</p>
            {confirmDialog.detail && (
              <div className="confirm-detail">
                <span className="confirm-detail-label">Files that will be deleted</span>
                {confirmDialog.detail}
              </div>
            )}
            <p className="confirm-warning">
              <i className="fas fa-circle-exclamation" /> This cannot be undone.
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                className="btn btn-outline"
                ref={confirmCancelRef}
                onClick={() => setConfirmDialog(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => { const run = confirmDialog.onConfirm; setConfirmDialog(null); run(); }}
              >
                <i className="fas fa-trash-can" /> {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  CSS — exact copy of Django template styles                         */
/* ------------------------------------------------------------------ */
const pageStyles = `
  .edit-page-root {
    font-family: system-ui, -apple-system, sans-serif;
  }
  body {
    background: url('/background.jpg') no-repeat center center fixed !important;
    background-size: cover !important;
  }
  body::before {
    content: '';
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.45);
    z-index: -1;
    pointer-events: none;
  }
  .max-w-3xl { max-width: 800px; margin: 0 auto; }
  .wizard-container {
    background: rgba(255,255,255,0.97);
    border-radius: 16px;
    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
    backdrop-filter: blur(10px);
  }
  .header-card {
    background: rgba(255,255,255,0.95);
    border-radius: 12px;
    padding: 16px 24px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  }
  .form-control {
    width: 100%;
    padding: 12px 16px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 15px;
    transition: all 0.2s;
    background: white;
    box-sizing: border-box;
    font-family: inherit;
    -webkit-appearance: none;
    appearance: none;
  }
  .form-control:focus {
    outline: none;
    border-color: #007890;
    box-shadow: 0 0 0 4px rgba(0,120,144,0.15);
  }
  .form-label {
    display: block;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 6px;
    font-size: 14px;
  }
  .form-group { margin-bottom: 20px; }
  .btn {
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    font-size: 15px;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
  }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-primary { background: #007890; color: white; }
  .btn-primary:hover:not(:disabled) { background: #005a6b; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,120,144,0.3); }
  .btn-secondary { background: #6b7280; color: white; }
  .btn-secondary:hover { background: #4b5563; }
  .btn-outline { background: rgba(255,255,255,0.9); border: 2px solid #e5e7eb; color: #1f2937; }
  .btn-outline:hover { background: white; border-color: #007890; }

  /* Wizard steps */
  .wizard-steps {
    display: flex;
    justify-content: space-between;
    margin-bottom: 32px;
    position: relative;
  }
  .wizard-steps::before {
    content: '';
    position: absolute;
    top: 22px; left: 50px; right: 50px;
    height: 3px;
    background: #e5e7eb;
    z-index: 0;
  }
  .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    z-index: 1;
    flex: 1;
  }
  .step-circle {
    width: 44px; height: 44px;
    border-radius: 50%;
    background: #e5e7eb;
    color: #9ca3af;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 16px;
    margin-bottom: 8px;
    transition: all 0.3s;
  }
  .step.active .step-circle { background: #007890; color: white; box-shadow: 0 0 0 4px rgba(0,120,144,0.2); }
  .step.completed .step-circle { background: #10b981; color: white; }
  .step-label { font-size: 13px; font-weight: 500; color: #9ca3af; text-align: center; }
  .step.active .step-label, .step.completed .step-label { color: #1f2937; }

  /* Wizard content */
  .wizard-step-content { display: none; animation: fadeInStep 0.3s ease; }
  .wizard-step-content.active { display: block; }
  @keyframes fadeInStep {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Commodity cards */
  .commodity-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 16px; }
  .commodity-card {
    padding: 20px 24px;
    border: 2px solid #e5e7eb;
    border-radius: 12px;
    transition: all 0.2s;
    text-align: center;
    background: white;
  }
  .commodity-card:hover { border-color: #007890; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
  .commodity-card.selected { border-color: #007890; background: #e6f3f7; box-shadow: 0 0 0 3px rgba(0,120,144,0.2); }
  .commodity-card i { font-size: 32px; margin-bottom: 8px; color: #007890; display: block; }
  .commodity-card h4 { font-weight: 600; color: #1f2937; font-size: 15px; margin: 0 0 12px; }
  .commodity-counter { display: flex; align-items: center; justify-content: center; gap: 12px; }
  .decrement-btn, .increment-btn {
    width: 32px; height: 32px;
    border-radius: 50%;
    border: 2px solid #007890;
    background: white;
    color: #007890;
    font-size: 18px;
    font-weight: bold;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.2s;
  }
  .decrement-btn:hover, .increment-btn:hover { background: #007890; color: white; }
  .decrement-btn:disabled { border-color: #ccc; color: #ccc; cursor: not-allowed; }
  .decrement-btn:disabled:hover { background: white; color: #ccc; }
  .commodity-count { font-size: 20px; font-weight: bold; color: #1f2937; min-width: 30px; text-align: center; }

  /* Confirm dialog */
  .confirm-overlay {
    position: fixed;
    inset: 0;
    z-index: 11000;
    background: rgba(15,23,42,0.55);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: confirmFadeIn 0.15s ease;
  }
  .confirm-card {
    background: white;
    border-radius: 16px;
    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.45);
    padding: 32px 32px 24px;
    max-width: 460px;
    width: 100%;
    text-align: center;
    animation: confirmPopIn 0.2s cubic-bezier(0.16,1,0.3,1);
  }
  .confirm-icon {
    width: 64px; height: 64px;
    margin: 0 auto 18px;
    border-radius: 50%;
    background: #fef2f2;
    color: #dc2626;
    display: flex; align-items: center; justify-content: center;
    font-size: 28px;
  }
  .confirm-title {
    margin: 0 0 10px;
    font-size: 1.25rem;
    font-weight: 700;
    color: #1f2937;
  }
  .confirm-body {
    margin: 0 0 16px;
    font-size: 14px;
    line-height: 1.6;
    color: #4b5563;
  }
  .confirm-detail {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 12px 14px;
    font-size: 12.5px;
    line-height: 1.5;
    color: #6b7280;
    text-align: left;
  }
  .confirm-detail-label {
    display: block;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #9ca3af;
    margin-bottom: 4px;
  }
  .confirm-warning {
    margin: 16px 0 0;
    font-size: 13px;
    font-weight: 600;
    color: #dc2626;
    display: flex; align-items: center; justify-content: center; gap: 7px;
  }
  .confirm-actions {
    display: flex;
    gap: 12px;
    margin-top: 24px;
  }
  .confirm-actions .btn { flex: 1; justify-content: center; white-space: nowrap; }
  .btn-danger { background: #dc2626; color: white; }
  .btn-danger:hover:not(:disabled) { background: #b91c1c; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(220,38,38,0.35); }
  .btn-outline:focus-visible, .btn-danger:focus-visible { outline: 3px solid rgba(0,120,144,0.45); outline-offset: 2px; }
  @keyframes confirmFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes confirmPopIn {
    from { opacity: 0; transform: translateY(12px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* Client dropdown */
  .client-dropdown {
    position: absolute;
    top: 100%; left: 0; right: 0;
    background: white;
    border: 2px solid #007890;
    border-top: none;
    border-radius: 0 0 12px 12px;
    max-height: 300px;
    overflow-y: auto;
    z-index: 1000;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  }
  .client-dropdown-item {
    padding: 12px 16px;
    cursor: pointer;
    border-bottom: 1px solid #f0f0f0;
    transition: all 0.15s;
  }
  .client-dropdown-item:hover { background: #e6f3f7; border-left: 3px solid #007890; }
  .client-name { font-weight: 600; color: #1f2937; font-size: 14px; }

  /* Checkbox cards */
  .checkbox-card {
    display: flex;
    align-items: center;
    padding: 16px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    background: white;
    margin: 0;
  }
  .checkbox-card:hover { border-color: #007890; background: #e6f3f7; }

  /* Sample taken card */
  .checkbox-card.sample-taken-card {
    position: relative;
    padding-left: 52px;
    min-height: 54px;
    width: 100%;
    box-sizing: border-box;
  }
  .checkbox-card.sample-taken-card input[type="checkbox"] { display: none; }
  .checkbox-card.sample-taken-card .custom-check {
    position: absolute;
    left: 14px; top: 50%;
    transform: translateY(-50%);
    width: 26px; height: 26px;
    border: 2px solid #d1d5db;
    border-radius: 6px;
    background: white;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.25s ease;
  }
  .checkbox-card.sample-taken-card .custom-check i { font-size: 14px; color: transparent; transition: all 0.25s ease; transform: scale(0); }
  .checkbox-card.sample-taken-card:has(input:checked) { border-color: #10b981; background: linear-gradient(135deg,#d1fae5 0%,#a7f3d0 100%); box-shadow: 0 4px 12px rgba(16,185,129,0.2); }
  .checkbox-card.sample-taken-card:has(input:checked) .custom-check { background: linear-gradient(135deg,#10b981 0%,#059669 100%); border-color: #059669; }
  .checkbox-card.sample-taken-card:has(input:checked) .custom-check i { color: white; transform: scale(1); }
  .checkbox-card.sample-taken-card:has(input:checked) .checkbox-content { color: #047857; font-weight: 600; }

  /* Testing card */
  .checkbox-card.testing-card { position: relative; padding-left: 48px; min-height: 50px; }
  .checkbox-card.testing-card input[type="checkbox"] { display: none; }
  .checkbox-card.testing-card .custom-check {
    position: absolute;
    left: 12px; top: 50%;
    transform: translateY(-50%);
    width: 24px; height: 24px;
    border: 2px solid #d1d5db;
    border-radius: 6px;
    background: white;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.2s ease;
  }
  .checkbox-card.testing-card .custom-check i { font-size: 12px; color: transparent; transition: all 0.2s ease; transform: scale(0); }
  .checkbox-card.testing-card:hover .custom-check { border-color: #007890; background: #e6f3f7; }
  .checkbox-card.testing-card:has(input:checked) { border-color: #007890; background: #e6f3f7; }
  .checkbox-card.testing-card:has(input:checked) .custom-check { background: #007890; border-color: #007890; }
  .checkbox-card.testing-card:has(input:checked) .custom-check i { color: white; transform: scale(1); }
  .checkbox-card.testing-card:has(input:checked) .checkbox-content { color: #007890; font-weight: 600; }

  textarea.form-control { font-family: inherit; }

  .product-fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; }
  .review-summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px; }

  @media (max-width: 768px) {
    .max-w-3xl { padding: 0 8px; }
    .wizard-container { padding: 16px !important; border-radius: 12px; }
    .header-card { padding: 12px 16px; }
    .header-card h1 { font-size: 1.2rem !important; }
    .commodity-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
    .commodity-card { padding: 14px 12px; }
    .commodity-card i { font-size: 24px; margin-bottom: 4px; }
    .commodity-card h4 { font-size: 13px; margin-bottom: 8px; }
    .wizard-steps::before { left: 20px; right: 20px; }
    .step-circle { width: 36px; height: 36px; font-size: 14px; }
    .step-label { font-size: 10px; }
    .product-fields-grid { grid-template-columns: 1fr; gap: 0; }
    .review-summary-grid { grid-template-columns: 1fr !important; }
    .form-control { padding: 10px 12px; font-size: 14px; }
    .form-label { font-size: 13px; }
    .form-group { margin-bottom: 14px; }
    .btn { padding: 10px 18px; font-size: 14px; }
    .checkbox-card { padding: 12px; }
    .checkbox-card.sample-taken-card { padding-left: 44px; min-height: 46px; }
    .checkbox-card.testing-card { padding-left: 40px; min-height: 42px; }
    .client-dropdown { max-height: 200px; }
    .client-dropdown-item { padding: 10px 12px; }
  }
  @media (max-width: 768px) {
    .confirm-card { padding: 24px 20px 20px; border-radius: 12px; }
    .confirm-icon { width: 54px; height: 54px; font-size: 24px; margin-bottom: 14px; }
    .confirm-title { font-size: 1.1rem; }
    .confirm-actions { flex-direction: column-reverse; gap: 10px; }
  }
  @media (max-width: 400px) {
    .max-w-3xl { padding: 0 4px; }
    .wizard-container { padding: 12px !important; }
    .commodity-grid { grid-template-columns: 1fr; gap: 8px; }
    .step-circle { width: 30px; height: 30px; font-size: 12px; }
    .step-label { font-size: 9px; }
    .wizard-steps::before { left: 15px; right: 15px; }
  }
`;
