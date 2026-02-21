import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  PRODUCTION_SUB_DEPARTMENTS,
  GRAPHICS_SUB_DEPARTMENTS,
  STORES_SUB_DEPARTMENTS,
  PHOTOGRAPHY_SUB_DEPARTMENTS,
  getDepartmentLabel,
} from "../../constants/departments";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import Toast from "../../components/ui/Toast";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { getLeadDisplay } from "../../utils/leadDisplay";
import "./EngagedProjects.css";

const STATUS_ACTIONS = {
  Graphics: {
    label: "Mockup",
    pending: "Pending Mockup",
    complete: "Mockup Completed",
  },
  Production: {
    label: "Production Complete",
    pending: "Pending Production",
    complete: "Production Completed",
  },
  Stores: {
    label: "Stocks & Packaging Complete",
    pending: "Pending Packaging",
    complete: "Packaging Completed",
  },
};

const ACKNOWLEDGE_PHRASE = "I agree to be engaged in this project";
const COMPLETE_PHRASE = "I confirm this engagement is complete";
const SCOPE_APPROVAL_READY_STATUSES = new Set([
  "Scope Approval Completed",
  "Pending Departmental Engagement",
  "Departmental Engagement Completed",
  "Pending Mockup",
  "Mockup Completed",
  "Pending Production",
  "Production Completed",
  "Pending Packaging",
  "Packaging Completed",
  "Pending Delivery/Pickup",
  "Delivered",
  "Pending Feedback",
  "Feedback Completed",
  "Finished",
  "In Progress",
  "Completed",
  "On Hold",
]);

const isScopeApprovalComplete = (status) =>
  Boolean(status && SCOPE_APPROVAL_READY_STATUSES.has(status));

const getReferenceFileName = (path) => {
  if (!path) return "Reference File";
  const withoutQuery = String(path).split("?")[0];
  const rawName = withoutQuery.split("/").pop() || withoutQuery;
  try {
    return decodeURIComponent(rawName);
  } catch {
    return rawName;
  }
};

const getReferenceFileExtension = (path) => {
  const fileName = getReferenceFileName(path);
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) return "FILE";
  return fileName.slice(dotIndex + 1).toUpperCase().slice(0, 6);
};

const isImageReference = (path) =>
  /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(path || ""));

