"use client";

import { useState, useEffect, useRef } from "react";

type CommodityKey = "POULTRY" | "RAW" | "PMP" | "EGGS";

interface ProductEntry {
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
}

interface FormOptions {
  clients: { name: string; town?: string; email?: string; corporate_group?: string; group_type?: string; facility_type?: string }[];
  towns: string[];
  corporate_groups: string[];
  inspectors: string[];
}

const COMMODITY_CONFIG: { key: CommodityKey; label: string; icon: string }[] = [
  { key: "POULTRY", label: "Poultry",          icon: "fa-drumstick-bite" },
  { key: "RAW",     label: "Raw Meat",         icon: "fa-bacon"          },
  { key: "PMP",     label: "PMP (Processed)",  icon: "fa-hamburger"      },
  { key: "EGGS",    label: "Eggs",             icon: "fa-egg"            },
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
const LABS = ["Food Safety Lab","Merieux","AGRI Food Lab","SANBI","SMT","ARC","Food Consulting Services (FCS)","AssureCloud/NOSA"];
const GROUP_TYPES = ["Corporate Store","Franchise Store","Individual / Independent Owner"];
const FACILITY_TYPES = ["Retailer","Butchery","Re-Packer","Production Plant","Farm","Abattoir","Importer","Egg Producers"];

/* ── Autocomplete with "Add new" support ── */
function Autocomplete({ label, required, options, value, onChange, placeholder }: {
  label: string; required?: boolean; options: string[]; value: string;
  onChange: (v: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const query = open ? search : value;
  const filtered = options.filter(o => o.toLowerCase().includes(query.toLowerCase())).slice(0, 50);
  const trimmed = search.trim();
  const exactMatch = trimmed && options.some(o => o.toLowerCase() === trimmed.toLowerCase());
  const showAddNew = open && trimmed && !exactMatch;

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        // When closing, keep typed value if it's custom
        if (search.trim() && !options.some(o => o.toLowerCase() === search.trim().toLowerCase())) {
          onChange(search.trim());
        }
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [search, options, onChange]);

  return (
    <div ref={ref} className="form-group" style={{ position: "relative" }}>
      <label className="form-label">{label}{required && <span style={{ color: "#ef4444" }}> *</span>}</label>
      <input type="text" className="form-control" value={open ? search : value} placeholder={placeholder || `Search or add new ${label.toLowerCase()}...`}
        onFocus={() => { setOpen(true); setSearch(value); }}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onKeyDown={e => { if (e.key === "Enter" && trimmed) { e.preventDefault(); onChange(trimmed); setOpen(false); setSearch(""); } }}
        autoComplete="off" />
      {open && (filtered.length > 0 || showAddNew) && (
        <div className="client-dropdown" style={{ display: "block" }}>
          {showAddNew && (
            <div className="client-dropdown-item"
              style={{ borderBottom: "2px solid #f59e0b", background: "#fef3c7" }}
              onClick={() => { onChange(trimmed); setOpen(false); setSearch(""); }}>
              <span style={{ color: "#92400e" }}>
                <i className="fas fa-plus-circle" style={{ marginRight: 6 }} />
                <strong>Add new: &quot;{trimmed}&quot;</strong>
              </span>
            </div>
          )}
          {filtered.map(o => (
            <div key={o} className="client-dropdown-item"
              onClick={() => { onChange(o); setOpen(false); setSearch(""); }}>
              <span className="client-name">{o}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main ── */
export default function AddInspectionPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<FormOptions | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Step 1
  const [dateOfInspection, setDateOfInspection] = useState("");
  const [clientName, setClientName] = useState("");
  const [town, setTown] = useState("");
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [additionalEmails, setAdditionalEmails] = useState<string[]>([""]);
  const [corporateGroup, setCorporateGroup] = useState("");
  const [groupType, setGroupType] = useState("");
  const [facilityType, setFacilityType] = useState("");
  const [commodities, setCommodities] = useState<Record<CommodityKey, number>>({ POULTRY: 0, RAW: 0, PMP: 0, EGGS: 0 });

  // Occurrence Report
  const [isOccurrence, setIsOccurrence] = useState(false);
  const [registrationCode, setRegistrationCode] = useState("");
  const [physicalAddress, setPhysicalAddress] = useState("");
  const [telephone, setTelephone] = useState("");
  const [timeOfVisit, setTimeOfVisit] = useState("");
  const [occurrenceDescription, setOccurrenceDescription] = useState("");
  const [occFile, setOccFile] = useState<File | null>(null);

  // RFI file (for Raw/PMP)
  const [rfiFile, setRfiFile] = useState<File | null>(null);

  // Step 2
  const [products, setProducts] = useState<ProductEntry[]>([]);

  // Step 3
  const [kmTraveled, setKmTraveled] = useState(0);
  const [hoursWorked, setHoursWorked] = useState(0);
  const [travelStart, setTravelStart] = useState("");
  const [travelEnd, setTravelEnd] = useState("");
  const [comment, setComment] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [dispensation, setDispensation] = useState(false);

  const [step1Error, setStep1Error] = useState<string[]>([]);
  const [step2Error, setStep2Error] = useState<string[]>([]);
  const [step3Error, setStep3Error] = useState<string[]>([]);

  // Current user info for inspector_name
  const [inspectorName, setInspectorName] = useState("API User");

  useEffect(() => {
    // Fetch current user info
    fetch("/api/me", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.authenticated) {
          const fullName = `${d.first_name || ""} ${d.last_name || ""}`.trim();
          setInspectorName(fullName || d.username || "API User");
        }
      })
      .catch(() => {});

    fetch("/api/inspection-form-data/")
      .then(r => r.json())
      .then(f => {
        if (f.success) {
          setOptions({ clients: f.clients || [], towns: f.towns || [], corporate_groups: f.corporate_groups || [], inspectors: f.inspectors || [] });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const rebuildProducts = () => {
    const next: ProductEntry[] = [];
    for (const cfg of COMMODITY_CONFIG) {
      const count = commodities[cfg.key];
      const existing = products.filter(p => p.commodity === cfg.key);
      for (let i = 0; i < count; i++) {
        next.push(existing[i] ?? {
          commodity: cfg.key, product_name: "", product_class: "", lab: "",
          is_sample_taken: false, fat: false, protein: false, calcium: false, dna: false, needs_retest: "NO",
        });
      }
    }
    setProducts(next);
  };

  const updateProduct = (idx: number, field: string, val: unknown) => {
    setProducts(prev => { const n = [...prev]; n[idx] = { ...n[idx], [field]: val }; return n; });
  };

  const adjustCommodity = (key: CommodityKey, delta: number) => {
    setCommodities(prev => ({ ...prev, [key]: Math.max(0, prev[key] + delta) }));
  };

  const isPoultryOrEggs = (c: string) => c === "POULTRY" || c === "EGGS";

  const validateStep = (s: number): string[] => {
    if (s === 1) {
      const m: string[] = [];
      if (!dateOfInspection) m.push("Date of Inspection");
      else if (dateOfInspection > new Date().toISOString().split("T")[0]) m.push("Date of Inspection cannot be in the future");
      if (!clientName.trim()) m.push("Client Name");
      if (!town.trim()) m.push("Facility Address");
      if (!primaryEmail.trim()) m.push("Client Email (Primary)");
      if (!corporateGroup.trim()) m.push("Business");
      if (!groupType.trim()) m.push("Store Type");
      if (!facilityType.trim()) m.push("Facility Type");
      if (Object.values(commodities).every(v => v === 0)) m.push("At least one commodity");
      return m;
    }
    if (s === 2) {
      const m: string[] = [];
      products.forEach((p, i) => {
        if (!p.product_name.trim()) m.push(`Product #${i + 1} name`);
        if (p.is_sample_taken && !p.lab.trim()) {
          m.push(`Product #${i + 1}: select a Lab (sample taken)`);
        }
        if (p.is_sample_taken && !p.fat && !p.protein && !p.calcium && !p.dna) {
          m.push(`Product #${i + 1}: select at least one test (Fat/Protein/Calcium/DNA)`);
        }
      });
      return m;
    }
    if (s === 3) {
      const m: string[] = [];
      if (!kmTraveled || kmTraveled <= 0) m.push("Kilometers Traveled");
      if (!hoursWorked || hoursWorked <= 0) m.push("Hours Worked");
      if (!travelStart.trim()) m.push("Travel Start Time");
      if (!travelEnd.trim()) m.push("Travel End Time");
      // RFI is required for RAW and PMP commodities
      if ((commodities.RAW > 0 || commodities.PMP > 0) && !rfiFile) m.push("RFI Document (required for Raw Meat & PMP)");
      return m;
    }
    return [];
  };

  const goNext = () => {
    const errors = validateStep(step);
    if (step === 1) setStep1Error(errors);
    if (step === 2) setStep2Error(errors);
    if (step === 3) setStep3Error(errors);
    if (errors.length > 0) return;
    if (step === 1) rebuildProducts();
    setStep(s => s + 1);
  };

  const goPrev = () => {
    setStep(s => s - 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
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
          follow_up: followUp,
          dispensation_application: dispensation,
          inspector_name: inspectorName,
          products,
      };
      const res = await fetch("/api/add-inspection/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        // Upload RFI file if present. RFI is mandatory for RAW/PMP, so a failed
        // upload must NOT be silently swallowed — otherwise the inspection is
        // created with no RFI (exactly the gap we are closing).
        const rfiRequired = commodities.RAW > 0 || commodities.PMP > 0;
        if (rfiFile && data.group_id) {
          try {
            const fd = new FormData();
            // Build proper group_id format with _g{pk} suffix for Django upload handler
            const slug = clientName.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
            const dateSlug = dateOfInspection.replace(/-/g, '');
            fd.append("group_id", `${slug}_${dateSlug}_g${data.group_id}`);
            fd.append("document_type", "rfi");
            fd.append("file", rfiFile);
            const up = await fetch("/api/upload-document", { method: "POST", body: fd });
            const upData = await up.json().catch(() => ({ success: up.ok }));
            if (!up.ok || upData.success === false) {
              throw new Error(upData.error || "RFI upload failed");
            }
          } catch (err) {
            // Inspection exists but the required RFI didn't attach. Keep the user
            // here with a clear warning so they re-upload from the Inspections page.
            setToast({
              msg: "Inspection saved, but the RFI upload failed. Please open the inspection on the Inspections page and upload the RFI — it is required for Raw/PMP.",
              ok: false,
            });
            setSubmitting(false);
            setTimeout(() => { window.location.href = "/inspections"; }, 3500);
            return;
          }
        } else if (rfiRequired) {
          // Should be unreachable (step 3 validation blocks this), but guard anyway.
          setToast({ msg: "An RFI document is required for Raw Meat / PMP inspections.", ok: false });
          setSubmitting(false);
          return;
        }
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

  /* ── Occurrence Report state ── */
  const [occStep, setOccStep] = useState(1);
  const [occError, setOccError] = useState<string[]>([]);

  const validateOccStep = (s: number): string[] => {
    if (s === 1) {
      const m: string[] = [];
      if (!facilityType.trim()) m.push("Facility Type");
      if (!clientName.trim()) m.push("Client Name");
      if (!physicalAddress.trim()) m.push("Physical Address");
      if (!town.trim()) m.push("Facility Address");
      if (!dateOfInspection) m.push("Date of Visit");
      else if (dateOfInspection > new Date().toISOString().split("T")[0]) m.push("Date of Visit cannot be in the future");
      if (kmTraveled === undefined || kmTraveled === null) m.push("KM Traveled");
      if (hoursWorked === undefined || hoursWorked === null) m.push("Hours Worked");
      if (!travelStart.trim()) m.push("Travel Start");
      if (!travelEnd.trim()) m.push("Travel End");
      return m;
    }
    if (s === 2) {
      return [];
    }
    return [];
  };

  const occGoNext = () => {
    const errors = validateOccStep(occStep);
    setOccError(errors);
    if (errors.length > 0) return;
    setOccStep(s => s + 1);
  };

  const occGoPrev = () => setOccStep(s => s - 1);

  const handleOccurrenceSubmit = async () => {
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        client_name: clientName,
        town,
        date_of_inspection: dateOfInspection,
        corporate_group: corporateGroup,
        group_type: groupType,
        facility_type: facilityType,
        additional_email: [primaryEmail, ...additionalEmails].filter(e => e.trim()).join('; '),
        comment: occurrenceDescription,
        km_traveled: kmTraveled,
        hours: hoursWorked,
        travel_start_time: travelStart,
        travel_end_time: travelEnd,
        follow_up: false,
        dispensation_application: false,
        inspector_name: inspectorName,
        products: [],
        is_occurrence_report: true,
        registration_code: registrationCode,
        physical_address: physicalAddress,
        telephone,
        time_of_visit: timeOfVisit,
      };
      const res = await fetch("/api/add-inspection/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        // Send occurrence notification email (non-blocking)
        try {
          const fd = new FormData();
          fd.append("client_name", clientName);
          fd.append("town", town);
          fd.append("date_of_inspection", dateOfInspection);
          fd.append("inspector_name", inspectorName);
          fd.append("description", occurrenceDescription);
          fd.append("corporate_group", corporateGroup);
          if (occFile) fd.append("file", occFile);
          await fetch("/api/send-occurrence-email", {
            method: "POST",
            body: fd,
          });
        } catch { /* non-blocking */ }
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

  /* ── Loading ── */
  if (loading) return (
    <>
      <style>{pageStyles}</style>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "white" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", border: "4px solid rgba(255,255,255,0.2)", borderTopColor: "#fff", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          Loading form data...
        </div>
      </div>
    </>
  );

  /* ── Occurrence Report Form (completely separate) ── */
  if (isOccurrence) {
    const occStepLabels = ["Facility Info", "Findings", "Review"];
    return (
      <>
        <style>{pageStyles}</style>
        <style>{occurrenceStyles}</style>

        {/* Toast */}
        {toast && (
          <div style={{ position: "fixed", top: 24, right: 24, zIndex: 10000, background: toast.ok ? "#059669" : "#dc2626", color: "#fff", padding: "14px 24px", borderRadius: 10, fontSize: "0.9rem", fontWeight: 500, boxShadow: "0 4px 12px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: 10 }}>
            <i className={`fas ${toast.ok ? "fa-check-circle" : "fa-exclamation-circle"}`} />
            {toast.msg}
          </div>
        )}

        <div className="max-w-3xl mx-auto" style={{ padding: "32px 16px" }}>

          {/* Header */}
          <div className="header-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, borderLeft: "4px solid #f59e0b" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700, color: "#92400e", display: "flex", alignItems: "center", gap: 10 }}>
                <i className="fas fa-exclamation-triangle" style={{ color: "#f59e0b" }} />
                Occurrence Report
              </h1>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => { setIsOccurrence(false); setOccStep(1); setOccError([]); }}
                className="btn btn-outline" style={{ fontSize: 13, borderColor: "#f59e0b", color: "#92400e" }}>
                <i className="fas fa-arrow-left" /> Back to Normal Inspection
              </button>
              <a href="/inspections" className="btn btn-outline" style={{ fontSize: 13 }}>
                <i className="fas fa-times" /> Cancel
              </a>
            </div>
          </div>

          {/* Wizard container */}
          <div className="wizard-container occ-wizard" style={{ padding: 32, border: "2px solid #f59e0b" }}>

            {/* Steps */}
            <div className="wizard-steps">
              {occStepLabels.map((label, i) => {
                const n = i + 1;
                const isActive = occStep === n;
                const isCompleted = occStep > n;
                return (
                  <div key={n} className={`step${isActive ? " active" : ""}${isCompleted ? " completed" : ""}`}>
                    <div className="step-circle" style={isActive ? { background: "#f59e0b", color: "white", boxShadow: "0 0 0 4px rgba(245,158,11,0.2)" } : isCompleted ? { background: "#f59e0b", color: "white" } : {}}>
                      {isCompleted ? <i className="fas fa-check" style={{ fontSize: 16 }} /> : n}
                    </div>
                    <span className="step-label" style={isActive || isCompleted ? { color: "#92400e" } : {}}>{label}</span>
                  </div>
                );
              })}
            </div>

            {/* ===== OCC STEP 1: FACILITY INFO ===== */}
            <div className={`wizard-step-content${occStep === 1 ? " active" : ""}`}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#92400e", marginBottom: 24 }}>
                <i className="fas fa-building" style={{ color: "#f59e0b", marginRight: 8 }} />Facility Information
              </h3>

              {/* Section 1: Facility Type */}
              <div style={{ background: "#fef3c7", border: "2px solid #f59e0b", borderRadius: 12, padding: 20, marginBottom: 24 }}>
                <h4 style={{ fontWeight: 600, color: "#92400e", marginBottom: 12, display: "flex", alignItems: "center", gap: 8, fontSize: "0.95rem" }}>
                  <i className="fas fa-industry" style={{ color: "#f59e0b" }} /> Facility Type
                </h4>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ color: "#92400e" }}>Facility Type <span style={{ color: "#ef4444" }}>*</span></label>
                  <select className="form-control" value={facilityType} onChange={e => setFacilityType(e.target.value)}>
                    <option value="">Select facility type...</option>
                    {FACILITY_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>

              {/* Section 2: Client Details */}
              <div style={{ background: "#f9fafb", border: "2px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 24 }}>
                <h4 style={{ fontWeight: 600, color: "#92400e", marginBottom: 12, display: "flex", alignItems: "center", gap: 8, fontSize: "0.95rem" }}>
                  <i className="fas fa-user" style={{ color: "#f59e0b" }} /> Client Details
                </h4>

                <Autocomplete label="Client Name" required options={options?.clients.map(c => c.name) ?? []} value={clientName}
                  onChange={v => {
                    setClientName(v);
                    const found = options?.clients.find(c => c.name === v);
                    if (found) {
                      if (found.town && !town) setTown(found.town);
                      if (found.email && !primaryEmail) setPrimaryEmail(found.email);
                      if (found.corporate_group && !corporateGroup) setCorporateGroup(found.corporate_group);
                      if (found.group_type && !groupType) setGroupType(found.group_type);
                      if (found.facility_type && !facilityType) setFacilityType(found.facility_type);
                    }
                  }}
                  placeholder="Start typing to search clients..." />

                <div className="form-group">
                  <label className="form-label" style={{ color: "#92400e" }}>Registration Code <span style={{ color: "#9ca3af", fontSize: "0.75rem", fontWeight: 400 }}>(if applicable)</span></label>
                  <input type="text" className="form-control occ-input" value={registrationCode} onChange={e => setRegistrationCode(e.target.value)} placeholder="e.g. ABC-123-456" />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ color: "#92400e" }}>Physical Address <span style={{ color: "#ef4444" }}>*</span></label>
                  <textarea className="form-control occ-input" rows={3} value={physicalAddress} onChange={e => setPhysicalAddress(e.target.value)} placeholder="Physical address of the facility" style={{ resize: "vertical" }} />
                </div>

                <Autocomplete label="Facility Address" required options={options?.towns ?? []} value={town} onChange={setTown} placeholder="Start typing to search..." />

                <div className="product-fields-grid" style={{ marginBottom: 0 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ color: "#92400e" }}>Telephone</label>
                    <input type="text" className="form-control occ-input" value={telephone} onChange={e => setTelephone(e.target.value)} placeholder="e.g. 012 345 6789" />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ color: "#92400e" }}>Client Email</label>
                    <input type="email" className="form-control occ-input" value={primaryEmail} onChange={e => setPrimaryEmail(e.target.value)} placeholder="client@example.com" />
                  </div>
                </div>
              </div>

              {/* Section 3: Visit Details */}
              <div style={{ background: "#f0f9ff", border: "2px solid #0ea5e9", borderRadius: 12, padding: 20, marginBottom: 24 }}>
                <h4 style={{ fontWeight: 600, color: "#92400e", marginBottom: 12, display: "flex", alignItems: "center", gap: 8, fontSize: "0.95rem" }}>
                  <i className="fas fa-calendar-check" style={{ color: "#0ea5e9" }} /> Visit Details
                </h4>
                <div className="product-fields-grid" style={{ marginBottom: 0 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ color: "#92400e" }}>Date of Visit <span style={{ color: "#ef4444" }}>*</span></label>
                    <input type="date" className="form-control occ-input" max={new Date().toISOString().split("T")[0]} value={dateOfInspection} onChange={e => setDateOfInspection(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ color: "#92400e" }}>Time of Visit</label>
                    <select className="form-control occ-input" value={timeOfVisit} onChange={e => setTimeOfVisit(e.target.value)}>
                      <option value="">Select time</option>
                      <option value="06:00 AM">06:00 AM</option>
                      <option value="06:30 AM">06:30 AM</option>
                      <option value="07:00 AM">07:00 AM</option>
                      <option value="07:30 AM">07:30 AM</option>
                      <option value="08:00 AM">08:00 AM</option>
                      <option value="08:30 AM">08:30 AM</option>
                      <option value="09:00 AM">09:00 AM</option>
                      <option value="09:30 AM">09:30 AM</option>
                      <option value="10:00 AM">10:00 AM</option>
                      <option value="10:30 AM">10:30 AM</option>
                      <option value="11:00 AM">11:00 AM</option>
                      <option value="11:30 AM">11:30 AM</option>
                      <option value="12:00 PM">12:00 PM</option>
                      <option value="12:30 PM">12:30 PM</option>
                      <option value="01:00 PM">01:00 PM</option>
                      <option value="01:30 PM">01:30 PM</option>
                      <option value="02:00 PM">02:00 PM</option>
                      <option value="02:30 PM">02:30 PM</option>
                      <option value="03:00 PM">03:00 PM</option>
                      <option value="03:30 PM">03:30 PM</option>
                      <option value="04:00 PM">04:00 PM</option>
                      <option value="04:30 PM">04:30 PM</option>
                      <option value="05:00 PM">05:00 PM</option>
                      <option value="05:30 PM">05:30 PM</option>
                      <option value="06:00 PM">06:00 PM</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 4: Corporate Information */}
              <div style={{ background: "#f9fafb", border: "2px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 24 }}>
                <h4 style={{ fontWeight: 600, color: "#92400e", marginBottom: 12, display: "flex", alignItems: "center", gap: 8, fontSize: "0.95rem" }}>
                  <i className="fas fa-sitemap" style={{ color: "#f59e0b" }} /> Corporate Information
                </h4>

                <div className="form-group">
                  <label className="form-label" style={{ color: "#92400e" }}>Business</label>
                  <select className="form-control" value={corporateGroup} onChange={e => setCorporateGroup(e.target.value)}>
                    <option value="">Select business...</option>
                    {[...(options?.corporate_groups ?? []), "Not Applicable", "Other"].map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ color: "#92400e" }}>Store Type</label>
                  <select className="form-control occ-input" value={groupType} onChange={e => setGroupType(e.target.value)}>
                    <option value="">Select store type (optional)</option>
                    {GROUP_TYPES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>

              {/* Section 5: Trip Information */}
              <div style={{ background: "#f9fafb", border: "2px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 8 }}>
                <h4 style={{ fontWeight: 600, color: "#92400e", marginBottom: 12, display: "flex", alignItems: "center", gap: 8, fontSize: "0.95rem" }}>
                  <i className="fas fa-route" style={{ color: "#f59e0b" }} /> Trip Information
                </h4>

                <div className="product-fields-grid">
                  <div className="form-group">
                    <label className="form-label" style={{ color: "#92400e" }}>KM Traveled <span style={{ color: "#ef4444" }}>*</span></label>
                    <input type="number" step="0.1" className="form-control occ-input" value={kmTraveled} onChange={e => setKmTraveled(Number(e.target.value))} placeholder="0" min={0} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ color: "#92400e" }}>Hours Worked <span style={{ color: "#ef4444" }}>*</span></label>
                    <input type="number" step="0.5" className="form-control occ-input" value={hoursWorked} onChange={e => setHoursWorked(Number(e.target.value))} placeholder="0" min={0} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ color: "#92400e" }}>Travel Start <span style={{ color: "#ef4444" }}>*</span></label>
                    <input type="time" className="form-control occ-input" value={travelStart} onChange={e => setTravelStart(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ color: "#92400e" }}>Travel End <span style={{ color: "#ef4444" }}>*</span></label>
                    <input type="time" className="form-control occ-input" value={travelEnd} onChange={e => setTravelEnd(e.target.value)} />
                  </div>
                </div>
              </div>

              {occError.length > 0 && occStep === 1 && (
                <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 8, padding: "12px 16px", color: "#92400e", fontSize: 14, marginTop: 16 }}>
                  <i className="fas fa-exclamation-triangle" style={{ marginRight: 8 }} />
                  <strong>Missing Required Fields:</strong>
                  <ul style={{ margin: "8px 0 0 24px", padding: 0, listStyleType: "disc" }}>
                    {occError.map(e => <li key={e}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>

            {/* ===== OCC STEP 2: DESCRIPTION & DOCUMENTS ===== */}
            <div className={`wizard-step-content${occStep === 2 ? " active" : ""}`}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#92400e", marginBottom: 24 }}>
                <i className="fas fa-clipboard-list" style={{ color: "#f59e0b", marginRight: 8 }} />Findings &amp; Documents
              </h3>

              {/* Document Upload */}
              <div className="form-group">
                <label className="form-label" style={{ color: "#92400e" }}>Occurrence Document <span style={{ color: "#9ca3af", fontSize: "0.75rem", fontWeight: 400 }}>(optional)</span></label>
                <div
                  style={{ border: "2px dashed #d1d5db", borderRadius: 8, padding: 24, textAlign: "center", cursor: "pointer", background: occFile ? "#f0fdf4" : "white", transition: "all 0.2s" }}
                  onClick={() => document.getElementById("occFileInput")?.click()}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#f59e0b"; e.currentTarget.style.background = "#fffbeb"; }}
                  onDragLeave={e => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.background = occFile ? "#f0fdf4" : "white"; }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.background = "#f0fdf4"; if (e.dataTransfer.files[0]) setOccFile(e.dataTransfer.files[0]); }}
                >
                  {occFile ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                      <i className="fas fa-file-pdf" style={{ color: "#22c55e", fontSize: "1.5rem" }} />
                      <span style={{ color: "#166534", fontWeight: 500 }}>{occFile.name}</span>
                      <button type="button" onClick={e => { e.stopPropagation(); setOccFile(null); }}
                        style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 4 }}>
                        <i className="fas fa-times" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <i className="fas fa-cloud-upload-alt" style={{ fontSize: "2rem", color: "#9ca3af", display: "block", marginBottom: 6 }} />
                      <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>Click to browse or drag &amp; drop</p>
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>PDF files only</p>
                    </>
                  )}
                </div>
                <input type="file" id="occFileInput" accept=".pdf" style={{ display: "none" }}
                  onChange={e => { if (e.target.files?.[0]) setOccFile(e.target.files[0]); }} />
              </div>

              {/* Description below file upload */}
              <div className="form-group">
                <label className="form-label" style={{ color: "#92400e" }}>Description of Events <span style={{ color: "#9ca3af", fontSize: "0.75rem", fontWeight: 400 }}>(optional)</span></label>
                <textarea className="form-control occ-input" rows={8} value={occurrenceDescription} onChange={e => setOccurrenceDescription(e.target.value)}
                  placeholder="Describe in detail what was found during the visit, including any non-conformances, observations, and corrective actions discussed..."
                  style={{ resize: "vertical", minHeight: 180 }} />
                <small style={{ color: "#92400e", fontSize: 11, opacity: 0.7 }}>Provide a thorough account of all events and findings during this occurrence visit.</small>
              </div>

              {occError.length > 0 && occStep === 2 && (
                <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 8, padding: "12px 16px", color: "#92400e", fontSize: 14, marginTop: 16 }}>
                  <i className="fas fa-exclamation-triangle" style={{ marginRight: 8 }} />
                  <strong>Missing Required Fields:</strong>
                  <ul style={{ margin: "8px 0 0 24px", padding: 0, listStyleType: "disc" }}>
                    {occError.map(e => <li key={e}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>

            {/* ===== OCC STEP 3: REVIEW & SUBMIT ===== */}
            <div className={`wizard-step-content${occStep === 3 ? " active" : ""}`}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#92400e", marginBottom: 24 }}>
                <i className="fas fa-check-circle" style={{ color: "#f59e0b", marginRight: 8 }} />Review &amp; Submit
              </h3>

              {/* Facility Type Card */}
              <div style={{ background: "#fffbeb", borderRadius: 12, padding: 24, marginBottom: 20, border: "2px solid #f59e0b" }}>
                <h4 style={{ fontWeight: 600, color: "#92400e", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  <i className="fas fa-industry" style={{ color: "#f59e0b" }} /> Facility Type
                </h4>
                <div style={{ padding: 12, background: "white", borderRadius: 8, border: "1px solid #fcd34d" }}>
                  <span style={{ display: "block", fontSize: 11, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Facility Type</span>
                  <span style={{ fontWeight: 600, color: "#1f2937" }}>{facilityType || "\u2014"}</span>
                </div>
              </div>

              {/* Client Details Card */}
              <div style={{ background: "#fffbeb", borderRadius: 12, padding: 24, marginBottom: 20, border: "2px solid #f59e0b" }}>
                <h4 style={{ fontWeight: 600, color: "#92400e", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  <i className="fas fa-user" style={{ color: "#f59e0b" }} /> Client Details
                </h4>
                <div className="review-summary-grid">
                  {[
                    ["Client Name", clientName || "\u2014"],
                    ["Registration Code", registrationCode || "\u2014"],
                    ["Physical Address", physicalAddress || "\u2014"],
                    ["Facility Address", town || "\u2014"],
                    ["Telephone", telephone || "\u2014"],
                    ["Client Email", primaryEmail || "\u2014"],
                  ].map(([label, val]) => (
                    <div key={label} style={{ padding: 12, background: "white", borderRadius: 8, border: "1px solid #fcd34d" }}>
                      <span style={{ display: "block", fontSize: 11, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</span>
                      <span style={{ fontWeight: 600, color: "#1f2937" }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Visit Details Card */}
              <div style={{ background: "#fffbeb", borderRadius: 12, padding: 24, marginBottom: 20, border: "2px solid #f59e0b" }}>
                <h4 style={{ fontWeight: 600, color: "#92400e", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  <i className="fas fa-calendar-check" style={{ color: "#f59e0b" }} /> Visit Details
                </h4>
                <div className="review-summary-grid">
                  {[
                    ["Date of Visit", dateOfInspection ? new Date(dateOfInspection + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "\u2014"],
                    ["Time of Visit", timeOfVisit || "\u2014"],
                  ].map(([label, val]) => (
                    <div key={label} style={{ padding: 12, background: "white", borderRadius: 8, border: "1px solid #fcd34d" }}>
                      <span style={{ display: "block", fontSize: 11, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</span>
                      <span style={{ fontWeight: 600, color: "#1f2937" }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Corporate & Trip Info Card */}
              <div style={{ background: "#fffbeb", borderRadius: 12, padding: 24, marginBottom: 20, border: "2px solid #f59e0b" }}>
                <h4 style={{ fontWeight: 600, color: "#92400e", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  <i className="fas fa-sitemap" style={{ color: "#f59e0b" }} /> Corporate &amp; Trip Info
                </h4>
                <div className="review-summary-grid">
                  {[
                    ["Business", corporateGroup || "\u2014"],
                    ["Store Type", groupType || "\u2014"],
                    ["KM Traveled", `${kmTraveled} km`],
                    ["Hours Worked", `${hoursWorked} hrs`],
                    ["Travel Start", travelStart || "\u2014"],
                    ["Travel End", travelEnd || "\u2014"],
                  ].map(([label, val]) => (
                    <div key={label} style={{ padding: 12, background: "white", borderRadius: 8, border: "1px solid #fcd34d" }}>
                      <span style={{ display: "block", fontSize: 11, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</span>
                      <span style={{ fontWeight: 600, color: "#1f2937" }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Findings & Document Card */}
              <div style={{ background: "#fffbeb", borderRadius: 12, padding: 24, marginBottom: 20, border: "2px solid #f59e0b" }}>
                <h4 style={{ fontWeight: 600, color: "#92400e", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  <i className="fas fa-clipboard-list" style={{ color: "#f59e0b" }} /> Findings &amp; Documents
                </h4>
                <div style={{ padding: 16, background: "white", borderRadius: 8, border: "1px solid #fcd34d", marginBottom: 12 }}>
                  <span style={{ display: "block", fontSize: 11, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Description of Events</span>
                  <span style={{ fontWeight: 500, color: "#1f2937", whiteSpace: "pre-wrap", fontSize: 14 }}>{occurrenceDescription || "\u2014"}</span>
                </div>
                {occFile && (
                  <div style={{ padding: 12, background: "white", borderRadius: 8, border: "1px solid #22c55e", display: "flex", alignItems: "center", gap: 8 }}>
                    <i className="fas fa-file-pdf" style={{ color: "#22c55e" }} />
                    <span style={{ fontWeight: 500, color: "#166534", fontSize: 14 }}>{occFile.name}</span>
                  </div>
                )}
              </div>

              <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 8, padding: "14px 18px", color: "#92400e", fontSize: 14 }}>
                <i className="fas fa-exclamation-triangle" style={{ marginRight: 8, color: "#f59e0b" }} />
                Ready to submit occurrence report. Click "Submit Occurrence Report" to save.
              </div>
            </div>

            {/* Navigation */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 24, borderTop: "1px solid #fcd34d" }}>
              <button type="button" className="btn btn-outline" onClick={occGoPrev} style={{ visibility: occStep === 1 ? "hidden" : "visible", borderColor: "#f59e0b", color: "#92400e" }}>
                <i className="fas fa-arrow-left" /> Back
              </button>
              <div style={{ display: "flex", gap: 12 }}>
                {occStep < 3 && (
                  <button type="button" onClick={occGoNext}
                    style={{ background: "#f59e0b", color: "white", border: "none", padding: "12px 24px", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 15, display: "inline-flex", alignItems: "center", gap: 8, transition: "all 0.2s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#d97706")}
                    onMouseLeave={e => (e.currentTarget.style.background = "#f59e0b")}>
                    Next <i className="fas fa-arrow-right" />
                  </button>
                )}
                {occStep === 3 && (
                  <button type="button" onClick={handleOccurrenceSubmit} disabled={submitting}
                    style={{ background: "#f59e0b", color: "white", border: "none", padding: "12px 24px", borderRadius: 8, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", fontSize: 15, display: "inline-flex", alignItems: "center", gap: 8, opacity: submitting ? 0.6 : 1, transition: "all 0.2s" }}
                    onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = "#d97706"; }}
                    onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = "#f59e0b"; }}>
                    {submitting
                      ? <><div style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "white", animation: "spin 0.8s linear infinite", verticalAlign: "middle" }} /> Submitting...</>
                      : <><i className="fas fa-exclamation-triangle" /> Submit Occurrence Report</>}
                  </button>
                )}
              </div>
            </div>

          </div>{/* end occ wizard-container */}

          <div style={{ textAlign: "center", marginTop: 24, color: "white", fontSize: 13, opacity: 0.8 }}>
            Food Safety Agency (Pty) Ltd - Inspection Management System
          </div>
        </div>
      </>
    );
  }

  /* ── Normal Inspection Form ── */
  return (
    <>
      <style>{pageStyles}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 10000, background: toast.ok ? "#059669" : "#dc2626", color: "#fff", padding: "14px 24px", borderRadius: 10, fontSize: "0.9rem", fontWeight: 500, boxShadow: "0 4px 12px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: 10 }}>
          <i className={`fas ${toast.ok ? "fa-check-circle" : "fa-exclamation-circle"}`} />
          {toast.msg}
        </div>
      )}

      <div className="max-w-3xl mx-auto" style={{ padding: "32px 16px" }}>

        {/* Header */}
        <div className="header-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700, color: "#1f2937", display: "flex", alignItems: "center", gap: 10 }}>
              <i className="fas fa-plus-circle" style={{ color: "#007890" }} />
              Add Inspection
            </h1>
          </div>
          <a href="/inspections" className="btn btn-outline" style={{ fontSize: 14 }}>
            <i className="fas fa-arrow-left" /> Back
          </a>
        </div>

        {/* Wizard container */}
        <div className="wizard-container" style={{ padding: 32 }}>

          {/* Steps */}
          <div className="wizard-steps">
            {[1, 2, 3, 4].map((n) => {
              const isActive = step === n;
              const isCompleted = step > n;
              const displayLabel = n === 1 ? "Basic Info" : n === 2 ? "Product Info" : n === 3 ? "Invoice Info" : "Review";
              return (
                <div key={n} className={`step${isActive ? " active" : ""}${isCompleted ? " completed" : ""}`}>
                  <div className="step-circle">
                    {isCompleted ? <i className="fas fa-check" style={{ fontSize: 16 }} /> : n}
                  </div>
                  <span className="step-label">{displayLabel}</span>
                </div>
              );
            })}
          </div>

          {/* ===== STEP 1: BASIC INFO ===== */}
          <div className={`wizard-step-content${step === 1 ? " active" : ""}`}>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1f2937", marginBottom: 24 }}>
              <i className="fas fa-info-circle" style={{ color: "#007890", marginRight: 8 }} />Basic Information
            </h3>

            <div className="form-group">
              <label className="form-label">Date of Inspection <span style={{ color: "#ef4444" }}>*</span></label>
              <input type="date" className="form-control" max={new Date().toISOString().split("T")[0]} value={dateOfInspection} onChange={e => setDateOfInspection(e.target.value)} />
            </div>

            <Autocomplete label="Client" required options={options?.clients.map(c => c.name) ?? []} value={clientName}
              onChange={v => {
                setClientName(v);
                const found = options?.clients.find(c => c.name === v);
                if (found) {
                  if (found.town && !town) setTown(found.town);
                  if (found.email && !primaryEmail) setPrimaryEmail(found.email);
                  if (found.corporate_group && !corporateGroup) setCorporateGroup(found.corporate_group);
                  if (found.group_type && !groupType) setGroupType(found.group_type);
                  if (found.facility_type && !facilityType) setFacilityType(found.facility_type);
                }
              }}
              placeholder="Start typing to search clients..." />

            <Autocomplete label="Facility Address" required options={options?.towns ?? []} value={town} onChange={setTown} placeholder="Start typing to search..." />

            <div className="form-group">
              <label className="form-label">Client Email (Primary) <span style={{ color: "#ef4444" }}>*</span></label>
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
              <label className="form-label">Business<span style={{ color: "#ef4444" }}> *</span></label>
              <select className="form-control" value={corporateGroup} onChange={e => setCorporateGroup(e.target.value)}>
                <option value="">Select business...</option>
                {[...(options?.corporate_groups ?? []), "Not Applicable", "Other"].map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Store Type<span style={{ color: "#ef4444" }}> *</span></label>
              <select className="form-control" value={groupType} onChange={e => setGroupType(e.target.value)}>
                <option value="">Select store type...</option>
                {GROUP_TYPES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Facility Type<span style={{ color: "#ef4444" }}> *</span></label>
              <select className="form-control" value={facilityType} onChange={e => setFacilityType(e.target.value)}>
                <option value="">Select facility type...</option>
                {FACILITY_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Commodity Types <span style={{ color: "#ef4444" }}>*</span></label>
              <div className="commodity-grid">
                {COMMODITY_CONFIG.map(cfg => (
                  <div key={cfg.key} className={`commodity-card${commodities[cfg.key] > 0 ? " selected" : ""}`}>
                    <i className={`fas ${cfg.icon}`} />
                    <h4>{cfg.label}</h4>
                    <div className="commodity-counter">
                      <button type="button" className="decrement-btn" onClick={() => adjustCommodity(cfg.key, -1)} disabled={commodities[cfg.key] === 0}>−</button>
                      <span className="commodity-count">{commodities[cfg.key]}</span>
                      <button type="button" className="increment-btn" onClick={() => adjustCommodity(cfg.key, 1)}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

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
          <div className={`wizard-step-content${step === 2 ? " active" : ""}`}>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1f2937", marginBottom: 24 }}>
              <i className="fas fa-box" style={{ color: "#007890", marginRight: 8 }} />Product Info
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
                <div key={idx} style={{ border: "2px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 20, background: "#fff" }}>
                  <h4 style={{ margin: "0 0 16px", fontWeight: 600, color: "#1f2937", display: "flex", alignItems: "center", gap: 8 }}>
                    <i className={`fas ${cfg.icon}`} style={{ color: "#007890" }} />
                    {cfg.label} #{sameCount + 1}
                  </h4>

                  <div className="product-fields-grid">
                    <div className="form-group">
                      <label className="form-label">Product Name <span style={{ color: "#ef4444" }}>*</span></label>
                      <input type="text" className="form-control" value={p.product_name}
                        onChange={e => updateProduct(idx, "product_name", e.target.value)} placeholder="Enter product name" maxLength={150} />
                    </div>
                    {(PRODUCT_CLASSES_BY_COMMODITY[p.commodity]?.length ?? 0) > 0 && (
                      <div className="form-group">
                        <label className="form-label">Product Class</label>
                        <select className="form-control" value={p.product_class} onChange={e => updateProduct(idx, "product_class", e.target.value)}>
                          <option value="">-- Select --</option>
                          {(PRODUCT_CLASSES_BY_COMMODITY[p.commodity] || []).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Sample Taken — only for RAW/PMP */}
                  {!hideTests && (
                    <label className="checkbox-card sample-taken-card" style={{ marginBottom: 16 }}>
                      <input type="checkbox" checked={p.is_sample_taken}
                        onChange={e => {
                          const checked = e.target.checked;
                          updateProduct(idx, "is_sample_taken", checked);
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
                      <span className="checkbox-content"><span style={{ fontWeight: 500 }}>Sample Taken</span></span>
                    </label>
                  )}

                  {/* Lab + Needs Retest — only when sample taken */}
                  {!hideTests && p.is_sample_taken && (
                    <div className="product-fields-grid">
                      <div className="form-group">
                        <label className="form-label">Lab</label>
                        <select className="form-control" value={p.lab} onChange={e => updateProduct(idx, "lab", e.target.value)}>
                          <option value="">-- Select --</option>
                          {LABS.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Needs Retest</label>
                        <select className="form-control" value={p.needs_retest} onChange={e => updateProduct(idx, "needs_retest", e.target.value)}>
                          <option value="NO">No</option>
                          <option value="YES">Yes</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Tests — only when sample taken */}
                  {!hideTests && p.is_sample_taken && (
                    <div>
                      <label className="form-label" style={{ marginBottom: 10 }}>Tests</label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        {(["fat", "protein", "calcium", "dna"] as const).map(t => (
                          <label key={t} className="checkbox-card testing-card">
                            <input type="checkbox" checked={p[t] as boolean} onChange={e => updateProduct(idx, t, e.target.checked)} />
                            <div className="custom-check"><i className="fas fa-check" /></div>
                            <span className="checkbox-content"><span style={{ fontWeight: 500 }}>{t.charAt(0).toUpperCase() + t.slice(1)}</span></span>
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

          {/* ===== STEP 3: INVOICE INFO ===== */}
          <div className={`wizard-step-content${step === 3 ? " active" : ""}`}>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1f2937", marginBottom: 24 }}>
              <i className="fas fa-file-invoice" style={{ color: "#007890", marginRight: 8 }} />Invoice Info
            </h3>

            {step3Error.length > 0 && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", color: "#991b1b", fontSize: 14, marginBottom: 16 }}>
                <i className="fas fa-exclamation-triangle" style={{ marginRight: 8 }} />
                <strong>Missing:</strong> {step3Error.join(", ")}
              </div>
            )}

            <div className="product-fields-grid">
              <div className="form-group">
                <label className="form-label">Kilometers Traveled <span style={{ color: "#ef4444" }}>*</span></label>
                <input type="number" step="0.1" className="form-control" value={kmTraveled} onChange={e => setKmTraveled(Number(e.target.value))} placeholder="0" min={0} />
              </div>
              <div className="form-group">
                <label className="form-label">Hours Worked <span style={{ color: "#ef4444" }}>*</span></label>
                <input type="number" step="0.5" className="form-control" value={hoursWorked} onChange={e => setHoursWorked(Number(e.target.value))} placeholder="0" min={0} />
              </div>
              <div className="form-group">
                <label className="form-label">Travel Start <span style={{ color: "#ef4444" }}>*</span></label>
                <input type="time" className="form-control" value={travelStart} onChange={e => setTravelStart(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Travel End <span style={{ color: "#ef4444" }}>*</span></label>
                <input type="time" className="form-control" value={travelEnd} onChange={e => setTravelEnd(e.target.value)} />
              </div>
            </div>

            <div className="product-fields-grid" style={{ gap: 12, marginBottom: 20 }}>
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
              <textarea className="form-control" rows={4} value={comment} onChange={e => setComment(e.target.value)} placeholder="Optional notes..." style={{ resize: "vertical" }} />
            </div>

            {/* RFI Upload - shown only when RAW or PMP commodities are selected */}
            {(commodities.RAW > 0 || commodities.PMP > 0) && (
              <div style={{ marginTop: 20 }}>
                <label className="form-label">
                  <i className="fas fa-file-invoice" style={{ color: "#007890", marginRight: 6 }} />
                  RFI Document <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 8px" }}>
                  <i className="fas fa-info-circle" style={{ marginRight: 4 }} />Required for Raw Meat and PMP commodities
                </p>
                <div
                  style={{
                    border: `2px dashed ${rfiFile ? "#22c55e" : "#d1d5db"}`,
                    borderRadius: 10,
                    padding: "20px 24px",
                    textAlign: "center",
                    cursor: "pointer",
                    background: rfiFile ? "#f0fdf4" : "#fafafa",
                    transition: "border-color 0.2s, background 0.2s",
                  }}
                  onClick={() => document.getElementById("rfiFileInput")?.click()}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#007890"; e.currentTarget.style.background = "#e6f3f7"; }}
                  onDragLeave={e => { e.currentTarget.style.borderColor = rfiFile ? "#22c55e" : "#d1d5db"; e.currentTarget.style.background = rfiFile ? "#f0fdf4" : "#fafafa"; }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#22c55e"; e.currentTarget.style.background = "#f0fdf4"; const f = e.dataTransfer.files[0]; if (f && (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))) setRfiFile(f); else if (f) setToast({ msg: "The RFI must be a PDF file.", ok: false }); }}
                >
                  {rfiFile ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                      <i className="fas fa-file-pdf" style={{ color: "#22c55e", fontSize: "1.5rem" }} />
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontWeight: 600, color: "#1f2937", fontSize: 14 }}>{rfiFile.name}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>{(rfiFile.size / 1024).toFixed(1)} KB</div>
                      </div>
                      <button type="button" onClick={e => { e.stopPropagation(); setRfiFile(null); }}
                        style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "8px 14px", cursor: "pointer", color: "#dc2626", fontSize: 13, fontWeight: 600, marginLeft: 8, minHeight: 44, minWidth: 44 }}>
                        <i className="fas fa-times" /> Remove
                      </button>
                    </div>
                  ) : (
                    <>
                      <i className="fas fa-cloud-upload-alt" style={{ fontSize: "2rem", color: "#9ca3af", display: "block", marginBottom: 6 }} />
                      <p style={{ margin: 0, fontWeight: 500, color: "#374151", fontSize: 14 }}>Click or drag to upload RFI document</p>
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>PDF only</p>
                    </>
                  )}
                </div>
                <input type="file" id="rfiFileInput" accept=".pdf,application/pdf" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f && (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))) setRfiFile(f); else if (f) setToast({ msg: "The RFI must be a PDF file.", ok: false }); }} />
              </div>
            )}
          </div>

          {/* ===== STEP 4: REVIEW ===== */}
          <div className={`wizard-step-content${step === 4 ? " active" : ""}`}>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1f2937", marginBottom: 24 }}>
              <i className="fas fa-check-circle" style={{ color: "#007890", marginRight: 8 }} />Review &amp; Submit
            </h3>

            <div style={{ background: "#f9fafb", borderRadius: 12, padding: 24, marginBottom: 24 }}>
              <h4 style={{ fontWeight: 600, color: "#374151", marginBottom: 16 }}>
                Inspection Summary
              </h4>
              <div className="review-summary-grid">
                {[
                  ["Date",            dateOfInspection ? new Date(dateOfInspection + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "\u2014"],
                  ["Client",          clientName || "\u2014"],
                  ["Facility Address", town || "\u2014"],
                  ["Email(s)",        [primaryEmail, ...additionalEmails].filter(e => e.trim()).join('; ') || "\u2014"],
                  ["Business",        corporateGroup || "\u2014"],
                  ["Store Type",      groupType || "\u2014"],
                  ["Facility Type",   facilityType || "\u2014"],
                  ["KM / Hours",      `${kmTraveled} km / ${hoursWorked} hrs`],
                  ["Travel Times",    travelStart && travelEnd ? `${travelStart} \u2192 ${travelEnd}` : "\u2014"],
                ].map(([label, val]) => (
                  <div key={label} style={{ padding: 12, background: "white", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                    <span style={{ display: "block", fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</span>
                    <span style={{ fontWeight: 600, color: "#1f2937" }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {products.length > 0 && (
              <div style={{ background: "#f9fafb", borderRadius: 12, padding: 24, marginBottom: 24 }}>
                <h4 style={{ fontWeight: 600, color: "#374151", marginBottom: 16 }}>Products ({products.length})</h4>
                {products.map((p, i) => {
                  const cfg = COMMODITY_CONFIG.find(c => c.key === p.commodity)!;
                  const tests = (["fat","protein","calcium","dna"] as const).filter(t => p[t]).map(t => t.charAt(0).toUpperCase() + t.slice(1));
                  return (
                    <div key={i} style={{ padding: "12px 16px", borderBottom: i < products.length - 1 ? "1px solid #e5e7eb" : "none", display: "flex", alignItems: "center", gap: 12 }}>
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

            {/* RFI Document Status */}
            {(commodities.RAW > 0 || commodities.PMP > 0) && (
              <div style={{ background: "#f9fafb", borderRadius: 12, padding: 24, marginBottom: 24 }}>
                <h4 style={{ fontWeight: 600, color: "#374151", marginBottom: 16 }}>Documents</h4>
                <div style={{ padding: "12px 16px", borderRadius: 8, border: "1px solid", display: "flex", alignItems: "center", gap: 10, ...(rfiFile ? { background: "#f0fdf4", borderColor: "#10b981" } : { background: "#fef2f2", borderColor: "#ef4444" }) }}>
                  <i className={`fas ${rfiFile ? "fa-check-circle" : "fa-times-circle"}`} style={{ color: rfiFile ? "#22c55e" : "#ef4444" }} />
                  <span style={{ fontSize: 14, color: "#1f2937" }}>RFI: {rfiFile ? rfiFile.name : "Not uploaded (Required)"}</span>
                </div>
              </div>
            )}

            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "14px 18px", color: "#166534", fontSize: 14 }}>
              <i className="fas fa-check-circle" style={{ marginRight: 8 }} />
              Ready to submit. Click &quot;Create Inspection&quot; to save.
            </div>
          </div>

          {/* Navigation */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
            <button type="button" className="btn btn-outline" onClick={goPrev} style={{ visibility: step === 1 ? "hidden" : "visible" }}>
              <i className="fas fa-arrow-left" /> Back
            </button>
            <div style={{ display: "flex", gap: 12 }}>
              {step === 1 && (
                <button type="button" onClick={() => { setIsOccurrence(true); setOccStep(1); setOccError([]); setCommodities({ POULTRY: 0, RAW: 0, PMP: 0, EGGS: 0 }); setProducts([]); }}
                  style={{ background: "#f59e0b", color: "white", border: "none", padding: "10px 20px", borderRadius: 8, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#d97706")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#f59e0b")}>
                  <i className="fas fa-exclamation-triangle" /> Occurrence Report
                </button>
              )}
              {step < 4 && (
                <button type="button" className="btn btn-primary" onClick={goNext}>
                  Next <i className="fas fa-arrow-right" />
                </button>
              )}
              {step === 4 && (
                <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                  {submitting
                    ? <><div style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "white", animation: "spin 0.8s linear infinite", verticalAlign: "middle" }} /> Creating...</>
                    : <><i className="fas fa-plus-circle" /> Create Inspection</>}
                </button>
              )}
            </div>
          </div>

        </div>{/* end wizard-container */}

        <div style={{ textAlign: "center", marginTop: 24, color: "white", fontSize: 13, opacity: 0.8 }}>
          Food Safety Agency (Pty) Ltd - Inspection Management System
        </div>
      </div>
    </>
  );
}

/* ── CSS — identical to edit page ── */
const pageStyles = `
  @keyframes spin { to { transform: rotate(360deg) } }
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
    width: 100%; padding: 12px 16px; border: 2px solid #e5e7eb;
    border-radius: 8px; font-size: 15px; transition: all 0.2s;
    background: white; box-sizing: border-box; font-family: inherit;
    -webkit-appearance: none; appearance: none;
  }
  .form-control:focus { outline: none; border-color: #007890; box-shadow: 0 0 0 4px rgba(0,120,144,0.15); }
  .form-label { display: block; font-weight: 600; color: #1f2937; margin-bottom: 6px; font-size: 14px; }
  .form-group { margin-bottom: 20px; }
  .btn {
    padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer;
    border: none; font-size: 15px; transition: all 0.2s;
    display: inline-flex; align-items: center; gap: 8px; text-decoration: none;
  }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-primary { background: #007890; color: white; }
  .btn-primary:hover:not(:disabled) { background: #005a6b; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,120,144,0.3); }
  .btn-outline { background: rgba(255,255,255,0.9); border: 2px solid #e5e7eb; color: #1f2937; }
  .btn-outline:hover { background: white; border-color: #007890; }
  .wizard-steps {
    display: flex; justify-content: space-between; margin-bottom: 32px; position: relative;
  }
  .wizard-steps::before {
    content: ''; position: absolute; top: 22px; left: 50px; right: 50px;
    height: 3px; background: #e5e7eb; z-index: 0;
  }
  .step { display: flex; flex-direction: column; align-items: center; position: relative; z-index: 1; flex: 1; }
  .step-circle {
    width: 44px; height: 44px; border-radius: 50%; background: #e5e7eb; color: #9ca3af;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 16px; margin-bottom: 8px; transition: all 0.3s;
  }
  .step.active .step-circle { background: #007890; color: white; box-shadow: 0 0 0 4px rgba(0,120,144,0.2); }
  .step.completed .step-circle { background: #10b981; color: white; }
  .step-label { font-size: 13px; font-weight: 500; color: #9ca3af; text-align: center; }
  .step.active .step-label, .step.completed .step-label { color: #1f2937; }
  .wizard-step-content { display: none; animation: fadeInStep 0.3s ease; }
  .wizard-step-content.active { display: block; }
  @keyframes fadeInStep { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .commodity-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 16px; }
  .commodity-card {
    padding: 20px 24px; border: 2px solid #e5e7eb; border-radius: 12px;
    transition: all 0.2s; text-align: center; background: white;
  }
  .commodity-card:hover { border-color: #007890; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
  .commodity-card.selected { border-color: #007890; background: #e6f3f7; box-shadow: 0 0 0 3px rgba(0,120,144,0.2); }
  .commodity-card i { font-size: 32px; margin-bottom: 8px; color: #007890; display: block; }
  .commodity-card h4 { font-weight: 600; color: #1f2937; font-size: 15px; margin: 0 0 12px; }
  .commodity-counter { display: flex; align-items: center; justify-content: center; gap: 12px; }
  .decrement-btn, .increment-btn {
    width: 32px; height: 32px; border-radius: 50%; border: 2px solid #007890;
    background: white; color: #007890; font-size: 18px; font-weight: bold;
    cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;
  }
  .decrement-btn:hover, .increment-btn:hover { background: #007890; color: white; }
  .decrement-btn:disabled { border-color: #ccc; color: #ccc; cursor: not-allowed; }
  .decrement-btn:disabled:hover { background: white; color: #ccc; }
  .commodity-count { font-size: 20px; font-weight: bold; color: #1f2937; min-width: 30px; text-align: center; }
  .client-dropdown {
    position: absolute; top: 100%; left: 0; right: 0; background: white;
    border: 2px solid #007890; border-top: none; border-radius: 0 0 12px 12px;
    max-height: 300px; overflow-y: auto; z-index: 1000;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
  }
  .client-dropdown-item { padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: all 0.15s; }
  .client-dropdown-item:hover { background: #e6f3f7; border-left: 3px solid #007890; }
  .client-name { font-weight: 600; color: #1f2937; font-size: 14px; }
  .checkbox-card {
    display: flex; align-items: center; padding: 16px; border: 2px solid #e5e7eb;
    border-radius: 8px; cursor: pointer; transition: all 0.2s; background: white; margin: 0;
  }
  .checkbox-card:hover { border-color: #007890; background: #e6f3f7; }
  .checkbox-card.sample-taken-card {
    position: relative; padding-left: 52px; min-height: 54px; width: 100%; box-sizing: border-box;
  }
  .checkbox-card.sample-taken-card input[type="checkbox"] { display: none; }
  .checkbox-card.sample-taken-card .custom-check {
    position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
    width: 26px; height: 26px; border: 2px solid #d1d5db; border-radius: 6px;
    background: white; display: flex; align-items: center; justify-content: center; transition: all 0.25s ease;
  }
  .checkbox-card.sample-taken-card .custom-check i { font-size: 14px; color: transparent; transition: all 0.25s ease; transform: scale(0); }
  .checkbox-card.sample-taken-card:has(input:checked) { border-color: #10b981; background: linear-gradient(135deg,#d1fae5 0%,#a7f3d0 100%); box-shadow: 0 4px 12px rgba(16,185,129,0.2); }
  .checkbox-card.sample-taken-card:has(input:checked) .custom-check { background: linear-gradient(135deg,#10b981 0%,#059669 100%); border-color: #059669; }
  .checkbox-card.sample-taken-card:has(input:checked) .custom-check i { color: white; transform: scale(1); }
  .checkbox-card.sample-taken-card:has(input:checked) .checkbox-content { color: #047857; font-weight: 600; }
  .checkbox-card.testing-card { position: relative; padding-left: 48px; min-height: 50px; }
  .checkbox-card.testing-card input[type="checkbox"] { display: none; }
  .checkbox-card.testing-card .custom-check {
    position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
    width: 24px; height: 24px; border: 2px solid #d1d5db; border-radius: 6px;
    background: white; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;
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
    .review-summary-grid { grid-template-columns: 1fr; }
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
  @media (max-width: 400px) {
    .max-w-3xl { padding: 0 4px; }
    .wizard-container { padding: 12px !important; }
    .commodity-grid { grid-template-columns: 1fr; gap: 8px; }
    .step-circle { width: 30px; height: 30px; font-size: 12px; }
    .step-label { font-size: 9px; }
    .wizard-steps::before { left: 15px; right: 15px; }
  }
`;

const occurrenceStyles = `
  .occ-wizard {
    background: rgba(255,251,235,0.97) !important;
  }
  .occ-wizard .wizard-steps::before {
    background: #fcd34d !important;
  }
  .occ-input:focus {
    border-color: #f59e0b !important;
    box-shadow: 0 0 0 4px rgba(245,158,11,0.15) !important;
  }
  .occ-wizard .form-label {
    color: #92400e;
  }
  .occ-wizard .client-dropdown {
    border-color: #f59e0b !important;
  }
  .occ-wizard .client-dropdown-item:hover {
    background: #fef3c7 !important;
    border-left: 3px solid #f59e0b !important;
  }
`;
