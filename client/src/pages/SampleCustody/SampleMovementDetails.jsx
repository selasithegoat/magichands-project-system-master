import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ConfirmationModal from "../../components/ui/ConfirmationModal";
import usePersistedState from "../../hooks/usePersistedState";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard";
import {
  SAMPLE_PRODUCTION_TREATMENTS,
  SAMPLE_STATUS_TONES,
  formatSampleDate,
  formatSampleStatus,
  getProjectLabel,
  requestSampleMovement,
} from "../../utils/sampleMovementApi";
import SampleWaybill from "./SampleWaybill";

const DOCUMENT_TYPE_LABELS = {
  custody_note: "Custody note / waybill",
  signed_custody_note: "Signed custody note",
  ownership_transfer_addendum: "Ownership transfer addendum",
  client_confirmation: "Client confirmation",
  supporting_document: "Supporting document",
};

const toDateTimeLocalValue = (value) => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const ACTION_META = {
  submit: {
    title: "Submit for authorization",
    description: "Admin will review the sample, custody plan, and expected return date before release.",
    endpoint: "submit",
    confirm: "Submit to Admin",
  },
  release: {
    title: "Record sample release",
    description: "Confirm who received the sample and how it left the premises.",
    endpoint: "release",
    confirm: "Record release",
  },
  receipt: {
    title: "Confirm client receipt",
    description: "Record the recipient after a dispatched sample reaches the client.",
    endpoint: "confirm-receipt",
    confirm: "Confirm receipt",
  },
  return: {
    title: "Record sample return",
    description: "Enter the quantity received now. Additional partial returns can be recorded later.",
    endpoint: "record-return",
    confirm: "Record return",
  },
  ownership: {
    title: "Request client ownership",
    description: "Admin must approve before retrieval reminders stop or quantities are applied to production.",
    endpoint: "request-ownership-transfer",
    confirm: "Send ownership request",
  },
  cancel: {
    title: "Cancel sample movement",
    description: "The record remains in the audit history and cannot be reopened.",
    endpoint: "cancel",
    confirm: "Cancel record",
  },
  retrieval_date: {
    title: "Change retrieval date",
    description:
      "Set the revised date agreed for retrieving the sample. Existing reminders will be replaced using this date.",
    endpoint: "retrieval-date",
    method: "PATCH",
    confirm: "Update retrieval date",
  },
  delete: {
    title: "Delete custody record",
    description:
      "This removes the record from the custody register and stops its reminders. Its audit data is retained securely.",
    endpoint: "",
    method: "DELETE",
    confirm: "Delete record",
  },
};

const initialActionForm = (movement) => ({
  note: "",
  reason: "",
  expectedReturnAt: toDateTimeLocalValue(movement?.expectedReturnAt),
  recipientName: movement?.release?.recipientName || movement?.client?.contactPerson || "",
  recipientRole: movement?.release?.recipientRole || movement?.client?.contactRole || "",
  courierName: movement?.release?.courierName || "",
  trackingReference: movement?.release?.trackingReference || "",
  recipientConfirmed: movement?.handoverMethod === "pickup",
  clientConfirmed: false,
  clientConfirmationNote: "",
  billingReference: "",
  paymentReference: "",
  hasDamage: false,
  items: (movement?.items || []).map((item) => ({
    itemId: item._id,
    description: item.description,
    remaining: Math.max(0, Number(item.quantity) - Number(item.quantityReturned || 0)),
    quantityReturned: 0,
    returnCondition: "Good",
    returnConditionNotes: "",
  })),
  itemTreatments: (movement?.items || [])
    .filter((item) => Number(item.quantity) - Number(item.quantityReturned || 0) > 0)
    .map((item) => ({
      itemId: item._id,
      description: item.description,
      outstanding: Math.max(0, Number(item.quantity) - Number(item.quantityReturned || 0)),
      productionTreatment:
        item.productionTreatment === "not_applicable"
          ? "counts_toward_order"
          : item.productionTreatment,
      productionQuantityApplied:
        item.productionQuantityApplied ||
        Math.max(0, Number(item.quantity) - Number(item.quantityReturned || 0)),
    })),
});

