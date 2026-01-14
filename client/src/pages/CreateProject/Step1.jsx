import React, { useState } from "react";
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

const Step1 = ({ formData, setFormData, onNext, onCancel }) => {
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
    setFormData({ [field]: value });
  };

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
              icon={<CalendarIcon />}
            />
            <Input
              type="time"
              label="Received Time"
              value={formData.receivedTime}
              onChange={(e) => handleChange("receivedTime", e.target.value)}
              icon={<ClockIcon />}
            />
          </div>

          {/* Lead Assignment */}
          <Select
            label="Lead Assignment"
            options={leads}
            value={
              isLoadingLeads
                ? null
                : leads.find((l) => l.value === formData.lead) || formData.lead
            }
            onChange={(val) => handleChange("lead", val)}
            placeholder={isLoadingLeads ? "Loading users..." : "Select Lead"}
            renderValue={(option) => (
              <>
                <UserAvatar />
                <span>{option.label}</span>
              </>
            )}
            renderOption={(option) => (
              <>
                <UserAvatar />
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
          />

          {/* Client Name */}
          <Input
            label="Client Name"
            placeholder="e.g. MagicHands Corp"
            value={formData.client}
            onChange={(e) => handleChange("client", e.target.value)}
          />

          {/* Row: Delivery Date & Time */}
          <div className="form-row-three">
            <Input
              type="date"
              label="Delivery Date"
              value={formData.deliveryDate}
              onChange={(e) => handleChange("deliveryDate", e.target.value)}
              icon={<CalendarIcon />}
            />
            <Input
              type="time"
              label="Time"
              value={formData.deliveryTime}
              onChange={(e) => handleChange("deliveryTime", e.target.value)}
              icon={<ClockIcon />}
            />
          </div>

          {/* Delivery Location */}
          <Input
            label="Delivery Location"
            placeholder="e.g. 123 Business Park, Warehouse B"
            value={formData.deliveryLocation}
            onChange={(e) => handleChange("deliveryLocation", e.target.value)}
            icon={<LocationIcon />}
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