const EngagedProjectActions = ({ user }) => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState(null);

  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateScopeDepts, setUpdateScopeDepts] = useState([]);
  const [updateForm, setUpdateForm] = useState({
    content: "",
    category: "Production",
    department: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const [showAcknowledgeModal, setShowAcknowledgeModal] = useState(false);
  const [acknowledgeTarget, setAcknowledgeTarget] = useState(null);
  const [acknowledgeInput, setAcknowledgeInput] = useState("");
  const [acknowledgeSubmitting, setAcknowledgeSubmitting] = useState(false);

  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeTarget, setCompleteTarget] = useState(null);
  const [completeInput, setCompleteInput] = useState("");
  const [completeSubmitting, setCompleteSubmitting] = useState(false);

  const [showMockupModal, setShowMockupModal] = useState(false);
  const [mockupTarget, setMockupTarget] = useState(null);
  const [mockupFile, setMockupFile] = useState(null);
  const [mockupNote, setMockupNote] = useState("");
  const [mockupUploading, setMockupUploading] = useState(false);

  const userDepartments = Array.isArray(user?.department)
    ? user.department
    : user?.department
      ? [user.department]
      : [];

  const hasProductionParent = userDepartments.includes("Production");
  const hasGraphicsParent = userDepartments.includes("Graphics/Design");
  const hasStoresParent = userDepartments.includes("Stores");
  const hasPhotographyParent = userDepartments.includes("Photography");

  const productionSubDepts = useMemo(() => {
    if (hasProductionParent) return PRODUCTION_SUB_DEPARTMENTS;
    return userDepartments.filter((d) => PRODUCTION_SUB_DEPARTMENTS.includes(d));
  }, [userDepartments, hasProductionParent]);

  const userEngagedDepts = useMemo(() => {
    const found = [];
    if (hasProductionParent || productionSubDepts.length > 0)
      found.push("Production");
    if (
      hasGraphicsParent ||
      userDepartments.some((d) => GRAPHICS_SUB_DEPARTMENTS.includes(d))
    )
      found.push("Graphics");
    if (
      hasStoresParent ||
      userDepartments.some((d) => STORES_SUB_DEPARTMENTS.includes(d))
    )
      found.push("Stores");
    if (
      hasPhotographyParent ||
      userDepartments.some((d) => PHOTOGRAPHY_SUB_DEPARTMENTS.includes(d))
    )
      found.push("Photography");
    return found;
  }, [
    userDepartments,
    productionSubDepts,
    hasProductionParent,
    hasGraphicsParent,
    hasStoresParent,
    hasPhotographyParent,
  ]);

  const engagedSubDepts = useMemo(() => {
    let aggregated = [];
    if (hasProductionParent || productionSubDepts.length > 0)
      aggregated = [...aggregated, ...productionSubDepts];
    if (userEngagedDepts.includes("Graphics"))
      aggregated = [...aggregated, ...GRAPHICS_SUB_DEPARTMENTS];
    if (userEngagedDepts.includes("Stores"))
      aggregated = [...aggregated, ...STORES_SUB_DEPARTMENTS];
    if (userEngagedDepts.includes("Photography"))
      aggregated = [...aggregated, ...PHOTOGRAPHY_SUB_DEPARTMENTS];
    return Array.from(new Set(aggregated));
  }, [
    userEngagedDepts,
    productionSubDepts,
    hasProductionParent,
  ]);

  const projectEngagedSubDepts = useMemo(() => {
    if (!project) return [];
    return (project.departments || []).filter((dept) =>
      engagedSubDepts.includes(dept),
    );
  }, [project, engagedSubDepts]);

  const acknowledgedDepts = useMemo(
    () => new Set((project?.acknowledgements || []).map((ack) => ack.department)),
    [project],
  );

  const paymentTypes = useMemo(
    () =>
      new Set(
        (project?.paymentVerifications || []).map((entry) => entry.type),
      ),
    [project],
  );

  const paymentChecksEnabled = project?.projectType !== "Quote";
  const hasPaymentVerification = paymentTypes.size > 0;

  const showPaymentWarning =
    project &&
    paymentChecksEnabled &&
    !hasPaymentVerification &&
    [
      "Scope Approval Completed",
      "Pending Departmental Engagement",
      "Departmental Engagement Completed",
      "Pending Mockup",
      "Pending Production",
    ].includes(project.status);

  const mockupUrl = project?.mockup?.fileUrl;
  const mockupName = project?.mockup?.fileName || "Approved Mockup";
  const mockupType = project?.mockup?.fileType || "";
  const isImageMockup =
    mockupType.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(mockupUrl || "");
  const isPdfMockup =
    mockupType === "application/pdf" || /\.pdf$/i.test(mockupUrl || "");
  const departmentSections = useMemo(() => {
    if (!project) return [];

    const sections = [];

    const buildSection = (key, label, pool) => {
      const subDepts = pool.filter((dept) =>
        projectEngagedSubDepts.includes(dept),
      );
      if (subDepts.length === 0) return;
      sections.push({
        key,
        label,
        subDepts,
        action: STATUS_ACTIONS[key]
          ? { dept: key, ...STATUS_ACTIONS[key] }
          : null,
      });
    };

    if (userEngagedDepts.includes("Graphics")) {
      buildSection("Graphics", "Graphics", GRAPHICS_SUB_DEPARTMENTS);
    }
    if (userEngagedDepts.includes("Production")) {
      buildSection("Production", "Production", productionSubDepts);
    }
    if (userEngagedDepts.includes("Stores")) {
      buildSection("Stores", "Stores", STORES_SUB_DEPARTMENTS);
    }
    if (userEngagedDepts.includes("Photography")) {
      buildSection("Photography", "Photography", PHOTOGRAPHY_SUB_DEPARTMENTS);
    }

    return sections;
  }, [project, projectEngagedSubDepts, userEngagedDepts, productionSubDepts]);

  const shouldShowScopeReferenceSection = useMemo(
    () =>
      departmentSections.some(
        (section) => section.key === "Graphics" || section.key === "Production",
      ),
    [departmentSections],
  );

  const briefOverview = useMemo(
    () => String(project?.details?.briefOverview || "").trim(),
    [project?.details?.briefOverview],
  );

  const scopeReferenceItems = useMemo(() => {
    const sampleImage = String(project?.details?.sampleImage || "").trim();
    const attachments = Array.isArray(project?.details?.attachments)
      ? project.details.attachments
      : [];

    const seen = new Set();
    const items = [];
    const addItem = (path, label) => {
      const normalized = String(path || "").trim();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      items.push({ path: normalized, label });
    };

    addItem(sampleImage, "Primary Reference");

    let attachmentCounter = 0;
    attachments.forEach((path) => {
      attachmentCounter += 1;
      addItem(path, `Reference Material ${attachmentCounter}`);
    });

    return items;
  }, [project?.details?.sampleImage, project?.details?.attachments]);

  const formatDate = (dateStr) => {
    if (!dateStr) return "TBD";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return "";
    return timeStr;
  };

  const fetchProject = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/projects?mode=engaged");
      if (!res.ok) {
        throw new Error("Failed to load engaged project.");
      }
      const data = await res.json();
      const engaged = data.filter((item) => {
        if (!item.departments || item.departments.length === 0) return false;
        return item.departments.some((dept) => engagedSubDepts.includes(dept));
      });
      const match = engaged.find((item) => item._id === id);
      if (!match) {
        const exists = data.some((item) => item._id === id);
        if (exists) {
          throw new Error("This project is not assigned to your department.");
        }
        throw new Error("Engaged project not found.");
      }
      setProject(match);
    } catch (err) {
      setError(err.message || "Failed to load engaged project.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (engagedSubDepts.length === 0) {
      setLoading(false);
      setError("No engaged departments are assigned to your profile.");
      return;
    }
    fetchProject();
  }, [id, engagedSubDepts]);

  useRealtimeRefresh(() => fetchProject(), {
    enabled: Boolean(id) && engagedSubDepts.length > 0,
  });

  const handleCompleteStatus = async (targetProject, action) => {
    const actionKey = `${targetProject._id}:${action.complete}`;
    setStatusUpdating(actionKey);
    try {
      const res = await fetch(`/api/projects/${targetProject._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action.complete }),
      });

      if (res.ok) {
        setToast({
          type: "success",
          message: `${action.label} recorded.`,
        });
        await fetchProject();
        return true;
      }
      const errorData = await res.json().catch(() => ({}));
      setToast({
        type: "error",
        message: errorData.message || "Failed to update status.",
      });
      return false;
    } catch (err) {
      console.error("Error updating status:", err);
      setToast({
        type: "error",
        message: "An unexpected error occurred.",
      });
      return false;
    } finally {
      setStatusUpdating(null);
    }
  };

  const getCategoryForDepartment = (dept) => {
    if (GRAPHICS_SUB_DEPARTMENTS.includes(dept)) return "Graphics";
    if (STORES_SUB_DEPARTMENTS.includes(dept)) return "Stores";
    if (PHOTOGRAPHY_SUB_DEPARTMENTS.includes(dept)) return "Photography";
    return "Production";
  };

  const handleOpenUpdateModal = (departments = projectEngagedSubDepts) => {
    if (!project) return;
    const availableDepts = departments?.length
      ? departments
      : projectEngagedSubDepts;
    if (availableDepts.length === 0) {
      setToast({
        type: "error",
        message: "No engaged departments available for updates.",
      });
      return;
    }
    const defaultDept = availableDepts[0];
    setUpdateScopeDepts(availableDepts);
    setUpdateForm({
      content: "",
      category: getCategoryForDepartment(defaultDept),
      department: defaultDept,
    });
    setShowUpdateModal(true);
  };

  const handleSubmitUpdate = async (e) => {
    e.preventDefault();
    if (!updateForm.content || !updateForm.department) {
      setToast({
        type: "error",
        message: "Please provide update content and select a department.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const data = new FormData();
      data.append(
        "content",
        `[${getDepartmentLabel(updateForm.department)}] ${updateForm.content}`,
      );
      data.append("category", updateForm.category);
      data.append("isEndOfDayUpdate", false);

      const res = await fetch(`/api/updates/project/${project._id}`, {
        method: "POST",
        body: data,
      });

      if (res.ok) {
        setToast({ type: "success", message: "Update posted successfully!" });
        setShowUpdateModal(false);
        setUpdateScopeDepts([]);
        setUpdateForm({ content: "", category: "Production", department: "" });
      } else {
        const errorData = await res.json();
        setToast({
          type: "error",
          message: errorData.message || "Failed to post update.",
        });
      }
    } catch (err) {
      console.error("Error posting update:", err);
      setToast({ type: "error", message: "An unexpected error occurred." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcknowledge = async (targetProject, department) => {
    try {
      const res = await fetch(`/api/projects/${targetProject._id}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department }),
      });

      if (res.ok) {
        setToast({
          type: "success",
          message: `${getDepartmentLabel(department)} acknowledged!`,
        });
        await fetchProject();
        return true;
      }
      const errorData = await res.json();
      setToast({
        type: "error",
        message: errorData.message || "Acknowledgement failed.",
      });
      return false;
    } catch (err) {
      console.error("Error acknowledging project:", err);
      setToast({ type: "error", message: "An unexpected error occurred." });
      return false;
    }
  };

  const openAcknowledgeModal = (targetProject, department) => {
    if (!isScopeApprovalComplete(targetProject.status)) {
      setToast({
        type: "error",
        message: "Scope approval must be completed before engagement can be accepted.",
      });
      return;
    }
    setAcknowledgeTarget({ project: targetProject, department });
    setAcknowledgeInput("");
    setShowAcknowledgeModal(true);
  };

  const closeAcknowledgeModal = () => {
    setShowAcknowledgeModal(false);
    setAcknowledgeTarget(null);
    setAcknowledgeInput("");
    setAcknowledgeSubmitting(false);
  };

  const handleConfirmAcknowledge = async () => {
    if (!acknowledgeTarget) return;
    if (acknowledgeInput.trim() !== ACKNOWLEDGE_PHRASE) return;

    setAcknowledgeSubmitting(true);
    const acknowledged = await handleAcknowledge(
      acknowledgeTarget.project,
      acknowledgeTarget.department,
    );
    setAcknowledgeSubmitting(false);
    if (acknowledged) {
      setShowAcknowledgeModal(false);
      setAcknowledgeTarget(null);
      setAcknowledgeInput("");
    }
  };

  const openCompleteModal = (targetProject, action) => {
    setCompleteTarget({ project: targetProject, action });
    setCompleteInput("");
    setShowCompleteModal(true);
  };

  const openMockupModal = (targetProject, action) => {
    setMockupTarget({ project: targetProject, action });
    setMockupFile(null);
    setMockupNote("");
    setShowMockupModal(true);
  };

  const closeCompleteModal = () => {
    setShowCompleteModal(false);
    setCompleteTarget(null);
    setCompleteInput("");
    setCompleteSubmitting(false);
  };

  const closeMockupModal = () => {
    setShowMockupModal(false);
    setMockupTarget(null);
    setMockupFile(null);
    setMockupNote("");
    setMockupUploading(false);
  };

  const handleConfirmComplete = async () => {
    if (!completeTarget) return;
    if (completeInput.trim() !== COMPLETE_PHRASE) return;

    setCompleteSubmitting(true);
    const completed = await handleCompleteStatus(
      completeTarget.project,
      completeTarget.action,
    );
    setCompleteSubmitting(false);
    if (completed) {
      setShowCompleteModal(false);
      setCompleteTarget(null);
      setCompleteInput("");
    }
  };

  const handleUploadMockup = async (e) => {
    e.preventDefault();
    if (!mockupTarget) return;
    if (!mockupFile) {
      setToast({ type: "error", message: "Please select a mockup file." });
      return;
    }

    setMockupUploading(true);
    const target = mockupTarget;
    try {
      const data = new FormData();
      data.append("mockup", mockupFile);
      if (mockupNote.trim()) data.append("note", mockupNote.trim());

      const res = await fetch(`/api/projects/${target.project._id}/mockup`, {
        method: "POST",
        body: data,
      });

      if (res.ok) {
        const updatedProject = await res.json();
        setToast({
          type: "success",
          message: "Mockup uploaded. Please confirm completion.",
        });
        setProject(updatedProject);
        closeMockupModal();
      } else {
        const errorData = await res.json().catch(() => ({}));
        setToast({
          type: "error",
          message: errorData.message || "Failed to upload mockup.",
        });
      }
    } catch (err) {
      console.error("Error uploading mockup:", err);
      setToast({ type: "error", message: "An unexpected error occurred." });
    } finally {
      setMockupUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="engaged-projects-container">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="engaged-projects-container">
        <div className="empty-state">{error || "Project not found."}</div>
        <button
          className="update-btn view-actions-btn"
          onClick={() => navigate("/engaged-projects")}
          style={{ marginTop: "1rem" }}
        >
          Back to Engaged Projects
        </button>
      </div>
    );
  }

  const lead = getLeadDisplay(project, "Unassigned");
  const deliveryDate = formatDate(project.details?.deliveryDate);
  const deliveryTime = formatTime(project.details?.deliveryTime);
  const projectId = project.orderId || project._id.slice(-6).toUpperCase();
  const projectName = project.details?.projectName || "Untitled";
  const parsedVersion = Number(project.versionNumber);
  const projectVersion =
    Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1;
  const showVersionTag = projectVersion > 1;

  return (
    <div className="engaged-projects-container engaged-actions-page">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="engaged-actions-header">
        <div>
          <h1>Engaged Project Actions</h1>
          <p className="engaged-subtitle">
            <span className="project-id-with-version">
              <span>{projectId}</span>
              {showVersionTag && (
                <span className="project-version-chip">v{projectVersion}</span>
              )}
            </span>{" "}
            - {projectName}
          </p>
        </div>
        <button
          className="update-btn view-actions-btn"
          onClick={() => navigate("/engaged-projects")}
        >
          Back to Engaged Projects
        </button>
      </div>

      <div className="engaged-actions-summary">
        <div className="engaged-summary-details">
          <div>
            <strong>Lead:</strong> {lead}
          </div>
          <div>
            <strong>Client:</strong> {project.details?.client || "N/A"}
          </div>
          <div>
            <strong>Delivery:</strong> {deliveryDate}
            {deliveryTime && ` (${deliveryTime})`}
          </div>
        </div>
        <div className="engaged-summary-tags">
          <span
            className={`status-badge ${project.status
              .toLowerCase()
              .replace(/\s+/g, "-")}`}
          >
            {project.status}
          </span>
        </div>
      </div>

      {shouldShowScopeReferenceSection && (
        <section className="engaged-scope-section">
          <div className="engaged-scope-header">
            <div>
              <h2>Brief Overview &amp; Reference Materials</h2>
              <p>
                Review the project scope and source files before starting design
                and production work.
              </p>
            </div>
            <div className="engaged-scope-stats">
              <span className="engaged-scope-pill">
                {scopeReferenceItems.length}{" "}
                {scopeReferenceItems.length === 1 ? "file" : "files"}
              </span>
              <span className="engaged-scope-pill muted">
                {briefOverview ? "Brief ready" : "Brief pending"}
              </span>
            </div>
          </div>

          <div className="engaged-scope-grid">
            <article className="engaged-scope-card">
              <h3>Brief Overview</h3>
              {briefOverview ? (
                <p className="engaged-scope-brief-text">{briefOverview}</p>
              ) : (
                <p className="engaged-scope-empty">
                  No brief overview has been added yet.
                </p>
              )}
            </article>

            <article className="engaged-scope-card">
              <h3>Reference Materials</h3>
              {scopeReferenceItems.length === 0 ? (
                <p className="engaged-scope-empty">
                  No reference materials uploaded yet.
                </p>
              ) : (
                <div className="engaged-reference-grid">
                  {scopeReferenceItems.map((item) => {
                    const fileName = getReferenceFileName(item.path);
                    const fileExtension = getReferenceFileExtension(item.path);
                    const isImage = isImageReference(item.path);

                    return (
                      <a
                        key={item.path}
                        className="engaged-reference-item"
                        href={item.path}
                        target="_blank"
                        rel="noreferrer"
                        download
                      >
                        <div
                          className={`engaged-reference-preview ${
                            isImage ? "is-image" : "is-file"
                          }`}
                        >
                          {isImage ? (
                            <img src={item.path} alt={fileName} loading="lazy" />
                          ) : (
                            <span>{fileExtension}</span>
                          )}
                        </div>
                        <div className="engaged-reference-meta">
                          <span className="engaged-reference-tag">
                            {item.label}
                          </span>
                          <span className="engaged-reference-name">{fileName}</span>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </article>
          </div>
        </section>
      )}

      <div className="engaged-sections">
        {departmentSections.length === 0 ? (
          <div className="empty-state">No engaged departments available.</div>
        ) : (
          departmentSections.map((section) => {
            const action = section.action;
            const isProductionSection = section.key === "Production";

            return (
              <section key={section.key} className="engaged-section">
                <div className="engaged-section-header">
                  <div>
                    <h2 className="engaged-section-title">{section.label}</h2>
                    <p className="engaged-section-subtitle">
                      {section.subDepts.length > 1
                        ? "Engaged departments"
                        : "Engaged department"}
                    </p>
                  </div>
                  <div className="engaged-section-tags">
                    {section.subDepts.map((dept) => (
                      <span key={dept} className="engaged-section-chip">
                        {getDepartmentLabel(dept)}
                      </span>
                    ))}
                  </div>
                </div>

                {isProductionSection && showPaymentWarning && (
                  <div className="engaged-warning-banner">
                    Payment verification is required before production can be completed.
                  </div>
                )}

                <div className="engaged-section-grid">
                  <div className="engaged-action-card">
                    <h3>Post Update</h3>
                    <p>
                      Share a quick update for the {section.label.toLowerCase()} team.
                    </p>
                    <button
                      className="update-btn"
                      onClick={() => handleOpenUpdateModal(section.subDepts)}
                      disabled={section.subDepts.length === 0}
                    >
                      Post Update
                    </button>
                  </div>

                  <div className="engaged-action-card">
                    <h3>Engagement Acceptance</h3>
                    <p>Confirm engagement for the departments assigned to you.</p>
                    <div className="engaged-ack-list">
                      {section.subDepts.map((dept) => {
                        const isAcknowledged = acknowledgedDepts.has(dept);
                        const canAcknowledge =
                          !isAcknowledged &&
                          isScopeApprovalComplete(project.status);
                        return (
                          <div key={dept} className="engaged-ack-row">
                            <div className="engaged-ack-info">
                              <span>{getDepartmentLabel(dept)}</span>
                              {isAcknowledged && (
                                <span className="engaged-ack-status">
                                  Acknowledged
                                </span>
                              )}
                            </div>
                            <button
                              className="acknowledge-btn"
                              onClick={() => openAcknowledgeModal(project, dept)}
                              disabled={!canAcknowledge}
                              title={
                                isAcknowledged
                                  ? "Already acknowledged"
                                  : isScopeApprovalComplete(project.status)
                                    ? "Confirm engagement"
                                    : "Scope approval must be completed"
                              }
                            >
                              {isAcknowledged ? "Acknowledged" : "Acknowledge"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {action && (() => {
                    const isPending = project.status === action.pending;
                    const isProductionAction =
                      action.complete === "Production Completed";
                    const blockedByPayment =
                      isProductionAction &&
                      paymentChecksEnabled &&
                      !hasPaymentVerification;
                    const actionKey = `${project._id}:${action.complete}`;
                    const isUpdating = statusUpdating === actionKey;
                    const isMockupAction = action.dept === "Graphics";
                    const mockupAlreadySubmitted =
                      isMockupAction && Boolean(mockupUrl);

                    let disabledReason = "";
                    if (!isPending) {
                      disabledReason = `Waiting for ${action.pending}.`;
                    } else if (blockedByPayment) {
                      disabledReason =
                        "Payment verification is required before production can be completed.";
                    }

                    return (
                      <div className="engaged-action-card">
                        <h3>{action.dept} Stage</h3>
                        <p>
                          {isMockupAction
                            ? "Upload the approved mockup and confirm completion."
                            : "Confirm this stage is complete for the project."}
                        </p>
                        {isMockupAction ? (
                          <div className="mockup-action-stack">
                            <button
                              className="complete-btn"
                              onClick={() => openMockupModal(project, action)}
                              disabled={
                                !isPending || isUpdating || mockupAlreadySubmitted
                              }
                              title={
                                !isPending
                                  ? `Waiting for ${action.pending}.`
                                  : mockupAlreadySubmitted
                                    ? "Mockup already submitted."
                                    : "Upload approved mockup"
                              }
                            >
                              {mockupAlreadySubmitted
                                ? "Mockup Already submitted"
                                : "Upload Mockup"}
                            </button>
                            <button
                              className="complete-btn confirm-btn"
                              onClick={() => openCompleteModal(project, action)}
                              disabled={!isPending || isUpdating || !mockupAlreadySubmitted}
                              title={
                                !isPending
                                  ? `Waiting for ${action.pending}.`
                                  : mockupAlreadySubmitted
                                    ? "Confirm mockup completion"
                                    : "Upload mockup before confirming"
                              }
                            >
                              Confirm Mockup Completion
                            </button>
                          </div>
                        ) : (
                          <button
                            className="complete-btn"
                            onClick={() => openCompleteModal(project, action)}
                            disabled={!isPending || blockedByPayment || isUpdating}
                            title={disabledReason || "Confirm stage completion"}
                          >
                            {isUpdating ? "Updating..." : action.label}
                          </button>
                        )}
                        {blockedByPayment && (
                          <div className="engaged-action-meta">
                            Payment verification must be recorded first.
                          </div>
                        )}
                        {isMockupAction && mockupUrl && (
                          <>
                            <div className="mockup-preview">
                              {isImageMockup ? (
                                <img
                                  src={mockupUrl}
                                  alt={mockupName}
                                  loading="lazy"
                                />
                              ) : isPdfMockup ? (
                                <iframe
                                  src={mockupUrl}
                                  title={`Preview of ${mockupName}`}
                                  loading="lazy"
                                />
                              ) : (
                                <div className="mockup-preview-fallback">
                                  Preview not available for this file type.
                                </div>
                              )}
                            </div>
                            <Link
                              className="mockup-link download"
                              to={mockupUrl}
                              target="_blank"
                              rel="noreferrer"
                              download
                              reloadDocument
                            >
                              Download {mockupName}
                            </Link>
                          </>
                        )}
                      </div>
                    );
                  })()}

                  {section.key === "Production" && (
                    <div className="engaged-action-card">
                      <h3>Approved Mockup Reference</h3>
                      <p>
                        Use the approved mockup from Graphics as your production
                        reference.
                      </p>

                      {mockupUrl ? (
                        <>
                          <div className="mockup-preview">
                            {isImageMockup ? (
                              <img src={mockupUrl} alt={mockupName} loading="lazy" />
                            ) : isPdfMockup ? (
                              <iframe
                                src={mockupUrl}
                                title={`Preview of ${mockupName}`}
                                loading="lazy"
                              />
                            ) : (
                              <div className="mockup-preview-fallback">
                                Preview not available for this file type.
                              </div>
                            )}
                          </div>
                          <Link
                            className="mockup-link download"
                            to={mockupUrl}
                            target="_blank"
                            rel="noreferrer"
                            download
                            reloadDocument
                          >
                            Download {mockupName}
                          </Link>
                        </>
                      ) : (
                        <div className="engaged-action-meta">
                          Approved mockup is not available yet.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            );
          })
        )}
      </div>

      {showUpdateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Post Update for {projectId}</h3>

            <div className="engaged-depts-section">
              <label>Engaged Departments</label>
              <div className="dept-chips">
                {(updateScopeDepts.length
                  ? updateScopeDepts
                  : projectEngagedSubDepts
                ).map((dept) => (
                  <span
                    key={dept}
                    className={`dept-chip ${
                      updateForm.department === dept ? "selected" : ""
                    }`}
                    onClick={() =>
                      setUpdateForm({
                        ...updateForm,
                        department: dept,
                        category: getCategoryForDepartment(dept),
                      })
                    }
                  >
                    {getDepartmentLabel(dept)}
                  </span>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmitUpdate}>
              <div className="form-group">
                <label>Update Content</label>
                <textarea
                  className="input-field"
                  rows="4"
                  value={updateForm.content}
                  onChange={(e) =>
                    setUpdateForm({ ...updateForm, content: e.target.value })
                  }
                  placeholder="What's the latest update from your department?"
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowUpdateModal(false);
                    setUpdateForm({
                      content: "",
                      category: "Production",
                      department: "",
                    });
                    setUpdateScopeDepts([]);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                >
                  {submitting ? "Posting..." : "Post Update"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showMockupModal && mockupTarget && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Upload Approved Mockup</h3>
            <p className="acknowledge-confirm-text">
              Upload the approved mockup for project <strong>{projectId}</strong>.
            </p>
            <form onSubmit={handleUploadMockup}>
              <div className="form-group">
                <label>Approved Mockup File</label>
                <input
                  type="file"
                  className="input-field"
                  onChange={(e) => setMockupFile(e.target.files?.[0] || null)}
                  required
                />
                <div className="file-hint" style={{ marginTop: "0.5rem" }}>
                  Any file type allowed (e.g., .cdr, .pdf, .png)
                </div>
                {mockupFile && (
                  <div className="file-hint" style={{ marginTop: "0.25rem" }}>
                    Selected: {mockupFile.name}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Note (optional)</label>
                <textarea
                  className="input-field"
                  rows="3"
                  value={mockupNote}
                  onChange={(e) => setMockupNote(e.target.value)}
                  placeholder="Add a short note for production..."
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={closeMockupModal}
                  disabled={mockupUploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={mockupUploading || !mockupFile}
                >
                  {mockupUploading ? "Uploading..." : "Upload & Continue"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCompleteModal && completeTarget && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Confirm Engagement Completion</h3>
            <p className="acknowledge-confirm-text">
              You are about to mark <strong>{completeTarget.action.label}</strong>{" "}
              for project <strong>{projectId}</strong>.
            </p>
            <p className="acknowledge-confirm-text">
              Type the phrase below to confirm:
            </p>
            <div className="acknowledge-phrase">{COMPLETE_PHRASE}</div>
            <div className="form-group" style={{ marginTop: "1rem" }}>
              <label>Confirmation</label>
              <input
                type="text"
                className="input-field"
                value={completeInput}
                onChange={(e) => setCompleteInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeCompleteModal}
                disabled={completeSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmComplete}
                disabled={
                  completeSubmitting || completeInput.trim() !== COMPLETE_PHRASE
                }
              >
                {completeSubmitting ? "Confirming..." : "Confirm Completion"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAcknowledgeModal && acknowledgeTarget && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Confirm Engagement Acceptance</h3>
            <p className="acknowledge-confirm-text">
              You are about to acknowledge engagement for{" "}
              <strong>{getDepartmentLabel(acknowledgeTarget.department)}</strong>{" "}
              on project <strong>{projectId}</strong>.
            </p>
            <p className="acknowledge-confirm-text">
              Type the phrase below to confirm:
            </p>
            <div className="acknowledge-phrase">{ACKNOWLEDGE_PHRASE}</div>
            <div className="form-group" style={{ marginTop: "1rem" }}>
              <label>Confirmation</label>
              <input
                type="text"
                className="input-field"
                value={acknowledgeInput}
                onChange={(e) => setAcknowledgeInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeAcknowledgeModal}
                disabled={acknowledgeSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmAcknowledge}
                disabled={
                  acknowledgeSubmitting ||
                  acknowledgeInput.trim() !== ACKNOWLEDGE_PHRASE
                }
              >
                {acknowledgeSubmitting ? "Confirming..." : "Confirm Acceptance"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EngagedProjectActions;
