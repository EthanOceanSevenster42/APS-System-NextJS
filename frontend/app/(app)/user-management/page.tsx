"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface UserRecord {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  allocated_inspectors?: number[];
}

interface Message {
  text: string;
  type: "success" | "error";
  id: number;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  user: UserRecord | null;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const ROLE_OPTIONS = [
  { value: "inspector", label: "Inspector" },
  { value: "inspector_manager", label: "Inspector Manager" },
  { value: "admin", label: "Administrator" },
  { value: "super_admin", label: "Super Admin" },
  { value: "financial", label: "Financial Administrator" },
  { value: "lab_technician", label: "Lab Technician" },
  { value: "developer", label: "Developer" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const ROLE_COLORS: Record<string, string> = {
  inspector: "#3730a3",
  inspector_manager: "#3730a3",
  admin: "#d97706",
  super_admin: "#dc2626",
  financial: "#059669",
  lab_technician: "#7c3aed",
  developer: "#1e40af",
};

const ROLE_LABELS: Record<string, string> = {
  inspector: "Inspector",
  inspector_manager: "Inspector Manager",
  admin: "Administrator",
  super_admin: "Super Admin",
  financial: "Financial Admin",
  lab_technician: "Lab Technician",
  developer: "Developer",
};

/* ── Filament (FSA teal) tokens + stat widget ────────────────────────────── */
function Stat({ label, value, icon, tint, color }: { label: string; value: React.ReactNode; icon: string; tint: string; color: string; }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 0 0 1px rgba(17,24,39,0.05), 0 1px 2px 0 rgba(0,0,0,0.05)", padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "#6b7280" }}>{label}</span>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: tint, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className={icon} style={{ color, fontSize: "0.85rem" }} />
        </div>
      </div>
      <div style={{ fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.02em", color: "#007890", marginTop: 8, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Multi-Select Component                                             */
/* ------------------------------------------------------------------ */
function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (val: string) => {
    onChange(
      selected.includes(val) ? selected.filter((s) => s !== val) : [...selected, val]
    );
  };

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
      : `${selected.length} selected`;

  return (
    <div className="um-multi-select-wrapper" ref={ref}>
      <div className="um-multi-select-btn" onClick={() => setOpen(!open)}>
        <span>{label}</span>
        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      {open && (
        <div className="um-multi-select-panel">
          {options.map((o) => (
            <label
              key={o.value}
              className="um-multi-select-option"
              onClick={() => toggle(o.value)}
            >
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                readOnly
                style={{ accentColor: "#007890" }}
              />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */
export default function UserManagementPage() {
  // Data
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters — default to "active" only so deleted (inactive) users are hidden
  const [filterRoles, setFilterRoles] = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<string[]>(["active"]);
  const [searchText, setSearchText] = useState("");
  const [appliedRoles, setAppliedRoles] = useState<string[]>([]);
  const [appliedStatuses, setAppliedStatuses] = useState<string[]>(["active"]);
  const [appliedSearch, setAppliedSearch] = useState("");

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignUser, setReassignUser] = useState<UserRecord | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [resetUser, setResetUser] = useState<{ id: number; username: string; email: string } | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetShowPassword, setResetShowPassword] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  // Add form
  const [addForm, setAddForm] = useState({
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    role: "inspector",
    monthly_salary: "",
  });

  // Edit form
  const [editForm, setEditForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    role: "",
    allocated_inspectors: [] as number[],
  });

  // Context menu
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    user: null,
  });

  // Messages
  const [messages, setMessages] = useState<Message[]>([]);
  const msgIdRef = useRef(0);

  // ---- helpers ----
  const addMessage = useCallback((text: string, type: "success" | "error") => {
    const id = ++msgIdRef.current;
    setMessages((prev) => [...prev, { text, type, id }]);
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }, 5000);
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      addMessage("Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  }, [addMessage]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Close context menu on click outside
  useEffect(() => {
    const handler = () => setContextMenu((c) => ({ ...c, visible: false }));
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // ---- filtered users (client-side) ----
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (appliedRoles.length > 0 && !appliedRoles.includes(u.role)) return false;
      if (appliedStatuses.length > 0) {
        const status = u.is_active ? "active" : "inactive";
        if (!appliedStatuses.includes(status)) return false;
      }
      if (appliedSearch) {
        const s = appliedSearch.toLowerCase();
        if (
          !u.username.toLowerCase().includes(s) &&
          !u.email.toLowerCase().includes(s) &&
          !(u.first_name + " " + u.last_name).toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [users, appliedRoles, appliedStatuses, appliedSearch]);

  // ---- summary stats (client-side over all users) ----
  const stats = useMemo(() => {
    const active = users.filter((u) => u.is_active).length;
    const roleCount = (r: string) => users.filter((u) => u.role === r).length;
    return {
      total: users.length,
      active,
      inactive: users.length - active,
      inspectors: roleCount("inspector") + roleCount("inspector_manager"),
      admins: roleCount("admin") + roleCount("super_admin") + roleCount("developer"),
    };
  }, [users]);

  // ---- API helpers ----
  const postAction = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  };

  // ---- Handlers ----
  const handleApplyFilters = () => {
    setAppliedRoles([...filterRoles]);
    setAppliedStatuses([...filterStatuses]);
    setAppliedSearch(searchText);
  };

  const handleClearFilters = () => {
    setFilterRoles([]);
    setFilterStatuses(["active"]);
    setSearchText("");
    setAppliedRoles([]);
    setAppliedStatuses(["active"]);
    setAppliedSearch("");
  };

  const handleAddUser = async () => {
    if (!addForm.username || !addForm.email || !addForm.first_name || !addForm.last_name || !addForm.role) {
      addMessage("Please fill in all required fields", "error");
      return;
    }
    const data = await postAction({ action: "add_user", ...addForm });
    if (data.success) {
      addMessage(data.message || "User added. Setup email with OTP sent.", "success");
      setShowAddModal(false);
      setAddForm({
        username: "",
        email: "",
        first_name: "",
        last_name: "",
        role: "inspector",
        monthly_salary: "",
      });
      fetchUsers();
    } else {
      addMessage(data.error || "Failed to add user", "error");
    }
  };

  const handleResetOTP = async (user: UserRecord) => {
    if (
      !confirm(
        `Reset OTP for "${user.username}"?\n\n` +
          `This will:\n` +
          `- Invalidate their current password\n` +
          `- Generate a new OTP code\n` +
          `- Send a setup email to ${user.email}\n\n` +
          `The user will need to set up a new password using the OTP.`
      )
    )
      return;

    const data = await postAction({ action: "reset_otp", user_id: user.id });
    if (data.success) {
      addMessage(data.message || "OTP reset email sent", "success");
    } else {
      addMessage(data.error || "Failed to reset OTP", "error");
    }
  };

  const handleEditUser = async () => {
    if (!editUser) return;
    const data = await postAction({
      action: "edit_user",
      user_id: editUser.id,
      ...editForm,
    });
    if (data.success) {
      addMessage(data.message || "User updated successfully", "success");
      setShowEditModal(false);
      fetchUsers();
    } else {
      addMessage(data.error || "Failed to update user", "error");
    }
  };

  // Build a password that clears Django's validators on the first try.
  const generatePassword = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
    const bytes = new Uint32Array(14);
    crypto.getRandomValues(bytes);
    const generated = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
    setResetNewPassword(generated);
    setResetShowPassword(true);
  };

  // Admin types (or generates) the new password - takes effect immediately.
  const handleSetPassword = async () => {
    if (!resetUser) return;
    if (resetNewPassword.length < 8) {
      addMessage("Password must be at least 8 characters long", "error");
      return;
    }
    setResetBusy(true);
    try {
      const data = await postAction({
        action: "reset_password",
        user_id: resetUser.id,
        new_password: resetNewPassword,
      });
      if (data.success) {
        addMessage(data.message || `Password updated for ${resetUser.username}`, "success");
        setShowResetPasswordModal(false);
      } else {
        addMessage(data.error || "Failed to set password", "error");
      }
    } finally {
      setResetBusy(false);
    }
  };

  // Alternative: let the user choose their own password via an emailed link.
  const handleResetPassword = async () => {
    if (!resetUser) return;
    if (!resetUser.email) {
      addMessage(`${resetUser.username} has no email address on file`, "error");
      return;
    }
    setResetBusy(true);
    try {
      const data = await postAction({
        action: "send_reset_email",
        user_id: resetUser.id,
      });
      if (data.success) {
        addMessage(data.message || "Password reset link sent", "success");
        setShowResetPasswordModal(false);
      } else {
        addMessage(data.error || "Failed to send password reset link", "error");
      }
    } finally {
      setResetBusy(false);
    }
  };

  const handleToggleActive = async (user: UserRecord) => {
    const data = await postAction({
      action: user.is_active ? "deactivate_user" : "activate_user",
      user_id: user.id,
    });
    if (data.success) {
      addMessage(
        data.message || `User ${user.is_active ? "deactivated" : "activated"} successfully`,
        "success"
      );
      fetchUsers();
    } else {
      addMessage(data.error || "Failed to toggle user status", "error");
    }
  };

  const handleDeleteUser = async (user: UserRecord) => {
    // For inspectors/inspector_managers, show reassignment modal
    if (user.role === "inspector" || user.role === "inspector_manager") {
      setReassignUser(user);
      setReassignTo("");
      setShowReassignModal(true);
      return;
    }
    // For non-inspectors, simple confirm
    if (!confirm(`Delete user "${user.username}"?\n\nThe user will be deactivated and can no longer log in. All historical data will be preserved.`))
      return;
    const data = await postAction({ action: "delete_user", user_id: user.id });
    if (data.success) {
      addMessage(data.message || "User deleted successfully", "success");
      fetchUsers();
    } else {
      addMessage(data.error || "Failed to delete user", "error");
    }
  };

  const handleReassignAndDelete = async () => {
    if (!reassignUser) return;
    if (!reassignTo) {
      addMessage("Please select an inspector to reassign facilities to", "error");
      return;
    }
    const data = await postAction({
      action: "reassign_and_delete",
      user_id: reassignUser.id,
      reassign_to: reassignTo,
    });
    if (data.success) {
      addMessage(data.message || "Facilities reassigned and user deactivated", "success");
      setShowReassignModal(false);
      setReassignUser(null);
      fetchUsers();
    } else {
      addMessage(data.error || "Failed to reassign", "error");
    }
  };

  const handleSendResetEmail = async (user: UserRecord) => {
    const data = await postAction({ action: "send_reset_email", user_id: user.id });
    if (data.success) {
      addMessage(data.message || "Password reset email sent", "success");
    } else {
      addMessage(data.error || "Failed to send reset email", "error");
    }
  };


  const openEditModal = (user: UserRecord) => {
    setEditUser(user);
    setEditForm({
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      allocated_inspectors: user.allocated_inspectors ?? [],
    });
    setShowEditModal(true);
  };

  const openResetModal = (user: UserRecord) => {
    setResetUser({ id: user.id, username: user.username, email: user.email });
    setResetNewPassword("");
    setResetShowPassword(false);
    setResetBusy(false);
    setShowResetPasswordModal(true);
  };

  const handleContextMenu = (e: React.MouseEvent, user: UserRecord) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, user });
  };

  // Get list of inspectors for the edit modal inspector_manager allocation
  const inspectors = useMemo(
    () => users.filter((u) => u.role === "inspector"),
    [users]
  );

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  if (loading) return (
    <>
    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, width: "100vw", height: "100vh", background: "url('/background.jpg') no-repeat center center fixed", backgroundSize: "cover", zIndex: -2, pointerEvents: "none" }} />
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
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, width: "100vw", height: "100vh", background: "url('/background.jpg') no-repeat center center fixed", backgroundSize: "cover", zIndex: -2, pointerEvents: "none" }} />
      <style>{`
/* Card styles */
.um-card { background: #ffffff; border-radius: 12px; box-shadow: 0 0 0 1px rgba(17,24,39,0.05), 0 1px 2px 0 rgba(0,0,0,0.05); margin-bottom: 20px; border: none; width: 100%; }
.um-card-header { padding: 14px 20px; border-bottom: 1px solid #f3f4f6; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; min-height: 44px; }
.um-card-title { font-size: 0.95rem; font-weight: 600; color: #111827; display: flex; align-items: center; gap: 0.375rem; }
.um-card-body { padding: 20px; }

/* Button styles */
.um-btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem; padding: 0.35rem 0.65rem; border-radius: 4px; border: none; font-weight: 500; font-size: 0.6875rem; cursor: pointer; transition: all 0.15s ease; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.um-btn:hover { opacity: 0.9; }
.um-btn-primary { background: #007890; color: white; }
.um-btn-secondary { background: #6b7280; color: white; }
.um-btn-success { background: #10b981; color: white; }
.um-btn-warning { background: #f59e0b; color: white; }
.um-btn-danger { background: #EC343C; color: white; }
.um-btn-info { background: #3b82f6; color: white; }
.um-btn-purple { background: #7c3aed; color: white; }
.um-btn-xs { padding: 4px 8px; font-size: 0.7rem; width: 28px; height: 28px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; }
.um-action-btn { padding: 4px 9px; font-size: 0.66rem; height: 26px; display: inline-flex; align-items: center; gap: 4px; border-radius: 6px; white-space: nowrap; }
.um-action-btn i { font-size: 0.6rem; }

/* Table styles */
.um-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; background: white; }
.um-table th { background-color: #fafafa; color: #6b7280; text-align: left; padding: 11px 18px; font-weight: 600; white-space: nowrap; border-bottom: 1px solid #f3f4f6; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; position: sticky; top: 0; z-index: 10; }
.um-table tr:nth-child(even) { background-color: #ffffff; }
.um-table tr:nth-child(odd) { background-color: white; }
.um-table tbody tr:hover { background-color: #f9fafb; }
.um-table tbody tr { cursor: pointer; transition: background-color 0.15s ease; }
.um-table td { padding: 12px 18px; border-top: 1px solid #f3f4f6; border-bottom: none; font-size: 0.8rem; white-space: nowrap; color: #374151; }

/* Role badges */
.um-role-badge { padding: 4px 10px; border-radius: 12px; font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.2); display: inline-block; }

/* Status badges */
.um-status-badge { padding: 4px 10px; border-radius: 12px; font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 4px; }
.um-status-active { background-color: rgba(16, 185, 129, 0.12); color: #059669; }
.um-status-inactive { background-color: rgba(239, 68, 68, 0.12); color: #dc2626; }

/* Form styles */
.um-form-group { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; width: 100%; }
.um-form-label { font-size: 0.75rem; font-weight: 600; color: #374151; margin-bottom: 0.35rem; display: block; }
.um-form-control { padding: 0.5rem 0.75rem; border: 1.5px solid #e5e7eb; border-radius: 6px; font-size: 0.85rem; transition: all 0.2s ease; color: #1f2937; background-color: #ffffff; width: 100%; box-sizing: border-box; }
.um-form-control:focus { outline: none; border-color: #007890; box-shadow: 0 0 0 3px #e6f3f7; }

/* Modal styles */
.um-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; }
.um-modal-content { background: #ffffff; padding: 1.5rem 2rem; border-radius: 12px; max-width: 600px; width: 92%; box-shadow: 0 20px 60px rgba(0,0,0,0.2); max-height: 90vh; overflow-y: auto; }
.um-modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; padding-bottom: 0.75rem; border-bottom: 2px solid #e5e7eb; }
.um-modal-title { font-size: 1.2rem; font-weight: 700; color: #1f2937; margin: 0; display: flex; align-items: center; gap: 8px; }
.um-modal-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #6b7280; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
.um-modal-close:hover { background: #f3f4f6; }
.um-modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1.5rem; }

/* Context Menu */
.um-context-menu { position: fixed; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); min-width: 180px; z-index: 10001; padding: 4px 0; }
.um-context-menu-item { padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 0.875rem; color: #1f2937; transition: background-color 0.15s ease; }
.um-context-menu-item:hover { background-color: #e6f3f7; }
.um-context-menu-item.danger { color: #EC343C; }
.um-context-menu-item.danger:hover { background-color: rgba(236, 52, 60, 0.1); }
.um-context-menu-divider { height: 1px; background-color: #e5e7eb; margin: 4px 0; }

/* Multi-select filter */
.um-multi-select-wrapper { position: relative; }
.um-multi-select-btn { display: flex; align-items: center; justify-content: space-between; cursor: pointer; text-align: left; background-color: #ffffff; user-select: none; padding: 0.4rem 0.55rem; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 0.75rem; width: 100%; }
.um-multi-select-panel { position: absolute; top: calc(100% + 4px); left: 0; min-width: 100%; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.12); z-index: 200; padding: 4px 0; }
.um-multi-select-option { display: flex; align-items: center; gap: 8px; padding: 5px 10px; font-size: 0.75rem; color: #1f2937; cursor: pointer; white-space: nowrap; }
.um-multi-select-option:hover { background: #e6f3f7; }

/* Password reset modal */
.um-password-generate { margin-bottom: 1.5rem; padding: 1rem; background: #f3f4f6; border-radius: 4px; }
.um-password-divider { text-align: center; margin: 1rem 0; color: #6b7280; font-weight: 600; font-size: 0.875rem; }
.um-password-input-wrapper { position: relative; }
.um-password-toggle { position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #6b7280; padding: 0.25rem; }

/* Header */
.um-header { text-align: center; margin-bottom: 20px; }
.um-header h1 { color: #fff; font-size: 1.3rem; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 4px; text-shadow: 0 2px 6px rgba(0,0,0,0.5); }
.um-header h2 { color: rgba(255,255,255,0.9); font-size: 0.75rem; font-weight: 400; margin: 0; text-shadow: 0 1px 3px rgba(0,0,0,0.4); }

/* Form actions */
.um-form-actions { display: flex; gap: 0.5rem; align-items: center; padding-top: 0.625rem; border-top: 1px solid #e5e7eb; margin-top: 0.75rem; flex-wrap: wrap; }

/* Button group */
.um-btn-group { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }

/* Loading */
.um-loading { display: flex; justify-content: center; align-items: center; padding: 3rem; color: #6b7280; font-size: 1rem; background: white; border-radius: 0.5rem; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 1.5rem; }

/* Table responsive */
.um-table-responsive { overflow-x: auto; border-radius: 0 0 12px 12px; width: 100%; background: white; }

/* Container */
.um-container { width: 100%; margin: 0; padding: 32px 32px 48px; box-sizing: border-box; }
.um-stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-bottom: 20px; }
@media (max-width: 1000px) { .um-stats-grid { grid-template-columns: repeat(2, 1fr) !important; } }

/* Mobile card view toggle */
.um-mobile-only { display: none !important; }
.um-desktop-only { display: block; }

/* Responsive breakpoints */
@media (max-width: 768px) {
  .um-mobile-only { display: block !important; }
  .um-desktop-only { display: none !important; }
  .um-container { padding: 0 0.75rem 1.25rem; }
  .um-header h1 { font-size: 1.35rem; }
  .um-header h2 { font-size: 0.875rem; }
  .um-header { padding: 1rem 0 0.75rem; margin-bottom: 1rem; }
  .um-form-group { grid-template-columns: 1fr; }
  .um-card-header { padding: 0.5rem 0.75rem; flex-direction: column !important; gap: 8px; align-items: stretch !important; }
  .um-card-title { justify-content: center; }
  .um-btn-group { flex-wrap: wrap; width: 100%; }
  .um-btn-group .um-btn { flex: 1 1 45%; min-width: 0; justify-content: center; }
  .um-card-body { padding: 0.75rem; }
  .um-modal-content { width: 95% !important; max-height: 90vh !important; }
  .um-modal-body { padding: 16px !important; }
  .um-form-actions { justify-content: stretch; }
  .um-form-actions .um-btn { flex: 1; justify-content: center; }
}
@media (max-width: 480px) {
  .um-container { padding: 0 0.5rem 1rem; }
  .um-header h1 { font-size: 1.1rem; }
  .um-header h2 { font-size: 0.75rem; }
  .um-btn-group { flex-direction: column; }
  .um-btn-group .um-btn { flex: unset; width: 100%; }
  .um-btn { font-size: 0.65rem; padding: 0.35rem 0.5rem; }
}

/* Alert boxes */
.um-alert-box { padding: 14px 18px; border-radius: 10px; display: flex; align-items: center; gap: 12px; font-size: 0.875rem; font-weight: 500; animation: slideIn 0.3s ease; }
.um-alert-error { background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; box-shadow: 0 4px 16px rgba(239,68,68,0.15); }
.um-alert-success { background: #ecfdf5; border: 1px solid #6ee7b7; color: #065f46; box-shadow: 0 4px 16px rgba(16,185,129,0.15); }
.um-alert-box .alert-icon { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.um-alert-success .alert-icon { background: #d1fae5; color: #059669; }
.um-alert-error .alert-icon { background: #fee2e2; color: #dc2626; }
.um-alert-box .alert-dismiss { margin-left: auto; background: none; border: none; cursor: pointer; opacity: 0.5; font-size: 14px; padding: 4px; color: inherit; }
.um-alert-box .alert-dismiss:hover { opacity: 1; }
@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

/* Messages container */
.um-messages { position: fixed; top: 1rem; right: 1rem; z-index: 20000; display: flex; flex-direction: column; gap: 0.5rem; }
      `}</style>

      {/* Messages */}
      {messages.length > 0 && (
        <div className="um-messages">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`um-alert-box ${
                m.type === "success" ? "um-alert-success" : "um-alert-error"
              }`}
              style={{ minWidth: 320, maxWidth: 440 }}
            >
              <span className="alert-icon">
                <i className={`fas ${m.type === "success" ? "fa-check-circle" : "fa-exclamation-circle"}`} />
              </span>
              <span style={{ flex: 1, lineHeight: 1.4 }}>{m.text}</span>
              <button className="alert-dismiss" onClick={() => setMessages(prev => prev.filter(x => x.id !== m.id))}>
                <i className="fas fa-times" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ width: "100%", minHeight: "100%", boxSizing: "border-box" }}>
      <div className="um-container">
        {/* Header */}
        <div className="um-header">
          <h1><i className="fas fa-users-gear" style={{ marginRight: 10 }} />User Management</h1>
          <h2>Manage user accounts, roles, and permissions</h2>
        </div>

        {/* Stat widgets */}
        <div className="um-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 20 }}>
          <Stat label="Total users" value={stats.total} icon="fas fa-users" tint="#e0f2f5" color="#007890" />
          <Stat label="Active" value={stats.active} icon="fas fa-circle-check" tint="#dcfce7" color="#16a34a" />
          <Stat label="Inactive" value={stats.inactive} icon="fas fa-circle-xmark" tint="#fee2e2" color="#dc2626" />
          <Stat label="Inspectors" value={stats.inspectors} icon="fas fa-user-shield" tint="#e0e7ff" color="#4338ca" />
          <Stat label="Admins" value={stats.admins} icon="fas fa-user-gear" tint="#f3e8ff" color="#7c3aed" />
        </div>

        {/* Filter Card — single row, matches the Late Captures / Analytics style */}
        <div className="um-card">
          <div className="um-card-body" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", padding: "14px 18px" }}>
            <div style={{ minWidth: 180 }}>
              <label className="um-form-label">Role</label>
              <MultiSelect
                options={ROLE_OPTIONS}
                selected={filterRoles}
                onChange={setFilterRoles}
                placeholder="All Roles"
              />
            </div>
            <div style={{ minWidth: 150 }}>
              <label className="um-form-label">Status</label>
              <MultiSelect
                options={STATUS_OPTIONS}
                selected={filterStatuses}
                onChange={setFilterStatuses}
                placeholder="All Statuses"
              />
            </div>
            <div style={{ flex: "1 1 220px", maxWidth: 340 }}>
              <label className="um-form-label">Search</label>
              <input
                type="text"
                className="um-form-control"
                style={{ padding: "0.4rem 0.55rem", fontSize: "0.75rem" }}
                placeholder="Search by name, email, username..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleApplyFilters(); }}
              />
            </div>
            <button className="um-btn um-btn-primary" style={{ padding: "0.45rem 1rem" }} onClick={handleApplyFilters}>
              <i className="fas fa-filter" /> Apply
            </button>
            <button className="um-btn um-btn-secondary" style={{ padding: "0.45rem 1rem" }} onClick={handleClearFilters}>
              <i className="fas fa-times" /> Clear
            </button>
          </div>
        </div>

        {/* Users Table Card */}
        {loading ? (
          <div className="um-loading">Loading users...</div>
        ) : (
          <div className="um-card">
            <div className="um-card-header">
              <div className="um-card-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Users
                <span
                  style={{
                    background: "#007890",
                    color: "white",
                    borderRadius: "10px",
                    padding: "1px 8px",
                    fontSize: "0.65rem",
                    fontWeight: 600,
                  }}
                >
                  {filteredUsers.length}
                </span>
              </div>
              <div className="um-btn-group">
                <button
                  className="um-btn um-btn-success"
                  onClick={() => setShowAddModal(true)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add User
                </button>
              </div>
            </div>
            {/* Desktop Table */}
            <div className="um-table-responsive um-desktop-only">
              <table className="um-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th className="um-col-email">Email</th>
                    <th className="um-col-fullname">Full Name</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "#9ca3af" }}>
                        No users found
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr
                        key={user.id}
                        onContextMenu={(e) => handleContextMenu(e, user)}
                      >
                        <td style={{ fontWeight: 600 }}>{user.username}</td>
                        <td className="um-col-email">{user.email}</td>
                        <td className="um-col-fullname">
                          {user.first_name || user.last_name ? (
                            `${user.first_name} ${user.last_name}`.trim()
                          ) : (
                            <em style={{ color: "#9ca3af" }}>Not provided</em>
                          )}
                        </td>
                        <td>
                          <span
                            className="um-role-badge"
                            style={{
                              backgroundColor: ROLE_COLORS[user.role] || "#6b7280",
                            }}
                          >
                            {ROLE_LABELS[user.role] || user.role}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`um-status-badge ${
                              user.is_active ? "um-status-active" : "um-status-inactive"
                            }`}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                backgroundColor: user.is_active ? "#059669" : "#dc2626",
                                display: "inline-block",
                              }}
                            />
                            {user.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "4px", flexWrap: "nowrap" }}>
                            <button
                              className="um-btn um-btn-info um-action-btn"
                              title="Change this user's name, email, or role"
                              onClick={() => openEditModal(user)}
                            >
                              <i className="fas fa-pen" /> Edit
                            </button>
                            <button
                              className="um-btn um-btn-info um-action-btn"
                              title="Set a new password for this user, or email them a reset link"
                              onClick={() => openResetModal(user)}
                            >
                              <i className="fas fa-key" /> Password
                            </button>
                            <button
                              className="um-btn um-action-btn"
                              style={{ backgroundColor: "#7c3aed", color: "white" }}
                              title="Email this user a link to set up their own password (resets their OTP)"
                              onClick={() => handleResetOTP(user)}
                            >
                              <i className="fas fa-envelope" /> Setup Email
                            </button>
                            <button
                              className={`um-btn um-action-btn ${
                                user.is_active ? "um-btn-warning" : "um-btn-success"
                              }`}
                              title={user.is_active
                                ? "Disable this account — the user can no longer log in (reversible)"
                                : "Re-enable this account so the user can log in again"}
                              onClick={() => handleToggleActive(user)}
                            >
                              <i className={`fas fa-${user.is_active ? "ban" : "check"}`} /> {user.is_active ? "Deactivate" : "Activate"}
                            </button>
                            {user.role !== "developer" && (
                              <button
                                className="um-btn um-btn-danger um-action-btn"
                                title="Remove this user — the account is deactivated and their historical data (inspections, logs) is preserved"
                                onClick={() => handleDeleteUser(user)}
                              >
                                <i className="fas fa-trash" /> Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="um-mobile-only" style={{ display: "none" }}>
              {filteredUsers.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "#9ca3af" }}>No users found</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px" }}>
                  {filteredUsers.map((user) => (
                    <div key={user.id} style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1f2937" }}>{user.username}</div>
                          {(user.first_name || user.last_name) && (
                            <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{`${user.first_name} ${user.last_name}`.trim()}</div>
                          )}
                          {user.email && <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginTop: 2 }}>{user.email}</div>}
                        </div>
                        <span className={`um-status-badge ${user.is_active ? "um-status-active" : "um-status-inactive"}`}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: user.is_active ? "#059669" : "#dc2626", display: "inline-block" }} />
                          {user.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span className="um-role-badge" style={{ backgroundColor: ROLE_COLORS[user.role] || "#6b7280" }}>
                          {ROLE_LABELS[user.role] || user.role}
                        </span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="um-btn um-btn-info um-btn-xs" title="Edit" onClick={() => openEditModal(user)}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </button>
                          <button className="um-btn um-btn-info um-btn-xs" title="Reset Password" onClick={() => openResetModal(user)}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                          </button>
                          <button className={`um-btn um-btn-xs ${user.is_active ? "um-btn-warning" : "um-btn-success"}`} title={user.is_active ? "Deactivate" : "Activate"} onClick={() => handleToggleActive(user)}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              {user.is_active ? <><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></> : <polyline points="20 6 9 17 4 12" />}
                            </svg>
                          </button>
                          {user.role !== "developer" && (
                            <button className="um-btn um-btn-danger um-btn-xs" title="Delete" onClick={() => handleDeleteUser(user)}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Context Menu */}
      {contextMenu.visible && contextMenu.user && (
        <div
          className="um-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y, display: "block" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="um-context-menu-item"
            onClick={() => {
              openEditModal(contextMenu.user!);
              setContextMenu((c) => ({ ...c, visible: false }));
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit User
          </div>
          <div
            className="um-context-menu-item"
            onClick={() => {
              openResetModal(contextMenu.user!);
              setContextMenu((c) => ({ ...c, visible: false }));
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            Reset Password
          </div>
          <div
            className="um-context-menu-item"
            onClick={() => {
              handleSendResetEmail(contextMenu.user!);
              setContextMenu((c) => ({ ...c, visible: false }));
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            Email Reset Link
          </div>
          <div
            className="um-context-menu-item"
            onClick={() => {
              handleResetOTP(contextMenu.user!);
              setContextMenu((c) => ({ ...c, visible: false }));
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.78 7.78 5.5 5.5 0 017.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
            Reset OTP
          </div>
          <div className="um-context-menu-divider" />
          <div
            className="um-context-menu-item"
            onClick={() => {
              handleToggleActive(contextMenu.user!);
              setContextMenu((c) => ({ ...c, visible: false }));
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {contextMenu.user.is_active ? (
                <>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </>
              ) : (
                <polyline points="20 6 9 17 4 12" />
              )}
            </svg>
            {contextMenu.user.is_active ? "Deactivate" : "Activate"}
          </div>
          <div className="um-context-menu-divider" />
          {contextMenu.user.role !== "developer" && (
            <div
              className="um-context-menu-item danger"
              onClick={() => {
                handleDeleteUser(contextMenu.user!);
                setContextMenu((c) => ({ ...c, visible: false }));
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              Delete User
            </div>
          )}
        </div>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <div className="um-modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="um-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="um-modal-header">
              <h3 className="um-modal-title">Add New User</h3>
              <button className="um-modal-close" onClick={() => setShowAddModal(false)}>
                &times;
              </button>
            </div>
            <div>
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af", padding: "10px 14px", borderRadius: "6px", marginBottom: "12px", fontSize: "0.85rem" }}>
                A one-time setup code (OTP) will be emailed to the user. They will use this code to set their own password.
              </div>
              <div className="um-form-group">
                <div>
                  <label className="um-form-label">Username *</label>
                  <input
                    className="um-form-control"
                    value={addForm.username}
                    onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                  />
                </div>
                <div>
                  <label className="um-form-label">Email *</label>
                  <input
                    className="um-form-control"
                    type="email"
                    value={addForm.email}
                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="um-form-group">
                <div>
                  <label className="um-form-label">First Name *</label>
                  <input
                    className="um-form-control"
                    value={addForm.first_name}
                    onChange={(e) => setAddForm({ ...addForm, first_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="um-form-label">Last Name</label>
                  <input
                    className="um-form-control"
                    value={addForm.last_name}
                    onChange={(e) => setAddForm({ ...addForm, last_name: e.target.value })}
                  />
                </div>
              </div>
              <div className="um-form-group">
                <div>
                  <label className="um-form-label">Role *</label>
                  <select
                    className="um-form-control"
                    value={addForm.role}
                    onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="um-form-label">Monthly Salary</label>
                  <input
                    className="um-form-control"
                    type="number"
                    value={addForm.monthly_salary}
                    onChange={(e) =>
                      setAddForm({ ...addForm, monthly_salary: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
            <div className="um-modal-actions">
              <button className="um-btn um-btn-secondary" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button className="um-btn um-btn-success" onClick={handleAddUser}>
                Add User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editUser && (
        <div className="um-modal-backdrop" onClick={() => setShowEditModal(false)}>
          <div className="um-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="um-modal-header">
              <h3 className="um-modal-title">Edit User</h3>
              <button className="um-modal-close" onClick={() => setShowEditModal(false)}>
                &times;
              </button>
            </div>
            <div>
              <div className="um-form-group">
                <div>
                  <label className="um-form-label">Username</label>
                  <input
                    className="um-form-control"
                    value={editUser.username}
                    readOnly
                    style={{ backgroundColor: "#f3f4f6" }}
                  />
                </div>
                <div>
                  <label className="um-form-label">Email</label>
                  <input
                    className="um-form-control"
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="um-form-group">
                <div>
                  <label className="um-form-label">First Name</label>
                  <input
                    className="um-form-control"
                    value={editForm.first_name}
                    onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="um-form-label">Last Name</label>
                  <input
                    className="um-form-control"
                    value={editForm.last_name}
                    onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                  />
                </div>
              </div>
              <div className="um-form-group">
                <div>
                  <label className="um-form-label">Role</label>
                  <select
                    className="um-form-control"
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {editForm.role === "inspector_manager" && inspectors.length > 0 && (
                <div style={{ marginTop: "0.5rem" }}>
                  <label className="um-form-label">Allocated Inspectors</label>
                  <div
                    style={{
                      maxHeight: 150,
                      overflowY: "auto",
                      border: "1px solid #e5e7eb",
                      borderRadius: 4,
                      padding: "0.5rem",
                    }}
                  >
                    {inspectors.map((ins) => (
                      <label
                        key={ins.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "4px 0",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={editForm.allocated_inspectors.includes(ins.id)}
                          onChange={() => {
                            setEditForm((prev) => ({
                              ...prev,
                              allocated_inspectors: prev.allocated_inspectors.includes(ins.id)
                                ? prev.allocated_inspectors.filter((id) => id !== ins.id)
                                : [...prev.allocated_inspectors, ins.id],
                            }));
                          }}
                          style={{ accentColor: "#007890" }}
                        />
                        {ins.username}
                        {ins.first_name || ins.last_name
                          ? ` (${ins.first_name} ${ins.last_name})`.trim()
                          : ""}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="um-modal-actions">
              <button className="um-btn um-btn-secondary" onClick={() => setShowEditModal(false)}>
                Cancel
              </button>
              <button className="um-btn um-btn-primary" onClick={handleEditUser}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPasswordModal && resetUser && (
        <div className="um-modal-backdrop" onClick={() => setShowResetPasswordModal(false)}>
          <div className="um-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="um-modal-header">
              <h3 className="um-modal-title">Reset Password</h3>
              <button
                className="um-modal-close"
                onClick={() => setShowResetPasswordModal(false)}
              >
                &times;
              </button>
            </div>
            <p style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "1rem" }}>
              Resetting password for <strong>{resetUser.username}</strong>
            </p>

            {/* Option 1 - set a password now */}
            <div className="um-password-generate">
              <label className="um-form-label">New Password</label>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                <div className="um-password-input-wrapper" style={{ flex: 1 }}>
                  <input
                    className="um-form-control"
                    type={resetShowPassword ? "text" : "password"}
                    value={resetNewPassword}
                    autoComplete="new-password"
                    placeholder="Enter a new password"
                    style={{ paddingRight: "2.25rem" }}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="um-password-toggle"
                    title={resetShowPassword ? "Hide password" : "Show password"}
                    onClick={() => setResetShowPassword((v) => !v)}
                  >
                    <i className={`fas ${resetShowPassword ? "fa-eye-slash" : "fa-eye"}`} />
                  </button>
                </div>
                <button
                  className="um-btn um-btn-secondary"
                  style={{ padding: "0.5rem 0.75rem", fontSize: "0.75rem" }}
                  onClick={generatePassword}
                >
                  <i className="fas fa-dice" /> Generate
                </button>
              </div>
              <small style={{ color: "#6b7280", fontSize: "0.75rem", marginTop: "0.4rem", display: "block" }}>
                Minimum 8 characters. Takes effect immediately, so remember to pass it on to the user.
              </small>
              <button
                className="um-btn um-btn-primary"
                style={{ marginTop: "0.75rem", padding: "0.5rem 1rem", fontSize: "0.8rem" }}
                disabled={resetBusy || resetNewPassword.length < 8}
                onClick={handleSetPassword}
              >
                <i className="fas fa-key" /> {resetBusy ? "Saving..." : "Set Password"}
              </button>
            </div>

            <div className="um-password-divider">OR</div>

            {/* Option 2 - let the user choose their own */}
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, color: "#1e3a8a", fontSize: "0.875rem", lineHeight: 1.5, padding: "0.875rem", marginBottom: "1rem" }}>
              Email a secure reset link to <strong>{resetUser.email || "this user"}</strong> and let them
              choose their own password. Their current password stays active until they do.
              {!resetUser.email && (
                <div style={{ color: "#b91c1c", marginTop: "0.5rem", fontWeight: 600 }}>
                  No email address on file for this user.
                </div>
              )}
            </div>

            <div className="um-modal-actions">
              <button
                className="um-btn um-btn-secondary"
                onClick={() => setShowResetPasswordModal(false)}
              >
                Cancel
              </button>
              <button
                className="um-btn um-btn-primary"
                disabled={resetBusy || !resetUser.email}
                onClick={handleResetPassword}
              >
                <i className="fas fa-paper-plane" /> Send Reset Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign & Delete Modal */}
      {showReassignModal && reassignUser && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowReassignModal(false)}>
          <div style={{ background: "white", borderRadius: 12, padding: "16px 20px", maxWidth: 550, width: "92%", maxHeight: "95vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
                <i className="fas fa-user-minus" style={{ marginRight: 8, color: "#dc2626" }} />Remove Inspector
              </h3>
              <button onClick={() => setShowReassignModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>&times;</button>
            </div>

            <div style={{ marginBottom: 14, padding: "12px 14px", background: "#fef2f2", borderRadius: 6, border: "1px solid #fecaca" }}>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "#991b1b" }}>
                <i className="fas fa-exclamation-triangle" style={{ marginRight: 6 }} />
                You are about to deactivate <strong>{reassignUser.first_name} {reassignUser.last_name}</strong> ({reassignUser.username}).
              </p>
              <p style={{ margin: "8px 0 0", fontSize: "0.78rem", color: "#7f1d1d" }}>
                All historical inspections, uploads, and records will remain under their name. They will no longer be able to log in.
              </p>
            </div>

            <div style={{ marginBottom: 14, padding: "12px 14px", background: "#e6f3f7", borderRadius: 6, border: "1px solid #b2d8e2" }}>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "#005a6b" }}>
                <i className="fas fa-exchange-alt" style={{ marginRight: 6 }} />
                Please select an inspector to <strong>take over their facility allocations</strong>. New inspections at those facilities will be assigned to the selected inspector.
              </p>
            </div>

            <div style={{ marginBottom: 16, padding: "10px 14px", background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb" }}>
              <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 600, color: "#374151", marginBottom: 4 }}>Reassign Facilities To</label>
              <select value={reassignTo} onChange={e => setReassignTo(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: "0.85rem" }}>
                <option value="">Select inspector...</option>
                {users.filter(u => u.is_active && u.id !== reassignUser.id && (u.role === "inspector" || u.role === "inspector_manager")).map(u => (
                  <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.username})</option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
              <button onClick={async () => {
                if (!reassignUser) return;
                const data = await postAction({ action: "delete_user", user_id: reassignUser.id });
                if (data.success) {
                  addMessage(data.message || "User deleted successfully", "success");
                  setShowReassignModal(false);
                  setReassignUser(null);
                  fetchUsers();
                } else {
                  addMessage(data.error || "Failed to delete user", "error");
                }
              }}
                style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #dc2626", background: "white", color: "#dc2626", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600 }}>
                <i className="fas fa-trash" style={{ marginRight: 6 }} />Just Delete
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowReassignModal(false)}
                  style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #e5e7eb", background: "white", cursor: "pointer", fontSize: "0.82rem", fontWeight: 500 }}>
                  Cancel
                </button>
                <button onClick={handleReassignAndDelete} disabled={!reassignTo}
                  style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: !reassignTo ? "#e5e7eb" : "#dc2626", color: !reassignTo ? "#9ca3af" : "white", cursor: !reassignTo ? "not-allowed" : "pointer", fontSize: "0.82rem", fontWeight: 600 }}>
                  <i className="fas fa-user-slash" style={{ marginRight: 6 }} />Reassign & Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
