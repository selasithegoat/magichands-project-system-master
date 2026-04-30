import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./BillingDocumentsFab.css";

const ReceiptIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M7 3h10a2 2 0 0 1 2 2v16l-3-1.6-2.6 1.6L11 19.4 8.6 21 6 19.4 3 21V5a2 2 0 0 1 2-2h2Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M8 8h8M8 12h8M8 16h5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const BillingDocumentsFab = ({ hasFrontDeskStack = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = location.pathname === "/billing-documents";

  return (
    <button
      type="button"
      className={[
        "billing-documents-fab",
        hasFrontDeskStack ? "with-frontdesk-stack" : "",
        isActive ? "active" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => navigate("/billing-documents")}
      aria-label="Open billing documents"
    >
      <span className="billing-documents-fab-icon">
        <ReceiptIcon />
      </span>
      <span className="billing-documents-fab-label">Billing</span>
    </button>
  );
};

export default BillingDocumentsFab;
