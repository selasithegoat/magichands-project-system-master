import { useEffect, useState } from "react";
import {
  BuildingIcon,
  ChevronDownIcon,
  ClockIcon,
  DownloadIcon,
  EditIcon,
  FileTextIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrashIcon,
} from "../../components/icons/Icons";
import Modal from "../../components/ui/Modal";
import { fetchInventory, parseListResponse } from "../../utils/inventoryApi";
import { buildPaginationRange } from "../../utils/pagination";
import "./Suppliers.css";

const getStatusClass = (status) =>
  `po-pill ${String(status || "").toLowerCase()}`;

const DEFAULT_LIMIT = 4;

const Suppliers = () => {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [meta, setMeta] = useState({
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 0,
  });
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    contactPerson: "",
    role: "",
    phone: "",
    email: "",
    products: "",
    tone: "blue",
    openPOLabel: "",
    openPOStatus: "open",
  });
  const [actionError, setActionError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const triggerRefresh = () => setRefreshKey((prev) => prev + 1);

  useEffect(() => {
    let isMounted = true;

    const loadSuppliers = async () => {
      try {
        const payload = await fetchInventory(
          `/api/inventory/suppliers?page=${page}&limit=${DEFAULT_LIMIT}`,
        );
        const parsed = parseListResponse(payload);
        const normalized = parsed.data.map((supplier, index) => ({
          id: supplier._id || supplier.id || `${index}`,
          code: supplier.code || "",
          name: supplier.name || "",
          contactPerson: supplier.contactPerson || "",
          role: supplier.role || "",
          phone: supplier.phone || "",
          email: supplier.email || "",
          products: Array.isArray(supplier.products) ? supplier.products : [],
          openPO: supplier.openPO || { label: "-", status: "" },
          tone: supplier.tone || "blue",
        }));

        if (!isMounted) return;
        if (parsed.totalPages && page > parsed.totalPages) {
          setPage(parsed.totalPages);
          return;
        }
        setRows(normalized);
        setMeta({
          limit: parsed.limit || DEFAULT_LIMIT,
          total: parsed.total,
          totalPages: parsed.totalPages,
        });
        setError("");
      } catch (err) {
        if (!isMounted) return;
        setRows([]);
        setMeta((prev) => ({ ...prev, total: 0, totalPages: 0 }));
        setError(err?.message || "Unable to load suppliers.");
      }
    };

    loadSuppliers();
    return () => {
      isMounted = false;
    };
  }, [page, refreshKey]);

  const total = meta.total || rows.length;
  const startIndex = total ? (page - 1) * meta.limit + 1 : 0;
  const endIndex = total ? Math.min(startIndex + rows.length - 1, total) : 0;
  const pagination = buildPaginationRange(page, meta.totalPages);
  const isPrevDisabled = page <= 1;
  const isNextDisabled = !meta.totalPages || page >= meta.totalPages;

  const handlePageChange = (nextPage) => {
    if (nextPage < 1) return;
    if (meta.totalPages && nextPage > meta.totalPages) return;
    setPage(nextPage);
  };

  const openCreateModal = () => {
    setEditingSupplier(null);
    setFormData({
      name: "",
      code: "",
      contactPerson: "",
      role: "",
      phone: "",
      email: "",
      products: "",
      tone: "blue",
      openPOLabel: "0 Open",
      openPOStatus: "open",
    });
    setActionError("");
    setIsModalOpen(true);
  };

  const openEditModal = (supplier) => {
    const productLabels = supplier.products
      .map((product) => product.label)
      .filter(Boolean)
      .join(", ");

    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name || "",
      code: supplier.code || "",
      contactPerson: supplier.contactPerson || "",
      role: supplier.role || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      products: productLabels,
      tone: supplier.tone || "blue",
      openPOLabel: supplier.openPO?.label || "",
      openPOStatus: supplier.openPO?.status || "open",
    });
    setActionError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSupplier(null);
    setActionError("");
  };

  const updateField = (field) => (event) => {
    setFormData((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (!formData.name) {
      setActionError("Supplier name is required.");
      return;
    }

    const products = formData.products
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((label) => ({ label, tone: "slate" }));

    setIsSaving(true);
    try {
      const payload = {
        name: formData.name,
        code: formData.code,
        contactPerson: formData.contactPerson,
        role: formData.role,
        phone: formData.phone,
        email: formData.email,
        products,
        tone: formData.tone,
        openPO: {
          label: formData.openPOLabel,
          status: formData.openPOStatus,
        },
      };

      const endpoint = editingSupplier
        ? `/api/inventory/suppliers/${editingSupplier.id}`
        : "/api/inventory/suppliers";

      await fetchInventory(endpoint, {
        method: editingSupplier ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      closeModal();
      if (!editingSupplier) {
        setPage(1);
      }
      triggerRefresh();
    } catch (err) {
      setActionError(err?.message || "Unable to save supplier.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (supplier) => {
    if (!supplier?.id) return;
    const confirmed = window.confirm(
      `Delete ${supplier.name}? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      await fetchInventory(`/api/inventory/suppliers/${supplier.id}`, {
        method: "DELETE",
      });
      triggerRefresh();
    } catch (err) {
      setError(err?.message || "Unable to delete supplier.");
    }
  };

  return (
    <section className="suppliers-page">
      <header className="suppliers-header">
        <div>
          <div className="breadcrumb">Operations / Suppliers</div>
          <h2>Suppliers</h2>
        </div>
        <div className="suppliers-actions">
          <button type="button" className="ghost-button">
            <DownloadIcon className="button-icon" />
            Export
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={openCreateModal}
          >
            <PlusIcon className="button-icon" />
            Add Supplier
          </button>
        </div>
      </header>

      <div className="filters-card">
        <div className="filters-row">
          <div className="filter-pill">
            <span>Category:</span>
            <select aria-label="Filter by category">
              <option>All Products</option>
              <option>Electronics</option>
              <option>Logistics</option>
              <option>Packaging</option>
            </select>
            <ChevronDownIcon className="chevron" />
          </div>
          <div className="filter-pill">
            <span>Status:</span>
            <select aria-label="Filter by status">
              <option>Active</option>
              <option>Paused</option>
              <option>Onboarding</option>
            </select>
            <ChevronDownIcon className="chevron" />
          </div>
          <div className="filter-pill">
            <span>Region:</span>
            <select aria-label="Filter by region">
              <option>Global</option>
              <option>North America</option>
              <option>Europe</option>
              <option>Asia Pacific</option>
            </select>
            <ChevronDownIcon className="chevron" />
          </div>
          <button type="button" className="clear-filters">
            Clear all filters
          </button>
        </div>
      </div>

      <div className="suppliers-table mobile-card-table">
        <div className="table-header">
          <span>Supplier Name</span>
          <span>Contact Person</span>
          <span>Contact Info</span>
          <span>Products Supplied</span>
          <span>Open POs</span>
          <span>Actions</span>
        </div>
        <div className="table-body">
          {rows.map((supplier) => (
            <div className="table-row" key={supplier.id}>
              <div
                className="supplier-cell cell supplier-name full"
                data-label="Supplier"
              >
                <div className={`supplier-icon ${supplier.tone}`}>
                  <BuildingIcon />
                </div>
                <div className="supplier-info">
                  <strong>{supplier.name}</strong>
                  <span className="muted">{supplier.code}</span>
                </div>
              </div>
              <div className="supplier-cell cell" data-label="Contact">
                <strong>{supplier.contactPerson}</strong>
                <span className="muted">{supplier.role}</span>
              </div>
              <div className="supplier-cell cell" data-label="Contact Info">
                <span>{supplier.phone}</span>
                <span className="muted">{supplier.email}</span>
              </div>
              <div
                className="supplier-cell cell supplier-tags full"
                data-label="Products"
              >
                {supplier.products.map((product) => (
                  <span
                    key={product.label}
                    className={`tag ${product.tone}`}
                  >
                    {product.label}
                  </span>
                ))}
              </div>
              <div className="supplier-cell cell" data-label="Open POs">
                <span className={getStatusClass(supplier.openPO.status)}>
                  {supplier.openPO.label}
                </span>
              </div>
              <div
                className="supplier-cell cell supplier-actions full"
                data-label="Actions"
              >
                <button
                  type="button"
                  className="action-button"
                  aria-label={`Edit ${supplier.name}`}
                  onClick={() => openEditModal(supplier)}
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="action-button"
                  aria-label={`Delete ${supplier.name}`}
                  onClick={() => handleDelete(supplier)}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="table-footer">
          <span>
            {error
              ? error
              : `Showing ${startIndex}-${endIndex} of ${total} suppliers`}
          </span>
          <div className="pagination">
            <button
              type="button"
              className="ghost-button"
              onClick={() => handlePageChange(page - 1)}
              disabled={isPrevDisabled}
            >
              Previous
            </button>
            {pagination.map((pageItem, index) =>
              pageItem === "ellipsis" ? (
                <span className="page-ellipsis" key={`ellipsis-${index}`}>
                  ...
                </span>
              ) : (
                <button
                  type="button"
                  key={`page-${pageItem}`}
                  className={`page ${pageItem === page ? "active" : ""}`}
                  onClick={() => handlePageChange(pageItem)}
                >
                  {pageItem}
                </button>
              ),
            )}
            <button
              type="button"
              className="ghost-button"
              onClick={() => handlePageChange(page + 1)}
              disabled={isNextDisabled}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-header">
            <span>Active Contracts</span>
            <span className="summary-icon">
              <FileTextIcon />
            </span>
          </div>
          <div className="summary-value">38</div>
          <div className="summary-meta positive">+2 this month</div>
        </div>
        <div className="summary-card">
          <div className="summary-header">
            <span>Average Delivery Time</span>
            <span className="summary-icon info">
              <ClockIcon />
            </span>
          </div>
          <div className="summary-value">4.2 Days</div>
          <div className="summary-meta positive">-0.5 days avg</div>
        </div>
        <div className="summary-card">
          <div className="summary-header">
            <span>Supply Risk Level</span>
            <span className="summary-icon success">
              <ShieldCheckIcon />
            </span>
          </div>
          <div className="summary-value">Low</div>
          <div className="summary-meta">Stable inventory</div>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        title={editingSupplier ? "Edit Supplier" : "Add Supplier"}
        subtitle="Manage supplier details and product categories."
        primaryText={isSaving ? "Saving..." : "Save"}
        secondaryText="Cancel"
        onConfirm={handleSave}
        onClose={closeModal}
      >
        <form className="modal-form">
          <div className="modal-grid">
            <label className="modal-field">
              <span>Supplier Name</span>
              <input
                type="text"
                value={formData.name}
                onChange={updateField("name")}
                placeholder="Supplier name"
              />
            </label>
            <label className="modal-field">
              <span>Supplier Code</span>
              <input
                type="text"
                value={formData.code}
                onChange={updateField("code")}
                placeholder="SUP-0001"
              />
            </label>
            <label className="modal-field">
              <span>Contact Person</span>
              <input
                type="text"
                value={formData.contactPerson}
                onChange={updateField("contactPerson")}
                placeholder="Contact name"
              />
            </label>
            <label className="modal-field">
              <span>Role</span>
              <input
                type="text"
                value={formData.role}
                onChange={updateField("role")}
                placeholder="Role"
              />
            </label>
            <label className="modal-field">
              <span>Phone</span>
              <input
                type="text"
                value={formData.phone}
                onChange={updateField("phone")}
                placeholder="+1 (555) 555-1234"
              />
            </label>
            <label className="modal-field">
              <span>Email</span>
              <input
                type="email"
                value={formData.email}
                onChange={updateField("email")}
                placeholder="supplier@email.com"
              />
            </label>
            <label className="modal-field">
              <span>Products</span>
              <input
                type="text"
                value={formData.products}
                onChange={updateField("products")}
                placeholder="Semiconductors, Warehousing"
              />
              <span className="modal-help">
                Separate product names with commas.
              </span>
            </label>
            <label className="modal-field">
              <span>Icon Tone</span>
              <select value={formData.tone} onChange={updateField("tone")}>
                <option value="blue">Blue</option>
                <option value="amber">Amber</option>
                <option value="green">Green</option>
                <option value="indigo">Indigo</option>
                <option value="slate">Slate</option>
              </select>
            </label>
            <label className="modal-field">
              <span>Open PO Label</span>
              <input
                type="text"
                value={formData.openPOLabel}
                onChange={updateField("openPOLabel")}
                placeholder="0 Open"
              />
            </label>
            <label className="modal-field">
              <span>Open PO Status</span>
              <select
                value={formData.openPOStatus}
                onChange={updateField("openPOStatus")}
              >
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="active">Active</option>
              </select>
            </label>
          </div>
          {actionError ? <span className="modal-help">{actionError}</span> : null}
        </form>
      </Modal>
    </section>
  );
};

export default Suppliers;
