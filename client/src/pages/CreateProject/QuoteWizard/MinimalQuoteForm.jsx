import React, { useMemo, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Spinner from "../../../components/ui/Spinner";
import TrashIcon from "../../../components/icons/TrashIcon";
import FolderIcon from "../../../components/icons/FolderIcon";
import PersonIcon from "../../../components/icons/PersonIcon";
import MailIcon from "../../../components/icons/MailIcon";
import PhoneIcon from "../../../components/icons/PhoneIcon";
import UploadIcon from "../../../components/icons/UploadIcon";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import UserAvatar from "../../../components/ui/UserAvatar";
import FloatingMessageToast from "../../../components/ui/FloatingMessageToast";
import CalendarIcon from "../../../components/icons/CalendarIcon";
import ClockIcon from "../../../components/icons/ClockIcon";
import ConfirmationModal from "../../../components/ui/ConfirmationModal";
import ContextualHelpLink from "../../../components/features/ContextualHelpLink";
import useObjectUrls from "../../../hooks/useObjectUrls";
import {
  buildFileKey,
  normalizeReferenceAttachments,
  getReferenceFileName,
  getReferenceFileUrl,
  getReferenceFileNote,
} from "../../../utils/referenceAttachments";
import {
  formatProjectIndicatorInput,
  formatProjectDisplayName,
  resolveProjectNameForForm,
} from "../../../utils/projectName";
import { resolvePortalSource } from "../../../utils/portalSource";
import {
  canManageProjectCreationDrafts,
  getProjectDraft,
  saveProjectDraft,
} from "../../../utils/projectDraftApi";
import "./MinimalQuoteForm.css";

const REVISION_LOCKED_STATUSES = new Set([
  "Completed",
  "Delivered",
  "Feedback Completed",
  "Finished",
]);
const REVISION_LOCKED_MESSAGE =
  "Quote revision is locked after completion. Reopen the project to revise it.";
const REVISION_CANCELLED_MESSAGE =
  "This project is cancelled and frozen. Reactivate it before making changes.";

const isProjectCancelled = (project) =>
  Boolean(project?.cancellation?.isCancelled);

const normalizeTimeForInput = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const hhmm = raw.match(/^([01]\d|2[0-3]):([0-5]\d)/);
  if (hhmm) {
    return `${hhmm[1]}:${hhmm[2]}`;
  }

  const amPm = raw.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (amPm) {
    const hour12 = Number(amPm[1]);
    const minutes = amPm[2];
    const suffix = amPm[3].toLowerCase();
    const hour24 = (hour12 % 12) + (suffix === "pm" ? 12 : 0);
    return `${String(hour24).padStart(2, "0")}:${minutes}`;
  }

  return "";
};

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

const toEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object") {
    if (value._id) return toEntityId(value._id);
    if (value.id) return String(value.id);
  }
  return "";
};

const defaultChecklist = {
  cost: true,
  mockup: false,
  previousSamples: false,
  sampleProduction: false,
  bidSubmission: false,
};

const normalizeChecklist = (checklist) => {
  const next = { ...defaultChecklist, ...(checklist || {}) };
  const hasAtLeastOneRequirement = Object.values(next).some(Boolean);
  if (!hasAtLeastOneRequirement) {
    next.cost = true;
  }
  next.cost = true;
  next.mockup = Boolean(next.mockup);
  next.previousSamples = Boolean(next.previousSamples);
  next.sampleProduction = Boolean(next.sampleProduction);
  next.bidSubmission = Boolean(next.bidSubmission);
  return next;
};

const defaultQuoteItem = { description: "", breakdown: "", qty: 1 };

const normalizeDraftItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return [{ ...defaultQuoteItem }];
  }
  return items.map((item) => ({
    description: String(item?.description || ""),
    breakdown: String(item?.breakdown || ""),
    qty: item?.qty ?? 1,
  }));
};

const normalizeDraftDate = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const directDate = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (directDate) return directDate;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toISOString().slice(0, 10);
};

const normalizeDraftFile = (file, fieldName) => {
  if (!file || typeof file !== "object") return null;
  const fileUrl = String(file.fileUrl || file.url || file.path || "").trim();
  if (!fileUrl) return null;
  return {
    ...file,
    _id: String(file._id || file.id || file.fileId || ""),
    fileUrl,
    fileName:
      String(file.fileName || file.name || "").trim() ||
      getReferenceFileName(fileUrl),
    fileType: String(file.fileType || file.type || "").trim(),
    size: Number(file.size) || 0,
    note: String(file.note || file.notes || ""),
    fieldName: String(file.fieldName || fieldName || ""),
  };
};

const normalizeDraftFileGroup = (files, fieldName) => {
  const values = Array.isArray(files) ? files : files ? [files] : [];
  return values
    .map((file) => normalizeDraftFile(file, fieldName))
    .filter(Boolean);
};

