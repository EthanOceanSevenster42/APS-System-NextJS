"use client";

import { useState, useRef, useEffect } from "react";

interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  /** Show a search input to filter options */
  searchable?: boolean;
  /** Optional friendly display labels keyed by option value */
  optionLabels?: Record<string, string>;
  /** Extra wrapper style */
  style?: React.CSSProperties;
}

export default function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  placeholder = "All",
  searchable = false,
  optionLabels,
  style,
}: MultiSelectDropdownProps) {
  const labelOf = (v: string) => optionLabels?.[v] ?? v;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside mousedown — works in React 17+ because we check
  // containment instead of relying on stopPropagation.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (open && searchable && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open, searchable]);

  const filteredOptions = searchable && search
    ? options.filter((opt) => opt.toLowerCase().includes(search.toLowerCase()))
    : options;

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  };

  const clearAll = () => onChange([]);
  const selectAll = () => onChange([...options]);

  const buttonLabel =
    selected.length === 0
      ? placeholder
      : selected.length === 1
      ? labelOf(selected[0])
      : `${selected.length} selected`;

  return (
    <div ref={containerRef} style={{ position: "relative", ...style }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          padding: "6px 10px",
          fontSize: "0.8rem",
          border: "1px solid #e5e7eb",
          borderRadius: 6,
          background: open ? "#f9fafb" : "white",
          textAlign: "left",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          color: selected.length > 0 ? "#1f2937" : "#6b7280",
          gap: 6,
        }}
      >
        <span title={buttonLabel} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {buttonLabel}
        </span>
        <i
          className={`fas fa-chevron-${open ? "up" : "down"}`}
          style={{ fontSize: 10, flexShrink: 0, color: "#9ca3af" }}
        />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            minWidth: 180,
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            zIndex: 2000,
            overflow: "hidden",
          }}
        >
          {/* Actions */}
          <div
            style={{
              padding: "6px 10px",
              borderBottom: "1px solid #f3f4f6",
              display: "flex",
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={selectAll}
              style={{ fontSize: 11, color: "#007890", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 600 }}
            >
              All
            </button>
            <button
              type="button"
              onClick={clearAll}
              style={{ fontSize: 11, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Clear
            </button>
          </div>

          {/* Search */}
          {searchable && (
            <div style={{ padding: "6px 10px", borderBottom: "1px solid #f3f4f6" }}>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                style={{
                  width: "100%",
                  padding: "5px 8px",
                  fontSize: "0.78rem",
                  border: "1px solid #e5e7eb",
                  borderRadius: 4,
                  outline: "none",
                  color: "#1f2937",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#007890")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#e5e7eb")}
              />
            </div>
          )}

          {/* Options */}
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {filteredOptions.length === 0 ? (
              <div style={{ padding: "8px 10px", fontSize: 12, color: "#9ca3af" }}>
                {search ? "No matches" : "No options"}
              </div>
            ) : (
              filteredOptions.map((opt) => (
                <label
                  key={opt}
                  title={labelOf(opt)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    color: "#1f2937",
                    background: selected.includes(opt) ? "#f0fafb" : "transparent",
                  }}
                  onMouseEnter={(e) => { if (!selected.includes(opt)) e.currentTarget.style.background = "#f9fafb"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = selected.includes(opt) ? "#f0fafb" : "transparent"; }}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(opt)}
                    onChange={() => toggle(opt)}
                    style={{ accentColor: "#007890", flexShrink: 0 }}
                  />
                  <span title={labelOf(opt)} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{labelOf(opt)}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
