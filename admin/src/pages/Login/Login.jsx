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

const Login = () => {
  const [loginData, setLoginData] = useState({
    username: "",
    password: "",
    keepLogged: false,
  });

  const handleLogin = (e) => {
    e.preventDefault();
    console.log("Logging in with:", loginData);
    // Authentication logic here
  };

  return (
    <AuthLayout>
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon-wrapper">
            <ShieldCheckIcon className="login-icon w-8 h-8" />
          </div>
          <h1 className="login-title">Project Management</h1>
          <h2>Admin Portal</h2>
          <p className="login-subtitle">
            Welcome back. Please authenticate to continue.
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <InputField
            label="Username or Email"
            placeholder="Enter your admin credentials"
            icon={UserIcon}
            type="text"
          />

          <InputField
            label="Password"
            placeholder="••••••••"
            icon={LockIcon}
            type="password"
            showForgot={false}
          />

          <Button type="submit" icon={CheckCircleIcon}>
            Secure Login
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
