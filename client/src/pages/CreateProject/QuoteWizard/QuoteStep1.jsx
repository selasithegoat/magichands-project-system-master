import React from "react";
import Input from "../../../components/ui/Input";
import ProgressBar from "../../../components/ui/ProgressBar";
import BackArrow from "../../../components/icons/BackArrow";
import CalendarIcon from "../../../components/icons/CalendarIcon";
import FolderIcon from "../../../components/icons/FolderIcon";
import PersonIcon from "../../../components/icons/PersonIcon";
import Select from "../../../components/ui/Select";
import UserAvatar from "../../../components/ui/UserAvatar";

const QuoteStep1 = ({ formData, setFormData, onNext, onCancel, isEditing }) => {
  const [leads, setLeads] = React.useState([]);
  const [isLoadingLeads, setIsLoadingLeads] = React.useState(false);

  React.useEffect(() => {
    const fetchUsers = async () => {
      setIsLoadingLeads(true);
      try {
        const res = await fetch("/api/auth/users");
        if (res.ok) {
          const data = await res.json();
          const formatted = data.map((u) => {
            const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim();
            const identifier = u.employeeId || u.email;
            return {
              value: u._id,
              label: identifier ? `${fullName} (${identifier})` : fullName,
            };
          });
          setLeads(formatted);
        }
      } catch (e) {
        console.error("Failed to fetch users", e);
      } finally {
        setIsLoadingLeads(false);
      }
    };
    fetchUsers();
  }, []);

  const handleChange = (field, value) => {
    setFormData({ [field]: value });
  };

  const handleNextStep = () => {
    if (!formData.projectName || !formData.deliveryDate || !formData.lead) {
      alert("Please fill in Project Name, Completion Date, and select a Lead.");
      return;
    }
    onNext();
  };

  return (
    <div className="step-container">
      <div className="step-header">
        <button className="back-btn" onClick={onCancel}>
          <BackArrow />
        </button>
        <h1 className="header-title">
          {isEditing ? "Edit Quote Project" : "Create Project from Quote"}
        </h1>
        <button className="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <div className="step-scrollable-content">
        <ProgressBar currentStep={1} totalSteps={5} />

        <div className="order-title-section">
          <h2 className="order-title">
            {formData.quoteDetails?.quoteNumber || "Quote Details"}
          </h2>
          <p className="order-subtitle">Finalize the project details below.</p>
        </div>

        <div className="form-body">
          <h3 className="section-title">Step 1: Project Basic Info</h3>

          <div className="form-row">
            <Input
              label="Received Time"
              value={formData.receivedTime}
              onChange={(e) => handleChange("receivedTime", e.target.value)}
            />
            <Input
              type="date"
              label={
                <>
                  Completion Date <span style={{ color: "#ef4444" }}>*</span>
                </>
              }
              value={formData.deliveryDate}
              onChange={(e) => handleChange("deliveryDate", e.target.value)}
              icon={<CalendarIcon />}
              required
            />
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <Select
              label={
                <>
                  Lead Assignment <span style={{ color: "#ef4444" }}>*</span>
                </>
              }
              options={leads}
              value={leads.find((l) => l.value === formData.lead)}
              onChange={(val) => handleChange("lead", val)}
              disabled={true}
              placeholder={isLoadingLeads ? "Loading users..." : "Select Lead"}
              renderValue={(option) => (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <UserAvatar />
                  <span>{option.label}</span>
                </div>
              )}
              renderOption={(option) => (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <UserAvatar />
                  <span>{option.label}</span>
                </div>
              )}
            />
          </div>

          <div className="form-row">
            <Input
              label="Project / Item Name"
              value={formData.projectName}
              onChange={(e) => handleChange("projectName", e.target.value)}
              icon={<FolderIcon />}
              required
            />
            <Input
              label="Client Name"
              placeholder="e.g. MagicHands Corp"
              value={formData.client}
              onChange={(e) => handleChange("client", e.target.value)}
              icon={<PersonIcon />}
            />
          </div>

          <div
            className="divider"
            style={{
              borderBottom: "1px solid var(--border-color)",
              margin: "2rem 0",
              opacity: 0.5,
            }}
          ></div>

          <div
            className="minimal-quote-form-group"
            style={{ marginBottom: "1.5rem" }}
          >
            <label
              className="input-label"
              style={{
                marginBottom: "0.5rem",
                display: "block",
                color: "#64748b",
                fontSize: "0.875rem",
                fontWeight: "600",
              }}
            >
              Brief Overview
            </label>
            <textarea
              name="briefOverview"
              className="minimal-quote-textarea-std"
              value={formData.briefOverview}
              onChange={(e) => handleChange("briefOverview", e.target.value)}
              placeholder="High-level summary of the request..."
              rows="3"
              style={{
                width: "100%",
                padding: "0.75rem",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                minHeight: "100px",
                fontSize: "0.95rem",
                resize: "vertical",
              }}
            />
          </div>

          {formData.attachments?.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <label
                className="input-label"
                style={{
                  marginBottom: "0.5rem",
                  display: "block",
                  color: "#64748b",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                }}
              >
                Reference Materials
              </label>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {formData.attachments.map((file, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "8px 12px",
                      background: "rgba(59, 130, 246, 0.1)",
                      border: "1px solid rgba(59, 130, 246, 0.2)",
                      borderRadius: "6px",
                      fontSize: "0.85rem",
                    }}
                  >
                    <a
                      href={file}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#3b82f6", textDecoration: "none" }}
                    >
                      {file.split("/").pop()}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: "1.5rem" }}>
            <label
              className="input-label"
              style={{
                marginBottom: "0.5rem",
                display: "block",
                color: "#64748b",
                fontSize: "0.875rem",
                fontWeight: "600",
              }}
            >
              Quote Checklist Status
            </label>
            <div
              className="checklist-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: "0.75rem",
              }}
            >
              {formData.quoteDetails?.checklist &&
                Object.entries(formData.quoteDetails.checklist).map(
                  ([key, val]) => (
                    <div
                      key={key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.5rem 0.75rem",
                        background: val
                          ? "rgba(16, 185, 129, 0.1)"
                          : "rgba(255, 255, 255, 0.05)",
                        borderRadius: "6px",
                        border: val
                          ? "1px solid rgba(16, 185, 129, 0.2)"
                          : "1px solid var(--border-color)",
                        color: val ? "#10b981" : "#64748b",
                        fontSize: "0.85rem",
                        cursor: "default",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <span style={{ fontSize: "1.1rem" }}>
                        {val ? "✓" : "○"}
                      </span>
                      <span>
                        {key
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, (str) => str.toUpperCase())}
                      </span>
                    </div>
                  ),
                )}
            </div>
          </div>
        </div>
      </div>

      <div
        className="step-footer"
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: "2rem",
          padding: "1.5rem 0",
          borderTop: "1px solid var(--border-color)",
          gap: "1.5rem",
        }}
      >
        <button
          className="next-btn"
          onClick={handleNextStep}
          style={{
            background: "var(--primary-blue)",
            color: "white",
            padding: "0.75rem 2rem",
            borderRadius: "8px",
            border: "none",
            fontWeight: "600",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          Next Step
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M4.16666 10H15.8333"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10 4.16669L15.8333 10L10 15.8334"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default QuoteStep1;
