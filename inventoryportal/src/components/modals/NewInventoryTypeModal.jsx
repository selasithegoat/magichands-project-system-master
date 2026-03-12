import { useState } from "react";
import Modal from "../ui/Modal";
import "./NewInventoryTypeModal.css";

const DEFAULT_FORM = {
  name: "",
  description: "",
  status: "Active",
  visibility: "Internal",
  warehouse: "Main Warehouse",
  owner: "",
  tags: "",
};

const NewInventoryTypeModal = ({ isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState(DEFAULT_FORM);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    if (!formData.name.trim()) return;
    onSave?.(formData);
    setFormData(DEFAULT_FORM);
  };

  const handleClose = () => {
    onClose?.();
    setFormData(DEFAULT_FORM);
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Create Inventory Type"
      subtitle="Set the base schema before defining fields and attributes."
      primaryText="Create Type"
      secondaryText="Cancel"
      onConfirm={handleSave}
      onClose={handleClose}
      variant="side"
    >
      <form className="type-form">
        <section className="type-section">
          <div className="section-title">Basic Information</div>
          <label className="field">
            Inventory Type Name
            <input
              name="name"
              type="text"
              placeholder="e.g. Raw Materials"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </label>
          <label className="field">
            Description
            <textarea
              name="description"
              placeholder="Describe what this inventory type will include..."
              value={formData.description}
              onChange={handleChange}
            />
          </label>
        </section>

        <section className="type-section">
          <div className="section-title">Classification</div>
          <div className="inline-row">
            <label className="field">
              Status
              <select name="status" value={formData.status} onChange={handleChange}>
                <option>Active</option>
                <option>Paused</option>
                <option>Archived</option>
              </select>
            </label>
            <label className="field">
              Visibility
              <select
                name="visibility"
                value={formData.visibility}
                onChange={handleChange}
              >
                <option>Internal</option>
                <option>Client Facing</option>
                <option>Restricted</option>
              </select>
            </label>
          </div>
          <label className="field">
            Default Warehouse
            <select
              name="warehouse"
              value={formData.warehouse}
              onChange={handleChange}
            >
              <option>Main Warehouse</option>
              <option>Central Hub</option>
              <option>Warehouse B</option>
              <option>Warehouse C</option>
            </select>
          </label>
        </section>

        <section className="type-section">
          <div className="section-title">Ownership</div>
          <label className="field">
            Data Owner
            <input
              name="owner"
              type="text"
              placeholder="e.g. Procurement Team"
              value={formData.owner}
              onChange={handleChange}
            />
          </label>
          <label className="field">
            Tags
            <input
              name="tags"
              type="text"
              placeholder="Production, High Priority"
              value={formData.tags}
              onChange={handleChange}
            />
            <span className="field-help">Separate tags with commas.</span>
          </label>
        </section>
      </form>
    </Modal>
  );
};

export default NewInventoryTypeModal;
