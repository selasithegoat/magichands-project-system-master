import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmationModal from "../../components/ui/ConfirmationModal";
import {
  deleteProjectDraft,
  getProjectDraftResumePath,
  listProjectDrafts,
} from "../../utils/projectDraftApi";
import { resolvePortalSource } from "../../utils/portalSource";
import "./SavedCreationDrafts.css";

const toText = (value) => String(value || "").trim();

const getDraftFormData = (draft = {}) => {
  const payload = draft.payload && typeof draft.payload === "object"
    ? draft.payload
    : {};
  const envelope =
    draft.formData && typeof draft.formData === "object"
      ? draft.formData
      : payload;
  const formData =
    envelope.formData && typeof envelope.formData === "object"
      ? envelope.formData
      : envelope;
  return formData && typeof formData === "object" ? formData : {};
};

const getDraftKind = (draft = {}) => {
  const formData = getDraftFormData(draft);
  const envelope =
    draft.formData && typeof draft.formData === "object"
      ? draft.formData
      : draft.payload && typeof draft.payload === "object"
        ? draft.payload
        : {};
  const value = toText(
    draft.projectType ||
      formData.projectType ||
      draft.draftType ||
      envelope.draftType ||
      draft.flowType ||
      draft.kind,
  );
  if (value.toLowerCase() === "quote") return "Quote";
  return value.toLowerCase() === "project"
    ? toText(formData.projectType) || "Standard"
    : value || "Standard";
};

const getDraftTitle = (draft = {}) => {
  const formData = getDraftFormData(draft);
  return (
    toText(formData.projectName) ||
    toText(draft.title) ||
    `Untitled ${getDraftKind(draft)}`
  );
};

const getDraftClient = (draft = {}) => {
  const formData = getDraftFormData(draft);
  return toText(formData.clientName || formData.client) || "No client yet";
};

const getDraftOrderNumber = (draft = {}) => {
  const formData = getDraftFormData(draft);
  return toText(formData.orderNumber || formData.quoteNumber || draft.orderNumber);
};

const countDraftFiles = (draft = {}) => {
  const files = draft.files;
  if (Array.isArray(files)) return files.length;
  if (!files || typeof files !== "object") return 0;

  return Object.values(files).reduce(
    (total, entries) => total + (Array.isArray(entries) ? entries.length : 0),
    0,
  );
};

const formatSavedAt = (value) => {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "Saved recently";

  return `Saved ${date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
};

const SavedCreationDrafts = () => {
  const navigate = useNavigate();
  const portalSource = useMemo(() => resolvePortalSource(), []);
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draftToDelete, setDraftToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listProjectDrafts();
      const list = Array.isArray(result)
        ? result
        : Array.isArray(result?.drafts)
          ? result.drafts
          : [];
      setDrafts(list);
    } catch (loadError) {
      setError(loadError.message || "Unable to load saved drafts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  const handleResume = (draft) => {
    navigate(getProjectDraftResumePath(draft));
  };

  const handleDelete = async () => {
    if (!draftToDelete?._id || deleting) return;
    setDeleting(true);
    setError("");
    try {
      await deleteProjectDraft(draftToDelete._id);
      setDrafts((current) =>
        current.filter((draft) => draft._id !== draftToDelete._id),
      );
      setDraftToDelete(null);
    } catch (deleteError) {
      setError(deleteError.message || "Unable to discard this draft.");
    } finally {
      setDeleting(false);
    }
  };

  const handleStartNew = () => {
    navigate(portalSource === "admin" ? "/new-orders/form" : "/create/select-type");
  };

  return (
    <section className="creation-drafts" aria-labelledby="creation-drafts-title">
      <div className="creation-drafts-header">
        <div>
          <span className="creation-drafts-eyebrow">Saved work</span>
          <h2 id="creation-drafts-title">Project and Quote Drafts</h2>
          <p>Resume an intake exactly where you left it, including its uploaded files.</p>
        </div>
        <button type="button" className="creation-drafts-new" onClick={handleStartNew}>
          Start New
        </button>
      </div>

      {error && (
        <div className="creation-drafts-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={loadDrafts}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="creation-drafts-state">Loading saved drafts...</div>
      ) : drafts.length === 0 ? (
        <div className="creation-drafts-state empty">
          <strong>No saved drafts</strong>
          <span>Use Save to Draft while creating a project or quote.</span>
        </div>
      ) : (
        <div className="creation-drafts-grid">
          {drafts.map((draft) => {
            const kind = getDraftKind(draft);
            const fileCount = countDraftFiles(draft);
            const orderNumber = getDraftOrderNumber(draft);

            return (
              <article className="creation-draft-card" key={draft._id}>
                <div className="creation-draft-card-topline">
                  <span className={`creation-draft-kind ${kind.toLowerCase().replace(/\s+/g, "-")}`}>
                    {kind}
                  </span>
                  <span>{formatSavedAt(draft.updatedAt || draft.savedAt)}</span>
                </div>
                <h3>{getDraftTitle(draft)}</h3>
                <p className="creation-draft-client">{getDraftClient(draft)}</p>
                <div className="creation-draft-meta">
                  <span>{orderNumber ? `#${orderNumber}` : "Order number not entered"}</span>
                  <span>{fileCount} file{fileCount === 1 ? "" : "s"}</span>
                </div>
                <div className="creation-draft-actions">
                  <button type="button" className="resume" onClick={() => handleResume(draft)}>
                    Resume
                  </button>
                  <button type="button" className="discard" onClick={() => setDraftToDelete(draft)}>
                    Discard
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ConfirmationModal
        isOpen={Boolean(draftToDelete)}
        title="Discard Saved Draft?"
        message={`Discard ${getDraftTitle(draftToDelete || {})}? Its saved files will also be removed.`}
        confirmText={deleting ? "Discarding..." : "Yes, Discard Draft"}
        cancelText="Keep Draft"
        onConfirm={handleDelete}
        onCancel={() => !deleting && setDraftToDelete(null)}
      />
    </section>
  );
};

export default SavedCreationDrafts;
