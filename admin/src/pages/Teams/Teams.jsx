import React, { useState, useEffect } from "react";
import DashboardLayout from "../../layouts/DashboardLayout/DashboardLayout";
import "./Teams.css";
import Modal from "../../components/Modal/Modal";
import ConfirmationModal from "../../components/ConfirmationModal/ConfirmationModal";
import { UserIcon, LockIcon, PencilIcon, TrashIcon } from "../../icons/Icons";

const Teams = ({ user }) => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
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

  // Fetch Employees
  const fetchEmployees = async () => {
    try {
      const res = await fetch("/api/admin/employees");
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
      }
    } catch (err) {
      console.error("Error fetching employees:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  // Handle Input Changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });

    if (name === "password") {
      checkStrength(value);
    }
  };

  // Handle Department Toggle (Multi-select)
  const handleDepartmentToggle = (dept) => {
    const currentDepts = formData.department;
    if (currentDepts.includes(dept)) {
      setFormData({
        ...formData,
        department: currentDepts.filter((d) => d !== dept),
      });
    } else {
      setFormData({ ...formData, department: [...currentDepts, dept] });
    }
  };

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
    });
    setPwdStrength(0);
    setSelectedEmployee(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (emp) => {
    setSelectedEmployee(emp);
    setFormData({
      firstName: emp.firstName,
      lastName: emp.lastName,
      employeeId: emp.employeeId,
      email: emp.email || "",
      password: "", // Password not editable here
      confirmPassword: "",
      department: Array.isArray(emp.department)
        ? emp.department
        : [emp.department],
      position: emp.position,
      employeeType: emp.employeeType,
    });
    setShowAddModal(true);
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
      });
      if (res.ok) {
        setEmployees(employees.filter((e) => e._id !== employeeId));
      } else {
        alert("Failed to delete user");
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting user");
    }
  };

  // Register or Update Employee
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (formData.department.length === 0) {
      alert("Please select at least one department");
      return;
    }

    if (!selectedEmployee) {
      // Create Mode
      if (formData.password !== formData.confirmPassword) {
        alert("Passwords do not match");
        return;
      }
      try {
        const res = await fetch("/api/admin/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        const data = await res.json();
        if (res.ok) {
          setEmployees([data, ...employees]);
          setShowAddModal(false);
          alert("Employee Registered Successfully");
        } else {
          alert(data.message || "Registration Failed");
        }
      } catch (err) {
        alert("Error registering employee");
      }
    } else {
      // Edit Mode
      try {
        const res = await fetch(
          `/api/admin/employees/${selectedEmployee._id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              firstName: formData.firstName,
              lastName: formData.lastName,
              email: formData.email,
              employeeId: formData.employeeId,
              department: formData.department,
              position: formData.position,
              employeeType: formData.employeeType,
            }),
          },
        );

        const data = await res.json();
        if (res.ok) {
          setEmployees(
            employees.map((emp) =>
              emp._id === selectedEmployee._id ? data : emp,
            ),
          );
          setShowAddModal(false);
          alert("Employee Updated Successfully");
        } else {
          alert(data.message || "Update Failed");
        }
      } catch (err) {
        alert("Error updating employee");
      }
    }
  };

  // Change Password
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmNewPassword) {
      alert("Passwords do not match");
      return;
    }

    try {
      const res = await fetch(
        `/api/admin/employees/${selectedEmployee._id}/password`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: passwordData.newPassword }),
        },
      );

      if (res.ok) {
        alert("Password updated successfully");
        setShowPasswordModal(false);
        setPasswordData({ newPassword: "", confirmNewPassword: "" });
      } else {
        alert("Failed to update password");
      }
    } catch (err) {
      alert("Error updating password");
    }
  };

  return (
    <DashboardLayout user={user}>
      <div className="teams-page">
        <div className="teams-header">
          <div>
            <h1>Teams Management</h1>
            <p style={{ color: "var(--text-secondary)" }}>
              Manage employees, credentials, and roles
            </p>
          </div>
          <button className="add-btn" onClick={openAddModal}>
            + Register Employee
          </button>
        </div>

        {loading ? (
          <div>Loading...</div>
        ) : (
          <div className="teams-grid">
            {employees.map((emp) => (
              <div className="employee-card" key={emp._id}>
                <div className="card-header">
                  <div className="initials">
                    {emp.firstName?.[0]}
                    {emp.lastName?.[0]}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      className="icon-btn edit-btn"
                      onClick={() => openEditModal(emp)}
                      title="Edit Details"
                    >
                      <PencilIcon width="16" height="16" />
                    </button>
                    <button
                      className="icon-btn delete-btn"
                      onClick={() => openDeletePrompt(emp)}
                      title="Remove User"
                    >
                      <TrashIcon width="16" height="16" />
                    </button>
                  </div>
                </div>
                <div className="employee-info">
                  <h3>
                    {emp.firstName} {emp.lastName}
                  </h3>
                  <p className="employee-id">ID: {emp.employeeId}</p>
                </div>
                <div
                  className="info-row"
                  style={{ flexDirection: "column", gap: "0.5rem" }}
                >
                  <span className="info-label">Departments & Role</span>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "6px",
                      alignItems: "center",
                    }}
                  >
                    {(Array.isArray(emp.department)
                      ? emp.department
                      : [emp.department]
                    ).map((d, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: "0.75rem",
                          padding: "2px 8px",
                          background: "var(--bg-secondary)",
                          borderRadius: "4px",
                          border: "1px solid var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {d}
                      </span>
                    ))}
                    {/* Position Badge next to departments */}
                    <span className={`role-badge ${emp.position}`}>
                      {emp.position}
                    </span>
                  </div>
                </div>
                <div className="info-row">
                  <span className="info-label">Type</span>
                  <span
                    className="role-badge"
                    style={{
                      color: "#64748b",
                      border: "1px solid #e2e8f0",
                      background: "#f8fafc",
                    }}
                  >
                    {emp.employeeType}
                  </span>
                </div>

                <div className="card-actions">
                  <button
                    className="action-btn"
                    onClick={() => {
                      setSelectedEmployee(emp);
                      setShowPasswordModal(true);
                    }}
                  >
                    Change Password
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

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
    </DashboardLayout>
  );
};

export default Teams;
