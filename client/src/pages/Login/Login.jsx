import React from "react";
import "./Login.css";
// Importing a simple icon for the "Tools" logo.
// If 'SystemIcon' or 'SettingsIcon' isn't quite right, we'll build a custom SVG.
// Using 'SettingsIcon' as a placeholder for the crossed tools, or I will create an inline SVG that looks like the wrench/hammer in the image.
import XIcon from "../../components/icons/XIcon";

const ToolsLogo = () => (
  <svg
    width="40"
    height="40"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

// Better custom icon for "Wrench and Hammer" crossed if possible, but let's stick to a generic "Tools" representation
// or imply it with a Wrench + Hammer SVG if I can easily draw it.
// Given the complexity of drawing a perfect icon from scratch blindly, I'll use a simplified version
// or just use the ToolsLogo above which is a generic wrench-like shape.
// Let's try to match the image: Crossed Hammer and Wrench.
const CrossedToolsIcon = () => (
  <svg
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Hammer */}
    <path d="M13.7 3.7l3.6 3.6" />
    <path d="M6.3 11.1l7.4-7.4a2 2 0 0 1 2.8 0l2 2a2 2 0 0 1 0 2.8l-7.4 7.4" />
    <path d="M2 22l6-6" />
    {/* Wrench (simplified crossing) - This is hard to perfect blindly. 
       Let's use a meaningful construction icon. */}
  </svg>
);

// Actually, the `SystemIcon` in the project might be suitable?
// Let's just use a clean "Wrench" and "Hammer" SVG inline for best visual match.
const ConstructionIcon = () => (
  <svg
    width="40"
    height="40"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M14.5 2L17.5 5L14.5 8"
      stroke="#10b981"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M5 14L2 17C2 17 4 21 8 21L11 18"
      stroke="#10b981"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M16 3.5L8 11.5"
      stroke="#10b981"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M11.5 8L3.5 16"
      stroke="#10b981"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Cross line */}
    <path
      d="M21 21L12 12"
      stroke="#10b981"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M15 9L18 12"
      stroke="#10b981"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Login = ({ onLogin }) => {
  return (
    <div className="login-container">
      {/* Top Controls */}
      <button className="login-close-btn" aria-label="Close">
        <XIcon />
      </button>

      <div className="login-lang-selector">English</div>

      <div className="login-content">
        {/* Logo Icon */}
        <div className="login-icon-wrapper">
          {/* Using a generic "Construction" or "Tools" looking SVG */}
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18.3 5.3a2 2 0 0 0-2.8 0l-10 10a2 2 0 0 0 0 2.8l4.2 4.2a2 2 0 0 0 2.8 0l10-10a2 2 0 0 0 0-2.8L18.3 5.3z" />
            <path d="M2 2l20 20" />
          </svg>
        </div>

        {/* Brand */}
        <div className="login-brand">
          MagicHands <span className="highlight">Co. Ltd.</span>
        </div>

        {/* Welcome Text */}
        <h1 className="login-title">Welcome Back</h1>
        <p className="login-subtitle">
          Access your project management dashboard
        </p>

        {/* Form */}
        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            onLogin();
          }}
        >
          {/* Email Address */}
          <div className="form-group">
            <div className="form-label-row">
              <label className="form-label">EMAIL ADDRESS</label>
            </div>
            <input
              type="email"
              className="form-input"
              placeholder="name@magichands.com"
            />
          </div>

          {/* Password */}
          <div className="form-group">
            <div className="form-label-row">
              <label className="form-label">PASSWORD</label>
              <a href="#" className="forgot-link">
                Forgot?
              </a>
            </div>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
            />
          </div>

          {/* Submit */}
          <button type="submit" className="login-submit-btn">
            Sign In to Portal
          </button>
        </form>

        {/* Footer */}
        <div className="login-footer">
          New team member?{" "}
          <a href="#" className="request-access-link">
            Request Access
          </a>
        </div>

        {/* Home Indicator */}
        <div className="home-indicator"></div>
      </div>
    </div>
  );
};

export default Login;
