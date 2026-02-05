import React, { useState } from "react";
import "./Login.css";
import AuthLayout from "../../layouts/AuthLayout/AuthLayout";
import InputField from "../../components/InputField/InputField";
import Button from "../../components/Button/Button";
import {
  ShieldCheckIcon,
  UserIcon,
  LockIcon,
  CheckCircleIcon,
  HelpIcon,
  SupportIcon,
} from "../../icons/Icons";
const Login = ({ onLoginSuccess }) => {
  const [loginData, setLoginData] = useState({
    username: "",
    password: "",
    keepLogged: false,
  });

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload = {
        employeeId: loginData.username.trim(), // Ensure no whitespace
        password: loginData.password.trim(),
      };

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed");
      }

      if (data.role === "admin") {
        if (onLoginSuccess) {
          onLoginSuccess(data);
        }
      } else {
        throw new Error("Unauthorized: Access restricted to Administrators.");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h2>Admin Portal</h2>

      <div className="login-card">
        <div className="login-header">
          <div className="login-icon-wrapper">
            <img
              className="logo-icon"
              src={`${import.meta.env.BASE_URL}mhlogo.png`}
              alt="MagicHands Logo"
            />
          </div>
          <h1 className="login-title">Project Management</h1>
          <p className="login-subtitle">
            Welcome back. Please authenticate to continue.
          </p>
          {error && (
            <div
              style={{
                color: "#ef4444",
                fontSize: "0.875rem",
                marginTop: "1rem",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                padding: "0.5rem",
                borderRadius: "4px",
              }}
            >
              {error}
            </div>
          )}
        </div>

        <form onSubmit={handleLogin}>
          <InputField
            label="Username or Email"
            placeholder="Enter your admin credentials"
            icon={UserIcon}
            type="text"
            value={loginData.username}
            onChange={(e) =>
              setLoginData({ ...loginData, username: e.target.value })
            }
          />
          <InputField
            label="Password"
            placeholder="••••••••"
            icon={LockIcon}
            type="password"
            showForgot={false}
            value={loginData.password}
            onChange={(e) =>
              setLoginData({ ...loginData, password: e.target.value })
            }
          />
          <Button type="submit" icon={CheckCircleIcon} disabled={loading}>
            {loading ? "Authenticating..." : "Secure Login"}
          </Button>
          <div className="login-footer">
            <div className="footer-action">
              <HelpIcon className="w-4 h-4" /> Need Help?
            </div>
            <div className="footer-action">
              <SupportIcon className="w-4 h-4" /> Contact Support
            </div>
          </div>
        </form>
      </div>

      <p className="warning-text">
        Unauthorized access is strictly prohibited. Your activity is monitored
        and logged in accordance with enterprise security policies.
      </p>
    </AuthLayout>
  );
};

export default Login;