const ActionDialog = ({ action, movement, onClose, onCompleted, onDeleted }) => {
  const meta = ACTION_META[action];
  const initialForm = useMemo(() => initialActionForm(movement), [movement]);
  const [form, setForm, clearSavedForm] = usePersistedState(
    `sample-custody-action:${movement._id}:${action}`,
    initialForm,
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [closeMode, setCloseMode] = useState("");
  const hasUnsavedProgress = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initialForm),
    [form, initialForm],
  );

  useUnsavedChangesGuard(hasUnsavedProgress && !saving);

  const requestClose = () => {
    if (saving) return;
    if (!hasUnsavedProgress) {
      onClose();
      return;
    }
    setCloseMode("keep");
  };

  const setField = (field, value) =>
    setForm((current) => ({ ...current, [field]: value }));

  const updateReturnItem = (index, field, value) =>
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));

  const updateTreatment = (index, field, value) =>
    setForm((current) => ({
      ...current,
      itemTreatments: current.itemTreatments.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));

  const submit = async () => {
    setError("");
    let payload = { note: form.note };
    if (
      action === "submit" &&
      (movement.items || []).some((item) => !(item.photos || []).length)
    ) {
      setError("Upload at least one outbound photo for every sample item before submitting to Admin.");
      return;
    }
    if (action === "cancel" && !form.reason.trim()) {
      setError("Enter a cancellation reason.");
      return;
    }
    if (action === "retrieval_date") {
      const retrievalDate = new Date(form.expectedReturnAt);
      if (!form.expectedReturnAt || Number.isNaN(retrievalDate.getTime())) {
        setError("Enter a valid retrieval date and time.");
        return;
      }
      if (!form.reason.trim()) {
        setError("Enter a reason for changing the retrieval date.");
        return;
      }
    }
    if ((action === "release" || action === "receipt") && !form.recipientName.trim()) {
      setError("Recipient name is required.");
      return;
    }
    if (action === "return") {
      if (
        form.items.some(
          (item) =>
            Number(item.quantityReturned) > 0 &&
            (!Number.isInteger(Number(item.quantityReturned)) ||
              Number(item.quantityReturned) > item.remaining),
        )
      ) {
        setError("Returned quantities must be whole numbers within the outstanding quantity.");
        return;
      }
      const returnedItems = form.items
        .filter((item) => Number(item.quantityReturned) > 0)
        .map((item) => ({
          itemId: item.itemId,
          quantityReturned: Number(item.quantityReturned),
          returnCondition: item.returnCondition,
          returnConditionNotes: item.returnConditionNotes,
        }));
      if (!returnedItems.length) {
        setError("Enter at least one returned quantity.");
        return;
      }
      payload = { ...payload, items: returnedItems, hasDamage: form.hasDamage };
    } else if (action === "ownership") {
      if (!form.reason.trim() || !form.clientConfirmed) {
        setError("Enter the reason and confirm the client's decision.");
        return;
      }
      if (
        form.itemTreatments.some(
          (item) =>
            !Number.isInteger(Number(item.productionQuantityApplied)) ||
            Number(item.productionQuantityApplied) < 0 ||
            Number(item.productionQuantityApplied) > item.outstanding,
        )
      ) {
        setError("Production quantities must be whole numbers within the outstanding quantity.");
        return;
      }
      payload = {
        reason: form.reason,
        clientConfirmed: form.clientConfirmed,
        clientConfirmationNote: form.clientConfirmationNote,
        billingReference: form.billingReference,
        paymentReference: form.paymentReference,
        itemTreatments: form.itemTreatments.map((item) => ({
          itemId: item.itemId,
          productionTreatment: item.productionTreatment,
          productionQuantityApplied: Number(item.productionQuantityApplied) || 0,
        })),
      };
    } else if (action === "release") {
      payload = {
        ...payload,
        recipientName: form.recipientName,
        recipientRole: form.recipientRole,
        courierName: form.courierName,
        trackingReference: form.trackingReference,
        recipientConfirmed: form.recipientConfirmed,
      };
    } else if (action === "receipt") {
      payload = {
        ...payload,
        recipientName: form.recipientName,
        recipientRole: form.recipientRole,
      };
    } else if (action === "cancel") {
      payload = { reason: form.reason };
    } else if (action === "retrieval_date") {
      payload = {
        expectedReturnAt: new Date(form.expectedReturnAt).toISOString(),
        reason: form.reason,
      };
    } else if (action === "delete") {
      payload = { reason: form.reason };
    }

    setSaving(true);
    try {
      const updated = await requestSampleMovement(
        `/${movement._id}${meta.endpoint ? `/${meta.endpoint}` : ""}`,
        { method: meta.method || "POST", body: JSON.stringify(payload) },
      );
      clearSavedForm();
      if (action === "delete") {
        onDeleted(updated.message || `${movement.reference} was deleted.`);
      } else {
        onCompleted(updated, `${meta.title} completed.`);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="sample-modal-backdrop elevated"
      role="presentation"
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
    >
      <section className="sample-action-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="sample-modal-header">
          <div><span className="sample-eyebrow">{movement.reference}</span><h2>{meta.title}</h2></div>
          <button type="button" className="sample-icon-button" onClick={requestClose} aria-label="Close">×</button>
        </header>
        <div className="sample-action-body">
          <p className="sample-action-description">{meta.description}</p>
          {error && <div className="sample-form-error" role="alert">{error}</div>}

          {(action === "submit") && (
            <label className="sample-field"><span>Note to Admin (optional)</span><textarea rows="3" value={form.note} onChange={(event) => setField("note", event.target.value)} /></label>
          )}
          {(action === "release" || action === "receipt") && (
            <div className="sample-action-grid">
              <label className="sample-field"><span>Recipient name *</span><input value={form.recipientName} onChange={(event) => setField("recipientName", event.target.value)} /></label>
              <label className="sample-field"><span>Recipient role</span><input value={form.recipientRole} onChange={(event) => setField("recipientRole", event.target.value)} /></label>
              {action === "release" && movement.handoverMethod === "dispatch" && (
                <>
                  <label className="sample-field"><span>Courier / driver</span><input value={form.courierName} onChange={(event) => setField("courierName", event.target.value)} /></label>
                  <label className="sample-field"><span>Tracking / vehicle reference</span><input value={form.trackingReference} onChange={(event) => setField("trackingReference", event.target.value)} /></label>
                  <label className="sample-check sample-field-wide"><input type="checkbox" checked={form.recipientConfirmed} onChange={(event) => setField("recipientConfirmed", event.target.checked)} /><span>Client receipt is already confirmed</span></label>
                </>
              )}
              <label className="sample-field sample-field-wide"><span>Handover note</span><textarea rows="3" value={form.note} onChange={(event) => setField("note", event.target.value)} /></label>
            </div>
          )}
          {action === "return" && (
            <div className="sample-return-list">
              {form.items.map((item, index) => item.remaining > 0 ? (
                <article key={item.itemId}>
                  <div><strong>{item.description}</strong><span>{item.remaining} outstanding</span></div>
                  <label className="sample-field"><span>Quantity received</span><input type="number" min="0" max={item.remaining} step="1" inputMode="numeric" value={item.quantityReturned} onChange={(event) => updateReturnItem(index, "quantityReturned", event.target.value)} /></label>
                  <label className="sample-field"><span>Return condition</span><select value={item.returnCondition} onChange={(event) => updateReturnItem(index, "returnCondition", event.target.value)}><option>Good</option><option>Fair</option><option>Damaged</option></select></label>
                  <label className="sample-field sample-field-wide"><span>Condition notes</span><input value={item.returnConditionNotes} onChange={(event) => updateReturnItem(index, "returnConditionNotes", event.target.value)} /></label>
                </article>
              ) : null)}
              <label className="sample-check"><input type="checkbox" checked={form.hasDamage} onChange={(event) => setField("hasDamage", event.target.checked)} /><span>Damage was identified</span></label>
              <label className="sample-field"><span>Return note</span><textarea rows="3" value={form.note} onChange={(event) => setField("note", event.target.value)} /></label>
            </div>
          )}
          {action === "ownership" && (
            <div className="sample-action-grid">
              <label className="sample-field sample-field-wide"><span>Reason for client retention *</span><textarea rows="3" value={form.reason} onChange={(event) => setField("reason", event.target.value)} /></label>
              <label className="sample-check sample-field-wide"><input type="checkbox" checked={form.clientConfirmed} onChange={(event) => setField("clientConfirmed", event.target.checked)} /><span>The client has confirmed they will retain these samples</span></label>
              <label className="sample-field sample-field-wide"><span>Client confirmation details</span><textarea rows="2" value={form.clientConfirmationNote} onChange={(event) => setField("clientConfirmationNote", event.target.value)} placeholder="Email, call, signed note, contact person…" /></label>
              <label className="sample-field"><span>Invoice / quote reference</span><input value={form.billingReference} onChange={(event) => setField("billingReference", event.target.value)} /></label>
              <label className="sample-field"><span>Payment reference</span><input value={form.paymentReference} onChange={(event) => setField("paymentReference", event.target.value)} /></label>
              <div className="sample-treatment-list sample-field-wide">
                {form.itemTreatments.map((item, index) => (
                  <div key={item.itemId}>
                    <strong>{item.description}</strong>
                    <select value={item.productionTreatment} onChange={(event) => updateTreatment(index, "productionTreatment", event.target.value)}>
                      {SAMPLE_PRODUCTION_TREATMENTS.filter((option) => option.value !== "not_applicable").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <input type="number" min="0" max={item.outstanding} step="1" inputMode="numeric" value={item.productionQuantityApplied} onChange={(event) => updateTreatment(index, "productionQuantityApplied", event.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {action === "cancel" && (
            <label className="sample-field"><span>Cancellation reason *</span><textarea rows="4" value={form.reason} onChange={(event) => setField("reason", event.target.value)} /></label>
          )}
          {action === "retrieval_date" && (
            <div className="sample-action-grid">
              <label className="sample-field sample-field-wide"><span>New retrieval date and time *</span><input type="datetime-local" value={form.expectedReturnAt} onChange={(event) => setField("expectedReturnAt", event.target.value)} /></label>
              <label className="sample-field sample-field-wide"><span>Reason for change *</span><textarea rows="3" value={form.reason} onChange={(event) => setField("reason", event.target.value)} placeholder="For example: client requested an extension" /></label>
            </div>
          )}
          {action === "delete" && (
            <label className="sample-field"><span>Reason for deletion (optional)</span><textarea rows="4" value={form.reason} onChange={(event) => setField("reason", event.target.value)} placeholder="Explain why this custody record should be removed" /></label>
          )}
        </div>
        <footer className="sample-modal-footer">
          {hasUnsavedProgress && <button type="button" className="sample-discard-draft" onClick={() => setCloseMode("discard")}>Discard entries</button>}
          <button type="button" className="sample-secondary-button" onClick={requestClose}>Close for now</button>
          <button type="button" className={`sample-primary-button ${["cancel", "delete"].includes(action) ? "danger" : ""}`} disabled={saving} onClick={submit}>{saving ? "Processing…" : meta.confirm}</button>
        </footer>
      </section>
      <ConfirmationModal
        isOpen={Boolean(closeMode)}
        title={closeMode === "discard" ? "Discard these entries?" : "Close and continue later?"}
        message={closeMode === "discard" ? "The information entered in this action will be removed from this device." : "Your entries are saved locally and will be restored when you reopen this action."}
        confirmText={closeMode === "discard" ? "Discard entries" : "Close and keep entries"}
        cancelText="Keep editing"
        onCancel={() => setCloseMode("")}
        onConfirm={() => {
          if (closeMode === "discard") clearSavedForm();
          setCloseMode("");
          onClose();
        }}
      />
    </div>
  );
};

const EvidenceDialog = ({ movement, onClose, onCompleted, onProgress }) => {
  const [kind, setKind] = useState("photo");
  const [itemId, setItemId] = useState(movement.items?.[0]?._id || "");
  const [photoType, setPhotoType] = useState("outbound");
  const [documentType, setDocumentType] = useState("signed_custody_note");
  const [photoFiles, setPhotoFiles] = useState([]);
  const [documentFiles, setDocumentFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const activeFiles = kind === "photo" ? photoFiles : documentFiles;
  const totalFiles = photoFiles.length + documentFiles.length;
  const hasUnsavedSelection =
    totalFiles > 0 ||
    kind !== "photo" ||
    itemId !== (movement.items?.[0]?._id || "") ||
    photoType !== "outbound" ||
    documentType !== "signed_custody_note";

  useUnsavedChangesGuard(hasUnsavedSelection && !saving);

  const requestClose = () => {
    if (saving) return;
    if (hasUnsavedSelection) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };

  const addSelectedFiles = (event, evidenceKind) => {
    const input = event.target;
    const selectedFiles = Array.from(input.files || []);
    const isPhoto = evidenceKind === "photo";
    const currentFiles = isPhoto ? photoFiles : documentFiles;
    const maximumFiles = isPhoto ? 8 : 6;
    const identifyFile = (file) =>
      `${file.name}-${file.size}-${file.lastModified}-${file.type}`;
    const knownFiles = new Set(currentFiles.map(identifyFile));
    const newFiles = selectedFiles.filter((file) => {
      const identity = identifyFile(file);
      if (knownFiles.has(identity)) return false;
      knownFiles.add(identity);
      return true;
    });
    const combinedFiles = [...currentFiles, ...newFiles];

    if (isPhoto) setPhotoFiles(combinedFiles.slice(0, maximumFiles));
    else setDocumentFiles(combinedFiles.slice(0, maximumFiles));

    if (combinedFiles.length > maximumFiles) {
      setError(`A maximum of ${maximumFiles} ${isPhoto ? "photos" : "documents"} can be uploaded at once. Your first ${maximumFiles} selections were kept.`);
    } else if (selectedFiles.length > 0 && newFiles.length === 0) {
      setError("The selected file is already in the upload list.");
    } else {
      setError("");
    }

    input.value = "";
  };

  const submit = async () => {
    if (!totalFiles) {
      setError("Select at least one photo or document to upload.");
      return;
    }
    if (photoFiles.length && !itemId) {
      setError("Select the sample item shown in the photos.");
      return;
    }
    setSaving(true);
    setError("");
    let updatedMovement = movement;
    const completedKinds = [];
    try {
      if (photoFiles.length) {
        const photoData = new FormData();
        photoFiles.forEach((file) => photoData.append("samplePhotos", file));
        photoData.append("photoType", photoType);
        updatedMovement = await requestSampleMovement(
          `/${movement._id}/items/${itemId}/photos`,
          { method: "POST", body: photoData },
        );
        completedKinds.push("photos");
        setPhotoFiles([]);
      }

      if (documentFiles.length) {
        const documentData = new FormData();
        documentFiles.forEach((file) => documentData.append("sampleDocuments", file));
        documentData.append("type", documentType);
        documentData.append("documentNumber", movement.reference);
        documentData.append(
          "status",
          documentType === "signed_custody_note" ? "signed" : "issued",
        );
        updatedMovement = await requestSampleMovement(`/${movement._id}/documents`, {
          method: "POST",
          body: documentData,
        });
        completedKinds.push("documents");
        setDocumentFiles([]);
      }

      const message =
        completedKinds.length === 2
          ? "Sample photos and custody documents uploaded."
          : completedKinds[0] === "photos"
            ? "Sample photos uploaded."
            : "Custody documents uploaded.";
      onCompleted(updatedMovement, message);
    } catch (requestError) {
      if (completedKinds.length) {
        onProgress?.(
          updatedMovement,
          "Some evidence was uploaded. The remaining files are still selected.",
        );
        setError(`${requestError.message} Retry to upload the remaining files.`);
      } else {
        setError(requestError.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sample-modal-backdrop elevated" role="presentation" onMouseDown={(event) => event.stopPropagation()}>
      <section className="sample-action-dialog sample-evidence-dialog" role="dialog" aria-modal="true" aria-labelledby="sample-evidence-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="sample-modal-header">
          <div><span className="sample-eyebrow">{movement.reference}</span><h2 id="sample-evidence-title">Add evidence</h2></div>
          <button type="button" className="sample-icon-button" onClick={requestClose} aria-label="Close">×</button>
        </header>
        <div className="sample-action-body">
          <div className="sample-evidence-kind" role="tablist" aria-label="Evidence type">
            <button type="button" role="tab" aria-selected={kind === "photo"} className={kind === "photo" ? "active" : ""} onClick={() => setKind("photo")}>Sample photos {photoFiles.length > 0 && <span>{photoFiles.length}</span>}</button>
            <button type="button" role="tab" aria-selected={kind === "document"} className={kind === "document" ? "active" : ""} onClick={() => setKind("document")}>Custody document {documentFiles.length > 0 && <span>{documentFiles.length}</span>}</button>
          </div>
          {error && <div className="sample-form-error" role="alert">{error}</div>}
          {kind === "photo" ? (
            <div className="sample-action-grid">
              <label className="sample-field sample-field-wide"><span>Sample item *</span><select value={itemId} onChange={(event) => setItemId(event.target.value)}>{(movement.items || []).map((item) => <option key={item._id} value={item._id}>{item.description}</option>)}</select></label>
              <label className="sample-field sample-field-wide"><span>Photo stage</span><select value={photoType} onChange={(event) => setPhotoType(event.target.value)}><option value="outbound">Before handover</option><option value="return">On return</option></select></label>
              <label className="sample-file-drop sample-field-wide"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => addSelectedFiles(event, "photo")} /><strong>{photoFiles.length ? "Add more sample photos" : "Select sample photos"}</strong><span>JPG, PNG, WEBP or GIF · up to 8 files</span></label>
            </div>
          ) : (
            <div className="sample-action-grid">
              <label className="sample-field sample-field-wide"><span>Document type *</span><select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>{Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="sample-file-drop sample-field-wide"><input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" multiple onChange={(event) => addSelectedFiles(event, "document")} /><strong>{documentFiles.length ? "Add more documents" : "Select scanned or electronic documents"}</strong><span>PDF, Word or image · up to 6 files</span></label>
            </div>
          )}
          {activeFiles.length > 0 && (
            <div className="sample-selected-files">
              <strong>{activeFiles.length} file{activeFiles.length === 1 ? "" : "s"} selected</strong>
              {activeFiles.map((file, index) => (
                <div key={`${file.name}-${file.size}-${file.lastModified}`}>
                  <span title={file.name}>{file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => {
                      const removeAtIndex = (selectedFiles) =>
                        selectedFiles.filter((_, fileIndex) => fileIndex !== index);
                      if (kind === "photo") setPhotoFiles(removeAtIndex);
                      else setDocumentFiles(removeAtIndex);
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <footer className="sample-modal-footer"><button type="button" className="sample-secondary-button" onClick={requestClose}>Cancel</button><button type="button" className="sample-primary-button" disabled={saving} onClick={submit}>{saving ? "Uploading…" : `Upload evidence${totalFiles ? ` (${totalFiles})` : ""}`}</button></footer>
      </section>
      <ConfirmationModal
        isOpen={confirmClose}
        title="Discard selected evidence?"
        message="For security, browsers cannot restore selected files after this window closes. Keep editing to preserve the current selection."
        confirmText="Discard selection"
        cancelText="Keep editing"
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          onClose();
        }}
      />
    </div>
  );
};

const SampleMovementDetails = ({ movement, loading, error, onClose, onEdit, onChanged, onDeleted }) => {
  const [action, setAction] = useState("");
  const [showEvidence, setShowEvidence] = useState(false);
  const [showWaybill, setShowWaybill] = useState(false);
  const projectId = movement?.project?._id || movement?.project;
  const missingPhotoCount = (movement?.items || []).filter(
    (item) => !(item.photos || []).length,
  ).length;
  const actions = useMemo(() => {
    if (!movement) return [];
    if (["draft", "changes_requested"].includes(movement.status)) {
      return ["edit", "submit", "cancel"];
    }
    if (movement.status === "awaiting_authorization") return ["cancel"];
    if (movement.status === "authorized") return ["release"];
    if (movement.status === "dispatched") return ["receipt", "return", "ownership", "retrieval_date"];
    if (["in_client_custody", "partially_returned"].includes(movement.status)) {
      return ["return", "ownership", "retrieval_date"];
    }
    if (movement.status === "ownership_transfer_pending") return ["retrieval_date"];
    return [];
  }, [movement]);

  return (
    <div className="sample-detail-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="sample-detail-panel" role="dialog" aria-modal="true" aria-label="Sample movement details" onMouseDown={(event) => event.stopPropagation()}>
        {error ? (
          <div className="sample-empty-state error">
            <strong>Could not open this custody record</strong>
            <p>{error.message}</p>
            <button type="button" onClick={onClose}>Close</button>
          </div>
        ) : loading || !movement ? (
          <div className="sample-detail-loading"><span className="sample-spinner" />Loading custody record…</div>
        ) : (
          <>
            <header className="sample-detail-header">
              <div><span className="sample-eyebrow">Custody record</span><h2>{movement.reference}</h2></div>
              <button type="button" className="sample-icon-button" onClick={onClose} aria-label="Close details">×</button>
              <div className="sample-detail-status-row">
                <span className={`sample-status ${SAMPLE_STATUS_TONES[movement.status] || "neutral"}`}>{formatSampleStatus(movement.status)}</span>
                {movement.attentionState && movement.attentionState !== "none" && <span className={`sample-attention ${movement.attentionState}`}>{movement.attentionState === "overdue" ? "Overdue" : "Due soon"}</span>}
              </div>
            </header>

            <div className="sample-detail-actions">
                <button type="button" className="sample-secondary-button" onClick={() => setShowWaybill(true)}>Preview waybill</button>
                <button type="button" className="sample-secondary-button" onClick={() => setShowEvidence(true)}>Add evidence</button>
              {actions.length > 0 && (
                <>
                {actions.map((item) => (
                  <button key={item} type="button" className={item === "cancel" ? "danger-link" : item === "edit" ? "sample-secondary-button" : "sample-primary-button"} onClick={() => item === "edit" ? onEdit(movement) : setAction(item)}>
                    {item === "edit" ? "Edit draft" : item === "submit" ? "Submit to Admin" : item === "release" ? "Record release" : item === "receipt" ? "Confirm receipt" : item === "return" ? "Record return" : item === "ownership" ? "Request ownership" : item === "retrieval_date" ? "Change retrieval date" : "Cancel"}
                  </button>
                ))}
                </>
              )}
              <button type="button" className="danger-link sample-delete-action" onClick={() => setAction("delete")}>Delete record</button>
            </div>

            <div className="sample-detail-content">
              {missingPhotoCount > 0 && (
                <div className="sample-evidence-alert" role="status">
                  <div><strong>Outbound evidence incomplete</strong><p>{missingPhotoCount} sample item{missingPhotoCount === 1 ? " needs" : "s need"} a photo before this record can be submitted.</p></div>
                  <button type="button" onClick={() => setShowEvidence(true)}>Upload photos</button>
                </div>
              )}
              <section className="sample-detail-card">
                <h3>Project and client</h3>
                <dl className="sample-detail-list">
                  <div><dt>Project</dt><dd>{projectId ? <Link to={`/projects/${projectId}`}>{getProjectLabel(movement.project)}</Link> : getProjectLabel(movement)}</dd></div>
                  <div><dt>Client</dt><dd>{movement.client?.name || "—"}</dd></div>
                  <div><dt>Contact</dt><dd>{movement.client?.contactPerson || "—"}{movement.client?.phone ? ` · ${movement.client.phone}` : ""}</dd></div>
                  <div><dt>Purpose</dt><dd>{movement.purpose}</dd></div>
                </dl>
              </section>

              <section className="sample-detail-card">
                <h3>Custody plan</h3>
                <dl className="sample-detail-list two-column">
                  <div><dt>Method</dt><dd>{movement.handoverMethod === "pickup" ? "Client pick-up" : "Dispatch"}</dd></div>
                  <div><dt>Disposition</dt><dd>{movement.disposition?.replace(/_/g, " ")}</dd></div>
                  <div><dt>Expected return</dt><dd>{movement.disposition === "client_owned" ? "Not required" : formatSampleDate(movement.expectedReturnAt, { hour: "2-digit", minute: "2-digit" })}</dd></div>
                  <div><dt>Front Desk owner</dt><dd>{[movement.frontDeskOwner?.firstName, movement.frontDeskOwner?.lastName].filter(Boolean).join(" ") || "—"}</dd></div>
                </dl>
                {movement.authorization?.decisionNote && <div className="sample-decision-note"><strong>Admin note</strong><p>{movement.authorization.decisionNote}</p></div>}
              </section>

              <section className="sample-detail-card">
                <div className="sample-card-heading"><h3>Sample items</h3><span>{movement.items?.length || 0}</span></div>
                <div className="sample-detail-items">
                  {(movement.items || []).map((item) => (
                    <article key={item._id}>
                      <div><strong>{item.description}</strong><span>{item.identifyingMarks || item.outboundCondition || "No identifier"}</span></div>
                      <dl><div><dt>Released</dt><dd>{item.quantity} {item.unit}</dd></div><div><dt>Returned</dt><dd>{item.quantityReturned || 0} {item.unit}</dd></div><div><dt>Production</dt><dd>{item.productionTreatment?.replace(/_/g, " ")}</dd></div></dl>
                      {((item.photos || []).length > 0 || (item.returnPhotos || []).length > 0) && (
                        <div className="sample-photo-strip">
                          {[...(item.photos || []), ...(item.returnPhotos || [])].map((photo) => <a key={photo._id} href={photo.fileUrl} target="_blank" rel="noreferrer"><img src={photo.fileUrl} alt={`${item.description} evidence`} /><span>{(item.returnPhotos || []).some((entry) => entry._id === photo._id) ? "Return" : "Outbound"}</span></a>)}
                        </div>
                      )}
                      {!(item.photos || []).length && <p className="sample-photo-required">Outbound photo required before submission</p>}
                    </article>
                  ))}
                </div>
              </section>

              <section className="sample-detail-card">
                <div className="sample-card-heading"><h3>Waybill and documents</h3><span>{movement.documents?.length || 0}</span></div>
                {(movement.documents || []).length ? (
                  <div className="sample-document-list">
                    {[...(movement.documents || [])].reverse().map((document) => (
                      <a key={document._id} href={document.file?.fileUrl} target="_blank" rel="noreferrer">
                        <span className="sample-document-icon">{document.file?.mimeType?.includes("pdf") ? "PDF" : "FILE"}</span>
                        <span><strong>{DOCUMENT_TYPE_LABELS[document.type] || document.type?.replace(/_/g, " ")}</strong><small>{document.file?.originalName || document.documentNumber} · {formatSampleDate(document.issuedAt)}</small></span>
                        <em className={`sample-document-status ${document.status}`}>{document.status}</em>
                      </a>
                    ))}
                  </div>
                ) : <div className="sample-document-empty"><p>No signed waybill or supporting document uploaded yet.</p><button type="button" onClick={() => setShowEvidence(true)}>Upload document</button></div>}
              </section>

              {movement.release?.releasedAt && (
                <section className="sample-detail-card"><h3>Release details</h3><dl className="sample-detail-list two-column"><div><dt>Released</dt><dd>{formatSampleDate(movement.release.releasedAt, { hour: "2-digit", minute: "2-digit" })}</dd></div><div><dt>Recipient</dt><dd>{movement.release.recipientName || "—"}</dd></div><div><dt>Courier</dt><dd>{movement.release.courierName || "—"}</dd></div><div><dt>Tracking</dt><dd>{movement.release.trackingReference || "—"}</dd></div></dl></section>
              )}

              <section className="sample-detail-card">
                <div className="sample-card-heading"><h3>Custody timeline</h3><span>{movement.custodyEvents?.length || 0}</span></div>
                <ol className="sample-timeline">
                  {[...(movement.custodyEvents || [])].reverse().map((event) => (
                    <li key={event._id}><span className="sample-timeline-dot" /><div><strong>{formatSampleStatus(event.toStatus || event.type)}</strong><p>{event.note || event.type?.replace(/_/g, " ")}</p><small>{event.actorName || "System"} · {formatSampleDate(event.occurredAt, { hour: "2-digit", minute: "2-digit" })}</small></div></li>
                  ))}
                </ol>
              </section>
            </div>
          </>
        )}
      </aside>
      {action && movement && <ActionDialog action={action} movement={movement} onClose={() => setAction("")} onCompleted={(updated, message) => { setAction(""); onChanged(updated, message); }} onDeleted={(message) => { setAction(""); onDeleted(message); }} />}
      {showEvidence && movement && <EvidenceDialog movement={movement} onClose={() => setShowEvidence(false)} onProgress={onChanged} onCompleted={(updated, message) => { setShowEvidence(false); onChanged(updated, message); }} />}
      {showWaybill && movement && <SampleWaybill movement={movement} onClose={() => setShowWaybill(false)} />}
    </div>
  );
};

export default SampleMovementDetails;
