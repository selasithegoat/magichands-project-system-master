import React from "react";
import "./AuthLayout.css";
import { ShieldIcon } from "../../icons/Icons";

const AuthLayout = ({ children }) => {
  return (
    <div className="auth-layout">
      <header className="auth-header">
        <div className="auth-logo">
          <ShieldIcon className="auth-logo-icon w-6 h-6" />
          <span>MagicHands Co. Ltd</span>
        </div>
        <div className="auth-version">Enterprise Secure Gateway</div>
      </header>

      <main className="auth-content">{children}</main>

      <footer className="auth-footer">
        <div className="copyright">
          © 2024 MagicHands Co. Ltd. All rights reserved.
        </div>
        
      </footer>
    </div>
  );
};

export default AuthLayout;
