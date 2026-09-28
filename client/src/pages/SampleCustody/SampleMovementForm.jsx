import React, { useMemo, useState } from "react";
import {
  SAMPLE_PRODUCTION_TREATMENTS,
  getProjectLabel,
  requestSampleMovement,
} from "../../utils/sampleMovementApi";

const FORM_STEPS = ["Project & client", "Sample items", "Custody plan", "Review"];

const emptyItem = () => ({
  description: "",
  quantity: 1,
  unit: "unit",
  identifyingMarks: "",
  outboundCondition: "Good",
  outboundConditionNotes: "",
  productionTreatment: "not_applicable",
  productionQuantityApplied: 0,
});

const toInputDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const getInitialForm = (movement) => ({
  project: String(movement?.project?._id || movement?.project || ""),
  client: {
    name: movement?.client?.name || "",
    contactPerson: movement?.client?.contactPerson || "",
    contactRole: movement?.client?.contactRole || "",
    email: movement?.client?.email || "",
    phone: movement?.client?.phone || "",
    address: movement?.client?.address || "",
  },
  purpose: movement?.purpose || "",
  handoverMethod: movement?.handoverMethod || "pickup",
  disposition: movement?.disposition || "returnable",
  expectedReturnAt: toInputDateTime(movement?.expectedReturnAt),
  items: movement?.items?.length
    ? movement.items.map((item) => ({
        _id: item._id,
        description: item.description || "",
        quantity: item.quantity || 1,
        unit: item.unit || "unit",
        identifyingMarks: item.identifyingMarks || "",
        outboundCondition: item.outboundCondition || "",
        outboundConditionNotes: item.outboundConditionNotes || "",
        productionTreatment: item.productionTreatment || "not_applicable",
        productionQuantityApplied: item.productionQuantityApplied || 0,
      }))
    : [emptyItem()],
});

