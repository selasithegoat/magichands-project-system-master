import React, { useState } from "react";
import Input from "../ui/Input";
import Select from "../ui/Select";
import CardOption from "../ui/CardOption";
import UserAvatar from "../ui/UserAvatar";
import BackArrow from "../icons/BackArrow";
import CalendarIcon from "../icons/CalendarIcon";
import ClockIcon from "../icons/ClockIcon";
import LocationIcon from "../icons/LocationIcon";
import HomeIcon from "../icons/HomeIcon";
import CartIcon from "../icons/CartIcon";
import PersonIcon from "../icons/PersonIcon";
import "./Step1.css";
import ProgressBar from "../ui/ProgressBar";

const Step1 = ({ onNext }) => {
  // State for form fields
  const [lead, setLead] = useState({ value: "sarah", label: "Sarah Jenkins" });
  const [supplySource, setSupplySource] = useState("in-house");
  const [contactType, setContactType] = useState("MH"); // MH, None, 3rd Party

  const leads = [
    { value: "sarah", label: "Sarah Jenkins", avatar: true },
    { value: "mike", label: "Mike Ross", avatar: true },
    { value: "jessica", label: "Jessica Pearson", avatar: true },
  ];

  return (
    <div className="step-container">
      {/* Header */}
      <div className="step-header">
        <button className="back-btn">
          <BackArrow />
        </button>
        <h1 className="header-title">Create Project</h1>
        <div style={{ width: 24 }}></div> {/* Spacer */}
      </div>

      <div className="step-scrollable-content">
        {/* Progress */}
        <ProgressBar currentStep={1} />

        {/* Title */}
        <div className="order-title-section">
          <h2 className="order-title">Order #1024-B</h2>
          <p className="order-subtitle">
            Please fill in the project details below.
          </p>
        </div>

        {/* Form Body */}
        <div className="form-body">
          {/* Row 1: Date & Time (Readonly style in design, but we'll make them Inputs) */}
          <div className="form-row">
            <Input
              type="date"
              label="Order Date"
              value={new Date().toISOString().split("T")[0]}
              icon={<CalendarIcon />}
              readOnly
            />
            <Input
              type="time"
              label="Received Time"
              value={new Date().toISOString().split("T")[1]}
              icon={<ClockIcon />}
              readOnly
            />
          </div>

          {/* Lead Assignment */}
          <Select
            label="Lead Assignment"
            options={leads}
            value={lead}
            onChange={setLead}
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
            placeholder="e.g. Summer Campaign Banner"
          />

          {/* Row: Delivery Date & Time */}
          <div className="form-row">
            <Input
              type="date"
              label="Delivery Date"
              value={new Date().toISOString().split("T")[0]}
              icon={<CalendarIcon />}
            />
            <Input
              type="time"
              label="Time"
              value={new Date().toISOString().split("T")[1]}
              icon={<ClockIcon />}
            />
          </div>

          {/* Delivery Location */}
          <Input
            label="Delivery Location"
            placeholder="e.g. 123 Business Park, Warehouse B"
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
                    contactType === type ? "active" : ""
                  }`}
                  onClick={() => setContactType(type)}
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
              checked={supplySource === "in-house"}
              onChange={() => setSupplySource("in-house")}
            />
            <CardOption
              icon={<CartIcon />}
              label="Purchase"
              checked={supplySource === "purchase"}
              onChange={() => setSupplySource("purchase")}
            />
            <CardOption
              icon={<PersonIcon />}
              label="Client Supply"
              checked={supplySource === "client-supply"}
              onChange={() => setSupplySource("client-supply")}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="step-footer">
        <button className="next-btn" onClick={onNext}>
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
