import React, { useState, useEffect } from "react";
import DashboardLayout from "../../layouts/DashboardLayout/DashboardLayout";
import "./Teams.css";
import { UserIcon, LockIcon } from "../../icons/Icons";

const Teams = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Form States
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    employeeId: "",
    email: "",
    password: "",
    confirmPassword: "",
    department: "Administration",
    position: "Member",
    employeeType: "Staff",
  });

  const [passwordData, setPasswordData] = useState({
    newPassword: "",
    confirmNewPassword: "",
  });

  const [pwdStrength, setPwdStrength] = useState(0);

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

  const checkStrength = (pwd) => {
    let strength = 0;
    if (pwd.length > 5) strength += 33;
    if (pwd.length > 7 && /[A-Z]/.test(pwd)) strength += 33;
    if (/[@$!%*?&]/.test(pwd)) strength += 34;
    setPwdStrength(strength > 100 ? 100 : strength);
  };

  // Register Employee
  const handleRegister = async (e) => {
    e.preventDefault();
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
        setFormData({
          firstName: "",
          lastName: "",
          employeeId: "",
          email: "",
          password: "",
          confirmPassword: "",
          department: "Administration",
          position: "Member",
          employeeType: "Staff",
        });
        alert("Employee Registered Successfully");
      } else {
        alert(data.message || "Registration Failed");
      }
    } catch (err) {
      alert("Error registering employee");
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
        }
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
    <DashboardLayout>
      <div className="teams-page">
        <div className="teams-header">
          <div>
            <h1>Teams Management</h1>
            <p style={{ color: "var(--text-secondary)" }}>
              Manage employees, credentials, and roles
            </p>
          </div>
          <button className="add-btn" onClick={() => setShowAddModal(true)}>
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
                  <span className={`role-badge ${emp.position}`}>
                    {emp.position}
                  </span>
                </div>
                <div className="employee-info">
                  <h3>
                    {emp.firstName} {emp.lastName}
                  </h3>
                  <p className="employee-id">ID: {emp.employeeId}</p>
                </div>
                <div className="info-row">
                  <span className="info-label">Department</span>
                  <span className="info-value">{emp.department}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Type</span>
                  <span className="info-value">{emp.employeeType}</span>
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

        {/* Register Modal */}
        {showAddModal && (
          <div className="modal-overlay">
            <div
              className="modal-content"
              style={{
                maxWidth: "600px",
                width: "100%",
                maxHeight: "90vh",
                overflowY: "auto",
              }}
            >
              <h2 className="modal-title">Register New Employee</h2>
              <form onSubmit={handleRegister}>
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

                <div className="form-row">
                  <div className="form-group">
                    <label>Department</label>
                    <select
                      className="input-field"
                      name="department"
                      value={formData.department}
                      onChange={handleChange}
                    >
                      {[
                        "Administration",
                        "Front Desk",
                        "Production",
                        "Graphics/Design",
                        "Photography",
                        "Stores",
                      ].map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Position</label>
                    <select
                      className="input-field"
                      name="position"
                      value={formData.position}
                      onChange={handleChange}
                    >
                      <option value="Member">Member</option>
                      <option value="Leader">Leader</option>
                    </select>
                  </div>
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

                <div className="form-group">
                  <label>Set Password</label>
                  <input
                    className="input-field"
                    type="password"
                    name="password"
                    required
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
                    required
                    value={formData.confirmPassword}
                    onChange={handleChange}
                  />
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowAddModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    Register
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Change Password Modal */}
        {showPasswordModal && selectedEmployee && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: "400px" }}>
              <h2 className="modal-title">Reset Password</h2>
              <p
                style={{ marginBottom: "1rem", color: "var(--text-secondary)" }}
              >
                Changing password for{" "}
                <strong>
                  {selectedEmployee.firstName} {selectedEmployee.lastName}
                </strong>
              </p>
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
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Teams;
