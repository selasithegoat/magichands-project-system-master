import { useEffect, useState } from "react";
import {
  BuildingIcon,
  DownloadIcon,
  EditIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "../../components/icons/Icons";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Breadcrumb from "../../components/ui/Breadcrumb";
import Modal from "../../components/ui/Modal";
import { fetchInventory, parseListResponse } from "../../utils/inventoryApi";
import { buildPaginationRange } from "../../utils/pagination";
import useInventoryGlobalSearch from "../../hooks/useInventoryGlobalSearch";
import "./Suppliers.css";

const getStatusClass = (status) =>
  `po-pill ${String(status || "").toLowerCase()}`;

const formatOpenPOStatusLabel = (status) => {
  const raw = String(status || "").trim();
  if (!raw) return "";
  return raw
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const resolveOpenPOLabel = (openPO) => {
  const label = String(openPO?.label || "").trim();
  if (label) return label;
  const statusLabel = formatOpenPOStatusLabel(openPO?.status);
  return statusLabel || "-";
};

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
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    contactPerson: "",
    phone: "",
    email: "",
    products: "",
    openPOStatus: "open",
  });
  const [actionError, setActionError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const triggerRefresh = () => setRefreshKey((prev) => prev + 1);

  useInventoryGlobalSearch((term) => {
    setSearchTerm(term);
    setPage(1);
  });

  useEffect(() => {
    let isMounted = true;

    const loadSuppliers = async () => {
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(DEFAULT_LIMIT));
        if (searchTerm.trim()) {
          params.set("search", searchTerm.trim());
        }
        const payload = await fetchInventory(
          `/api/inventory/suppliers?${params.toString()}`,
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
          openPO: {
            status: supplier.openPO?.status || "",
            label: resolveOpenPOLabel(supplier.openPO),
          },
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
  }, [page, refreshKey, searchTerm]);

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

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setPage(1);
  };

  const handleExport = () => {
    if (!rows.length) return;
    const rowsForExport = rows.map((supplier) => ({
      Supplier: supplier.name,
      Code: supplier.code,
      "Contact Person": supplier.contactPerson,
      Role: supplier.role,
      Phone: supplier.phone,
      Email: supplier.email,
      Products: supplier.products
        .map((product) => product.label)
        .filter(Boolean)
        .join(", "),
      "Open PO": supplier.openPO?.label || "",
      "Open PO Status": supplier.openPO?.status || "",
    }));

    const headers = Object.keys(rowsForExport[0]);
    const csv = [
      headers.join(","),
      ...rowsForExport.map((row) =>
        headers
          .map((header) => {
            const cell = String(row[header] ?? "");
            return `"${cell.replace(/"/g, '""')}"`;
          })
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `suppliers-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const openCreateModal = () => {
    setEditingSupplier(null);
    setFormData({
      name: "",
      code: "",
      contactPerson: "",
      phone: "",
      email: "",
      products: "",
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
      phone: supplier.phone || "",
      email: supplier.email || "",
      products: productLabels,
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
      const openPOStatus = formData.openPOStatus || "open";
      const payload = {
        name: formData.name,
        code: formData.code,
        contactPerson: formData.contactPerson,
        phone: formData.phone,
        email: formData.email,
        products,
        openPO: {
          label: formatOpenPOStatusLabel(openPOStatus),
          status: openPOStatus,
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

  const requestDelete = (supplier) => {
    setDeleteTarget(supplier);
  };

  const closeDelete = () => {
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id || isDeleting) return;
    setIsDeleting(true);
    try {
      await fetchInventory(`/api/inventory/suppliers/${deleteTarget.id}`, {
        method: "DELETE",
      });
      triggerRefresh();
    } catch (err) {
      setError(err?.message || "Unable to delete supplier.");
    } finally {
      setIsDeleting(false);
      closeDelete();
    }
  };

  return (
    <section className="suppliers-page">
      <header className="suppliers-header">
        <div>
          <Breadcrumb pageKey="suppliers" />
          <h2>Suppliers</h2>
        </div>
        <div className="suppliers-actions">
          <button type="button" className="ghost-button" onClick={handleExport}>
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
          <div className="input-shell">
            <SearchIcon className="search-icon" />
            <input
              type="text"
              placeholder="Search suppliers, contacts, or email..."
              value={searchTerm}
              onChange={handleSearchChange}
            />
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={handleClearFilters}
          >
            Clear
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
                {supplier.role ? (
                  <span className="muted">{supplier.role}</span>
                ) : null}
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
                  onClick={() => requestDelete(supplier)}
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

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Supplier"
        message={
          deleteTarget
            ? `Delete ${deleteTarget.name}? This cannot be undone.`
            : "Delete this supplier?"
        }
        confirmText={isDeleting ? "Deleting..." : "Delete"}
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onClose={closeDelete}
      />
    </section>
  );
};

export default Suppliers;
