import React, { useMemo, useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import FolderIcon from "../../components/icons/FolderIcon";
import TrashIcon from "../../components/icons/TrashIcon";
import CalendarIcon from "../../components/icons/CalendarIcon";
import ClockIcon from "../../components/icons/ClockIcon";
import PersonIcon from "../../components/icons/PersonIcon";
import LocationIcon from "../../components/icons/LocationIcon";
import UploadIcon from "../../components/icons/UploadIcon";
import PackageIcon from "../../components/icons/PackageIcon";
import MailIcon from "../../components/icons/MailIcon";
import PhoneIcon from "../../components/icons/PhoneIcon";
import UserAvatar from "../../components/ui/UserAvatar";
import Select from "../../components/ui/Select";
import ConfirmationModal from "../../components/ui/ConfirmationModal";
import {
  buildFileKey,
  normalizeReferenceAttachments,
  getReferenceFileName,
  getReferenceFileUrl,
  getReferenceFileNote,
} from "../../utils/referenceAttachments";
import {
  formatProjectIndicatorInput,
  formatProjectDisplayName,
  resolveProjectNameForForm,
} from "../../utils/projectName";
import {
  clearNewOrderDraft,
  loadNewOrderDraft,
  saveNewOrderDraftFiles,
  saveNewOrderDraftMeta,
} from "../../utils/newOrderDraftStorage";
import "./NewOrders.css";

const REVISION_LOCKED_STATUSES = new Set([
  "Completed",
  "Delivered",
  "Feedback Completed",
  "Finished",
]);

const formatFileSize = (bytes) => {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(size) / Math.log(1024)),
  );
  const value = size / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

const createEmptyItem = () => ({ description: "", breakdown: "", qty: 1 });

