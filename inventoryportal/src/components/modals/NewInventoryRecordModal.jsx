import { useEffect, useMemo, useState } from "react";
import Modal from "../ui/Modal";
import "./NewInventoryRecordModal.css";

const DEFAULT_FORM = {
  itemName: "",
  sku: "",
  category: "Electronics",
  condition: "New",
  status: "In Stock",
  quantity: "0",
  unitPrice: "0.00",
  warehouse: "Main Warehouse",
  location: "",
  reorderLevel: "20",
  supplier: "",
  tags: "",
  imageFile: null,
  notes: "",
};

const NewInventoryRecordModal = ({ isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [imagePreview, setImagePreview] = useState("");
  const [imageName, setImageName] = useState("");
  const [showWarehouseInput, setShowWarehouseInput] = useState(false);

  useEffect(() => {
    if (!imagePreview) return undefined;
    return () => URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  const totalValue = useMemo(() => {
    const qty = Number.parseFloat(formData.quantity || "0");
    const price = Number.parseFloat(formData.unitPrice || "0");
    if (Number.isNaN(qty) || Number.isNaN(price)) {
      return "$0.00";
    }
    return `$${(qty * price).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }, [formData.quantity, formData.unitPrice]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setImagePreview("");
      setImageName("");
      setFormData((prev) => ({ ...prev, imageFile: null }));
      return;
    }

    setImageName(file.name);
    setFormData((prev) => ({ ...prev, imageFile: file }));
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
  };

  const handleWarehouseChange = (event) => {
    const { value } = event.target;
    if (value === "__add_new__") {
      setShowWarehouseInput(true);
      setFormData((prev) => ({ ...prev, warehouse: "" }));
      return;
    }

    setShowWarehouseInput(false);
    setFormData((prev) => ({ ...prev, warehouse: value }));
  };

  const handleConditionChange = (condition) => {
    setFormData((prev) => ({ ...prev, condition }));
  };

  const handleSave = () => {
    onSave?.(formData);
    onClose?.();
    setFormData(DEFAULT_FORM);
    setImagePreview("");
    setImageName("");
    setShowWarehouseInput(false);
  };

  const handleClose = () => {
    onClose?.();
    setFormData(DEFAULT_FORM);
    setImagePreview("");
    setImageName("");
    setShowWarehouseInput(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Add New Inventory Record"
      subtitle="Capture item details, stock levels, and supplier information."
      primaryText="Save Record"
      secondaryText="Cancel"
      onConfirm={handleSave}
      onClose={handleClose}
      variant="side"
    >
      <form className="record-form">
        <div className="form-grid">
          <section className="form-section">
            <div className="section-title">Item Details</div>
            <label className="field">
              Item Name
              <input
                name="itemName"
                type="text"
                placeholder="e.g. Pro-G Wireless Mouse"
                value={formData.itemName}
                onChange={handleChange}
              />
            </label>
            <label className="field">
              Item ID
              <input
                name="sku"
                type="text"
                placeholder="e.g. MS-G903-BK"
                value={formData.sku}
                onChange={handleChange}
              />
            </label>
            <label className="field">
              Category
              <select name="category" value={formData.category} onChange={handleChange}>
                <option>Electronics</option>
                <option>Peripherals</option>
                <option>Accessories</option>
                <option>Office</option>
                <option>Hardware</option>
              </select>
            </label>
            <div className="field">
              Condition
              <div className="pill-options">
                {["New", "Refurbished", "Used"].map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`pill-option ${
                      formData.condition === option ? "active" : ""
                    }`}
                    onClick={() => handleConditionChange(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              Item Image
              <div className="file-upload">
                <label className="file-input">
                  <input
                    key={imageName || "empty"}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                  />
                  Upload image
                </label>
                <div className="file-meta">
                  <span>{imageName || "No file selected"}</span>
                  <span className="field-help">PNG or JPG, up to 5MB</span>
                </div>
              </div>
              {imagePreview ? (
                <div className="file-preview">
                  <img src={imagePreview} alt="Preview" />
                </div>
              ) : null}
            </div>
          </section>

          <section className="form-section">
            <div className="section-title">Stock & Location</div>
            <div className="inline-row">
              <label className="field">
                Quantity
                <input
                  name="quantity"
                  type="number"
                  min="0"
                  value={formData.quantity}
                  onChange={handleChange}
                />
              </label>
              <label className="field">
                Status
                <select name="status" value={formData.status} onChange={handleChange}>
                  <option>In Stock</option>
                  <option>Low Stock</option>
                  <option>Oversupply</option>
                  <option>Critical</option>
                </select>
              </label>
            </div>
            <label className="field">
              Warehouse
              <select
                name="warehouse"
                value={formData.warehouse || "__add_new__"}
                onChange={handleWarehouseChange}
              >
                <option>Main Warehouse</option>
                <option>Central Hub</option>
                <option>Warehouse B</option>
                <option>Warehouse C</option>
                <option value="__add_new__">Add new...</option>
              </select>
              {showWarehouseInput ? (
                <input
                  name="warehouse"
                  type="text"
                  placeholder="Enter new warehouse name"
                  value={formData.warehouse}
                  onChange={handleChange}
                />
              ) : null}
            </label>
            <div className="inline-row">
              <label className="field">
                Bin / Location
                <input
                  name="location"
                  type="text"
                  placeholder="e.g. A-04-12"
                  value={formData.location}
                  onChange={handleChange}
                />
              </label>
              <label className="field">
                Reorder Level
                <input
                  name="reorderLevel"
                  type="number"
                  min="0"
                  value={formData.reorderLevel}
                  onChange={handleChange}
                />
              </label>
            </div>
          </section>
        </div>

        <div className="form-grid">
          <section className="form-section">
            <div className="section-title">Pricing & Supplier</div>
            <div className="inline-row">
              <label className="field">
                Unit Price
                <input
                  name="unitPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.unitPrice}
                  onChange={handleChange}
                />
              </label>
              <div className="field value-preview">
                <div>
                  Total Value
                  <strong>{totalValue}</strong>
                </div>
                <span className="field-help">Auto-calculated</span>
              </div>
            </div>
            <label className="field">
              Supplier
              <input
                name="supplier"
                type="text"
                placeholder="e.g. Global Tech Solutions"
                value={formData.supplier}
                onChange={handleChange}
              />
            </label>
            <label className="field">
              Tags
              <input
                name="tags"
                type="text"
                placeholder="Semiconductors, QA Approved"
                value={formData.tags}
                onChange={handleChange}
              />
              <span className="field-help">Separate tags with commas.</span>
            </label>
          </section>

          <section className="form-section">
            <div className="section-title">Notes</div>
            <label className="field">
              Internal Notes
              <textarea
                name="notes"
                placeholder="Add storage handling, inspection, or reorder notes..."
                value={formData.notes}
                onChange={handleChange}
              />
            </label>
          </section>
        </div>
      </form>
    </Modal>
  );
};

export default NewInventoryRecordModal;
