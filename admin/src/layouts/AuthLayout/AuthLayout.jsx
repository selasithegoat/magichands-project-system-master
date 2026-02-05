import React from "react";
import "./AuthLayout.css";
import { ShieldIcon } from "../../icons/Icons";

const AuthLayout = ({ children }) => {
  return (
    <div className="auth-layout">
      <header className="auth-header">
        <div className="auth-logo">
          <img
            className="auth-logo-icon"
            src={`${import.meta.env.BASE_URL}mhlogo.png`}
            alt="MagicHands Logo"
          />
        </div>
        <div className="auth-version">Enterprise Secure Gateway</div>
      </header>

      <main className="auth-content">{children}</main>

      <footer className="auth-footer">
        <div className="copyright">
          © {new Date().getFullYear()} MagicHands Co. Ltd. All rights reserved.
        </div>
        
      </footer>
    </div>
  );
};

export default AuthLayout;
