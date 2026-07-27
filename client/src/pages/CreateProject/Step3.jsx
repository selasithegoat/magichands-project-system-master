import React from "react";
import Input from "../../components/ui/Input";
import BackArrow from "../../components/icons/BackArrow";
import TrashIcon from "../../components/icons/TrashIcon";
import PlusCircleIcon from "../../components/icons/PlusCircleIcon";
import "./Step3.css";
import ProgressBar from "../../components/ui/ProgressBar";
import ProductionAssignmentsEditor from "../../components/features/ProductionAssignmentsEditor";

const Step3 = ({
  formData,
  setFormData,
  onNext,
  onBack,
  onCancel,
  assignmentOnly = false,
  showAssignments = true,
  stepNumber = 3,
}) => {
  const items = formData.items || [];

  // Initialize with default items if empty (optional, but good for demo)
  // React.useEffect(() => {
  //   if (items.length === 0) {
  //      setFormData({ items: [ ...defaultItems ] });
  //   }
  // }, []);

  const addItem = () => {
    const newId =
      Date.now().toString() + Math.random().toString(36).substr(2, 5);
    const newItems = [
      ...items,
      {
        id: newId,
        description: "",
        breakdown: "",
        qty: 1,
        productionAssignments: [],
      },
    ];
    setFormData({ items: newItems });
  };

  const deleteItem = (id) => {
    const newItems = items.filter((item) => item.id !== id);
    setFormData({ items: newItems });
  };

  const updateItem = (id, field, value) => {
    const newItems = items.map((item) =>
      item.id === id ? { ...item, [field]: value } : item,
    );
    setFormData({ items: newItems });
  };

  const totalItems = items.reduce(
    (sum, item) => sum + (parseInt(item.qty) || 0),
    0,
  );

  return (
    <div className="step-container">
      {/* Header */}
      <div className="step-header">
        <button className="back-btn" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="header-title">New Project</h1>
        <button className="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <div className="step-scrollable-content">
        {/* Progress Bar */}
        <ProgressBar currentStep={stepNumber} />

        {/* Title */}
        <div className="page-title-section">
          <h2 className="page-title">
            {assignmentOnly
              ? "Assign Production Departments"
              : "Order Quantity Breakdown"}
          </h2>
          <p className="page-subtitle">
            {assignmentOnly
              ? "Production department assignments are optional and can be completed after the project is accepted."
              : "Please list all items, their breakdown, and quantities required."}
          </p>
        </div>

        {/* Items List */}
        <div className="items-list">
          {items.map((item, index) => (
            <div key={item.id} className="item-card">
              <div className="item-card-header">
                <div className="item-number-badge">{index + 1}</div>
                <span className="item-card-title">Item Details</span>
                {!assignmentOnly && (
                  <button
                    className="delete-btn"
                    onClick={() => deleteItem(item.id)}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>

              <div className="item-card-body">
                <Input
                  label="ITEM DESCRIPTION"
                  value={item.description}
                  onChange={(e) =>
                    updateItem(item.id, "description", e.target.value)
                  }
                  placeholder="e.g. Office Chairs"
                  disabled={assignmentOnly}
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
                      disabled={assignmentOnly}
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
                      disabled={assignmentOnly}
                    />
                  </div>
                </div>
                {showAssignments && (
                  <ProductionAssignmentsEditor
                    assignments={item.productionAssignments}
                    onChange={(productionAssignments) =>
                      updateItem(
                        item.id,
                        "productionAssignments",
                        productionAssignments,
                      )
                    }
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add Button */}
        {!assignmentOnly && (
          <button className="add-item-btn" onClick={addItem}>
            <PlusCircleIcon />
            <span>Add Another Item</span>
          </button>
        )}

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
