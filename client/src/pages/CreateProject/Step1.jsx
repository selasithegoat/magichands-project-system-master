import React, { useState, useRef } from "react";
import { Link } from "react-router-dom";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import CardOption from "../../components/ui/CardOption";
import UserAvatar from "../../components/ui/UserAvatar";
import BackArrow from "../../components/icons/BackArrow";
import CalendarIcon from "../../components/icons/CalendarIcon";
import ClockIcon from "../../components/icons/ClockIcon";
import LocationIcon from "../../components/icons/LocationIcon";
import HomeIcon from "../../components/icons/HomeIcon";
import CartIcon from "../../components/icons/CartIcon";
import PersonIcon from "../../components/icons/PersonIcon";
import FolderIcon from "../../components/icons/FolderIcon";
import "./Step1.css";
import ProgressBar from "../../components/ui/ProgressBar";

const Step1 = ({ formData, setFormData, onNext, onCancel, isEditing }) => {
  const fileInputRef = useRef(null);
  const [leads, setLeads] = useState([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);

  // Fetch users for generic dropdown
  React.useEffect(() => {
    const fetchUsers = async () => {
      setIsLoadingLeads(true);
      try {
        const res = await fetch("/api/auth/users", {
          credentials: "include",
        });
        if (res.ok) {
          const users = await res.json();
          const mappedUsers = users.map((u) => ({
            value: u._id,
            label: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.name,
            avatar: true, // Assuming avatar logic exists in UserAvatar
          }));
          setLeads(mappedUsers);
        }
      } catch (err) {
        console.error("Failed to fetch users", err);
      } finally {
        setIsLoadingLeads(false);
      }
    };
    fetchUsers();
  }, []);

  const handleChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  const selectedLeadValue =
    formData.lead?.value || formData.lead || "";
  const leadDisplayName =
    formData.leadLabel ||
    leads.find((l) => l.value === formData.lead)?.label ||
    "Assigned Lead";

  const handleNextStep = () => {
    // Basic Validation
    if (!formData.projectName || !formData.lead) {
      alert("Please fill in Project Name and select a Lead.");
      return;
    }
    onNext();
  };

  return (
    <div className="step-container">
      {/* Header */}
      <div className="step-header">
        <button className="back-btn">
          <BackArrow />
        </button>
        <h1 className="header-title">Create Project</h1>
        <button className="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <div className="step-scrollable-content">
        {/* Progress */}
        <ProgressBar currentStep={1} />

        {/* Title */}
        <div className="order-title-section">
          <h2 className="order-title">{formData.orderId || "New Order"}</h2>
          <p className="order-subtitle">
            Please fill in the project details below.
          </p>
        </div>

        {/* Form Body */}
        <div className="form-body">
          {/* Row 1: Date & Time */}
          <div className="form-row">
            <Input
              type="date"
              label="Order Date"
              value={formData.orderDate}
              onChange={(e) => handleChange("orderDate", e.target.value)}
              icon={<CalendarIcon />
              }
              readOnly={isEditing} // Prevent changing order date when editing
            />
            <Input
              type="time"
              label="Received Time"
              value={formData.receivedTime}
              onChange={(e) => handleChange("receivedTime", e.target.value)}
              icon={<ClockIcon />}
               readOnly={isEditing}
            />
          </div>

          {/* Lead Assignment */}
          {formData.lead ? (
            <div className="input-group">
              <label className="input-label">Project Lead</label>
              <div
                style={{
                  padding: "0.75rem",
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <UserAvatar name={leadDisplayName} />
                <span style={{ color: "var(--text-primary)" }}>
                  {leadDisplayName}
                </span>
              </div>
            </div>
          ) : (
            <Select
              label={
                <>
                  Lead Assignment <span style={{ color: "#ef4444" }}>*</span>
                </>
              }
              options={leads}
              value={
                isLoadingLeads
                  ? null
                  : leads.find((l) => l.value === formData.lead) ||
                    formData.lead
              }
              onChange={(val) => handleChange("lead", val)}
              placeholder={isLoadingLeads ? "Loading users..." : "Select Lead"}
              renderValue={(option) => (
                <>
                  <UserAvatar name={option.label} />
                  <span>{option.label}</span>
                </>
              )}
              renderOption={(option) => (
                <>
                  <UserAvatar name={option.label} />
                  <span>{option.label}</span>
                </>
              )}
            />
          )}

          <Select
            label="Assistant Lead (Optional)"
            options={leads.filter((l) => l.value !== selectedLeadValue)}
            value={leads.find((l) => l.value === formData.assistantLeadId)}
            onChange={(val) => handleChange("assistantLeadId", val.value)}
            placeholder={isLoadingLeads ? "Loading users..." : "Select Assistant"}
            disabled={isEditing}
            renderValue={(option) => (
              <>
                <UserAvatar name={option.label} />
                <span>{option.label}</span>
              </>
            )}
            renderOption={(option) => (
              <>
                <UserAvatar name={option.label} />
                <span>{option.label}</span>
              </>
            )}
          />

          {/* Project Name */}
          <Input
            label="Project Name"
            placeholder="e.g. Summer Campaign 2024"
            value={formData.projectName}
            onChange={(e) => handleChange("projectName", e.target.value)}
            icon={<FolderIcon />}
             readOnly={isEditing}
          />

          {/* Client Name */}
          <Input
            label="Client Name"
            placeholder="e.g. MagicHands Corp"
            value={formData.client}
            onChange={(e) => handleChange("client", e.target.value)}
             readOnly={isEditing}
          />

          {/* Row: Delivery Date & Time */}
          <div className="form-row-three">
            <Input
              type="date"
              label="Delivery Date"
              value={formData.deliveryDate}
              onChange={(e) => handleChange("deliveryDate", e.target.value)}
              icon={<CalendarIcon />}
               readOnly={isEditing}
            />
            <Input
              type="time"
              label="Time"
              value={formData.deliveryTime}
              onChange={(e) => handleChange("deliveryTime", e.target.value)}
              icon={<ClockIcon />}
               readOnly={isEditing}
            />
          </div>

          {/* Delivery Location */}
          <Input
            label="Delivery Location"
            placeholder="e.g. 123 Business Park, Warehouse B"
            value={formData.deliveryLocation}
            onChange={(e) => handleChange("deliveryLocation", e.target.value)}
            icon={<LocationIcon />}
             readOnly={isEditing}
          />

          {/* Contact Type - Tabs/Pills */}
          <div className="contact-type-section">
            <label className="section-label">Contact Type</label>
            <div className="contact-type-options">
              {["MH", "None", "3rd Party"].map((type) => (
                <button
                  key={type}
                  className={`contact-pill ${
                    formData.contactType === type ? "active" : ""
                  }`}
                  onClick={() => handleChange("contactType", type)}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Supply Source */}
          <div className="supply-source-section">
            <label className="section-label">Supply Source</label>
            <CardOption
              icon={<HomeIcon />}
              label="In-house"
              checked={formData.supplySource === "in-house"}
              onChange={() => handleChange("supplySource", "in-house")}
            />
            <CardOption
              icon={<CartIcon />}
              label="Purchase"
              checked={formData.supplySource === "purchase"}
              onChange={() => handleChange("supplySource", "purchase")}
            />
            <CardOption
              icon={<PersonIcon />}
              label="Client Supply"
              checked={formData.supplySource === "client-supply"}
              onChange={() => handleChange("supplySource", "client-supply")}
            />
          </div>

          {/* Reference Materials Section */}
          <div className="reference-section" style={{ marginTop: "1.5rem" }}>
            <label className="section-label">Reference Materials</label>

            {!isEditing && (
              <div
                className="file-upload-multi"
                style={{ marginTop: "0.5rem" }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const newFiles = Array.from(e.target.files);
                    if (newFiles.length > 0) {
                      handleChange("files", [
                        ...(formData.files || []),
                        ...newFiles,
                      ]);
                      e.target.value = null;
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: "0.5rem 1rem",
                    background: "var(--primary-color)",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <FolderIcon width="16" height="16" />
                  Add Files
                </button>
                <div
                  style={{
                    marginTop: "0.5rem",
                    fontSize: "0.8rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  Any file type (images, PDFs, audio, video)
                </div>
              </div>
            )}

            {/* New Files Preview Grid */}
            {formData.files && formData.files.length > 0 && (
              <div
                style={{
                  marginTop: "1rem",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                  gap: "1rem",
                }}
              >
                {formData.files.map((file, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: "relative",
                      aspectRatio: "1",
                      borderRadius: "8px",
                      overflow: "hidden",
                      border: "1px solid var(--border-color)",
                      background: "#f8fafc",
                    }}
                  >
                    {file.type.startsWith("image/") ? (
                      <img
                        src={URL.createObjectURL(file)}
                        alt="Preview"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "0.5rem",
                          textAlign: "center",
                        }}
                      >
                        <FolderIcon width="24" height="24" color="#64748b" />
                        <span
                          style={{
                            fontSize: "0.7rem",
                            marginTop: "0.25rem",
                            wordBreak: "break-all",
                          }}
                        >
                          {file.name}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const remaining = formData.files.filter(
                          (_, i) => i !== idx,
                        );
                        handleChange("files", remaining);
                      }}
                      style={{
                        position: "absolute",
                        top: "4px",
                        right: "4px",
                        background: "rgba(239, 68, 68, 0.9)",
                        color: "white",
                        border: "none",
                        borderRadius: "50%",
                        width: "20px",
                        height: "20px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Unified Existing Reference Materials (Attachments & Sample Image) */}
            {(formData.attachments?.length > 0 || formData.sampleImage) && (
              <div
                style={{
                  marginTop: "1rem",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                  gap: "0.5rem",
                }}
              >
                {/* Prepare a unified list of existing files */}
                {[
                  ...(formData.sampleImage ? [formData.sampleImage] : []),
                  ...(formData.attachments || []),
                ].map((path, idx) => {
                  const isImage = path.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                  const fileName = path.split("/").pop();
                  return (
                    <Link
                      key={`exist-${idx}`}
                      to={`${path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      reloadDocument
                      style={{
                        position: "relative",
                        aspectRatio: "1",
                        border: "1px solid var(--border-color)",
                        borderRadius: "8px",
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(0,0,0,0.1)",
                        textDecoration: "none",
                      }}
                      title={fileName}
                    >
                      {isImage ? (
                        <img
                          src={`${path}`}
                          alt="reference"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            textAlign: "center",
                            padding: "0.5rem",
                            fontSize: "0.8rem",
                            color: "var(--text-secondary)",
                            overflow: "hidden",
                            width: "100%",
                          }}
                        >
                          <FolderIcon width="24" height="24" />
                          <div
                            style={{
                              marginTop: "0.25rem",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              color: "var(--text-primary)",
                              fontSize: "0.75rem",
                            }}
                          >
                            {fileName}
                          </div>
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="step-footer">
        <button className="next-btn" onClick={handleNextStep}>
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

export default Step1;