const toDateTimeLocal = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const generateOrderNumber = () => {
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${datePart}-${randomPart}`;
};

const createNewOrderFormData = ({
  projectType = "Standard",
  priority = "Normal",
  orderNumber = generateOrderNumber(),
  orderDate = toDateTimeLocal(new Date()),
} = {}) => ({
  orderNumber,
  clientName: "",
  clientEmail: "",
  clientPhone: "",
  contactType: "None",
  packagingType: "",
  deliveryLocation: "",
  projectName: "",
  projectIndicator: "",
  briefOverview: "",
  items: [createEmptyItem()],
  orderDate,
  deliveryDate: "",
  projectType,
  priority,
  corporateEmergency: false,
  projectLeadId: "",
  assistantLeadId: "",
  sampleRequired: false,
});

const normalizeDraftItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return [createEmptyItem()];
  }

  return items.map((item) => {
    const normalizedQty = Number(item?.qty);
    return {
      description: String(item?.description || ""),
      breakdown: String(item?.breakdown || ""),
      qty:
        Number.isFinite(normalizedQty) && normalizedQty > 0
          ? normalizedQty
          : 1,
    };
  });
};

const normalizeDraftFiles = (files) =>
  Array.isArray(files)
    ? files.filter(
        (file) =>
          file &&
          typeof file === "object" &&
          typeof file.name === "string" &&
          typeof file.size === "number",
      )
    : [];

const mergeUniqueFiles = (existingFiles, incomingFiles) => {
  const seen = new Set(existingFiles.map((file) => buildFileKey(file)));
  const dedupedIncoming = incomingFiles.filter((file) => {
    const key = buildFileKey(file);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...existingFiles, ...dedupedIncoming];
};

const normalizeDraftFormData = (draftFormData, fallbackFormData) => {
  const draft = draftFormData && typeof draftFormData === "object" ? draftFormData : {};
  const nextProjectType =
    typeof draft.projectType === "string" && draft.projectType.trim()
      ? draft.projectType
      : fallbackFormData.projectType;

  return {
    ...fallbackFormData,
    ...draft,
    orderNumber:
      typeof draft.orderNumber === "string" && draft.orderNumber.trim()
        ? draft.orderNumber
        : fallbackFormData.orderNumber,
    clientName: typeof draft.clientName === "string" ? draft.clientName : "",
    clientEmail: typeof draft.clientEmail === "string" ? draft.clientEmail : "",
    clientPhone: typeof draft.clientPhone === "string" ? draft.clientPhone : "",
    contactType:
      typeof draft.contactType === "string" && draft.contactType.trim()
        ? draft.contactType
        : fallbackFormData.contactType,
    packagingType:
      typeof draft.packagingType === "string" ? draft.packagingType : "",
    deliveryLocation:
      typeof draft.deliveryLocation === "string" ? draft.deliveryLocation : "",
    projectName: typeof draft.projectName === "string" ? draft.projectName : "",
    projectIndicator:
      typeof draft.projectIndicator === "string" ? draft.projectIndicator : "",
    briefOverview:
      typeof draft.briefOverview === "string" ? draft.briefOverview : "",
    items: normalizeDraftItems(draft.items),
    orderDate:
      typeof draft.orderDate === "string" && draft.orderDate.trim()
        ? draft.orderDate
        : fallbackFormData.orderDate,
    deliveryDate:
      typeof draft.deliveryDate === "string" ? draft.deliveryDate : "",
    projectType: nextProjectType,
    priority:
      typeof draft.priority === "string" && draft.priority.trim()
        ? draft.priority
        : fallbackFormData.priority,
    corporateEmergency:
      nextProjectType === "Corporate Job" && Boolean(draft.corporateEmergency),
    projectLeadId:
      typeof draft.projectLeadId === "string" ? draft.projectLeadId : "",
    assistantLeadId:
      typeof draft.assistantLeadId === "string" ? draft.assistantLeadId : "",
    sampleRequired: Boolean(draft.sampleRequired),
  };
};

const NewOrders = ({ user = null }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [formData, setFormData] = useState(() =>
    createNewOrderFormData({
      projectType: location.state?.projectType || "Standard",
      priority: location.state?.priority || "Normal",
    }),
  );

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [selectedClientMockups, setSelectedClientMockups] = useState([]);
  const [selectedClientMockupNotes, setSelectedClientMockupNotes] = useState({});
  const [selectedFileNotes, setSelectedFileNotes] = useState({});
  const [existingSampleImage, setExistingSampleImage] = useState("");
  const [existingSampleImageNote, setExistingSampleImageNote] = useState("");
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [leads, setLeads] = useState([]);
  const [existingOrderNumbers, setExistingOrderNumbers] = useState([]);
  const [clientSuggestions, setClientSuggestions] = useState([]);
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });
  const [isToastFading, setIsToastFading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editingProjectStatus, setEditingProjectStatus] = useState("");
  const [currentUser, setCurrentUser] = useState(user);
  const [hasResolvedCurrentUser, setHasResolvedCurrentUser] = useState(
    Boolean(user),
  );
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);
  const draftMetaSaveChainRef = useRef(Promise.resolve());
  const draftFileSaveChainRef = useRef(Promise.resolve());
  const draftPersistenceDisabledRef = useRef(false);
  const isRevisionMode = Boolean(editingId && location.state?.revisionMode);
  const revisionReturnTo =
    editingId && typeof location.state?.returnTo === "string"
      ? location.state.returnTo
      : "";
  const isRevisionLocked =
    Boolean(editingId) &&
    REVISION_LOCKED_STATUSES.has(String(editingProjectStatus || ""));
  const reopenedProject = location.state?.reopenedProject || null;
  const isCreateMode = !editingId && !reopenedProject;
  const routeProjectType = location.state?.projectType || "Standard";
  const routePriority = location.state?.priority || "Normal";
  const draftAccountKey =
    String(
      currentUser?._id || currentUser?.id || currentUser?.email || "default",
    ).trim() || "default";

  useEffect(() => {
    let isCancelled = false;

    if (user) {
      setCurrentUser(user);
      setHasResolvedCurrentUser(true);
      return undefined;
    }

    setHasResolvedCurrentUser(false);

    const fetchCurrentUser = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) {
          if (!isCancelled) {
            setCurrentUser(null);
          }
          return;
        }
        const data = await res.json();
        if (!isCancelled) {
          setCurrentUser(data || null);
        }
      } catch (e) {
        if (!isCancelled) {
          setCurrentUser(null);
        }
        console.error("Failed to fetch current user", e);
      } finally {
        if (!isCancelled) {
          setHasResolvedCurrentUser(true);
        }
      }
    };

    fetchCurrentUser();

    return () => {
      isCancelled = true;
    };
  }, [user]);

  // Fetch users for project lead
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/auth/users");
        if (res.ok) {
          const data = await res.json();
          const formatted = data.map((u) => {
            const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim();
            const departments = Array.isArray(u.department)
              ? u.department.filter(Boolean)
              : u.department
                ? [u.department]
                : [];
            const primaryDepartment = departments[0] || "";
            const roleLabel =
              u.position ||
              (u.role === "admin" ? "Admin" : "Team Member");
            return {
              value: u._id,
              label: fullName || u.name || "Unnamed User",
              roleLabel,
              department: primaryDepartment,
              avatarUrl: u.avatarUrl || "",
              role: u.role || "user",
            };
          });
          setLeads(formatted);
        }
      } catch (e) {
        console.error("Failed to fetch users", e);
      }
    };

    const fetchExistingOrders = async () => {
      try {
        const res = await fetch("/api/projects/orders?collapseRevisions=true");
        if (!res.ok) return;
        const data = await res.json();
        const orderNumbers = Array.from(
          new Set(
            (Array.isArray(data) ? data : [])
              .map((entry) => String(entry?.orderNumber || "").trim())
              .filter(Boolean),
          ),
        ).sort((a, b) => a.localeCompare(b));
        setExistingOrderNumbers(orderNumbers);
      } catch (e) {
        console.error("Failed to fetch grouped orders", e);
      }
    };

    const fetchClientSuggestions = async () => {
      try {
        const res = await fetch("/api/projects/clients", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        const suggestionsMap = new Map();

        (Array.isArray(data) ? data : []).forEach((client) => {
          const fallbackName = formatClientName(client?.name || "");
          const projects = Array.isArray(client?.projects) ? client.projects : [];

          if (projects.length === 0) {
            const key = normalizeClientName(fallbackName);
            if (!key || suggestionsMap.has(key)) return;
            suggestionsMap.set(key, {
              key,
              name: fallbackName,
              createdAt: 0,
              autofill: {
                clientEmail: "",
                clientPhone: "",
              },
            });
            return;
          }

          projects.forEach((project) => {
            const projectClientName = formatClientName(
              project?.details?.client || fallbackName,
            );
            const key = normalizeClientName(projectClientName);
            if (!key) return;

            const createdAt = Date.parse(project?.createdAt || "") || 0;
            const nextSuggestion = {
              key,
              name: projectClientName,
              createdAt,
              autofill: {
                clientEmail: String(project?.details?.clientEmail || "").trim(),
                clientPhone: String(project?.details?.clientPhone || "").trim(),
              },
            };
            const existingSuggestion = suggestionsMap.get(key);

            if (
              !existingSuggestion ||
              nextSuggestion.createdAt > existingSuggestion.createdAt
            ) {
              suggestionsMap.set(key, nextSuggestion);
            }
          });
        });

        const suggestions = Array.from(suggestionsMap.values()).sort((a, b) =>
          a.name.localeCompare(b.name),
        );
        setClientSuggestions(suggestions);
      } catch (e) {
        console.error("Failed to fetch clients", e);
      }
    };

    fetchUsers();
    fetchExistingOrders();
    fetchClientSuggestions();
  }, []);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setIsToastFading(false);
    setTimeout(() => {
      setIsToastFading(true);
      setTimeout(() => {
        setToast({ show: false, message: "", type: "success" });
        setIsToastFading(false);
      }, 500);
    }, 4500);
  };

  const renderLeadOption = (option) => (
    <div className="lead-option">
      <span
        className={`lead-status ${option.role === "admin" ? "admin" : "staff"}`}
      />
      <UserAvatar
        name={option.label}
        src={option.avatarUrl}
        width="34px"
        height="34px"
      />
      <div className="lead-meta">
        <span className="lead-name">{option.label}</span>
        <span className="lead-role">
          {option.roleLabel}
          {option.department ? ` - ${option.department}` : ""}
        </span>
      </div>
    </div>
  );

  const renderLeadValue = (option) => (
    <div className="lead-value">
      <UserAvatar
        name={option.label}
        src={option.avatarUrl}
        width="30px"
        height="30px"
      />
      <div className="lead-meta">
        <span className="lead-name">{option.label}</span>
        <span className="lead-role">
          {option.roleLabel}
          {option.department ? ` - ${option.department}` : ""}
        </span>
      </div>
    </div>
  );

  const normalizeClientName = (value = "") =>
    String(value).trim().replace(/\s+/g, " ").toLowerCase();

  const formatClientName = (value = "") =>
    String(value).trim().replace(/\s+/g, " ");

  const clientSuggestionMap = useMemo(() => {
    const map = {};
    clientSuggestions.forEach((suggestion) => {
      if (suggestion?.key) {
        map[suggestion.key] = suggestion;
      }
    });
    return map;
  }, [clientSuggestions]);

  const resolveClientName = (value = "") => {
    const key = normalizeClientName(value);
    if (!key) return "";
    return clientSuggestionMap[key]?.name || formatClientName(value);
  };

  const filteredClientSuggestions = useMemo(() => {
    const query = normalizeClientName(formData.clientName);
    if (!query) return clientSuggestions;
    return clientSuggestions.filter((suggestion) =>
      String(suggestion?.key || "").includes(query),
    );
  }, [clientSuggestions, formData.clientName]);

  const showClientDropdown =
    isClientDropdownOpen && filteredClientSuggestions.length > 0;

  const handleClientSuggestionSelect = (suggestion) => {
    setFormData((prev) => ({
      ...prev,
      clientName: suggestion?.name || "",
      clientEmail: suggestion?.autofill?.clientEmail || "",
      clientPhone: suggestion?.autofill?.clientPhone || "",
    }));
    setIsClientDropdownOpen(false);
  };

  const applyProjectToForm = (project) => {
    if (!project) return;
    setEditingProjectStatus(project.status || "");
    setFormData({
      orderNumber: project.orderId || "",
      clientName: project.details?.client || "",
      clientEmail: project.details?.clientEmail || "",
      clientPhone: project.details?.clientPhone || "",
      contactType: project.details?.contactType || "None",
      packagingType: project.details?.packagingType || "",
      deliveryLocation: project.details?.deliveryLocation || "",
      projectName: resolveProjectNameForForm(project.details) || "",
      projectIndicator: project.details?.projectIndicator || "",
      briefOverview: project.details?.briefOverview || "",
      items:
        project.items?.length > 0
          ? project.items
          : [{ description: "", breakdown: "", qty: 1 }],
      orderDate: project.orderDate
        ? toDateTimeLocal(project.orderDate)
        : toDateTimeLocal(new Date()),
      deliveryDate: project.details?.deliveryDate
        ? toDateTimeLocal(project.details.deliveryDate)
        : "",
      projectType: project.projectType || "Standard",
      priority: project.priority || "Normal",
      corporateEmergency: Boolean(project.corporateEmergency?.isEnabled),
      projectLeadId: project.projectLeadId?._id || project.projectLeadId || "",
      assistantLeadId:
        project.assistantLeadId?._id || project.assistantLeadId || "",
      sampleRequired: Boolean(project.sampleRequirement?.isRequired),
    });
    setExistingSampleImage(project.details?.sampleImage || "");
    setExistingSampleImageNote(String(project.details?.sampleImageNote || ""));
    setExistingAttachments(
      normalizeReferenceAttachments(project.details?.attachments || []),
    );
    setSelectedClientMockups([]);
    setSelectedClientMockupNotes({});
  };

  useEffect(() => {
    const editParam = new URLSearchParams(location.search).get("edit");
    setEditingId(editParam || "");
  }, [location.search]);

  useEffect(() => {
    let isCancelled = false;

    const loadEditProject = async (projectId) => {
      if (reopenedProject?._id === projectId) {
        applyProjectToForm(reopenedProject);
        if (!isCancelled) {
          setIsDraftHydrated(true);
        }
        return;
      }

      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled) {
            applyProjectToForm(data);
            setIsDraftHydrated(true);
          }
        } else {
          if (!isCancelled) {
            showToast("Unable to load project for editing.", "error");
            setIsDraftHydrated(true);
          }
        }
      } catch (error) {
        console.error("Failed to load project for editing", error);
        if (!isCancelled) {
          showToast("Unable to load project for editing.", "error");
          setIsDraftHydrated(true);
        }
      }
    };

    const loadCreateModeDraft = async () => {
      if (!hasResolvedCurrentUser) {
        return;
      }

      draftPersistenceDisabledRef.current = false;
      const fallbackFormData = createNewOrderFormData({
        projectType: routeProjectType,
        priority: routePriority,
      });

      try {
        const storedDraft = await loadNewOrderDraft(draftAccountKey);
        if (isCancelled) return;

        if (storedDraft) {
          setFormData(
            normalizeDraftFormData(storedDraft.formData, fallbackFormData),
          );
          setSelectedFiles(normalizeDraftFiles(storedDraft.selectedFiles));
          setSelectedFileNotes(
            storedDraft.selectedFileNotes &&
              typeof storedDraft.selectedFileNotes === "object"
              ? storedDraft.selectedFileNotes
              : {},
          );
          setSelectedClientMockups([]);
          setSelectedClientMockupNotes({});
          setExistingSampleImage(
            typeof storedDraft.existingSampleImage === "string"
              ? storedDraft.existingSampleImage
              : "",
          );
          setExistingSampleImageNote(
            typeof storedDraft.existingSampleImageNote === "string"
              ? storedDraft.existingSampleImageNote
              : "",
          );
          setExistingAttachments(
            normalizeReferenceAttachments(storedDraft.existingAttachments || []),
          );
        } else {
          setFormData(fallbackFormData);
          setSelectedFiles([]);
          setSelectedFileNotes({});
          setSelectedClientMockups([]);
          setSelectedClientMockupNotes({});
          setExistingSampleImage("");
          setExistingSampleImageNote("");
          setExistingAttachments([]);
        }
      } catch (error) {
        console.error("Failed to restore New Order draft", error);
        if (isCancelled) return;
        setFormData(fallbackFormData);
        setSelectedFiles([]);
        setSelectedFileNotes({});
        setSelectedClientMockups([]);
        setSelectedClientMockupNotes({});
        setExistingSampleImage("");
        setExistingSampleImageNote("");
        setExistingAttachments([]);
      }

      if (!isCancelled) {
        setEditingProjectStatus("");
        setIsDraftHydrated(true);
      }
    };

    setIsDraftHydrated(false);

    if (editingId) {
      draftPersistenceDisabledRef.current = true;
      loadEditProject(editingId);
      return () => {
        isCancelled = true;
      };
    }

    if (reopenedProject) {
      draftPersistenceDisabledRef.current = true;
      applyProjectToForm(reopenedProject);
      setIsDraftHydrated(true);
      return () => {
        isCancelled = true;
      };
    }

    loadCreateModeDraft();

    return () => {
      isCancelled = true;
    };
  }, [
    draftAccountKey,
    editingId,
    hasResolvedCurrentUser,
    reopenedProject,
    routePriority,
    routeProjectType,
  ]);

  useEffect(() => {
    if (!isCreateMode || !isDraftHydrated || !hasResolvedCurrentUser) {
      return undefined;
    }

    const payload = {
      formData,
      selectedFileNotes,
      existingSampleImage,
      existingSampleImageNote,
      existingAttachments,
    };

    const timerId = window.setTimeout(() => {
      draftMetaSaveChainRef.current = draftMetaSaveChainRef.current
        .catch(() => {})
        .then(() => {
          if (draftPersistenceDisabledRef.current) return null;
          return saveNewOrderDraftMeta(draftAccountKey, payload);
        })
        .catch((error) => {
          console.error("Failed to save New Order draft", error);
        });
    }, 150);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    draftAccountKey,
    existingAttachments,
    existingSampleImage,
    existingSampleImageNote,
    formData,
    hasResolvedCurrentUser,
    isCreateMode,
    isDraftHydrated,
    selectedFileNotes,
  ]);

  useEffect(() => {
    if (!isCreateMode || !isDraftHydrated || !hasResolvedCurrentUser) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      draftFileSaveChainRef.current = draftFileSaveChainRef.current
        .catch(() => {})
        .then(() => {
          if (draftPersistenceDisabledRef.current) return null;
          return saveNewOrderDraftFiles(draftAccountKey, selectedFiles);
        })
        .catch((error) => {
          console.error("Failed to save New Order draft files", error);
        });
    }, 150);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    draftAccountKey,
    hasResolvedCurrentUser,
    isCreateMode,
    isDraftHydrated,
    selectedFiles,
  ]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const nextValue =
        name === "projectIndicator" ? formatProjectIndicatorInput(value) : value;
      const next = { ...prev, [name]: nextValue };
      if (name === "projectType" && value !== "Corporate Job") {
        next.corporateEmergency = false;
      }
      if (name === "projectLeadId" && value === prev.assistantLeadId) {
        next.assistantLeadId = "";
      }
      return next;
    });
  };

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { description: "", breakdown: "", qty: 1 }],
    }));
  };

  const removeItem = (index) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    setFormData({ ...formData, items: newItems });
  };

  const moveItem = (index, direction) => {
    setFormData((prev) => {
      const nextItems = [...prev.items];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= nextItems.length) {
        return prev;
      }
      const [moved] = nextItems.splice(index, 1);
      nextItems.splice(targetIndex, 0, moved);
      return { ...prev, items: nextItems };
    });
  };

  const adjustItemQty = (index, delta) => {
    setFormData((prev) => {
      const nextItems = [...prev.items];
      const currentQty = Number(nextItems[index]?.qty || 1);
      const nextQty = Math.max(1, currentQty + delta);
      nextItems[index] = { ...nextItems[index], qty: nextQty };
      return { ...prev, items: nextItems };
    });
  };

  const removeFile = (index) => {
    const fileToRemove = selectedFiles[index];
    if (fileToRemove) {
      const key = buildFileKey(fileToRemove);
      setSelectedFileNotes((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingAttachment = (index) => {
    setExistingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingSampleImage = () => {
    setExistingSampleImage("");
    setExistingSampleImageNote("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingId && isRevisionLocked) {
      showToast(
        "Order revision is locked after completion. Reopen the project to revise it.",
        "error",
      );
      return;
    }
    if (!formData.projectLeadId) {
      showToast("Please select a Project Lead.", "error");
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    if (editingId && isRevisionLocked) {
      setShowConfirmModal(false);
      showToast(
        "Order revision is locked after completion. Reopen the project to revise it.",
        "error",
      );
      return;
    }
    setShowConfirmModal(false);
    setIsLoading(true);

    const formPayload = new FormData();
    formPayload.append("orderId", formData.orderNumber);
    formPayload.append("orderDate", formData.orderDate);
    const canonicalClientName = resolveClientName(formData.clientName);
    formPayload.append("client", canonicalClientName);
    formPayload.append("clientEmail", formData.clientEmail);
    formPayload.append("clientPhone", formData.clientPhone);
    formPayload.append("contactType", formData.contactType);
    formPayload.append("packagingType", formData.packagingType);
    formPayload.append("projectName", formData.projectName);
    formPayload.append("projectIndicator", formData.projectIndicator || "");
    formPayload.append("deliveryLocation", formData.deliveryLocation);
    formPayload.append("deliveryDate", formData.deliveryDate || "");
    formPayload.append("projectLeadId", formData.projectLeadId);
    if (formData.assistantLeadId) {
      formPayload.append("assistantLeadId", formData.assistantLeadId);
    }
    if (!editingId) {
      formPayload.append("status", "Order Created");
    }
    formPayload.append("briefOverview", formData.briefOverview);
    formPayload.append("projectType", formData.projectType);
    formPayload.append("priority", formData.priority);
    formPayload.append(
      "corporateEmergency",
      String(
        formData.projectType === "Corporate Job" &&
          Boolean(formData.corporateEmergency),
      ),
    );
    formPayload.append("items", JSON.stringify(formData.items));
    if (!editingId) {
      formPayload.append("sampleRequired", String(Boolean(formData.sampleRequired)));
    }

    // Handle Existing Files
    formPayload.append("existingSampleImage", existingSampleImage || "");
    formPayload.append(
      "existingAttachments",
      JSON.stringify(existingAttachments || []),
    );

    const getFileNote = (file) =>
      selectedFileNotes[buildFileKey(file)] || "";
    const shouldUseSelectedImageAsSample =
      !editingId || !existingSampleImage;
    const imageFile = shouldUseSelectedImageAsSample
      ? selectedFiles.find((f) => f.type.startsWith("image/"))
      : null;
    const attachmentFiles = imageFile
      ? selectedFiles.filter((f) => f !== imageFile)
      : selectedFiles;

    attachmentFiles.forEach((file) => {
      formPayload.append("attachments", file);
    });

    if (attachmentFiles.length > 0) {
      const attachmentNotes = attachmentFiles.map((file) => getFileNote(file));
      formPayload.append("attachmentNotes", JSON.stringify(attachmentNotes));
    }

    if (imageFile) {
      formPayload.append("sampleImage", imageFile);
    }

    if (selectedClientMockups.length > 0) {
      selectedClientMockups.forEach((file) => {
        formPayload.append("clientMockup", file);
      });
      const clientMockupNotes = selectedClientMockups.map(
        (file) => selectedClientMockupNotes[buildFileKey(file)] || "",
      );
      formPayload.append(
        "clientMockupNotes",
        JSON.stringify(clientMockupNotes),
      );
    }

    const sampleNote = imageFile
      ? getFileNote(imageFile)
      : existingSampleImage
        ? existingSampleImageNote
        : "";
    formPayload.append("sampleImageNote", sampleNote);

    try {
      const url = editingId ? `/api/projects/${editingId}` : "/api/projects";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        body: formPayload,
      });

      if (res.ok) {
        if (!editingId) {
          draftPersistenceDisabledRef.current = true;
          try {
            await Promise.allSettled([
              draftMetaSaveChainRef.current,
              draftFileSaveChainRef.current,
            ]);
            await clearNewOrderDraft(draftAccountKey);
          } catch (error) {
            console.error("Failed to clear New Order draft", error);
          }
        }

        showToast(
          editingId
            ? "Order revision updated successfully!"
            : "Order Created Successfully!",
          "success",
        );
        if (!editingId) {
          setFormData(
            createNewOrderFormData({
              projectType: formData.projectType,
              priority: formData.priority,
            }),
          );
          setSelectedFiles([]);
          setSelectedFileNotes({});
          setSelectedClientMockups([]);
          setSelectedClientMockupNotes({});
          setExistingSampleImage("");
          setExistingSampleImageNote("");
          setExistingAttachments([]);
        }

        const nextPath =
          editingId && revisionReturnTo ? revisionReturnTo : "/create";
        setTimeout(() => navigate(nextPath), 1500);
      } else {
        const errorData = await res.json();
        showToast(`Error: ${errorData.message || "Failed to submit"}`, "error");
      }
    } catch (error) {
      console.error("Submission error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const isEmergency =
    formData.projectType === "Emergency" || formData.priority === "Urgent";

  const isCorporate = formData.projectType === "Corporate Job";
  const currentUserDepartments = Array.isArray(currentUser?.department)
    ? currentUser.department
    : currentUser?.department
      ? [currentUser.department]
      : [];
  const canEditOrderNumber =
    currentUser?.role === "admin" ||
    currentUserDepartments.includes("Front Desk");

  return (
    <div className="new-orders-page">
      {toast.show && (
        <div
          className={`toast-message ${toast.type} ${isToastFading ? "fading-out" : ""}`}
        >
          {toast.message}
        </div>
      )}

      <div className="page-header">
        <div className="page-header-brand">
          <div>
            <h1>
              {editingId
                ? isRevisionMode
                  ? "Order Revision"
                  : "Edit Reopened Order"
                : "Create New Order"}
            </h1>
            <p className="subtitle">
              {editingId
                ? "Update project information with the complete order form."
                : "Fill in the details for the "}
              {!editingId && (
                <>
                  <span style={{ color: isCorporate ? "#42a165" : "inherit" }}>
                    {formData.projectType}
                  </span>{" "}
                  job
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="form-card-container">
        {isEmergency && (
          <div className="emergency-banner">
            <span style={{ fontSize: "1.5rem" }}>🔥</span>
            <span>EMERGENCY ORDER - High Priority Handling Required</span>
          </div>
        )}

        {isCorporate && (
          <div
            className="corporate-banner"
            style={{
              background: "rgba(66, 161, 101, 0.1)",
              border: "1px solid #42a165",
              color: "#42a165",
              padding: "1rem",
              borderRadius: "8px",
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              fontWeight: "600",
            }}
          >
            <span style={{ fontSize: "1.5rem" }}>🏢</span>
            <span>CORPORATE JOB - Specialized Handling Flow</span>
          </div>
        )}

        <div className="form-card">
          <form onSubmit={handleSubmit} autoComplete="off">
            <div className="order-meta-card">
              <div className="order-meta-head">
                <div>
                  <span className="order-meta-eyebrow">Order Snapshot</span>
                  <h2 className="order-meta-title">
                    {formatProjectDisplayName(
                      formData.projectName,
                      formData.projectIndicator,
                      "New Order",
                    )}
                  </h2>
                  <p className="order-meta-subtitle">
                    Confirm the essentials before assigning the project lead.
                  </p>
                </div>
                <div className="order-meta-badges">
                  <span
                    className={`order-meta-pill ${
                      isEmergency ? "urgent" : ""
                    }`}
                  >
                    {formData.projectType}
                  </span>
                  <span
                    className={`order-meta-pill ${
                      isCorporate ? "corporate" : ""
                    }`}
                  >
                    {formData.priority}
                  </span>
                </div>
              </div>
              <div className="order-meta-grid">
                <div className="order-meta-field">
                  <label htmlFor="orderNumber">Order Number</label>
                  <div className="input-wrapper meta-input">
                    <input
                      type="text"
                      id="orderNumber"
                      name="orderNumber"
                      value={formData.orderNumber}
                      onChange={handleChange}
                      className="form-input"
                      list="existingOrderNumbers"
                      disabled={!canEditOrderNumber}
                      required
                    />
                    <span className="input-icon">#</span>
                  </div>
                  <datalist id="existingOrderNumbers">
                    {existingOrderNumbers.map((orderNumber) => (
                      <option key={orderNumber} value={orderNumber} />
                    ))}
                  </datalist>
                  <small className="field-help-text">
                    {canEditOrderNumber
                      ? "Use an existing order number to group projects under the same order."
                      : "Only Front Desk and Admin can change order numbers."}
                  </small>
                </div>
                <div className="order-meta-field">
                  <label htmlFor="orderDate">Date/Time Placed</label>
                  <div className="input-wrapper meta-input">
                    <input
                      type="datetime-local"
                      id="orderDate"
                      name="orderDate"
                      value={formData.orderDate}
                      onChange={handleChange}
                      className="form-input"
                      required
                    />
                    <span className="input-icon">
                      <CalendarIcon />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="form-section">
              <h2 className="section-title">Order Leadership</h2>
              <div className="form-row">
                <div className="form-group">
                  <Select
                    label={
                      <>
                        Project Lead <span style={{ color: "red" }}>*</span>
                      </>
                    }
                    options={leads}
                    value={leads.find(
                      (lead) => lead.value === formData.projectLeadId,
                    )}
                    onChange={(option) =>
                      setFormData((prev) => ({
                        ...prev,
                        projectLeadId: option?.value || "",
                        assistantLeadId:
                          option?.value === prev.assistantLeadId
                            ? ""
                            : prev.assistantLeadId,
                      }))
                    }
                    placeholder="Select a Project Lead"
                    renderOption={renderLeadOption}
                    renderValue={renderLeadValue}
                  />
                </div>
                <div className="form-group">
                  <Select
                    label="Assistant Lead (Optional)"
                    options={leads.filter(
                      (lead) => lead.value !== formData.projectLeadId,
                    )}
                    value={leads.find(
                      (lead) => lead.value === formData.assistantLeadId,
                    )}
                    onChange={(option) =>
                      setFormData((prev) => ({
                        ...prev,
                        assistantLeadId: option?.value || "",
                      }))
                    }
                    placeholder="Select an Assistant Lead"
                    renderOption={renderLeadOption}
                    renderValue={renderLeadValue}
                  />
                </div>
              </div>
            </div>

            {isCreateMode && (
              <>
                <div className="divider"></div>

                <div className="form-section">
                  <h2 className="section-title">Client Mockup</h2>
                  <p className="section-hint">
                    Upload client-provided artwork or mockup here so Graphics can validate it or revise it later.
                  </p>

                  <div
                    className="reference-dropzone"
                    onClick={() =>
                      document.getElementById("new-order-client-mockup").click()
                    }
                    style={{ cursor: "pointer" }}
                  >
                    <div className="dropzone-icon">
                      <UploadIcon />
                    </div>
                    <div>
                      <p>
                        {selectedClientMockups.length > 0
                          ? "Add client mockups"
                          : "Upload client mockups"}
                      </p>
                      <span>Use this only for client-supplied mockup/artwork files</span>
                    </div>
                  </div>

                  <input
                    type="file"
                    id="new-order-client-mockup"
                    style={{ display: "none" }}
                    multiple
                    onChange={(e) => {
                      const nextFiles = Array.from(e.target.files || []);
                      if (nextFiles.length > 0) {
                        setSelectedClientMockups((current) =>
                          mergeUniqueFiles(current, nextFiles),
                        );
                      }
                      e.target.value = null;
                    }}
                  />

                  {selectedClientMockups.length > 0 && (
                    <div className="reference-files-grid">
                      {selectedClientMockups.map((file) => {
                        const fileKey = buildFileKey(file);
                        return (
                          <div key={fileKey} className="reference-file-tile">
                            <div className="file-icon">
                              {file.type.startsWith("image/") ? (
                                <img
                                  src={URL.createObjectURL(file)}
                                  alt="client mockup preview"
                                />
                              ) : (
                                <FolderIcon />
                              )}
                            </div>
                            <div className="file-info" title={file.name}>
                              <span className="file-name">{file.name}</span>
                              <span className="file-size">
                                {formatFileSize(file.size)}
                              </span>
                            </div>
                            <textarea
                              className="reference-file-note"
                              placeholder="Add note for Graphics..."
                              value={selectedClientMockupNotes[fileKey] || ""}
                              onChange={(e) =>
                                setSelectedClientMockupNotes((current) => ({
                                  ...current,
                                  [fileKey]: e.target.value,
                                }))
                              }
                              rows="2"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedClientMockups((current) =>
                                  current.filter(
                                    (entry) => buildFileKey(entry) !== fileKey,
                                  ),
                                );
                                setSelectedClientMockupNotes((current) => {
                                  const next = { ...current };
                                  delete next[fileKey];
                                  return next;
                                });
                              }}
                              className="file-remove-btn"
                            >
                              &times;
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="divider"></div>

            <div className="form-section">
              <h2 className="section-title">Client & Project Details</h2>
              <div className="contact-grid">
                <div className="form-group">
                  <label htmlFor="clientName">Client Name</label>
                  <div className="input-wrapper client-suggestion-wrapper">
                    <input
                      type="text"
                      id="clientName"
                      name="clientName"
                      autoComplete="new-password"
                      data-lpignore="true"
                      data-form-type="other"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={formData.clientName}
                      onChange={handleChange}
                      onFocus={() => setIsClientDropdownOpen(true)}
                      onBlur={(event) => {
                        const canonicalName = resolveClientName(event.target.value);
                        if (canonicalName && canonicalName !== event.target.value) {
                          setFormData((prev) => ({
                            ...prev,
                            clientName: canonicalName,
                          }));
                        }
                        setTimeout(() => setIsClientDropdownOpen(false), 120);
                      }}
                      className="form-input"
                      placeholder="e.g. Acme Corp"
                      required
                    />
                    <span className="input-icon">
                      <PersonIcon />
                    </span>
                    {showClientDropdown && (
                      <div className="client-suggestions" role="listbox">
                        {filteredClientSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.key}
                            type="button"
                            className="client-suggestion-item"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handleClientSuggestionSelect(suggestion);
                            }}
                          >
                            {suggestion.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="clientEmail">Client Email</label>
                  <div className="input-wrapper">
                    <input
                      type="email"
                      id="clientEmail"
                      name="clientEmail"
                      value={formData.clientEmail}
                      onChange={handleChange}
                      className="form-input"
                      placeholder="e.g. contact@client.com"
                    />
                    <span className="input-icon">
                      <MailIcon />
                    </span>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="clientPhone">Client Phone</label>
                  <div className="input-wrapper">
                    <input
                      type="tel"
                      id="clientPhone"
                      name="clientPhone"
                      value={formData.clientPhone}
                      onChange={handleChange}
                      className="form-input"
                      placeholder="e.g. +1234567890"
                    />
                    <span className="input-icon">
                      <PhoneIcon />
                    </span>
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="contactType">Contact Type</label>
                  <select
                    id="contactType"
                    name="contactType"
                    value={formData.contactType}
                    onChange={handleChange}
                    className="form-input"
                    required
                  >
                    <option value="None">None</option>
                    <option value="MH">MH</option>
                    <option value="3rd Party">3rd Party</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="packagingType">Type of Packaging</label>
                  <div className="input-wrapper">
                    <input
                      type="text"
                      id="packagingType"
                      name="packagingType"
                      value={formData.packagingType}
                      onChange={handleChange}
                      className="form-input"
                      placeholder="e.g. Carton box with bubble wrap"
                    />
                    <span className="input-icon">
                      <PackageIcon />
                    </span>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="deliveryLocation">Delivery Location</label>
                  <div className="input-wrapper">
                    <input
                      type="text"
                      id="deliveryLocation"
                      name="deliveryLocation"
                      value={formData.deliveryLocation}
                      onChange={handleChange}
                      className="form-input"
                      placeholder="e.g. 123 Main St, City"
                      required
                    />
                    <span className="input-icon">
                      <LocationIcon />
                    </span>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="deliveryDate">
                    Delivery Date / Time (Optional)
                  </label>
                  <div className="input-wrapper">
                    <input
                      type="datetime-local"
                      id="deliveryDate"
                      name="deliveryDate"
                      value={formData.deliveryDate}
                      onChange={handleChange}
                      className="form-input"
                    />
                    <span className="input-icon">
                      <ClockIcon />
                    </span>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="projectName">Order / Project Name</label>
                <div className="input-wrapper">
                  <input
                    type="text"
                    id="projectName"
                    name="projectName"
                    value={formData.projectName}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="e.g. Annual Conference Banners"
                    required
                  />
                  <span className="input-icon">
                    <FolderIcon />
                  </span>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="projectIndicator">Brand / Project Indicator</label>
                <div className="input-wrapper">
                  <input
                    type="text"
                    id="projectIndicator"
                    name="projectIndicator"
                    value={formData.projectIndicator}
                    onChange={handleChange}
                    className="form-input"
                    placeholder="e.g. Presidential Villa"
                  />
                  <span className="input-icon">
                    <FolderIcon />
                  </span>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="briefOverview">Brief Overview</label>
                <textarea
                  id="briefOverview"
                  name="briefOverview"
                  value={formData.briefOverview}
                  onChange={handleChange}
                  className="form-input textarea-short"
                  placeholder="High-level summary (e.g. '3 Large banners for stage background')"
                  rows="2"
                ></textarea>
              </div>
            </div>

            <div className="divider soft"></div>

            <div className="form-section order-items-section">
              <h2 className="section-title">Order Items & Workflow</h2>
              <div className="items-container">
                {formData.items.map((item, index) => (
                  <div key={index} className="item-card">
                    <div className="item-card-header">
                      <div className="item-card-title">
                        <span className="item-grip" aria-hidden="true" />
                        <span className="item-index">Item {index + 1}</span>
                      </div>
                      <div className="item-card-actions">
                        <button
                          type="button"
                          className="item-move-btn"
                          onClick={() => moveItem(index, -1)}
                          disabled={index === 0}
                          title="Move up"
                        >
                          <span className="arrow up" />
                        </button>
                        <button
                          type="button"
                          className="item-move-btn"
                          onClick={() => moveItem(index, 1)}
                          disabled={index === formData.items.length - 1}
                          title="Move down"
                        >
                          <span className="arrow down" />
                        </button>
                        {formData.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="remove-item-btn"
                            title="Remove Item"
                          >
                            <TrashIcon width="16" height="16" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="item-card-body">
                      <div className="item-input-group main">
                        <label>Description</label>
                        <input
                          type="text"
                          placeholder="e.g. Rollup Banner"
                          value={item.description}
                          onChange={(e) =>
                            updateItem(index, "description", e.target.value)
                          }
                          className="form-input"
                          required
                        />
                      </div>
                      <div className="item-input-group details">
                        <label>Details (Optional)</label>
                        <input
                          type="text"
                          placeholder="Finish, size, or material details"
                          value={item.breakdown}
                          onChange={(e) =>
                            updateItem(index, "breakdown", e.target.value)
                          }
                          className="form-input"
                        />
                      </div>
                      <div className="item-input-group qty">
                        <label>Quantity</label>
                        <div className="qty-stepper">
                          <button
                            type="button"
                            onClick={() => adjustItemQty(index, -1)}
                            aria-label="Decrease quantity"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            placeholder="Qty"
                            value={item.qty}
                            onChange={(e) =>
                              updateItem(index, "qty", e.target.value)
                            }
                            className="form-input"
                            min="1"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => adjustItemQty(index, 1)}
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addItem}
                  className="add-item-link"
                >
                  + Add Another Item
                </button>
              </div>

              <div className="workflow-stack">
                <div className="workflow-card">
                  <label className="workflow-control">
                    <input
                      type="checkbox"
                      name="sampleRequired"
                      checked={Boolean(formData.sampleRequired)}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          sampleRequired: e.target.checked,
                        }))
                      }
                      disabled={Boolean(editingId)}
                    />
                    <span>
                      Require client sample approval before Production can be
                      completed
                    </span>
                  </label>
                  <small className="field-help-text">
                    Enable when client must approve a production sample before
                    mass production.
                  </small>
                </div>

                {formData.projectType === "Corporate Job" && (
                  <div className="workflow-card accent-corporate">
                    <label className="workflow-control">
                      <input
                        type="checkbox"
                        name="corporateEmergency"
                        checked={Boolean(formData.corporateEmergency)}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            corporateEmergency: e.target.checked,
                          }))
                        }
                      />
                      <span>
                        Mark this Corporate Job as Corporate Emergency
                      </span>
                    </label>
                    <small className="field-help-text">
                      Use this for urgent corporate projects that need emergency
                      visibility.
                    </small>
                  </div>
                )}
              </div>
            </div>

            <div className="divider"></div>

            <div className="form-section">
              <h2 className="section-title">Reference Lab</h2>
              <p className="section-hint">
                Add artwork, briefs, images, or production references for this
                order.
              </p>

              {selectedFiles.length === 0 &&
                !existingSampleImage &&
                existingAttachments.length === 0 && (
                  <div
                    className="reference-dropzone"
                    onClick={() =>
                      document.getElementById("new-order-attachments").click()
                    }
                    style={{ cursor: "pointer" }}
                  >
                    <div className="dropzone-icon">
                      <UploadIcon />
                    </div>
                    <div>
                      <p>Drop files here, or click to upload</p>
                      <span>Images, PDFs, Docs, ZIP, and design files</span>
                    </div>
                  </div>
                )}

              <input
                type="file"
                multiple
                id="new-order-attachments"
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    const filesArray = Array.from(e.target.files);
                    setSelectedFiles((prev) => [...prev, ...filesArray]);
                    e.target.value = null;
                  }
                }}
              />

              {(selectedFiles.length > 0 ||
                existingSampleImage ||
                existingAttachments.length > 0) && (
                <div className="reference-files-grid">
                  {/* Existing Sample Image */}
                  {existingSampleImage && (
                    <div className="reference-file-tile existing">
                      <div className="file-icon">
                        <img src={existingSampleImage} alt="existing sample" />
                      </div>
                      <div className="file-info" title="Sample Image (Original)">
                        <span className="file-name">Sample Image</span>
                        <span className="file-size">Original</span>
                      </div>
                      <textarea
                        className="reference-file-note"
                        placeholder="Add note for this reference..."
                        value={existingSampleImageNote}
                        onChange={(e) =>
                          setExistingSampleImageNote(e.target.value)
                        }
                        rows="2"
                      />
                      <button
                        type="button"
                        onClick={removeExistingSampleImage}
                        className="file-remove-btn"
                      >
                        &times;
                      </button>
                    </div>
                  )}

                  {/* Existing Attachments */}
                  {existingAttachments.map((attachment, idx) => {
                    const attachmentUrl = getReferenceFileUrl(attachment);
                    const fileName = getReferenceFileName(attachment);
                    const noteValue = getReferenceFileNote(attachment);
                    return (
                    <div
                      key={`exist-${attachmentUrl || idx}`}
                      className="reference-file-tile existing"
                    >
                      <div className="file-icon">
                        {attachmentUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                          <img src={attachmentUrl} alt="attachment" />
                        ) : (
                          <FolderIcon />
                        )}
                      </div>
                      <div className="file-info" title={fileName}>
                        <span className="file-name">{fileName}</span>
                        <span className="file-size">Saved</span>
                      </div>
                      <textarea
                        className="reference-file-note"
                        placeholder="Add note for this reference..."
                        value={noteValue}
                        onChange={(e) => {
                          const value = e.target.value;
                          setExistingAttachments((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, note: value } : item,
                            ),
                          );
                        }}
                        rows="2"
                      />
                      <button
                        type="button"
                        onClick={() => removeExistingAttachment(idx)}
                        className="file-remove-btn"
                      >
                        &times;
                      </button>
                    </div>
                  );
                  })}

                  {/* New Files */}
                  {selectedFiles.map((file, idx) => {
                    const fileKey = buildFileKey(file);
                    return (
                    <div key={fileKey || idx} className="reference-file-tile">
                      <div className="file-icon">
                        {file.type.startsWith("image/") ? (
                          <img src={URL.createObjectURL(file)} alt="preview" />
                        ) : (
                          <FolderIcon />
                        )}
                      </div>
                      <div className="file-info" title={file.name}>
                        <span className="file-name">{file.name}</span>
                        <span className="file-size">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                      <textarea
                        className="reference-file-note"
                        placeholder="Add note for this reference..."
                        value={selectedFileNotes[fileKey] || ""}
                        onChange={(e) =>
                          setSelectedFileNotes((prev) => ({
                            ...prev,
                            [fileKey]: e.target.value,
                          }))
                        }
                        rows="2"
                      />
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="file-remove-btn"
                      >
                        &times;
                      </button>
                    </div>
                  );
                  })}
                  <div
                    className="reference-file-add-tile"
                    onClick={() =>
                      document.getElementById("new-order-attachments").click()
                    }
                  >
                    <span>+</span>
                  </div>
                </div>
              )}
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="submit-btn"
                disabled={isLoading || (editingId && isRevisionLocked)}
              >
                {isLoading
                  ? editingId
                    ? "Saving..."
                    : "Creating..."
                  : editingId
                    ? isRevisionMode
                      ? "Save Order Revision"
                      : "Save Reopened Order"
                    : "Create Order"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ConfirmationModal
        isOpen={showConfirmModal}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowConfirmModal(false)}
        title={
          editingId
            ? isRevisionMode
              ? "Confirm Order Revision"
              : "Confirm Order Update"
            : "Confirm New Order"
        }
        message={
          editingId
            ? isRevisionMode
              ? `Are you sure you want to save all revision updates for order ${formData.orderNumber}?`
              : `Are you sure you want to save reopened order ${formData.orderNumber}?`
            : `Are you sure you want to create order ${formData.orderNumber} for ${formatProjectDisplayName(
                formData.projectName,
                formData.projectIndicator,
                "New Order",
              )}? It will be assigned to the selected Project Lead for approval.`
        }
        confirmText={
          editingId
            ? isRevisionMode
              ? "Yes, Save Revision"
              : "Yes, Save Changes"
            : "Yes, Create Order"
        }
        cancelText="Cancel"
      />
    </div>
  );
};

export default NewOrders;