const SampleMovementForm = ({ movement = null, projects = [], onClose, onSaved }) => {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => getInitialForm(movement));
  const [projectSearch, setProjectSearch] = useState(() =>
    movement?.project && typeof movement.project === "object"
      ? getProjectLabel(movement.project)
      : "",
  );
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [activeProjectIndex, setActiveProjectIndex] = useState(-1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const editing = Boolean(movement?._id);

  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) return projects.slice(0, 12);
    return projects.filter((project) =>
      [getProjectLabel(project), project?.details?.client]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    ).slice(0, 12);
  }, [projectSearch, projects]);

  const selectedProject = projects.find(
    (project) => String(project?._id) === String(form.project),
  );

  const setField = (field, value) =>
    setForm((current) => ({ ...current, [field]: value }));

  const setClientField = (field, value) =>
    setForm((current) => ({
      ...current,
      client: { ...current.client, [field]: value },
    }));

  const selectProject = (project) => {
    const projectId = String(project?._id || "");
    setForm((current) => ({
      ...current,
      project: projectId,
      client: {
        ...current.client,
        name: project?.details?.client || current.client.name,
        email: project?.details?.clientEmail || current.client.email,
        phone: project?.details?.clientPhone || current.client.phone,
      },
    }));
    setProjectSearch(getProjectLabel(project));
    setProjectMenuOpen(false);
    setActiveProjectIndex(-1);
  };

  const handleProjectSearchChange = (value) => {
    setProjectSearch(value);
    setProjectMenuOpen(true);
    setActiveProjectIndex(-1);
    if (form.project) {
      setForm((current) => ({ ...current, project: "" }));
    }
  };

  const handleProjectKeyDown = (event) => {
    if (event.key === "Escape") {
      setProjectMenuOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setProjectMenuOpen(true);
      setActiveProjectIndex((current) =>
        Math.min(current + 1, filteredProjects.length - 1),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveProjectIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (
      event.key === "Enter" &&
      projectMenuOpen &&
      filteredProjects[activeProjectIndex]
    ) {
      event.preventDefault();
      selectProject(filteredProjects[activeProjectIndex]);
    }
  };

  const updateItem = (index, field, value) =>
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));

  const removeItem = (index) =>
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));

  const validateStep = () => {
    if (step === 0 && (!form.project || !form.client.name.trim())) {
      return "Choose a project and confirm the client name.";
    }
    if (
      step === 1 &&
      (!form.items.length ||
        form.items.some(
          (item) =>
            !item.description.trim() ||
            !Number.isInteger(Number(item.quantity)) ||
            Number(item.quantity) <= 0,
        ))
    ) {
      return "Every sample item needs a description and a whole-number quantity of at least 1.";
    }
    if (step === 2) {
      if (!form.purpose.trim()) return "Describe why the client needs the sample.";
      if (form.disposition !== "client_owned" && !form.expectedReturnAt) {
        return "Set the expected retrieval date for this sample.";
      }
      if (
        form.items.some(
          (item) =>
            item.productionTreatment !== "not_applicable" &&
            (!Number.isInteger(Number(item.productionQuantityApplied)) ||
              Number(item.productionQuantityApplied) < 0 ||
              Number(item.productionQuantityApplied) > Number(item.quantity)),
        )
      ) {
        return "Production quantities must be whole numbers within the sample quantity.";
      }
    }
    return "";
  };

  const nextStep = () => {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setStep((current) => Math.min(FORM_STEPS.length - 1, current + 1));
  };

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const payload = {
        ...form,
        expectedReturnAt:
          form.disposition === "client_owned"
            ? null
            : new Date(form.expectedReturnAt).toISOString(),
        items: form.items.map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          productionQuantityApplied:
            item.productionTreatment === "not_applicable"
              ? 0
              : Number(item.productionQuantityApplied) || 0,
        })),
      };
      const saved = await requestSampleMovement(
        editing ? `/${movement._id}` : "",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      onSaved?.(saved, editing ? "Sample draft updated." : "Sample draft created.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sample-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="sample-form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sample-form-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="sample-modal-header">
          <div>
            <span className="sample-eyebrow">Sample custody</span>
            <h2 id="sample-form-title">{editing ? "Edit sample draft" : "New sample movement"}</h2>
          </div>
          <button type="button" className="sample-icon-button" onClick={onClose} aria-label="Close form">
            ×
          </button>
        </header>

        <ol className="sample-stepper">
          {FORM_STEPS.map((label, index) => (
            <li key={label} className={index === step ? "active" : index < step ? "done" : ""}>
              <span>{index < step ? "✓" : index + 1}</span>
              <small>{label}</small>
            </li>
          ))}
        </ol>

        <div className="sample-modal-body">
          {error && <div className="sample-form-error" role="alert">{error}</div>}

          {step === 0 && (
            <div className="sample-form-section">
              <div className="sample-section-heading">
                <h3>Project and client</h3>
                <p>Every sample movement must remain traceable to a project.</p>
              </div>
              <div
                className="sample-field sample-field-wide sample-project-combobox"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setProjectMenuOpen(false);
                    setActiveProjectIndex(-1);
                  }
                }}
              >
                <span>Linked project *</span>
                <div className={`sample-project-search-wrap ${projectMenuOpen ? "open" : ""}`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m16 16 4 4" />
                  </svg>
                  <input
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={projectMenuOpen}
                    aria-controls="sample-project-results"
                    aria-activedescendant={
                      activeProjectIndex >= 0
                        ? `sample-project-option-${activeProjectIndex}`
                        : undefined
                    }
                    value={projectSearch}
                    onFocus={(event) => {
                      setProjectMenuOpen(true);
                      event.currentTarget.select();
                    }}
                    onChange={(event) => handleProjectSearchChange(event.target.value)}
                    onKeyDown={handleProjectKeyDown}
                    placeholder="Search order number, project name or client"
                  />
                  {projectSearch && (
                    <button
                      type="button"
                      className="sample-project-clear"
                      onClick={() => handleProjectSearchChange("")}
                      aria-label="Clear selected project"
                    >
                      ×
                    </button>
                  )}
                  <span className="sample-project-chevron" aria-hidden="true">⌄</span>
                </div>
                {projectMenuOpen && (
                  <div
                    id="sample-project-results"
                    className="sample-project-results"
                    role="listbox"
                  >
                    {filteredProjects.length ? (
                      filteredProjects.map((project, index) => (
                        <button
                          type="button"
                          id={`sample-project-option-${index}`}
                          role="option"
                          aria-selected={String(form.project) === String(project._id)}
                          className={`${index === activeProjectIndex ? "active" : ""} ${String(form.project) === String(project._id) ? "selected" : ""}`}
                          key={project._id}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectProject(project)}
                        >
                          <span>
                            <strong>{getProjectLabel(project)}</strong>
                            <small>{project?.details?.client || "Client not specified"}</small>
                          </span>
                          <em>{project.status || "Active"}</em>
                        </button>
                      ))
                    ) : (
                      <div className="sample-project-no-results">
                        No projects match “{projectSearch}”
                      </div>
                    )}
                  </div>
                )}
                {selectedProject && !projectMenuOpen && (
                  <small className="sample-project-selected-meta">
                    {selectedProject?.details?.client || "Client not specified"}
                    <span>•</span>
                    {selectedProject.status || "Active project"}
                  </small>
                )}
              </div>
              <label className="sample-field">
                <span>Client name *</span>
                <input value={form.client.name} onChange={(event) => setClientField("name", event.target.value)} />
              </label>
              <label className="sample-field">
                <span>Contact person</span>
                <input value={form.client.contactPerson} onChange={(event) => setClientField("contactPerson", event.target.value)} />
              </label>
              <label className="sample-field">
                <span>Contact role</span>
                <input value={form.client.contactRole} onChange={(event) => setClientField("contactRole", event.target.value)} />
              </label>
              <label className="sample-field">
                <span>Phone</span>
                <input value={form.client.phone} onChange={(event) => setClientField("phone", event.target.value)} />
              </label>
              <label className="sample-field">
                <span>Email</span>
                <input type="email" value={form.client.email} onChange={(event) => setClientField("email", event.target.value)} />
              </label>
              <label className="sample-field">
                <span>Address</span>
                <input value={form.client.address} onChange={(event) => setClientField("address", event.target.value)} />
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="sample-form-section single-column">
              <div className="sample-section-heading sample-heading-row">
                <div>
                  <h3>Sample items</h3>
                  <p>Record identifiers and condition before the items leave.</p>
                </div>
                <button type="button" className="sample-secondary-button" onClick={() => setForm((current) => ({ ...current, items: [...current.items, emptyItem()] }))}>
                  + Add item
                </button>
              </div>
              {form.items.map((item, index) => (
                <article className="sample-item-editor" key={item._id || index}>
                  <div className="sample-item-editor-header">
                    <strong>Sample {index + 1}</strong>
                    {form.items.length > 1 && (
                      <button type="button" onClick={() => removeItem(index)}>Remove</button>
                    )}
                  </div>
                  <div className="sample-item-grid">
                    <label className="sample-field sample-field-wide">
                      <span>Description *</span>
                      <input value={item.description} onChange={(event) => updateItem(index, "description", event.target.value)} placeholder="e.g. Embroidered polo sample" />
                    </label>
                    <label className="sample-field">
                      <span>Quantity *</span>
                      <input type="number" min="1" step="1" inputMode="numeric" value={item.quantity} onChange={(event) => updateItem(index, "quantity", event.target.value)} />
                    </label>
                    <label className="sample-field">
                      <span>Unit</span>
                      <input value={item.unit} onChange={(event) => updateItem(index, "unit", event.target.value)} />
                    </label>
                    <label className="sample-field">
                      <span>Condition</span>
                      <select value={item.outboundCondition} onChange={(event) => updateItem(index, "outboundCondition", event.target.value)}>
                        <option value="Good">Good</option>
                        <option value="Fair">Fair</option>
                        <option value="Damaged">Damaged</option>
                        <option value="Custom">Other / custom</option>
                      </select>
                    </label>
                    <label className="sample-field">
                      <span>Identifying marks</span>
                      <input value={item.identifyingMarks} onChange={(event) => updateItem(index, "identifyingMarks", event.target.value)} placeholder="Serial number, colour, label…" />
                    </label>
                    <label className="sample-field sample-field-wide">
                      <span>Condition notes</span>
                      <textarea rows="2" value={item.outboundConditionNotes} onChange={(event) => updateItem(index, "outboundConditionNotes", event.target.value)} />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="sample-form-section">
              <div className="sample-section-heading sample-field-wide">
                <h3>Custody plan</h3>
                <p>Set how the sample leaves and its expected final disposition.</p>
              </div>
              <label className="sample-field sample-field-wide">
                <span>Purpose of assessment *</span>
                <textarea rows="3" value={form.purpose} onChange={(event) => setField("purpose", event.target.value)} placeholder="What will the client assess or approve?" />
              </label>
              <label className="sample-field">
                <span>Handover method *</span>
                <select value={form.handoverMethod} onChange={(event) => setField("handoverMethod", event.target.value)}>
                  <option value="pickup">Client pick-up</option>
                  <option value="dispatch">Dispatch to client</option>
                </select>
              </label>
              <label className="sample-field">
                <span>Planned disposition *</span>
                <select value={form.disposition} onChange={(event) => setField("disposition", event.target.value)}>
                  <option value="returnable">Returnable</option>
                  <option value="decision_pending">Ownership decision pending</option>
                  <option value="client_owned">Client-owned from release</option>
                </select>
              </label>
              {form.disposition !== "client_owned" && (
                <label className="sample-field">
                  <span>Expected retrieval date *</span>
                  <input type="datetime-local" value={form.expectedReturnAt} onChange={(event) => setField("expectedReturnAt", event.target.value)} />
                </label>
              )}
              <div className="sample-field sample-field-wide">
                <span>Production quantity treatment</span>
                <div className="sample-treatment-list">
                  {form.items.map((item, index) => (
                    <div key={item._id || index}>
                      <strong>{item.description || `Sample ${index + 1}`}</strong>
                      <select value={item.productionTreatment} onChange={(event) => updateItem(index, "productionTreatment", event.target.value)}>
                        {SAMPLE_PRODUCTION_TREATMENTS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      {item.productionTreatment !== "not_applicable" && (
                        <input type="number" min="0" max={item.quantity} step="1" inputMode="numeric" value={item.productionQuantityApplied} onChange={(event) => updateItem(index, "productionQuantityApplied", event.target.value)} aria-label={`Production quantity for ${item.description || `sample ${index + 1}`}`} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="sample-review">
              <div className="sample-review-callout">
                <span>Ready to save</span>
                <strong>This creates a draft. You can review it again before sending it to Admin.</strong>
              </div>
              <dl className="sample-review-grid">
                <div><dt>Project</dt><dd>{selectedProject ? getProjectLabel(selectedProject) : "—"}</dd></div>
                <div><dt>Client</dt><dd>{form.client.name || "—"}</dd></div>
                <div><dt>Handover</dt><dd>{form.handoverMethod === "pickup" ? "Client pick-up" : "Dispatch"}</dd></div>
                <div><dt>Disposition</dt><dd>{form.disposition.replace(/_/g, " ")}</dd></div>
                <div><dt>Samples</dt><dd>{form.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} across {form.items.length} item(s)</dd></div>
                <div><dt>Expected return</dt><dd>{form.disposition === "client_owned" ? "Not required" : new Date(form.expectedReturnAt).toLocaleString("en-GB")}</dd></div>
              </dl>
              <div className="sample-review-purpose"><span>Purpose</span><p>{form.purpose}</p></div>
            </div>
          )}
        </div>

        <footer className="sample-modal-footer">
          <button type="button" className="sample-secondary-button" onClick={step === 0 ? onClose : () => { setError(""); setStep((current) => current - 1); }}>
            {step === 0 ? "Cancel" : "Back"}
          </button>
          {step < FORM_STEPS.length - 1 ? (
            <button type="button" className="sample-primary-button" onClick={nextStep}>Continue</button>
          ) : (
            <button type="button" className="sample-primary-button" disabled={saving} onClick={save}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create draft"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
};

export default SampleMovementForm;
