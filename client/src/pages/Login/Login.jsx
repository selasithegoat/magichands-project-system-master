import React from "react";
import { Link } from "react-router-dom";
import EyeIcon from "../../components/icons/EyeIcon";
import Spinner from "../../components/ui/Spinner";
import "./Login.css";

const EyeOffIcon = ({ width = "16", height = "16" }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.86 21.86 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.77 21.77 0 0 1-2.16 3.19" />
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const Login = ({ onLogin }) => {
  const [employeeId, setEmployeeId] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ employeeId, password }),
      });

      const data = await response.json();

      if (response.ok) {
        onLogin();
      } else {
        setError(data.message || "Invalid credentials");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-content">
        <div className="login-icon-wrapper">
          <img
            src="/mhlogo.png"
            alt="Logo"
            width="200"
            height="200"
            style={{ width: "200px", height: "auto" }}
          />
        </div>

        <h1 className="login-title">Welcome Back</h1>
        <p className="login-subtitle">
          Access your project management dashboard
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div
              style={{
                color: "red",
                fontSize: "0.875rem",
                marginBottom: "1rem",
              }}
            >
              {error}
            </div>
          )}

          <div className="form-group">
            <div className="form-label-row">
              <label className="form-label">EMPLOYEE ID</label>
            </div>
            <input
              type="text"
              className="form-input"
              placeholder="Enter your ID"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <div className="form-label-row">
              <label className="form-label">PASSWORD</label>
            </div>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                className="form-input"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                <Spinner /> Signing In...
              </div>
            ) : (
              "Sign In to Portal"
            )}
          </button>
        </form>

        <div className="login-footer">
          New team member?{" "}
          <Link
            to="#"
            className="request-access-link"
            onClick={(event) => event.preventDefault()}
          >
            Request Access
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
