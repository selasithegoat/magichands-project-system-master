import React, { useState } from "react";
import Input from "../ui/Input";
import BackArrow from "../icons/BackArrow";
import TrashIcon from "../icons/TrashIcon";
import PlusCircleIcon from "../icons/PlusCircleIcon";
import "./Step3.css";
import ProgressBar from "../ui/ProgressBar";

const Step3 = ({ onNext, onBack }) => {
  const [items, setItems] = useState([
    {
      id: 1,
      description: "Office Chairs Model X",
      breakdown: "Lobby Area",
      qty: 15,
    },
    {
      id: 2,
      description: "Conference Table Large",
      breakdown: "Main Meeting Room",
      qty: 1,
    },
  ]);

  const addItem = () => {
    const newId =
      items.length > 0 ? Math.max(...items.map((i) => i.id)) + 1 : 1;
    setItems([...items, { id: newId, description: "", breakdown: "", qty: 0 }]);
  };

  const deleteItem = (id) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const updateItem = (id, field, value) => {
    setItems(
      items.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const totalItems = items.reduce(
    (sum, item) => sum + (parseInt(item.qty) || 0),
    0
  );

  return (
    <div className="step-container">
      {/* Header */}
      <div className="step-header">
        <button className="back-btn" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="header-title">New Project</h1>
        <div style={{ width: 24 }}></div>
      </div>

      <div className="step-scrollable-content">
        {/* Progress Bar */}
        <ProgressBar currentStep={3} />

        {/* Title */}
        <div className="page-title-section">
          <h2 className="page-title">Order Quantity Breakdown</h2>
          <p className="page-subtitle">
            Please list all items, their location breakdown, and quantities
            required.
          </p>
        </div>

        {/* Items List */}
        <div className="items-list">
          {items.map((item, index) => (
            <div key={item.id} className="item-card">
              <div className="item-card-header">
                <div className="item-number-badge">{index + 1}</div>
                <span className="item-card-title">Item Details</span>
                <button
                  className="delete-btn"
                  onClick={() => deleteItem(item.id)}
                >
                  <TrashIcon />
                </button>
              </div>

              <div className="item-card-body">
                <Input
                  label="ITEM DESCRIPTION"
                  value={item.description}
                  onChange={(e) =>
                    updateItem(item.id, "description", e.target.value)
                  }
                  placeholder="e.g. Office Chairs"
                />

                <div className="item-row-split">
                  <div style={{ flex: 7 }}>
                    <Input
                      label="BREAKDOWN"
                      value={item.breakdown}
                      onChange={(e) =>
                        updateItem(item.id, "breakdown", e.target.value)
                      }
                      placeholder="e.g. Lobby Area"
                    />
                  </div>
                  <div style={{ flex: 3 }}>
                    <Input
                      label="QTY"
                      type="number"
                      value={item.qty}
                      onChange={(e) =>
                        updateItem(item.id, "qty", e.target.value)
                      }
                      className="qty-input"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add Button */}
        <button className="add-item-btn" onClick={addItem}>
          <PlusCircleIcon />
          <span>Add Another Item</span>
        </button>

        <div className="total-items-display">
          <span>Total Items:</span>
          <span className="total-count">{totalItems}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="step-footer footer-split">
        <button className="back-text-btn" onClick={onBack}>
          Back
        </button>
        <button className="next-btn-small" onClick={onNext}>
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

export default Step3;
