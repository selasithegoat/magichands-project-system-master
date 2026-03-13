import { useMemo, useState } from "react";
import {
  ColumnsIcon,
  EditIcon,
  MoreVerticalIcon,
  PlusIcon,
  TrashIcon,
} from "../../components/icons/Icons";
import { inventoryTypeRows, inventoryTypeFields } from "../../data/inventoryTypes";
import NewInventoryTypeModal from "../../components/modals/NewInventoryTypeModal";
import "./InventoryTypes.css";

const InventoryTypes = () => {
  const [typeRows, setTypeRows] = useState(inventoryTypeRows);
  const [fieldRows, setFieldRows] = useState(inventoryTypeFields);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [selectedTypeId, setSelectedTypeId] = useState(
    inventoryTypeRows[0]?.id || null,
  );
  const [isNewTypeOpen, setIsNewTypeOpen] = useState(false);

  const fieldTypeOptions = [
    "Text",
    "Number",
    "Currency",
    "Date",
    "Dropdown",
    "Attachment",
  ];

  const handleAddField = () => {
    if (!selectedTypeId) return;
    setBuilderOpen(true);
    setFieldRows((prev) => [
      ...prev,
      {
        id: `field-${Date.now()}`,
        name: "",
        type: "Text",
        required: false,
        defaultValue: "",
      },
    ]);
  };

  const getDefaultValueForType = (type) => {
    switch (type) {
      case "Number":
        return "0";
      case "Currency":
        return "0.00";
      case "Date":
        return "";
      case "Dropdown":
        return "";
      case "Attachment":
        return "";
      default:
        return "";
    }
  };

  const handleFieldChange = (id, key, value) => {
    setFieldRows((prev) =>
      prev.map((field) =>
        field.id === id ? { ...field, [key]: value } : field,
      ),
    );
  };

  const handleTypeChange = (id, value) => {
    setFieldRows((prev) =>
      prev.map((field) =>
        field.id === id
          ? {
              ...field,
              type: value,
              defaultValue: getDefaultValueForType(value),
            }
          : field,
      ),
    );
  };

  const renderDefaultInput = (field) => {
    if (field.type === "Number") {
      return (
        <input
          type="number"
          className="default-input"
          value={field.defaultValue}
          onChange={(event) =>
            handleFieldChange(field.id, "defaultValue", event.target.value)
          }
        />
      );
    }

    if (field.type === "Currency") {
      return (
        <input
          type="number"
          step="0.01"
          className="default-input"
          value={field.defaultValue}
          onChange={(event) =>
            handleFieldChange(field.id, "defaultValue", event.target.value)
          }
        />
      );
    }

    if (field.type === "Date") {
      return (
        <input
          type="date"
          className="default-input"
          value={field.defaultValue}
          onChange={(event) =>
            handleFieldChange(field.id, "defaultValue", event.target.value)
          }
        />
      );
    }

    if (field.type === "Attachment") {
      return (
        <input
          type="text"
          className="default-input"
          value="Not applicable"
          disabled
          readOnly
        />
      );
    }

    return (
      <input
        type="text"
        className="default-input"
        placeholder={field.type === "Dropdown" ? "Default option" : "Default value"}
        value={field.defaultValue}
        onChange={(event) =>
          handleFieldChange(field.id, "defaultValue", event.target.value)
        }
      />
    );
  };

  const handleRemoveField = (id) => {
    setFieldRows((prev) => prev.filter((field) => field.id !== id));
  };

  const handleDragStart = (id) => (event) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setDragId(id);
  };

  const handleDragOver = (id) => (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverId(id);
  };

  const handleDrop = (id) => (event) => {
    event.preventDefault();
    const draggedId = dragId || event.dataTransfer.getData("text/plain");
    if (!draggedId || draggedId === id) {
      setDragOverId(null);
      return;
    }

    setFieldRows((prev) => {
      const fromIndex = prev.findIndex((field) => field.id === draggedId);
      const toIndex = prev.findIndex((field) => field.id === id);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setDragId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
  };

  const handleDiscard = () => {
    setFieldRows(inventoryTypeFields);
    setBuilderOpen(false);
  };

  const handleCreateType = (formData) => {
    const created = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
    const newType = {
      id: `type-${Date.now()}`,
      name: formData.name,
      description: formData.description || "No description added.",
      fields: 0,
      records: "0",
      created,
    };
    setTypeRows((prev) => [newType, ...prev]);
    setSelectedTypeId(newType.id);
    setIsNewTypeOpen(false);
  };

  const selectedType = useMemo(
    () => typeRows.find((row) => row.id === selectedTypeId),
    [typeRows, selectedTypeId],
  );

  return (
    <section className="inventory-types">
      <header className="types-header">
        <div>
          <h2>Inventory Types</h2>
          <p>Define and manage the data schema for your enterprise assets.</p>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => setIsNewTypeOpen(true)}
        >
          <PlusIcon className="button-icon" />
          Create Inventory Type
        </button>
      </header>

      <div className="types-table mobile-card-table">
        <div className="table-header">
          <span>Inventory Type Name</span>
          <span>Description</span>
          <span>Fields</span>
          <span>Records</span>
          <span>Created Date</span>
          <span>Actions</span>
        </div>
        <div className="table-body">
          {typeRows.map((row) => (
            <div
              role="button"
              tabIndex={0}
              className={`table-row ${row.id === selectedTypeId ? "active" : ""}`}
              key={row.id}
              onClick={() => setSelectedTypeId(row.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedTypeId(row.id);
                }
              }}
            >
              <div className="cell type-name full" data-label="Type">
                <strong>{row.name}</strong>
              </div>
              <div className="cell muted full" data-label="Description">
                {row.description}
              </div>
              <div className="cell" data-label="Fields">
                <span className="count-pill">
                  {row.fields}
                  <span>Fields</span>
                </span>
              </div>
              <div className="cell" data-label="Records">
                {row.records}
              </div>
              <div className="cell muted" data-label="Created">
                {row.created}
              </div>
              <div className="cell actions-cell full" data-label="Actions">
                <button
                  type="button"
                  className="action-button"
                  aria-label="Edit"
                  onClick={(event) => event.stopPropagation()}
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="action-button"
                  aria-label="Duplicate"
                  onClick={(event) => event.stopPropagation()}
                >
                  <ColumnsIcon />
                </button>
                <button
                  type="button"
                  className="action-button"
                  aria-label="Archive"
                  onClick={(event) => event.stopPropagation()}
                >
                  <TrashIcon />
                </button>
                <button
                  type="button"
                  className="action-button"
                  aria-label="More"
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreVerticalIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <section className="field-builder">
        <div className="field-builder-header">
          <div className="builder-title">
            <ColumnsIcon />
            <div>
              <strong>Field Builder:</strong>{" "}
              {selectedType ? selectedType.name : "Select a type"}
            </div>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={handleAddField}
            disabled={!selectedTypeId}
          >
            <PlusIcon className="button-icon" />
            Add Field
          </button>
        </div>

        {builderOpen ? (
          <>
            <div className="builder-table mobile-card-table">
              <div className="table-header">
                <span />
                <span>Field Name</span>
                <span>Field Type</span>
                <span>Required</span>
                <span>Default Value</span>
                <span>Actions</span>
              </div>
              <div className="table-body">
                {fieldRows.map((field) => (
                  <div
                    className={`table-row${dragOverId === field.id ? " drag-over" : ""}`}
                    key={field.id}
                    onDragOver={handleDragOver(field.id)}
                    onDrop={handleDrop(field.id)}
                  >
                    <div className="cell drag-cell full" data-label="Reorder">
                      <span
                        className="drag-handle"
                        draggable
                        onDragStart={handleDragStart(field.id)}
                        onDragEnd={handleDragEnd}
                        aria-label="Reorder field"
                        title="Drag to reorder"
                      >
                        ::
                      </span>
                    </div>
                    <div className="cell full" data-label="Field Name">
                      <input
                        type="text"
                        className="field-input"
                        placeholder="Field name"
                        value={field.name}
                        onChange={(event) =>
                          handleFieldChange(field.id, "name", event.target.value)
                        }
                      />
                    </div>
                    <div className="cell" data-label="Field Type">
                      <select
                        className="field-select"
                        value={field.type}
                        onChange={(event) =>
                          handleTypeChange(field.id, event.target.value)
                        }
                      >
                        {fieldTypeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="cell" data-label="Required">
                      <input
                        type="checkbox"
                        className="required-checkbox"
                        checked={field.required}
                        onChange={(event) =>
                          handleFieldChange(field.id, "required", event.target.checked)
                        }
                      />
                    </div>
                    <div className="cell full" data-label="Default Value">
                      {renderDefaultInput(field)}
                    </div>
                    <div className="cell actions-cell full" data-label="Actions">
                      <button
                        type="button"
                        className="action-button"
                        aria-label="Remove"
                        onClick={() => handleRemoveField(field.id)}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="builder-actions">
              <button type="button" className="ghost-button" onClick={handleDiscard}>
                Discard Changes
              </button>
              <button type="button" className="primary-button">
                Save Schema
              </button>
            </div>
          </>
        ) : (
          <div className="builder-empty">
            <p>
              {selectedTypeId
                ? "No fields yet. Click “Add Field” to start building this type."
                : "Select an inventory type to start building fields."}
            </p>
          </div>
        )}
      </section>

      <section className="field-toolbar">
        {[
          { label: "Text", icon: "Tt" },
          { label: "Number", icon: "123" },
          { label: "Currency", icon: "$" },
          { label: "Date", icon: "DT" },
          { label: "Dropdown", icon: "▾" },
          { label: "Attachment", icon: "+" },
        ].map((tool) => (
          <button type="button" className="tool-card" key={tool.label}>
            <span className="tool-icon">{tool.icon}</span>
            <span className="tool-label">{tool.label}</span>
          </button>
        ))}
      </section>

      <NewInventoryTypeModal
        isOpen={isNewTypeOpen}
        onClose={() => setIsNewTypeOpen(false)}
        onSave={handleCreateType}
      />
    </section>
  );
};

export default InventoryTypes;
