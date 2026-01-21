import React from "react";
import Input from "../../../components/ui/Input";
import ProgressBar from "../../../components/ui/ProgressBar";
import BackArrow from "../../../components/icons/BackArrow";
import TrashIcon from "../../../components/icons/TrashIcon";

const QuoteStep2 = ({ formData, setFormData, onNext, onBack, onCancel }) => {
  const addItem = () => {
    const newItems = [
      ...(formData.items || []),
      { description: "", qty: 1, breakdown: "", department: "" },
    ];
    setFormData({ items: newItems });
  };

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    setFormData({ items: newItems });
  };

  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ items: newItems });
  };

  return (
    <div className="step-container">
      <div
        className="step-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2rem",
        }}
      >
        <button
          className="back-btn"
          onClick={onBack}
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          <BackArrow />
        </button>
        <h1
          className="header-title"
          style={{
            fontSize: "1.5rem",
            fontWeight: "700",
            color: "var(--text-primary)",
          }}
        >
          Order Breakdown
        </h1>
        <button
          className="cancel-btn"
          onClick={onCancel}
          style={{
            background: "none",
            border: "none",
            color: "#64748b",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>

      <div className="step-scrollable-content">
        <ProgressBar currentStep={2} totalSteps={5} />

        <div className="page-title-section" style={{ marginBottom: "2rem" }}>
          <h2
            className="page-title"
            style={{
              fontSize: "1.25rem",
              fontWeight: "600",
              color: "var(--text-primary)",
            }}
          >
            Order / Quantity Breakdown
          </h2>
          <p className="page-subtitle" style={{ color: "#64748b" }}>
            Review and adjust the specific quantities and descriptions for this
            order.
          </p>
        </div>

        <div
          className="quote-items-container"
          style={{
            background: "var(--bg-card)",
            padding: "2rem",
            borderRadius: "12px",
            border: "1px solid var(--border-color)",
          }}
        >
          {(formData.items || []).length === 0 && (
            <p
              style={{ color: "#64748b", textAlign: "center", padding: "2rem" }}
            >
              No items added yet. Click "+ Add Item" to begin.
            </p>
          )}

          {(formData.items || []).map((item, idx) => (
            <div
              key={idx}
              className="item-row"
              style={{
                display: "grid",
                gridTemplateColumns: "3fr 1fr 2fr 2fr 40px",
                gap: "1rem",
                alignItems: "end",
                marginBottom: "1.5rem",
                padding: "1rem",
                background: "rgba(255,255,255,0.02)",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
              }}
            >
              <Input
                label={idx === 0 ? "Description" : ""}
                placeholder="Item Description"
                value={item.description}
                onChange={(e) => updateItem(idx, "description", e.target.value)}
              />
              <Input
                type="number"
                label={idx === 0 ? "Qty" : ""}
                placeholder="Qty"
                value={item.qty}
                onChange={(e) => updateItem(idx, "qty", e.target.value)}
              />
              <Input
                label={idx === 0 ? "Breakdown" : ""}
                placeholder="Size/Style breakdown"
                value={item.breakdown}
                onChange={(e) => updateItem(idx, "breakdown", e.target.value)}
              />
              <Input
                label={idx === 0 ? "Department" : ""}
                placeholder="Assigned Dept"
                value={item.department}
                onChange={(e) => updateItem(idx, "department", e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="btn-remove"
                style={{
                  height: "42px",
                  padding: "0",
                  background: "#ef4444",
                  border: "none",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
              >
                <TrashIcon />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addItem}
            className="btn-add"
            style={{
              background: "#10b981",
              color: "white",
              padding: "0.75rem 1.5rem",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontWeight: "600",
              marginTop: "1rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            + Add Item
          </button>
        </div>
      </div>

      <div
        className="step-footer"
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "2rem",
          padding: "1.5rem 0",
          borderTop: "1px solid var(--border-color)",
        }}
      >
        <button
          className="back-text-btn"
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: "#64748b",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          Back
        </button>
        <button
          className="next-btn"
          onClick={onNext}
          style={{
            background: "var(--primary-color)",
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

export default QuoteStep2;
