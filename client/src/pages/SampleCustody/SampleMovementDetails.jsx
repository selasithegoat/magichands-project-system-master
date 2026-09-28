import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  SAMPLE_PRODUCTION_TREATMENTS,
  SAMPLE_STATUS_TONES,
  formatSampleDate,
  formatSampleStatus,
  getProjectLabel,
  requestSampleMovement,
} from "../../utils/sampleMovementApi";

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
};

const initialActionForm = (movement) => ({
  note: "",
  reason: "",
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

const ActionDialog = ({ action, movement, onClose, onCompleted }) => {
  const meta = ACTION_META[action];
  const [form, setForm] = useState(() => initialActionForm(movement));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
    if (action === "cancel" && !form.reason.trim()) {
      setError("Enter a cancellation reason.");
      return;
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
    }

    setSaving(true);
    try {
      const updated = await requestSampleMovement(
        `/${movement._id}/${meta.endpoint}`,
        { method: "POST", body: JSON.stringify(payload) },
      );
      onCompleted(updated, `${meta.title} completed.`);
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
        onClose();
      }}
    >
      <section className="sample-action-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="sample-modal-header">
          <div><span className="sample-eyebrow">{movement.reference}</span><h2>{meta.title}</h2></div>
          <button type="button" className="sample-icon-button" onClick={onClose} aria-label="Close">×</button>
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
        </div>
        <footer className="sample-modal-footer">
          <button type="button" className="sample-secondary-button" onClick={onClose}>Back</button>
          <button type="button" className={`sample-primary-button ${action === "cancel" ? "danger" : ""}`} disabled={saving} onClick={submit}>{saving ? "Processing…" : meta.confirm}</button>
        </footer>
      </section>
    </div>
  );
};

const SampleMovementDetails = ({ movement, loading, error, onClose, onEdit, onChanged }) => {
  const [action, setAction] = useState("");
  const projectId = movement?.project?._id || movement?.project;
  const actions = useMemo(() => {
    if (!movement) return [];
    if (["draft", "changes_requested"].includes(movement.status)) {
      return ["edit", "submit", "cancel"];
    }
    if (movement.status === "awaiting_authorization") return ["cancel"];
    if (movement.status === "authorized") return ["release"];
    if (movement.status === "dispatched") return ["receipt", "return", "ownership"];
    if (["in_client_custody", "partially_returned"].includes(movement.status)) {
      return ["return", "ownership"];
    }
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

            {actions.length > 0 && (
              <div className="sample-detail-actions">
                {actions.map((item) => (
                  <button key={item} type="button" className={item === "cancel" ? "danger-link" : item === "edit" ? "sample-secondary-button" : "sample-primary-button"} onClick={() => item === "edit" ? onEdit(movement) : setAction(item)}>
                    {item === "edit" ? "Edit draft" : item === "submit" ? "Submit to Admin" : item === "release" ? "Record release" : item === "receipt" ? "Confirm receipt" : item === "return" ? "Record return" : item === "ownership" ? "Request ownership" : "Cancel"}
                  </button>
                ))}
              </div>
            )}

            <div className="sample-detail-content">
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
                    </article>
                  ))}
                </div>
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
      {action && movement && <ActionDialog action={action} movement={movement} onClose={() => setAction("")} onCompleted={(updated, message) => { setAction(""); onChanged(updated, message); }} />}
    </div>
  );
};

export default SampleMovementDetails;