const isImageReference = (file) => {
  const mimeType = String(file?.fileType || file?.type || "").toLowerCase();
  if (mimeType.startsWith("image/")) return true;
  const source = String(
    file?.fileUrl || file?.url || file?.path || file?.fileName || file?.name || "",
  );
  return /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:$|[?#])/i.test(source);
};

const getDraftFileId = (file) => String(file?._id || file?.id || "").trim();

const getSavedDraftFiles = (draft) => {
  const savedFiles =
    draft?.files && typeof draft.files === "object" ? draft.files : {};
  return {
    sampleImage:
      normalizeDraftFileGroup(
        savedFiles.sampleImage || draft?.sampleImage,
        "sampleImage",
      )[0] || null,
    attachments: normalizeDraftFileGroup(
      savedFiles.attachments || draft?.attachments,
      "attachments",
    ),
    clientMockups: normalizeDraftFileGroup(
      savedFiles.clientMockup || draft?.clientMockups,
      "clientMockup",
    ),
    approvedMockups: normalizeDraftFileGroup(
      savedFiles.approvedMockup || draft?.approvedMockups,
      "approvedMockup",
    ),
  };
};

const MinimalQuoteForm = ({ user = null }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const portalSource = useMemo(() => resolvePortalSource(), []);
  const canManageCreationDrafts = useMemo(
    () => canManageProjectCreationDrafts(user),
    [user],
  );
  const dashboardPath = portalSource === "admin" ? "/dashboard" : "/client";
  const draftsPath =
    portalSource === "admin"
      ? "/orders-management?tab=drafts"
      : "/frontdesk/orders?tab=drafts";
  const requestedDraftId = useMemo(
    () => new URLSearchParams(location.search).get("draft") || "",
    [location.search],
  );
  const requestedEditId = useMemo(
    () => new URLSearchParams(location.search).get("edit") || "",
    [location.search],
  );

  const [isLoading, setIsLoading] = useState(false);
  const [isDraftLoading, setIsDraftLoading] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState("");
  const [activeDraftId, setActiveDraftId] = useState("");
  const [activeDraftRevision, setActiveDraftRevision] = useState(null);
  const [editingId, setEditingId] = useState(requestedEditId);
  const [editingProjectStatus, setEditingProjectStatus] = useState("");
  const [editingProjectIsCancelled, setEditingProjectIsCancelled] =
    useState(false);
  const [leads, setLeads] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [selectedClientMockups, setSelectedClientMockups] = useState([]);
  const [selectedClientMockupNotes, setSelectedClientMockupNotes] = useState({});
  const [selectedFileNotes, setSelectedFileNotes] = useState({});
  const clientMockupPreviewUrls = useObjectUrls(selectedClientMockups);
  const filePreviewUrls = useObjectUrls(selectedFiles);
  const [existingSampleImage, setExistingSampleImage] = useState("");
  const [existingSampleImageNote, setExistingSampleImageNote] = useState("");
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [draftSampleImage, setDraftSampleImage] = useState(null);
  const [draftAttachments, setDraftAttachments] = useState([]);
  const [draftClientMockups, setDraftClientMockups] = useState([]);
  const [draftApprovedMockups, setDraftApprovedMockups] = useState([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showToast, setShowToast] = useState({
    show: false,
    message: "",
    type: "success",
  });
  const [isToastFading, setIsToastFading] = useState(false);
  const [createdOrderNumber, setCreatedOrderNumber] = useState("");

  const [formData, setFormData] = useState({
    projectName: "",
    projectIndicator: "",
    clientName: "",
    clientEmail: "", // [NEW]
    clientPhone: "", // [NEW]
    deliveryDate: "",
    deliveryTime: "",
    projectLeadId: "",
    assistantLeadId: "",
    quoteNumber: "",
    briefOverview: "",
    items: [{ ...defaultQuoteItem }],
    checklist: { ...defaultChecklist },
  });
  const isRevisionLocked =
    Boolean(editingId) &&
    REVISION_LOCKED_STATUSES.has(String(editingProjectStatus || ""));
  const isRevisionFrozen = Boolean(editingId) && editingProjectIsCancelled;
  const revisionBlockMessage = isRevisionFrozen
    ? REVISION_CANCELLED_MESSAGE
    : isRevisionLocked
      ? REVISION_LOCKED_MESSAGE
      : "";

  const applyProjectToForm = (project) => {
    if (!project) return;
    setEditingProjectStatus(project.status || "");
    setEditingProjectIsCancelled(isProjectCancelled(project));
    const details = project.details || {};
    const orderRef = project.orderRef || {};
    const resolvedQuoteNumber =
      project.orderId ||
      project.quoteDetails?.quoteNumber ||
      orderRef.orderNumber ||
      "";
    const resolvedClientName = details.client || orderRef.client || "";
    const resolvedClientEmail = details.clientEmail || orderRef.clientEmail || "";
    const resolvedClientPhone = details.clientPhone || orderRef.clientPhone || "";
    setFormData({
      projectName: resolveProjectNameForForm(details) || "",
      projectIndicator: details.projectIndicator || "",
      clientName: resolvedClientName,
      clientEmail: resolvedClientEmail,
      clientPhone: resolvedClientPhone,
      deliveryDate: details.deliveryDate
        ? new Date(details.deliveryDate).toISOString().slice(0, 10)
        : "",
      deliveryTime: normalizeTimeForInput(details.deliveryTime),
      projectLeadId: project.projectLeadId?._id || project.projectLeadId || "",
      assistantLeadId:
        project.assistantLeadId?._id || project.assistantLeadId || "",
      quoteNumber: resolvedQuoteNumber,
      briefOverview: details.briefOverview || "",
      items:
        project.items?.length > 0
          ? project.items
          : [{ description: "", breakdown: "", qty: 1 }],
      checklist: normalizeChecklist(project.quoteDetails?.checklist),
    });
    setExistingSampleImage(details.sampleImage || "");
    setExistingSampleImageNote(String(details.sampleImageNote || ""));
    setExistingAttachments(
      normalizeReferenceAttachments(details.attachments || []),
    );
    setSelectedClientMockups([]);
    setSelectedClientMockupNotes({});
  };

  const applyDraftToForm = (draft) => {
    if (!draft || typeof draft !== "object") {
      throw new Error("The saved quote draft is unavailable.");
    }

    const savedPayload =
      draft.formData && typeof draft.formData === "object"
        ? draft.formData
        : {};
    const savedForm =
      savedPayload.formData && typeof savedPayload.formData === "object"
        ? savedPayload.formData
        : savedPayload;
    const draftType = String(
      savedPayload.draftType || draft.draftType || savedForm.projectType || "",
    ).toLowerCase();
    if (draftType && !draftType.includes("quote")) {
      throw new Error("This saved draft belongs to a different order form.");
    }

    setFormData({
      projectName: String(savedForm.projectName || ""),
      projectIndicator: String(savedForm.projectIndicator || ""),
      clientName: String(savedForm.clientName || savedForm.client || ""),
      clientEmail: String(savedForm.clientEmail || ""),
      clientPhone: String(savedForm.clientPhone || ""),
      deliveryDate: normalizeDraftDate(savedForm.deliveryDate),
      deliveryTime: normalizeTimeForInput(savedForm.deliveryTime),
      projectLeadId: toEntityId(savedForm.projectLeadId),
      assistantLeadId: toEntityId(savedForm.assistantLeadId),
      quoteNumber: String(
        savedForm.quoteNumber || savedForm.orderId || savedForm.orderNumber || "",
      ),
      briefOverview: String(savedForm.briefOverview || ""),
      items: normalizeDraftItems(savedForm.items),
      checklist: normalizeChecklist(
        savedForm.checklist || savedForm.quoteDetails?.checklist,
      ),
    });

    const savedFiles = getSavedDraftFiles(draft);
    setDraftSampleImage(savedFiles.sampleImage);
    setDraftAttachments(savedFiles.attachments);
    setDraftClientMockups(savedFiles.clientMockups);
    setDraftApprovedMockups(savedFiles.approvedMockups);
    setSelectedFiles([]);
    setSelectedFileNotes({});
    setSelectedClientMockups([]);
    setSelectedClientMockupNotes({});
    setExistingSampleImage("");
    setExistingSampleImageNote("");
    setExistingAttachments([]);
    setActiveDraftId(toEntityId(draft));
    setActiveDraftRevision(
      Number.isFinite(Number(draft.revision)) ? Number(draft.revision) : null,
    );

    const scrollY = Number(savedPayload.scrollY);
    if (Number.isFinite(scrollY) && scrollY > 0) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => window.scrollTo(0, scrollY));
      });
    }
  };

  useEffect(() => {
    setEditingId(requestedEditId);
    if (requestedEditId) {
      setActiveDraftId("");
      setActiveDraftRevision(null);
    }
  }, [requestedEditId]);

  useEffect(() => {
    if (!requestedDraftId || requestedEditId) return undefined;

    let cancelled = false;
    setIsDraftLoading(true);
    getProjectDraft(requestedDraftId)
      .then((draft) => {
        if (cancelled) return;
        applyDraftToForm(draft);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to load quote draft", error);
        triggerToast(error.message || "Failed to load the quote draft.", "error");
      })
      .finally(() => {
        if (!cancelled) setIsDraftLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [requestedDraftId, requestedEditId]);

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
    fetchUsers();

    const loadEditProject = async () => {
      if (!editingId) return false;

      const reopenedProject = location.state?.reopenedProject || null;
      const reopenedProjectId = toEntityId(
        reopenedProject?._id || reopenedProject?.id,
      );
      const normalizedEditId = toEntityId(editingId);
      if (
        reopenedProject &&
        (!reopenedProjectId ||
          !normalizedEditId ||
          reopenedProjectId === normalizedEditId)
      ) {
        applyProjectToForm(reopenedProject);
        return true;
      }

      try {
        const res = await fetch(`/api/projects/${editingId}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          applyProjectToForm(data);
          return true;
        }
      } catch (error) {
        console.error("Failed to load quote for editing", error);
      }
      triggerToast("Failed to load quote revision for editing.", "error");
      return true;
    };

    loadEditProject().then((handledEdit) => {
      if (handledEdit) return;
      if (location.state?.reopenedProject) {
        applyProjectToForm(location.state.reopenedProject);
        return;
      }
    });
  }, [location.state, editingId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const nextValue =
      name === "projectIndicator" ? formatProjectIndicatorInput(value) : value;
    setFormData((prev) => ({ ...prev, [name]: nextValue }));
  };

  const handleChecklistChange = (field) => {
    const requirementKeys = [
      "cost",
      "mockup",
      "previousSamples",
      "sampleProduction",
      "bidSubmission",
    ];
    if (!requirementKeys.includes(field)) return;
    if (field === "cost") return;
    setFormData((prev) => {
      const currentChecklist = normalizeChecklist(prev.checklist);
      const nextChecklist = normalizeChecklist({
        ...currentChecklist,
        [field]: !currentChecklist[field],
      });
      return {
        ...prev,
        checklist: nextChecklist,
      };
    });
  };

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { description: "", breakdown: "", qty: 1 }],
    }));
  };

  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData((prev) => ({ ...prev, items: newItems }));
  };

  const updateItem = (index, field, value) => {
    const newItems = formData.items.map((item, i) =>
      i === index ? { ...item, [field]: value } : item,
    );
    setFormData((prev) => ({ ...prev, items: newItems }));
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

  const triggerToast = (message, type = "success") => {
    setShowToast({ show: true, message, type });
    setIsToastFading(false);
    setTimeout(() => {
      setIsToastFading(true);
      setTimeout(() => {
        setShowToast({ show: false, message: "", type: "success" });
        setIsToastFading(false);
      }, 500);
    }, 9500);
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

  const removeFile = (indexToRemove) => {
    const fileToRemove = selectedFiles[indexToRemove];
    if (fileToRemove) {
      const key = buildFileKey(fileToRemove);
      setSelectedFileNotes((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    setSelectedFiles((prev) =>
      prev.filter((_, index) => index !== indexToRemove),
    );
  };

  const removeExistingAttachment = (index) => {
    setExistingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingSampleImage = () => {
    setExistingSampleImage("");
    setExistingSampleImageNote("");
  };

  const updateDraftFileNote = (setter, fileId, note) => {
    setter((current) =>
      current.map((file) =>
        getDraftFileId(file) === fileId ? { ...file, note } : file,
      ),
    );
  };

  const buildDraftFileMetadata = () => {
    const groups = [
      ...(draftSampleImage ? [draftSampleImage] : []),
      ...draftAttachments,
      ...draftClientMockups,
      ...draftApprovedMockups,
    ];
    return groups
      .map((file, index) => ({
        _id: getDraftFileId(file),
        note: String(file.note || ""),
        order: Number.isFinite(Number(file.order)) ? Number(file.order) : index,
      }))
      .filter((file) => file._id);
  };

  const saveLatestQuoteDraft = async () => {
    const selectedSampleImage = draftSampleImage
      ? null
      : selectedFiles.find((file) => isImageReference(file)) || null;
    const attachmentFiles = selectedSampleImage
      ? selectedFiles.filter((file) => file !== selectedSampleImage)
      : selectedFiles;
    const getFileNote = (file) =>
      selectedFileNotes[buildFileKey(file)] || "";
    const savedDraft = await saveProjectDraft({
      id: activeDraftId,
      revision: activeDraftRevision,
      payload: {
        draftType: "quote",
        resumePath: "/create/quote",
        portalSource,
        scrollY: window.scrollY,
        formData: {
          ...formData,
          projectType: "Quote",
          items: normalizeDraftItems(formData.items),
          checklist: normalizeChecklist(formData.checklist),
        },
      },
      retainedFileIds: {
        attachments: draftAttachments.map(getDraftFileId).filter(Boolean),
        sampleImage: draftSampleImage
          ? [getDraftFileId(draftSampleImage)].filter(Boolean)
          : [],
        clientMockup: draftClientMockups.map(getDraftFileId).filter(Boolean),
        approvedMockup: draftApprovedMockups.map(getDraftFileId).filter(Boolean),
      },
      fileMetadata: buildDraftFileMetadata(),
      sampleImage: selectedSampleImage,
      sampleImageNote: selectedSampleImage
        ? getFileNote(selectedSampleImage)
        : draftSampleImage?.note || "",
      attachments: attachmentFiles,
      attachmentNotes: attachmentFiles.map(getFileNote),
      clientMockups: selectedClientMockups,
      clientMockupNotes: selectedClientMockups.map(
        (file) => selectedClientMockupNotes[buildFileKey(file)] || "",
      ),
    });
    const savedDraftId = toEntityId(savedDraft);
    if (!savedDraftId) {
      throw new Error("The server saved the draft without returning its ID.");
    }
    const savedFiles = getSavedDraftFiles(savedDraft);
    setActiveDraftId(savedDraftId);
    setActiveDraftRevision(
      Number.isFinite(Number(savedDraft.revision))
        ? Number(savedDraft.revision)
        : null,
    );
    setDraftSampleImage(savedFiles.sampleImage);
    setDraftAttachments(savedFiles.attachments);
    setDraftClientMockups(savedFiles.clientMockups);
    setDraftApprovedMockups(savedFiles.approvedMockups);
    setSelectedFiles([]);
    setSelectedFileNotes({});
    setSelectedClientMockups([]);
    setSelectedClientMockupNotes({});
    return savedDraft;
  };

  const handleSaveDraft = async () => {
    if (
      editingId ||
      !canManageCreationDrafts ||
      isSavingDraft ||
      isLoading
    ) return;
    setDraftSaveError("");
    setIsSavingDraft(true);
    try {
      await saveLatestQuoteDraft();
      triggerToast("Quote saved to drafts.", "success");
      navigate(draftsPath);
    } catch (error) {
      console.error("Failed to save quote draft", error);
      const message = error.message || "Failed to save the quote draft.";
      setDraftSaveError(message);
      triggerToast(message, "error");
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingId && revisionBlockMessage) {
      triggerToast(revisionBlockMessage, "error");
      return;
    }
    const trimmedOrderNumber = String(formData.quoteNumber || "").trim();
    if (!trimmedOrderNumber) {
      triggerToast("Please enter the Order Number.", "error");
      return;
    }
    if (trimmedOrderNumber !== formData.quoteNumber) {
      setFormData((prev) => ({ ...prev, quoteNumber: trimmedOrderNumber }));
    }
    if (!formData.deliveryTime) {
      triggerToast("Please set delivery time for this quote request.", "error");
      return;
    }
    if (!formData.projectLeadId) {
      alert("Please select a Project Lead. This is a required field.");
      return;
    }

    const hasChecklist = Object.values(formData.checklist).some(
      (val) => val === true,
    );
    if (!hasChecklist) {
      triggerToast("Please select at least one Requirement.", "error");
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    if (editingId && revisionBlockMessage) {
      setShowConfirmModal(false);
      triggerToast(revisionBlockMessage, "error");
      return;
    }
    setShowConfirmModal(false);
    setIsLoading(true);

    try {
      const orderNumber = String(formData.quoteNumber || "").trim();
      if (!orderNumber) {
        triggerToast("Please enter the Order Number.", "error");
        setIsLoading(false);
        return;
      }
      let submissionDraftId = "";
      let submissionDraftRevision = null;
      if (!editingId && canManageCreationDrafts) {
        setDraftSaveError("");
        const savedDraft = await saveLatestQuoteDraft();
        submissionDraftId = toEntityId(savedDraft);
        submissionDraftRevision = Number(savedDraft?.revision) || null;
      }
      const formPayload = new FormData();
      formPayload.append("projectType", "Quote");
      if (!editingId) {
        formPayload.append("status", "Quote Created");
      }
      formPayload.append("orderId", orderNumber);
      formPayload.append("projectName", formData.projectName);
      formPayload.append("projectIndicator", formData.projectIndicator || "");
      formPayload.append("client", formData.clientName);
      formPayload.append("clientEmail", formData.clientEmail); // [NEW]
      formPayload.append("clientPhone", formData.clientPhone); // [NEW]
      formPayload.append("briefOverview", formData.briefOverview);
      formPayload.append("deliveryDate", formData.deliveryDate);
      formPayload.append("deliveryTime", formData.deliveryTime);
      formPayload.append("projectLeadId", formData.projectLeadId);
      if (formData.assistantLeadId) {
        formPayload.append("assistantLeadId", formData.assistantLeadId);
      }
      formPayload.append("items", JSON.stringify(formData.items));
      formPayload.append(
        "quoteDetails",
        JSON.stringify({
          quoteNumber: orderNumber,
          checklist: normalizeChecklist(formData.checklist),
        }),
      );
      if (submissionDraftId) {
        formPayload.append("draftId", submissionDraftId);
        if (submissionDraftRevision) {
          formPayload.append(
            "draftRevision",
            String(submissionDraftRevision),
          );
        }
      }

      if (!submissionDraftId) {
        // Revisions and non-Front Desk creation retain the existing direct-upload
        // workflow. Front Desk/Admin creation submits the staged draft files.
        if (editingId) {
          formPayload.append("existingSampleImage", existingSampleImage || "");
          formPayload.append(
            "existingAttachments",
            JSON.stringify(existingAttachments || []),
          );
        }

        const getFileNote = (file) =>
          selectedFileNotes[buildFileKey(file)] || "";
        const imageFile = !editingId || !existingSampleImage
          ? selectedFiles.find((file) => isImageReference(file))
          : null;
        const attachmentFiles = imageFile
          ? selectedFiles.filter((file) => file !== imageFile)
          : selectedFiles;

        attachmentFiles.forEach((file) => {
          formPayload.append("attachments", file);
        });
        if (attachmentFiles.length > 0) {
          formPayload.append(
            "attachmentNotes",
            JSON.stringify(attachmentFiles.map((file) => getFileNote(file))),
          );
        }
        if (imageFile) formPayload.append("sampleImage", imageFile);

        if (selectedClientMockups.length > 0) {
          selectedClientMockups.forEach((file) => {
            formPayload.append("clientMockup", file);
          });
          formPayload.append(
            "clientMockupNotes",
            JSON.stringify(
              selectedClientMockups.map(
                (file) =>
                  selectedClientMockupNotes[buildFileKey(file)] || "",
              ),
            ),
          );
        }

        const sampleNote = imageFile
          ? getFileNote(imageFile)
          : existingSampleImage
            ? existingSampleImageNote
            : "";
        formPayload.append("sampleImageNote", sampleNote);
      }

      const url = editingId ? `/api/projects/${editingId}` : "/api/projects";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        body: formPayload,
      });

      if (res.ok) {
        setCreatedOrderNumber(orderNumber);
        triggerToast(
          editingId
            ? "Quote revision updated successfully!"
            : "Project Created Successfully!",
          "success",
        );
        setShowSuccessModal(true);
      } else {
        const err = await res.json();
        triggerToast(err.message || "Failed to create quote", "error");
      }
    } catch (err) {
      console.error(err);
      const message = err.message || "Error creating quote";
      if (!editingId && canManageCreationDrafts) setDraftSaveError(message);
      triggerToast(message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || isDraftLoading) return <Spinner />;

  return (
    <div className="minimal-quote-container">
      <FloatingMessageToast
        show={showToast.show}
        message={showToast.message}
        type={showToast.type}
        fading={isToastFading}
      />
      <div className="page-header">
        <div className="page-header-brand">
          <img
            src="/mhlogo.png"
            alt="Magic Hands"
            className="page-logo"
            draggable="false"
          />
          <div>
            <h1>
              {editingId
                ? "Edit Reopened Quote"
                : activeDraftId
                  ? "Continue Quote Draft"
                  : "Create New Quote"}
            </h1>
            <p className="subtitle">
              {activeDraftId
                ? "Continue from your last saved quote details"
                : "Front Desk entry for new quote requests"}
            </p>
          </div>
          <ContextualHelpLink
            label="Help with quote"
            topic="quote-blocked"
            category="Quotes"
            question="How do I complete this quote request correctly?"
          />
        </div>
      </div>

      <div className="minimal-quote-form-card">
        <form onSubmit={handleSubmit}>
          <div className="quote-meta-card">
            <div className="quote-meta-head">
              <div>
                <span className="quote-meta-eyebrow">Quote Snapshot</span>
                <h2 className="quote-meta-title">
                  {formatProjectDisplayName(
                    formData.projectName,
                    formData.projectIndicator,
                    "Quote Created",
                  )}
                </h2>
                <p className="quote-meta-subtitle">
                  Capture the core identifiers before filling the details.
                </p>
              </div>
            </div>
            <div className="quote-meta-grid">
              <Input
                label="Order Number"
                placeholder="Enter order number"
                value={formData.quoteNumber}
                onChange={(e) =>
                  handleChange({
                    target: { name: "quoteNumber", value: e.target.value },
                  })
                }
                icon={<span className="text-icon">#</span>}
                required
              />
              <Input
                type="date"
                label="Requested Completion Date"
                value={formData.deliveryDate}
                onChange={(e) =>
                  handleChange({
                    target: { name: "deliveryDate", value: e.target.value },
                  })
                }
                icon={<CalendarIcon />}
              />
              <Input
                type="time"
                label="Requested Completion Time"
                value={formData.deliveryTime}
                onChange={(e) =>
                  handleChange({
                    target: { name: "deliveryTime", value: e.target.value },
                  })
                }
                icon={<ClockIcon />}
                required
              />
            </div>
          </div>

          {/* Basic Info */}
          <div className="minimal-quote-form-section">
            <h3 className="section-subtitle">Leadership & Contact</h3>
            <div className="minimal-quote-grid">
              <Select
                label="Assigned Lead"
                options={leads}
                value={leads.find((l) => l.value === formData.projectLeadId)}
                onChange={(option) =>
                  setFormData((prev) => ({
                    ...prev,
                    projectLeadId: option.value,
                    assistantLeadId:
                      option.value === prev.assistantLeadId
                        ? ""
                        : prev.assistantLeadId,
                  }))
                }
                placeholder="Select Lead"
                renderValue={renderLeadValue}
                renderOption={renderLeadOption}
              />

              <Select
                label="Assistant Lead (Optional)"
                options={leads.filter(
                  (l) => l.value !== formData.projectLeadId,
                )}
                value={leads.find((l) => l.value === formData.assistantLeadId)}
                onChange={(option) =>
                  setFormData((prev) => ({
                    ...prev,
                    assistantLeadId: option.value,
                  }))
                }
                placeholder="Select Assistant"
                renderValue={renderLeadValue}
                renderOption={renderLeadOption}
              />
            </div>

            <div className="minimal-quote-grid">
              <Input
                label="Project / Item Name"
                placeholder="e.g. Annual Report Print"
                value={formData.projectName}
                onChange={(e) =>
                  handleChange({
                    target: { name: "projectName", value: e.target.value },
                  })
                }
                icon={<FolderIcon />}
              />
              <Input
                label="Brand / Project Indicator"
                placeholder="e.g. Presidential Villa"
                value={formData.projectIndicator}
                onChange={(e) =>
                  handleChange({
                    target: { name: "projectIndicator", value: e.target.value },
                  })
                }
                icon={<FolderIcon />}
              />
            </div>

            <div className="contact-grid">
              <Input
                label="Client Name"
                placeholder="e.g. MagicHands Corp"
                value={formData.clientName}
                onChange={(e) =>
                  handleChange({
                    target: { name: "clientName", value: e.target.value },
                  })
                }
                icon={<PersonIcon />}
              />

              <Input
                label="Client Email"
                placeholder="e.g. contact@client.com"
                value={formData.clientEmail}
                onChange={(e) =>
                  handleChange({
                    target: { name: "clientEmail", value: e.target.value },
                  })
                }
                icon={<MailIcon />}
              />

              <Input
                label="Client Phone"
                placeholder="e.g. +1234567890"
                value={formData.clientPhone}
                onChange={(e) =>
                  handleChange({
                    target: { name: "clientPhone", value: e.target.value },
                  })
                }
                icon={<PhoneIcon />}
              />
            </div>

            <div className="minimal-quote-form-group">
              <label className="input-label">Brief Overview</label>
              <textarea
                name="briefOverview"
                className="minimal-quote-textarea-std"
                value={formData.briefOverview}
                onChange={handleChange}
                placeholder="High-level summary of the request..."
                rows="3"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-input)",
                  color: "var(--text-color)",
                }}
              />
            </div>
          </div>

          <div className="divider"></div>

          {/* Items Section */}
          <div className="minimal-quote-form-section">
            <h3 className="section-subtitle">Order Items</h3>
            <div className="minimal-quote-items-container">
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
                          className="minimal-quote-remove-btn"
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="item-card-body">
                    <div className="item-input-group main">
                      <label>Description</label>
                      <Input
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) =>
                          updateItem(index, "description", e.target.value)
                        }
                      />
                    </div>
                    <div className="item-input-group details">
                      <label>Details (Optional)</label>
                      <Input
                        placeholder="Details (Optional)"
                        value={item.breakdown}
                        onChange={(e) =>
                          updateItem(index, "breakdown", e.target.value)
                        }
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
                          min="1"
                          className="form-input"
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
                className="minimal-quote-add-btn"
              >
                + Add Another Item
              </button>
            </div>
          </div>

          <div className="divider"></div>

          {/* Checklist Section */}
          <div className="minimal-quote-form-section">
            <h3 className="section-subtitle">
              Quote Requirements Checklist{" "}
              <span style={{ color: "red" }}>*</span>
            </h3>
            <p className="section-hint">
              Cost is required for every quote. You can add Mockup, Previous
              Sample / Jobs Done, Sample Production, and Bid Submission /
              Documents as additional requirements.
            </p>
            <div className="minimal-quote-checklist-grid">
              <label className="checklist-item">
                <input
                  type="checkbox"
                  checked={formData.checklist.cost}
                  disabled
                  readOnly
                />
                <span>Cost (Required)</span>
              </label>
              <label className="checklist-item">
                <input
                  type="checkbox"
                  checked={formData.checklist.mockup}
                  onChange={() => handleChecklistChange("mockup")}
                />
                <span>Mockup</span>
              </label>
              <label className="checklist-item">
                <input
                  type="checkbox"
                  checked={formData.checklist.previousSamples}
                  onChange={() => handleChecklistChange("previousSamples")}
                />
                <span>Previous Sample / Jobs Done</span>
              </label>
              <label className="checklist-item">
                <input
                  type="checkbox"
                  checked={formData.checklist.sampleProduction}
                  onChange={() => handleChecklistChange("sampleProduction")}
                />
                <span>Sample Production</span>
              </label>
              <label className="checklist-item">
                <input
                  type="checkbox"
                  checked={formData.checklist.bidSubmission}
                  onChange={() => handleChecklistChange("bidSubmission")}
                />
                <span>Bid Submission / Documents</span>
              </label>
            </div>
          </div>

          <div className="divider"></div>

          {!editingId && (
            <>
              <div className="minimal-quote-form-section">
                <h3 className="section-subtitle">Client Mockup</h3>
                <p className="section-hint">
                  Upload client-provided artwork or mockup so Graphics can validate it or revise it later.
                </p>
                <input
                  type="file"
                  id="quote-client-mockup"
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

                <div
                  className="reference-dropzone"
                  onClick={() =>
                    document.getElementById("quote-client-mockup").click()
                  }
                  style={{ cursor: "pointer" }}
                >
                  <div className="dropzone-icon">
                    <UploadIcon />
                  </div>
                  <div>
                    <p>
                      {selectedClientMockups.length > 0 ||
                      draftClientMockups.length > 0
                        ? "Add client mockups"
                        : "Upload client mockups"}
                    </p>
                    <span>Keep this separate from general references</span>
                  </div>
                </div>

                {(draftClientMockups.length > 0 ||
                  selectedClientMockups.length > 0) && (
                  <div className="reference-files-grid">
                    {draftClientMockups.map((file, index) => {
                      const fileId = getDraftFileId(file);
                      return (
                        <div
                          key={fileId || `draft-client-mockup-${index}`}
                          className="reference-file-tile existing draft-file"
                        >
                          <div className="file-icon">
                            {isImageReference(file) ? (
                              <img
                                src={file.fileUrl}
                                alt={`${file.fileName || "Client mockup"} preview`}
                              />
                            ) : (
                              <FolderIcon />
                            )}
                          </div>
                          <div className="file-info" title={file.fileName}>
                            <span className="file-name">
                              {file.fileName || "Client mockup"}
                            </span>
                            <span className="file-size">
                              {formatFileSize(file.size) || "Saved"}
                            </span>
                          </div>
                          <textarea
                            className="reference-file-note"
                            placeholder="Add note for Graphics..."
                            value={file.note || ""}
                            onChange={(event) =>
                              updateDraftFileNote(
                                setDraftClientMockups,
                                fileId,
                                event.target.value,
                              )
                            }
                            rows="2"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setDraftClientMockups((current) =>
                                current.filter(
                                  (entry) => getDraftFileId(entry) !== fileId,
                                ),
                              )
                            }
                            className="file-remove-btn"
                            aria-label={`Remove ${file.fileName || "client mockup"}`}
                          >
                            &times;
                          </button>
                        </div>
                      );
                    })}
                    {selectedClientMockups.map((file) => {
                      const fileKey = buildFileKey(file);
                      return (
                        <div key={fileKey} className="reference-file-tile">
                          <div className="file-icon">
                            {isImageReference(file) &&
                            clientMockupPreviewUrls[fileKey] ? (
                              <img
                                src={clientMockupPreviewUrls[fileKey]}
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

              <div className="divider"></div>
            </>
          )}

          {/* Reference Materials */}
          <div className="minimal-quote-form-section">
            <h3 className="section-subtitle">Reference Lab</h3>
            <p className="section-hint">
              Add artwork, briefs, images, or production references for this
              quote.
            </p>
            <input
              type="file"
              multiple
              id="quote-attachments"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  const filesArray = Array.from(e.target.files);
                  setSelectedFiles((prev) => [...prev, ...filesArray]);
                  e.target.value = null;
                }
              }}
            />

            {selectedFiles.length === 0 &&
              !existingSampleImage &&
              existingAttachments.length === 0 &&
              !draftSampleImage &&
              draftAttachments.length === 0 && (
                <div
                  className="reference-dropzone"
                  onClick={() =>
                    document.getElementById("quote-attachments").click()
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

            {(selectedFiles.length > 0 ||
              existingSampleImage ||
              existingAttachments.length > 0 ||
              draftSampleImage ||
              draftAttachments.length > 0) && (
              <div className="reference-files-grid">
                {draftSampleImage && (
                  <div className="reference-file-tile existing draft-file">
                    <div className="file-icon">
                      <img
                        src={draftSampleImage.fileUrl}
                        alt={`${draftSampleImage.fileName || "Sample image"} preview`}
                      />
                    </div>
                    <div
                      className="file-info"
                      title={draftSampleImage.fileName || "Sample image"}
                    >
                      <span className="file-name">
                        {draftSampleImage.fileName || "Sample Image"}
                      </span>
                      <span className="file-size">
                        {formatFileSize(draftSampleImage.size) || "Saved"}
                      </span>
                    </div>
                    <textarea
                      className="reference-file-note"
                      placeholder="Add note for this reference..."
                      value={draftSampleImage.note || ""}
                      onChange={(event) =>
                        setDraftSampleImage((current) =>
                          current
                            ? { ...current, note: event.target.value }
                            : current,
                        )
                      }
                      rows="2"
                    />
                    <button
                      type="button"
                      onClick={() => setDraftSampleImage(null)}
                      className="file-remove-btn"
                      aria-label={`Remove ${draftSampleImage.fileName || "sample image"}`}
                    >
                      &times;
                    </button>
                  </div>
                )}

                {draftAttachments.map((file, index) => {
                  const fileId = getDraftFileId(file);
                  return (
                    <div
                      key={fileId || `draft-attachment-${index}`}
                      className="reference-file-tile existing draft-file"
                    >
                      <div className="file-icon">
                        {isImageReference(file) ? (
                          <img
                            src={file.fileUrl}
                            alt={`${file.fileName || "Attachment"} preview`}
                          />
                        ) : (
                          <FolderIcon />
                        )}
                      </div>
                      <div className="file-info" title={file.fileName}>
                        <span className="file-name">
                          {file.fileName || "Reference file"}
                        </span>
                        <span className="file-size">
                          {formatFileSize(file.size) || "Saved"}
                        </span>
                      </div>
                      <textarea
                        className="reference-file-note"
                        placeholder="Add note for this reference..."
                        value={file.note || ""}
                        onChange={(event) =>
                          updateDraftFileNote(
                            setDraftAttachments,
                            fileId,
                            event.target.value,
                          )
                        }
                        rows="2"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraftAttachments((current) =>
                            current.filter(
                              (entry) => getDraftFileId(entry) !== fileId,
                            ),
                          )
                        }
                        className="file-remove-btn"
                        aria-label={`Remove ${file.fileName || "reference file"}`}
                      >
                        &times;
                      </button>
                    </div>
                  );
                })}

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
                      {isImageReference(file) &&
                      filePreviewUrls[fileKey] ? (
                        <img src={filePreviewUrls[fileKey]} alt="preview" />
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
                    document.getElementById("quote-attachments").click()
                  }
                >
                  <span>+</span>
                </div>
              </div>
            )}
          </div>

          {editingId && revisionBlockMessage && (
            <div className="revision-blocked-notice" role="alert">
              {revisionBlockMessage}
            </div>
          )}

          <div className="minimal-quote-actions">
            <button
              type="button"
              className="minimal-quote-btn-cancel"
              onClick={() => navigate(dashboardPath)}
            >
              Cancel
            </button>
            {!editingId && canManageCreationDrafts && (
              <button
                type="button"
                className="minimal-quote-btn-draft"
                onClick={handleSaveDraft}
                disabled={isLoading || isSavingDraft}
              >
                {isSavingDraft ? "Saving Draft..." : "Save to Draft"}
              </button>
            )}
            <button
              type="submit"
              className="minimal-quote-btn-submit"
              disabled={
                isLoading ||
                isSavingDraft ||
                Boolean(editingId && revisionBlockMessage)
              }
            >
              {editingId ? "Save Reopened Quote" : "Create Quote Project"}
            </button>
          </div>
          {!editingId && canManageCreationDrafts && (
            <div
              className={`quote-draft-status ${draftSaveError ? "error" : ""}`}
              role={draftSaveError ? "alert" : "status"}
              aria-live="polite"
            >
              {draftSaveError ||
                (isSavingDraft
                  ? "Uploading files and saving every quote detail..."
                  : activeDraftId
                    ? "This quote is backed by a saved draft."
                    : "Drafts can be resumed later with all files and notes intact.")}
            </div>
          )}
        </form>
      </div>

      <ConfirmationModal
        isOpen={showSuccessModal}
        onClose={() => navigate(dashboardPath)}
        onConfirm={() => navigate(dashboardPath)}
        title={
          editingId
            ? "Quote Updated Successfully"
            : "Quote Created Successfully"
        }
        message={
          editingId
            ? `Quote revision ${createdOrderNumber} has been saved successfully.`
            : `New quote project ${createdOrderNumber} has been created and assigned to the Project Lead for scope approval.`
        }
        confirmText="Back to Dashboard"
        hideCancel={true}
      />
      <ConfirmationModal
        isOpen={showConfirmModal}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowConfirmModal(false)}
        title={editingId ? "Confirm Quote Update" : "Confirm New Quote Order"}
        message={
          editingId
            ? `Are you sure you want to save reopened quote ${formData.quoteNumber}?`
            : `Are you sure you want to create a new project for ${formData.clientName}? It will be assigned to the selected Project Lead for approval.`
        }
        confirmText={editingId ? "Yes, Save Changes" : "Yes, Create Quote"}
        cancelText="Cancel"
      />
    </div>
  );
};

export default MinimalQuoteForm;
