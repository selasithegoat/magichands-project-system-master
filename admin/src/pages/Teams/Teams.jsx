import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import "./Teams.css";
import Modal from "../../components/Modal/Modal";
import ConfirmationModal from "../../components/ConfirmationModal/ConfirmationModal";
import { PencilIcon, TrashIcon } from "../../icons/Icons";

const normalizeDepartmentId = (value) =>
  ["outside-production", "outside production"].includes(
    String(value || "").trim().toLowerCase(),
  )
    ? "local-outsourcing"
    : value;

const PAGE_SIZE = 8;

const getEmployeeName = (employee) =>
  [employee?.firstName, employee?.lastName].filter(Boolean).join(" ") ||
  employee?.name ||
  "Unnamed employee";

const getInitials = (employee) =>
  [employee?.firstName, employee?.lastName]
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

const DirectoryIcon = ({ type }) => {
  const paths = {
    people: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-2a5.5 5.5 0 0 1 11 0v2M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 3.5 4.8V20" /></>,
    production: <><path d="M4 20V9l5 3V8l5 3V4h6v16H4Z" /><path d="M8 16h2m4 0h2" /></>,
    training: <><path d="m3 8 9-5 9 5-9 5-9-5Z" /><path d="M7 11v5c3 2 7 2 10 0v-5M21 8v6" /></>,
    access: <><path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-5" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">{paths[type] || paths.people}</svg>;
};

const Teams = () => {
  const queryClient = useQueryClient();
  const employeesQueryKey = ["admin", "employees"];
  const { data: employees = [], isPending: loading } = useQuery({
    queryKey: employeesQueryKey,
    queryFn: async () => {
      const response = await fetch("/api/admin/employees", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch employees.");
      const payload = await response.json();
      return Array.isArray(payload) ? payload : [];
    },
    meta: {
      realtimePaths: ["/api/admin/employees"],
    },
  });
  const setEmployees = (updater) => {
    queryClient.setQueryData(employeesQueryKey, (previous = []) =>
      typeof updater === "function" ? updater(previous) : updater,
    );
  };
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [accessFilter, setAccessFilter] = useState("all");
  const [cohortFilter, setCohortFilter] = useState("all");
  const [sortMode, setSortMode] = useState("name");
  const [viewMode, setViewMode] = useState("grid");
  const [page, setPage] = useState(1);
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    employeeId: null,
    employeeName: "",
  });

  // Form States
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    employeeId: "",
    email: "",
    password: "",
    confirmPassword: "",
    department: [],
    position: "Member",
    employeeType: "Staff",
    productionAccess: "Departmental Production",
  });

  const [passwordData, setPasswordData] = useState({
    newPassword: "",
    confirmNewPassword: "",
  });

  const [pwdStrength, setPwdStrength] = useState(0);

  // Available Departments
  const departments = [
    "Administration",
    "Front Desk",
    "Production",
    "Graphics/Design",
    "Photography",
    "Stores",
    "IT Department",
  ];
  const productionSubDepartments = [
    { id: "dtf", label: "DTF Printing" },
    { id: "uv-dtf", label: "UV DTF Printing" },
    { id: "uv-printing", label: "UV Printing" },
    { id: "engraving", label: "Engraving" },
    { id: "large-format", label: "Large Format" },
    { id: "digital-press", label: "Digital Press" },
    { id: "digital-heat-press", label: "Digital Heat Press" },
    { id: "offset-press", label: "Offset Press" },
    { id: "screen-printing", label: "Screen Printing" },
    { id: "embroidery", label: "Embroidery" },
    { id: "sublimation", label: "Sublimation" },
    { id: "digital-cutting", label: "Digital Cutting" },
    { id: "cnc", label: "CNC" },
    { id: "pvc-id", label: "PVC ID Cards" },
    { id: "business-cards", label: "Business Cards" },
    { id: "installation", label: "Installation" },
    { id: "overseas", label: "Overseas" },
    { id: "woodme", label: "Woodme" },
    { id: "fabrication", label: "Fabrication" },
    { id: "signage", label: "Signage" },
    { id: "local-outsourcing", label: "Local Outsourcing" },
  ];
  const productionSubDeptIds = productionSubDepartments.map((d) => d.id);
  const productionSubDeptLabelMap = new Map(
    productionSubDepartments.map((d) => [d.id, d.label]),
  );

  // Handle Input Changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });

    if (name === "password") {
      checkStrength(value);
    }
  };

  const normalizeDepartments = (depts = []) => {
    const unique = Array.from(
      new Set(depts.filter(Boolean).map(normalizeDepartmentId)),
    );
    const hasProdSub = unique.some((d) => productionSubDeptIds.includes(d));
    const hasProduction = unique.includes("Production") || hasProdSub;

    let next = unique;
    if (hasProdSub && !unique.includes("Production")) {
      next = [...next, "Production"];
    }
    if (!hasProduction) {
      next = next.filter((d) => !productionSubDeptIds.includes(d));
    }
    return next;
  };

  // Handle Department Toggle (Multi-select)
  const handleDepartmentToggle = (dept) => {
    const currentDepts = formData.department;
    if (currentDepts.includes(dept)) {
      let next = currentDepts.filter((d) => d !== dept);
      if (dept === "Production") {
        next = next.filter((d) => !productionSubDeptIds.includes(d));
      }
      setFormData({
        ...formData,
        department: next,
      });
    } else {
      setFormData({ ...formData, department: [...currentDepts, dept] });
    }
  };

  const handleProductionSubToggle = (subDept) => {
    const currentDepts = formData.department;
    let next = currentDepts.includes(subDept)
      ? currentDepts.filter((d) => d !== subDept)
      : [...currentDepts, subDept];

    if (!next.includes("Production")) {
      next = [...next, "Production"];
    }

    setFormData({
      ...formData,
      department: next,
    });
  };

  const getDepartmentLabel = (dept) =>
    productionSubDeptLabelMap.get(normalizeDepartmentId(dept)) ||
    normalizeDepartmentId(dept);

  const selectedProductionSubDepts = formData.department.filter((d) =>
    productionSubDeptIds.includes(d),
  );
  const showProductionSubDepts =
    formData.department.includes("Production") ||
    selectedProductionSubDepts.length > 0;

  const checkStrength = (pwd) => {
    let strength = 0;
    if (pwd.length > 5) strength += 33;
    if (pwd.length > 7 && /[A-Z]/.test(pwd)) strength += 33;
    if (/[@$!%*?&]/.test(pwd)) strength += 34;
    setPwdStrength(strength > 100 ? 100 : strength);
  };

  const resetForm = () => {
    setFormData({
      firstName: "",
      lastName: "",
      employeeId: "",
      email: "",
      password: "",
      confirmPassword: "",
      department: [],
      position: "Member",
      employeeType: "Staff",
      productionAccess: "Departmental Production",
    });
    setPwdStrength(0);
    setSelectedEmployee(null);
  };

  const employeeToFormData = (employee) => ({
    firstName: employee?.firstName || "",
    lastName: employee?.lastName || "",
    employeeId: employee?.employeeId || "",
    email: employee?.email || "",
    password: "",
    confirmPassword: "",
    department: normalizeDepartments(
      Array.isArray(employee?.department)
        ? employee.department
        : [employee?.department],
    ),
    position: employee?.position || "Member",
    employeeType: employee?.employeeType || "Staff",
    productionAccess:
      employee?.productionAccess || "Departmental Production",
  });

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (emp) => {
    setSelectedEmployee(emp);
    setFormData(employeeToFormData(emp));
  };

  const openDeletePrompt = (emp) => {
    setDeleteModal({
      isOpen: true,
      employeeId: emp._id,
      employeeName: `${emp.firstName} ${emp.lastName}`,
    });
  };

  const handleDeleteConfirm = async () => {
    const { employeeId } = deleteModal;
    if (!employeeId) return;

    try {
      const res = await fetch(`/api/admin/employees/${employeeId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setEmployees(employees.filter((e) => e._id !== employeeId));
        if (selectedEmployee?._id === employeeId) {
          resetForm();
        }
      } else {
        toast.error("Failed to delete user");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error deleting user");
    }
  };

  // Register or Update Employee
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    const normalizedDepartments = normalizeDepartments(formData.department);
    const selectedProductionSubs = normalizedDepartments.filter((d) =>
      productionSubDeptIds.includes(d),
    );

    if (normalizedDepartments.length === 0) {
      toast.error("Please select at least one department");
      return;
    }
    if (
      normalizedDepartments.includes("Production") &&
      selectedProductionSubs.length === 0
    ) {
      toast.error("Please select at least one Production sub-department");
      return;
    }

    if (!selectedEmployee) {
      // Create Mode
      if (formData.password !== formData.confirmPassword) {
        toast.error("Passwords do not match");
        return;
      }
      try {
        const res = await fetch("/api/admin/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            ...formData,
            department: normalizedDepartments,
          }),
        });

        const data = await res.json();
        if (res.ok) {
          setEmployees([data, ...employees]);
          setShowAddModal(false);
          toast.success("Employee registered successfully");
        } else {
          toast.error(data.message || "Registration failed");
        }
      } catch {
        toast.error("Error registering employee");
      }
    } else {
      // Edit Mode
      try {
        const res = await fetch(
          `/api/admin/employees/${selectedEmployee._id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              firstName: formData.firstName,
              lastName: formData.lastName,
              email: formData.email,
              employeeId: formData.employeeId,
              department: normalizedDepartments,
              position: formData.position,
              employeeType: formData.employeeType,
              productionAccess: formData.productionAccess,
            }),
          },
        );

        const data = await res.json();
        if (res.ok) {
          setEmployees(
            employees.map((emp) =>
              emp._id === selectedEmployee._id ? { ...emp, ...data } : emp,
            ),
          );
          setSelectedEmployee((current) => ({ ...current, ...data }));
          setShowAddModal(false);
          toast.success("Employee updated successfully");
        } else {
          toast.error(data.message || "Update failed");
        }
      } catch {
        toast.error("Error updating employee");
      }
    }
  };

  // Change Password
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmNewPassword) {
      toast.error("Passwords do not match");
      return;
    }

    try {
      const res = await fetch(
        `/api/admin/employees/${selectedEmployee._id}/password`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ password: passwordData.newPassword }),
        },
      );
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success("Password updated successfully");
        setShowPasswordModal(false);
        setPasswordData({ newPassword: "", confirmNewPassword: "" });
      } else {
        toast.error(data.message || "Failed to update password");
      }
    } catch {
      toast.error("Error updating password");
    }
  };

  const employeeDepartments = (employee) =>
    normalizeDepartments(
      Array.isArray(employee?.department)
        ? employee.department
        : [employee?.department],
    );

  const isTrainingEmployee = (employee) =>
    ["Trainee", "Intern", "NSP"].includes(employee?.employeeType) ||
    employee?.productionAccess === "Production Trainee";

  const productionEmployees = employees.filter((employee) =>
    employeeDepartments(employee).includes("Production"),
  );
  const trainingEmployees = employees.filter(isTrainingEmployee);
  const readyProfiles = employees.filter((employee) => {
    const depts = employeeDepartments(employee);
    return Boolean(
      employee?.employeeId &&
        employee?.firstName &&
        employee?.lastName &&
        employee?.position &&
        employee?.employeeType &&
        depts.length,
    );
  });
  const readinessRate = employees.length
    ? Math.round((readyProfiles.length / employees.length) * 1000) / 10
    : 100;

  const cohortCounts = {
    all: employees.length,
    production: productionEmployees.length,
    design: employees.filter((employee) =>
      employeeDepartments(employee).includes("Graphics/Design"),
    ).length,
    administration: employees.filter((employee) => {
      const depts = employeeDepartments(employee);
      return depts.includes("Administration") || depts.includes("Stores");
    }).length,
    training: trainingEmployees.length,
  };

  const filteredEmployees = (() => {
    const query = search.trim().toLowerCase();
    return employees
      .filter((employee) => {
        const depts = employeeDepartments(employee);
        if (departmentFilter !== "all" && !depts.includes(departmentFilter)) {
          return false;
        }
        if (roleFilter !== "all" && employee.position !== roleFilter) {
          return false;
        }
        if (
          accessFilter !== "all" &&
          (employee.productionAccess || "Departmental Production") !==
            accessFilter
        ) {
          return false;
        }
        if (cohortFilter === "production" && !depts.includes("Production")) {
          return false;
        }
        if (cohortFilter === "design" && !depts.includes("Graphics/Design")) {
          return false;
        }
        if (
          cohortFilter === "administration" &&
          !depts.some((dept) => ["Administration", "Stores"].includes(dept))
        ) {
          return false;
        }
        if (cohortFilter === "training" && !isTrainingEmployee(employee)) {
          return false;
        }
        if (!query) return true;
        return [
          getEmployeeName(employee),
          employee.employeeId,
          employee.email,
          employee.position,
          employee.employeeType,
          employee.productionAccess,
          ...depts,
          ...depts.map(getDepartmentLabel),
        ].some((value) => String(value || "").toLowerCase().includes(query));
      })
      .sort((left, right) => {
        if (sortMode === "newest") {
          return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
        }
        if (sortMode === "department") {
          return String(employeeDepartments(left)[0] || "").localeCompare(
            String(employeeDepartments(right)[0] || ""),
          );
        }
        if (sortMode === "role") {
          return String(left.position || "").localeCompare(
            String(right.position || ""),
          );
        }
        return getEmployeeName(left).localeCompare(getEmployeeName(right));
      });
  })();

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleEmployees = filteredEmployees.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const inspectorEmployee = selectedEmployee || visibleEmployees[0] || null;
  const inspectorValues = selectedEmployee
    ? formData
    : inspectorEmployee
      ? employeeToFormData(inspectorEmployee)
      : formData;

  const exportRoster = () => {
    if (!filteredEmployees.length) return;
    const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = filteredEmployees.map((employee) => [
      employee.employeeId,
      getEmployeeName(employee),
      employee.email || "",
      employeeDepartments(employee).map(getDepartmentLabel).join("; "),
      employee.position || "",
      employee.employeeType || "",
      employee.productionAccess || "Departmental Production",
    ]);
    const csv = [
      ["Employee ID", "Name", "Email", "Departments", "Role", "Type", "Production Access"],
      ...rows,
    ]
      .map((row) => row.map(escape).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `magichands-team-roster-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const summaryCards = [
    {
      icon: "people",
      tone: "violet",
      label: "Workforce headcount",
      value: employees.length,
      meta: `${employees.filter((employee) => employee.role === "admin").length} ${employees.filter((employee) => employee.role === "admin").length === 1 ? "administrator" : "administrators"}`,
      detail: "Registered employee profiles",
      progress: 100,
    },
    {
      icon: "production",
      tone: "green",
      label: "Production specialists",
      value: productionEmployees.length,
      meta: `${new Set(productionEmployees.flatMap(employeeDepartments).filter((dept) => productionSubDeptIds.includes(dept))).size} active units`,
      detail: "Assigned to Production",
      progress: employees.length
        ? (productionEmployees.length / employees.length) * 100
        : 0,
    },
    {
      icon: "training",
      tone: "amber",
      label: "Training cohort",
      value: trainingEmployees.length,
      meta: "Supervised access",
      detail: "NSP, interns and trainees",
      progress: employees.length
        ? (trainingEmployees.length / employees.length) * 100
        : 0,
    },
    {
      icon: "access",
      tone: "blue",
      label: "Directory readiness",
      value: `${readinessRate}%`,
      meta: `${employees.length - readyProfiles.length} incomplete`,
      detail: "Required profile fields present",
      progress: readinessRate,
    },
  ];

  return (
    <div className="teams-page">
      <header className="teams-hero">
        <div>
          <span>Operations Core / Workforce &amp; Access</span>
          <h1>Team Profiles &amp; Workforce Directory</h1>
          <p>Manage employee credentials, department assignments, production authorizations, and administrative access across active teams.</p>
        </div>
        <div className="teams-hero-actions">
          <button type="button" onClick={exportRoster} disabled={!filteredEmployees.length}>Export roster (CSV)</button>
          <button type="button" className="primary" onClick={openAddModal}>+ Register new employee</button>
        </div>
      </header>

      <section className="teams-summary" aria-label="Workforce summary">
        {summaryCards.map((card) => (
          <article className={`team-summary-card ${card.tone}`} key={card.label}>
            <span className="team-summary-icon"><DirectoryIcon type={card.icon} /></span>
            <span className="team-summary-meta">{card.meta}</span>
            <small>{card.label}</small>
            <strong>{card.value}</strong>
            <p>{card.detail}</p>
            <div><span style={{ width: `${Math.max(0, Math.min(100, card.progress))}%` }} /></div>
          </article>
        ))}
      </section>

      <section className="teams-controls">
        <div className="teams-filter-row">
          <label className="teams-search-field"><span>Search directory</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Staff name, employee ID, email, department, or unit…" /></label>
          <label><span>Department</span><select value={departmentFilter} onChange={(event) => { setDepartmentFilter(event.target.value); setPage(1); }}><option value="all">All departments</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
          <label><span>Role</span><select value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1); }}><option value="all">All roles</option><option value="Leader">Leaders</option><option value="Member">Members</option></select></label>
          <label><span>Access</span><select value={accessFilter} onChange={(event) => { setAccessFilter(event.target.value); setPage(1); }}><option value="all">All access levels</option><option value="Departmental Production">Departmental Production</option><option value="Production Trainee">Production Trainee</option></select></label>
          <div className="teams-view-toggle" aria-label="Directory view"><button type="button" className={viewMode === "grid" ? "active" : ""} onClick={() => setViewMode("grid")}>Grid</button><button type="button" className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>List</button></div>
        </div>
        <div className="teams-cohort-row">
          <nav aria-label="Workforce cohorts">
            {[
              ["all", "All personnel"],
              ["production", "Production floor"],
              ["design", "Design & Prepress"],
              ["administration", "Admin & Stores"],
              ["training", "Trainees & Apprentices"],
            ].map(([key, label]) => <button type="button" key={key} className={cohortFilter === key ? "active" : ""} onClick={() => { setCohortFilter(key); setPage(1); }}>{label} <span>{cohortCounts[key]}</span></button>)}
          </nav>
          <label><span>Sort by</span><select value={sortMode} onChange={(event) => { setSortMode(event.target.value); setPage(1); }}><option value="name">Name</option><option value="newest">Recently added</option><option value="department">Department</option><option value="role">Role</option></select></label>
        </div>
      </section>

      <div className="team-directory-workspace">
        <section className="team-directory-results">
          {loading ? (
            <div className="team-directory-state">Loading workforce directory…</div>
          ) : visibleEmployees.length ? (
            <div className={`teams-grid ${viewMode}`}>
              {visibleEmployees.map((emp) => {
                const employeeDepts = employeeDepartments(emp);
                const primaryDepts = employeeDepts.filter((dept) => !productionSubDeptIds.includes(dept));
                const machineUnits = employeeDepts.filter((dept) => productionSubDeptIds.includes(dept));
                const isSelected = selectedEmployee?._id === emp._id;
                return (
                  <article
                    className={`employee-card ${isSelected ? "is-selected" : ""}`}
                    key={emp._id}
                    onClick={() => openEditModal(emp)}
                    onKeyDown={(event) => { if (["Enter", " "].includes(event.key)) openEditModal(emp); }}
                    role="button"
                    tabIndex="0"
                  >
                    <header className="employee-card-header">
                      <span className="initials">{getInitials(emp)}</span>
                      <div className="employee-card-identity"><h3>{getEmployeeName(emp)} <i /></h3><p>ID: {emp.employeeId || "Not assigned"} <span className={`employee-type ${String(emp.employeeType || "staff").toLowerCase()}`}>{emp.employeeType || "Staff"}</span><span className="employee-position">{emp.position || "Member"}</span></p></div>
                      <div className="employee-card-tools">
                        <button type="button" className="icon-btn edit-btn" onClick={(event) => { event.stopPropagation(); openEditModal(emp); }} title="Edit employee"><PencilIcon width="15" height="15" /></button>
                        <button type="button" className="icon-btn delete-btn" onClick={(event) => { event.stopPropagation(); openDeletePrompt(emp); }} title="Remove employee"><TrashIcon width="15" height="15" /></button>
                      </div>
                    </header>

                    <div className="employee-card-section"><span>Departments &amp; production units ({employeeDepts.length})</span><div>{primaryDepts.map((dept) => <em className="dept-tag" key={dept}>{getDepartmentLabel(dept)}</em>)}{machineUnits.map((dept) => <em className="dept-tag machine" key={dept}>{getDepartmentLabel(dept)}</em>)}{!employeeDepts.length && <em className="dept-tag warning">Unassigned</em>}</div></div>
                    <div className="employee-access-panel"><span>Production access level</span><strong>{employeeDepts.includes("Production") ? (emp.productionAccess || "Departmental Production") : "Standard workforce access"}</strong><em>{emp.role === "admin" ? "Administrator" : emp.position === "Leader" ? "Team lead" : "Team member"}</em></div>
                    <footer className="employee-card-footer"><span>{emp.email || `Added ${emp.createdAt ? new Date(emp.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "to the directory"}`}</span><button type="button" onClick={(event) => { event.stopPropagation(); setSelectedEmployee(emp); setShowPasswordModal(true); }}>Change password</button></footer>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="team-directory-state"><strong>No employees match these filters.</strong><span>Try another department, cohort, role, or search term.</span></div>
          )}

          <nav className="teams-pagination" aria-label="Employee directory pages"><span>Showing {visibleEmployees.length} of {filteredEmployees.length} employees</span><div><button type="button" onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}>Previous</button><em>Page {currentPage} of {totalPages}</em><button type="button" onClick={() => setPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}>Next</button></div></nav>
        </section>

        <aside className="team-profile-inspector">
          {inspectorEmployee ? (
            <>
              <header><span>{selectedEmployee ? "Live inspector" : "Profile preview"}</span><h2>{selectedEmployee ? "Edit employee credentials" : "Employee credentials"}</h2><p>{getEmployeeName(inspectorEmployee)} ({inspectorEmployee.employeeId || "No ID"})</p></header>
              <form onSubmit={selectedEmployee ? handleSubmit : (event) => { event.preventDefault(); openEditModal(inspectorEmployee); }}>
                <div className="inspector-form-grid">
                  <label><span>First name</span><input name="firstName" value={inspectorValues.firstName} onChange={handleChange} disabled={!selectedEmployee} /></label>
                  <label><span>Last name</span><input name="lastName" value={inspectorValues.lastName} onChange={handleChange} disabled={!selectedEmployee} /></label>
                  <label><span>Employee ID</span><input name="employeeId" value={inspectorValues.employeeId} onChange={handleChange} disabled={!selectedEmployee} /></label>
                  <label><span>Company email</span><input name="email" type="email" value={inspectorValues.email} onChange={handleChange} disabled={!selectedEmployee} /></label>
                </div>

                <fieldset disabled={!selectedEmployee}><legend>Select department(s) <em>{inspectorValues.department.filter((dept) => !productionSubDeptIds.includes(dept)).length} active</em></legend><div className="inspector-check-grid">{departments.map((department) => <label className={inspectorValues.department.includes(department) ? "selected" : ""} key={department}><input type="checkbox" checked={inspectorValues.department.includes(department)} onChange={() => handleDepartmentToggle(department)} />{department}</label>)}</div></fieldset>

                {(inspectorValues.department.includes("Production") || inspectorValues.department.some((dept) => productionSubDeptIds.includes(dept))) && <fieldset disabled={!selectedEmployee}><legend>Production unit matrix <em>{inspectorValues.department.filter((dept) => productionSubDeptIds.includes(dept)).length} authorized</em></legend><p>Select the production units this employee is assigned to support.</p><div className="inspector-check-grid machine-grid">{productionSubDepartments.map((unit) => <label className={inspectorValues.department.includes(unit.id) ? "selected" : ""} key={unit.id}><input type="checkbox" checked={inspectorValues.department.includes(unit.id)} onChange={() => handleProductionSubToggle(unit.id)} />{unit.label}</label>)}</div></fieldset>}

                <div className="inspector-form-grid selects">
                  <label><span>Position / role</span><select name="position" value={inspectorValues.position} onChange={handleChange} disabled={!selectedEmployee}><option value="Member">Member</option><option value="Leader">Leader</option></select></label>
                  <label><span>Employee type</span><select name="employeeType" value={inspectorValues.employeeType} onChange={handleChange} disabled={!selectedEmployee}><option value="Staff">Staff</option><option value="NSP">NSP</option><option value="Intern">Intern</option><option value="Trainee">Trainee</option></select></label>
                  {inspectorValues.department.includes("Production") && <label className="wide"><span>Production access level</span><select name="productionAccess" value={inspectorValues.productionAccess} onChange={handleChange} disabled={!selectedEmployee}><option value="Departmental Production">Departmental Production</option><option value="Production Trainee">Production Trainee</option></select></label>}
                </div>
                <div className="inspector-actions">{selectedEmployee ? <><button type="button" onClick={resetForm}>Discard</button><button type="submit" className="primary">Update employee</button></> : <button type="submit" className="primary">Edit credentials</button>}</div>
              </form>
            </>
          ) : <div className="team-directory-state"><strong>No employee selected.</strong><span>Add an employee or adjust the current filters.</span></div>}
        </aside>
      </div>

      <footer className="team-directory-footer"><span className="team-summary-icon"><DirectoryIcon type="access" /></span><div><strong>Employee directory controls active</strong><p>{readyProfiles.length} of {employees.length} profiles contain all required identity, role, and department fields.</p></div><em>{employees.filter((employee) => employee.email).length} company email records</em></footer>

      {/* Register/Edit Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={selectedEmployee ? "Edit Employee" : "Register New Employee"}
        maxWidth="700px"
      >
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>First Name</label>
              <input
                className="input-field"
                name="firstName"
                required
                value={formData.firstName}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input
                className="input-field"
                name="lastName"
                required
                value={formData.lastName}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Employee ID</label>
              <input
                className="input-field"
                name="employeeId"
                required
                value={formData.employeeId}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label>Email (Optional)</label>
              <input
                className="input-field"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-section">
            <span className="form-section-title">
              Department & Role Assignment
            </span>

            <div className="form-group">
              <label>Select Departments</label>
              <div className="dept-grid">
                {departments.map((d) => (
                  <label
                    key={d}
                    className={`dept-checkbox ${
                      formData.department.includes(d) ? "selected" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.department.includes(d)}
                      onChange={() => handleDepartmentToggle(d)}
                    />
                    {d}
                  </label>
                ))}
              </div>
            </div>

            {showProductionSubDepts && (
              <div className="form-group">
                <label>Production Sub-Departments</label>
                <div className="subdept-grid">
                  {productionSubDepartments.map((sub) => (
                    <label
                      key={sub.id}
                      className={`subdept-checkbox ${
                        formData.department.includes(sub.id) ? "selected" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.department.includes(sub.id)}
                        onChange={() => handleProductionSubToggle(sub.id)}
                      />
                      {sub.label}
                    </label>
                  ))}
                </div>
                <p className="helper-text">
                  Select all production units the employee belongs to.
                </p>
              </div>
            )}

            <div className="form-row" style={{ alignItems: "flex-start" }}>
              <div className="form-group">
                <label>Position / Role</label>
                <select
                  className="input-field"
                  name="position"
                  value={formData.position}
                  onChange={handleChange}
                  style={{
                    borderColor:
                      formData.position === "Leader" ? "#a855f7" : "",
                  }}
                >
                  <option value="Member">Member</option>
                  <option value="Leader">Leader</option>
                </select>
                <p className="helper-text">
                  Applies to all selected departments.
                </p>
              </div>
              <div className="form-group">
                <label>Employee Type</label>
                <select
                  className="input-field"
                  name="employeeType"
                  value={formData.employeeType}
                  onChange={handleChange}
                >
                  <option value="Staff">Staff</option>
                  <option value="NSP">NSP</option>
                  <option value="Intern">Intern</option>
                  <option value="Trainee">Trainee</option>
                </select>
              </div>
            </div>
            {formData.department.includes("Production") && (
              <div className="form-group">
                <label>Production Access</label>
                <select
                  className="input-field"
                  name="productionAccess"
                  value={formData.productionAccess}
                  onChange={handleChange}
                >
                  <option value="Departmental Production">
                    Departmental Production
                  </option>
                  <option value="Production Trainee">Production Trainee</option>
                </select>
                <p className="helper-text">
                  Production Trainees can assist with general production work
                  but cannot access departmental engagement projects or actions.
                </p>
              </div>
            )}
          </div>

          {!selectedEmployee && (
            <>
              <div className="form-group">
                <label>Set Password</label>
                <input
                  className="input-field"
                  type="password"
                  name="password"
                  required={!selectedEmployee}
                  value={formData.password}
                  onChange={handleChange}
                />
                <div className="strength-meter">
                  <div
                    className="strength-bar"
                    style={{
                      width: `${pwdStrength}%`,
                      backgroundColor:
                        pwdStrength < 40
                          ? "#ef4444"
                          : pwdStrength < 80
                            ? "#eab308"
                            : "#22c55e",
                    }}
                  ></div>
                </div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  {pwdStrength < 40
                    ? "Weak"
                    : pwdStrength < 80
                      ? "Medium"
                      : "Strong"}
                </span>
              </div>
              <div className="form-group">
                <label>Verify Password</label>
                <input
                  className="input-field"
                  type="password"
                  name="confirmPassword"
                  required={!selectedEmployee}
                  value={formData.confirmPassword}
                  onChange={handleChange}
                />
              </div>
            </>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {selectedEmployee ? "Update Employee" : "Register"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        title="Reset Password"
        maxWidth="400px"
      >
        {selectedEmployee && (
          <p
            style={{
              marginBottom: "1rem",
              color: "var(--text-secondary)",
            }}
          >
            Changing password for{" "}
            <strong>
              {selectedEmployee.firstName} {selectedEmployee.lastName}
            </strong>
          </p>
        )}
        <form onSubmit={handleChangePassword}>
          <div className="form-group">
            <label>New Password</label>
            <input
              className="input-field"
              type="password"
              required
              value={passwordData.newPassword}
              onChange={(e) =>
                setPasswordData({
                  ...passwordData,
                  newPassword: e.target.value,
                })
              }
            />
          </div>
          <div className="form-group">
            <label>Confirm New Password</label>
            <input
              className="input-field"
              type="password"
              required
              value={passwordData.confirmNewPassword}
              onChange={(e) =>
                setPasswordData({
                  ...passwordData,
                  confirmNewPassword: e.target.value,
                })
              }
            />
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowPasswordModal(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Update Password
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ ...deleteModal, isOpen: false })}
        onConfirm={handleDeleteConfirm}
        title="Delete Employee"
        message={`Are you sure you want to remove ${deleteModal.employeeName}?`}
        confirmText="Remove"
        isDangerous={true}
      />
    </div>
  );
};

export default Teams;
