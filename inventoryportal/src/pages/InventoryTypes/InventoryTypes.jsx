import { useEffect, useState } from "react";
import {
  EditIcon,
  PlusIcon,
  SearchIcon,
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
import "./InventoryTypes.css";

const DEFAULT_LIMIT = 6;
const DEFAULT_FORM = {
  name: "",
  description: "",
};

const InventoryCategories = () => {
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [meta, setMeta] = useState({
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 0,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_FORM);
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

    const loadCategories = async () => {
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(meta.limit));
        if (searchTerm.trim()) {
          params.set("search", searchTerm.trim());
        }

        const payload = await fetchInventory(
          `/api/inventory/categories?${params.toString()}`,
        );
        const parsed = parseListResponse(payload);
        const normalized = parsed.data.map((category, index) => ({
          id: category._id || category.id || `${index}`,
          name: category.name || "",
          description: category.description || "",
          usageCount: Number.isFinite(category.usageCount)
            ? category.usageCount
            : 0,
          created: formatShortDate(category.createdAt),
        }));

        if (!isMounted) return;
        if (parsed.totalPages && page > parsed.totalPages) {
          setPage(parsed.totalPages);
          return;
        }
        setCategories(normalized);
        setMeta({
          limit: parsed.limit || meta.limit,
          total: parsed.total,
          totalPages: parsed.totalPages,
        });
        setError("");
      } catch (err) {
        if (!isMounted) return;
        setCategories([]);
        setMeta((prev) => ({ ...prev, total: 0, totalPages: 0 }));
        setError(err?.message || "Unable to load categories.");
      }
    };

    loadCategories();
    return () => {
      isMounted = false;
    };
  }, [meta.limit, page, refreshKey, searchTerm]);

  const total = meta.total || categories.length;
  const startIndex = total ? (page - 1) * meta.limit + 1 : 0;
  const endIndex = total ? Math.min(startIndex + categories.length - 1, total) : 0;
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

  const openCreateModal = () => {
    setEditingCategory(null);
    setFormData(DEFAULT_FORM);
    setActionError("");
    setIsModalOpen(true);
  };

  const openEditModal = (category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name || "",
      description: category.description || "",
    });
    setActionError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCategory(null);
    setFormData(DEFAULT_FORM);
    setActionError("");
  };

  const updateField = (field) => (event) => {
    setFormData((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (!formData.name.trim()) {
      setActionError("Category name is required.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description,
      };

      const endpoint = editingCategory
        ? `/api/inventory/categories/${editingCategory.id}`
        : "/api/inventory/categories";

      await fetchInventory(endpoint, {
        method: editingCategory ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      closeModal();
      if (!editingCategory) {
        setPage(1);
      }
      triggerRefresh();
    } catch (err) {
      setActionError(err?.message || "Unable to save category.");
    } finally {
      setIsSaving(false);
    }
  };

  const requestDelete = (category) => {
    setDeleteTarget(category);
  };

  const closeDelete = () => {
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id || isDeleting) return;
    setIsDeleting(true);
    try {
      await fetchInventory(`/api/inventory/categories/${deleteTarget.id}`, {
        method: "DELETE",
      });
      triggerRefresh();
    } catch (err) {
      setError(err?.message || "Unable to delete category.");
    } finally {
      setIsDeleting(false);
      closeDelete();
    }
  };

  return (
    <section className="inventory-types inventory-categories">
      <header className="types-header">
        <div>
          <Breadcrumb pageKey="inventory-types" />
          <h2>Inventory Categories</h2>
          <p>Organize inventory items into registered categories for faster entry.</p>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={openCreateModal}
        >
          <PlusIcon className="button-icon" />
          Create Category
        </button>
      </header>

      <div className="types-toolbar">
        <div className="input-shell">
          <SearchIcon className="search-icon" />
          <input
            type="text"
            placeholder="Search categories"
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>
      </div>

      <div className="types-table mobile-card-table">
        <div className="table-header">
          <span>Category Name</span>
          <span>Description</span>
          <span>Items</span>
          <span>Created Date</span>
          <span>Actions</span>
        </div>
        <div className="table-body">
          {categories.map((category) => (
            <div className="table-row" key={category.id}>
              <div className="cell type-name full" data-label="Category">
                <strong>{category.name}</strong>
              </div>
              <div className="cell muted full" data-label="Description">
                {category.description || "No description"}
              </div>
              <div className="cell" data-label="Items">
                <span className="count-pill">
                  {category.usageCount}
                  <span>Items</span>
                </span>
              </div>
              <div className="cell muted" data-label="Created">
                {category.created}
              </div>
              <div className="cell actions-cell full" data-label="Actions">
                <button
                  type="button"
                  className="action-button"
                  aria-label={`Edit ${category.name}`}
                  onClick={() => openEditModal(category)}
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="action-button"
                  aria-label={`Delete ${category.name}`}
                  onClick={() => requestDelete(category)}
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
              : `Showing ${startIndex} to ${endIndex} of ${total} categories`}
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
        title={editingCategory ? "Edit Category" : "Create Category"}
        subtitle="Register a category to help classify inventory items."
        primaryText={isSaving ? "Saving..." : "Save"}
        secondaryText="Cancel"
        onConfirm={handleSave}
        onClose={closeModal}
      >
        <form className="modal-form">
          <div className="modal-grid">
            <label className="modal-field">
              <span>Category Name</span>
              <input
                type="text"
                value={formData.name}
                onChange={updateField("name")}
                placeholder="Category name"
              />
            </label>
            <label className="modal-field">
              <span>Description</span>
              <input
                type="text"
                value={formData.description}
                onChange={updateField("description")}
                placeholder="Optional description"
              />
            </label>
          </div>
          {actionError ? <span className="modal-help">{actionError}</span> : null}
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Category"
        message={
          deleteTarget
            ? `Delete ${deleteTarget.name}? This cannot be undone.`
            : "Delete this category?"
        }
        confirmText={isDeleting ? "Deleting..." : "Delete"}
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onClose={closeDelete}
      />
    </section>
  );
};

export default InventoryCategories;
