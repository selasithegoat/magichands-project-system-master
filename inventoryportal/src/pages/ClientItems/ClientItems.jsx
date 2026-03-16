import { useEffect, useState } from "react";
import {
  ClockIcon,
  DownloadIcon,
  EditIcon,
  PlusIcon,
  SearchIcon,
  SortIcon,
  TrashIcon,
} from "../../components/icons/Icons";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Breadcrumb from "../../components/ui/Breadcrumb";
import Modal from "../../components/ui/Modal";
import {
  fetchInventory,
  formatShortDate,
  parseListResponse,
} from "../../utils/inventoryApi";
import { buildPaginationRange } from "../../utils/pagination";
import useInventoryGlobalSearch from "../../hooks/useInventoryGlobalSearch";
import "./ClientItems.css";

const DEFAULT_LIMIT = 6;
const DEFAULT_FORM = {
  clientName: "",
  clientPhone: "",
  itemName: "",
  serialNumber: "",
  receivedAt: "",
  warehouse: "",
  status: "Received",
  notes: "",
};
const STATUS_OPTIONS = [
  "Received",
  "Inspection",
  "In Progress",
  "Awaiting Parts",
  "Completed",
];
const STATUS_TABS = ["All", ...STATUS_OPTIONS];

const ClientItems = () => {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [meta, setMeta] = useState({
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 0,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [activeStatus, setActiveStatus] = useState("All");
  const [statusCounts, setStatusCounts] = useState(() =>
    STATUS_TABS.reduce((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {}),
  );
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [actionError, setActionError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [warehouseOptions, setWarehouseOptions] = useState([]);

  const triggerRefresh = () => setRefreshKey((prev) => prev + 1);

  useInventoryGlobalSearch((term) => {
    setSearchTerm(term);
    setPage(1);
  });

  const formatDateInput = (value) => {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toISOString().slice(0, 10);
  };

  useEffect(() => {
    let isMounted = true;

    const loadItems = async () => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(DEFAULT_LIMIT),
        });
        if (searchTerm.trim()) {
          params.set("search", searchTerm.trim());
        }
        if (activeStatus !== "All") {
          params.set("status", activeStatus);
        }

        const payload = await fetchInventory(
          `/api/inventory/client-items?${params.toString()}`,
        );
        const parsed = parseListResponse(payload);
        const normalized = parsed.data.map((item, index) => ({
          id: item._id || item.id || `${index}`,
          client: item.clientName || item.client || "",
          phone: item.clientPhone || item.phone || "",
          item: item.itemName || item.item || "",
          serial: item.serialNumber || item.serial || "",
          receivedAt: item.receivedAt || item.received || item.dateReceived,
          received: formatShortDate(
            item.receivedAt || item.received || item.dateReceived,
          ),
          warehouse: item.warehouse || "",
          status: item.status || "Received",
          notes: item.notes || "",
        }));

        if (!isMounted) return;
        if (parsed.totalPages && page > parsed.totalPages) {
          setPage(parsed.totalPages);
          return;
        }
        setItems(normalized);
        setMeta({
          limit: parsed.limit || DEFAULT_LIMIT,
          total: parsed.total,
          totalPages: parsed.totalPages,
        });
        setError("");
      } catch (err) {
        if (!isMounted) return;
        setItems([]);
        setMeta((prev) => ({ ...prev, total: 0, totalPages: 0 }));
        setError(err?.message || "Unable to load client items.");
      }
    };

    loadItems();
    return () => {
      isMounted = false;
    };
  }, [page, refreshKey, searchTerm, activeStatus]);

  useEffect(() => {
    let isMounted = true;

    const loadWarehouseOptions = async () => {
      try {
        const payload = await fetchInventory("/api/inventory/warehouses/options");
        const parsed = parseListResponse(payload);
        const options = Array.isArray(parsed?.data) ? parsed.data : [];
        if (!isMounted) return;
        const sorted = Array.from(new Set(options.filter(Boolean))).sort((a, b) =>
          a.localeCompare(b),
        );
        setWarehouseOptions(sorted);
      } catch (err) {
        if (!isMounted) return;
      }
    };

    loadWarehouseOptions();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, activeStatus]);

  useEffect(() => {
    let isMounted = true;

    const loadCounts = async () => {
      try {
        const baseParams = new URLSearchParams({
          page: "1",
          limit: "1",
        });
        if (searchTerm.trim()) {
          baseParams.set("search", searchTerm.trim());
        }

        const requests = STATUS_TABS.map((status) => {
          const params = new URLSearchParams(baseParams);
          if (status !== "All") {
            params.set("status", status);
          }
          return fetchInventory(`/api/inventory/client-items?${params.toString()}`);
        });

        const responses = await Promise.all(requests);
        if (!isMounted) return;
        const counts = responses.reduce((acc, payload, index) => {
          const parsed = parseListResponse(payload);
          acc[STATUS_TABS[index]] = parsed.total || 0;
          return acc;
        }, {});
        setStatusCounts(counts);
      } catch (err) {
        if (!isMounted) return;
      }
    };

    loadCounts();
    return () => {
      isMounted = false;
    };
  }, [refreshKey, searchTerm]);

  const total = meta.total || items.length;
  const startIndex = total ? (page - 1) * meta.limit + 1 : 0;
  const endIndex = total ? Math.min(startIndex + items.length - 1, total) : 0;
  const pagination = buildPaginationRange(page, meta.totalPages);
  const isPrevDisabled = page <= 1;
  const isNextDisabled = !meta.totalPages || page >= meta.totalPages;
  const formWarehouseOptions = Array.from(
    new Set([...warehouseOptions, formData.warehouse].filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  const handlePageChange = (nextPage) => {
    if (nextPage < 1) return;
    if (meta.totalPages && nextPage > meta.totalPages) return;
    setPage(nextPage);
  };

  const handleTabChange = (status) => {
    setActiveStatus(status);
    setPage(1);
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setFormData(DEFAULT_FORM);
    setActionError("");
    setIsModalOpen(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      clientName: item.client || "",
      clientPhone: item.phone || "",
      itemName: item.item || "",
      serialNumber: item.serial || "",
      receivedAt: formatDateInput(item.receivedAt),
      warehouse: item.warehouse || "",
      status: item.status || "Received",
      notes: item.notes || "",
    });
    setActionError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setFormData(DEFAULT_FORM);
    setActionError("");
  };

  const updateField = (field) => (event) => {
    setFormData((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (!formData.clientName || !formData.itemName || !formData.receivedAt) {
      setActionError("Client name, item name, and received date are required.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        clientName: formData.clientName,
        clientPhone: formData.clientPhone,
        itemName: formData.itemName,
        serialNumber: formData.serialNumber,
        receivedAt: formData.receivedAt,
        warehouse: formData.warehouse,
        status: formData.status,
        notes: formData.notes,
      };
      const endpoint = editingItem
        ? `/api/inventory/client-items/${editingItem.id}`
        : "/api/inventory/client-items";
      await fetchInventory(endpoint, {
        method: editingItem ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      closeModal();
      if (!editingItem) {
        setPage(1);
      }
      triggerRefresh();
    } catch (err) {
      setActionError(err?.message || "Unable to save client item.");
    } finally {
      setIsSaving(false);
    }
  };

  const requestDelete = (item) => {
    setDeleteTarget(item);
  };

  const closeDelete = () => {
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id || isDeleting) return;
    setIsDeleting(true);
    try {
      await fetchInventory(`/api/inventory/client-items/${deleteTarget.id}`, {
        method: "DELETE",
      });
      triggerRefresh();
    } catch (err) {
      setError(err?.message || "Unable to delete client item.");
    } finally {
      setIsDeleting(false);
      closeDelete();
    }
  };

  return (
    <section className="client-items-page">
      <header className="client-items-header">
        <div>
          <Breadcrumb pageKey="client-items" />
          <h2>Client Item Tracking</h2>
          <p>
            Register, monitor, and manage items received from clients for
            service and repair work.
          </p>
        </div>
        <div className="client-items-actions">
          <button
            type="button"
            className="primary-button"
            onClick={openCreateModal}
          >
            <PlusIcon className="button-icon" />
            New Intake
          </button>
        </div>
      </header>

      <div className="filters-card">
        <div className="filters-row">
          <div className="input-shell">
            <SearchIcon className="search-icon" />
            <input
              type="text"
              placeholder="Search by client, serial number, or item..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <button type="button" className="ghost-button">
            <ClockIcon className="button-icon" />
            Date Range
          </button>
          <button type="button" className="ghost-button">
            <SortIcon className="button-icon" />
            More Filters
          </button>
          <button type="button" className="ghost-button">
            <DownloadIcon className="button-icon" />
            Export
          </button>
        </div>
        <div className="client-items-tabs">
          {STATUS_TABS.map((status) => (
            <button
              key={status}
              type="button"
              className={`client-tab ${activeStatus === status ? "active" : ""}`}
              onClick={() => handleTabChange(status)}
            >
              {status === "All" ? "All Items" : status} ({statusCounts[status] || 0})
            </button>
          ))}
        </div>
      </div>

      <div className="client-items-table mobile-card-table">
        <div className="table-header">
          <span>Client / Phone</span>
          <span>Item Details</span>
          <span>Received</span>
          <span>Warehouse</span>
          <span>Actions</span>
        </div>
        <div className="table-body">
          {items.map((item) => (
            <div className="table-row" key={item.id}>
              <div className="cell client-cell full" data-label="Client">
                <div className="client-avatar">
                  {(item.client || "?").charAt(0)}
                </div>
                <div className="client-info">
                  <strong>{item.client}</strong>
                  <span className="muted">{item.phone}</span>
                </div>
              </div>
              <div className="cell item-cell full" data-label="Item Details">
                <strong>{item.item}</strong>
                <span className="muted">SN: {item.serial}</span>
              </div>
              <div className="cell muted" data-label="Received">
                {item.received}
              </div>
              <div className="cell" data-label="Warehouse">
                <span className="warehouse-pill">{item.warehouse}</span>
              </div>
              <div className="cell actions-cell" data-label="Actions">
                <button
                  type="button"
                  className="action-button"
                  aria-label={`Edit ${item.client}`}
                  onClick={() => openEditModal(item)}
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="action-button"
                  aria-label={`Delete ${item.client}`}
                  onClick={() => requestDelete(item)}
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
              : `Showing ${startIndex} to ${endIndex} of ${total} items`}
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
        title={editingItem ? "Edit Client Item" : "New Client Item"}
        subtitle="Capture client item details for service intake."
        primaryText={isSaving ? "Saving..." : "Save"}
        secondaryText="Cancel"
        onConfirm={handleSave}
        onClose={closeModal}
      >
        <form className="modal-form">
          <div className="modal-grid">
            <label className="modal-field">
              <span>Client Name</span>
              <input
                type="text"
                value={formData.clientName}
                onChange={updateField("clientName")}
                placeholder="Client name"
              />
            </label>
            <label className="modal-field">
              <span>Client Phone</span>
              <input
                type="text"
                value={formData.clientPhone}
                onChange={updateField("clientPhone")}
                placeholder="+1 (555) 555-1234"
              />
            </label>
            <label className="modal-field">
              <span>Item Name</span>
              <input
                type="text"
                value={formData.itemName}
                onChange={updateField("itemName")}
                placeholder="Item name"
              />
            </label>
            <label className="modal-field">
              <span>Serial Number</span>
              <input
                type="text"
                value={formData.serialNumber}
                onChange={updateField("serialNumber")}
                placeholder="Serial number"
              />
            </label>
            <label className="modal-field">
              <span>Received Date</span>
              <input
                type="date"
                value={formData.receivedAt}
                onChange={updateField("receivedAt")}
              />
            </label>
            <label className="modal-field">
              <span>Status</span>
              <select
                value={formData.status}
                onChange={updateField("status")}
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="modal-field">
              <span>Warehouse</span>
              <input
                type="text"
                list="client-items-warehouse-options"
                value={formData.warehouse}
                onChange={updateField("warehouse")}
                placeholder="Select or type warehouse"
              />
            </label>
          </div>
          <label className="modal-field">
            <span>Notes</span>
            <textarea
              value={formData.notes}
              onChange={updateField("notes")}
              placeholder="Intake notes"
            />
          </label>
          {actionError ? <span className="modal-help">{actionError}</span> : null}
          <datalist id="client-items-warehouse-options">
            {formWarehouseOptions.map((warehouse) => (
              <option key={warehouse} value={warehouse} />
            ))}
          </datalist>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Client Item"
        message={
          deleteTarget
            ? `Delete the record for ${deleteTarget.client}? This cannot be undone.`
            : "Delete this record?"
        }
        confirmText={isDeleting ? "Deleting..." : "Delete"}
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onClose={closeDelete}
      />
    </section>
  );
};

export default ClientItems;
