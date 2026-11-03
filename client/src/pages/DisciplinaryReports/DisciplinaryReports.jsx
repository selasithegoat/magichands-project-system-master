import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./DisciplinaryReports.css";

const emptyFinding = () => ({ title: "", discussion: "", evidence: "", conclusion: "" });
const emptyProposal = () => ({ recommendation: "", votesFor: 0, votesAgainst: 0, abstentions: 0, selected: false });
const emptyAccountability = () => ({
  user: "",
  summary: "",
  severity: "minor",
  penalized: false,
  penaltyType: "none",
  penaltyDetails: "",
  penaltyStatus: "not_applicable",
  correctiveAction: "",
  correctiveOwner: "",
  correctiveDueDate: "",
  correctiveStatus: "not_required",
});
const localDateTime = (date = new Date()) => {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
};
const emptyForm = (user) => ({
  project: "",
  challengeTitle: "",
  moderator: user?._id || "",
  meeting: { startedAt: localDateTime(), endedAt: "", location: "" },
  attendees: [],
  challengeBrief: "",
  projectImpact: "",
  findings: [emptyFinding()],
  proposals: [emptyProposal()],
  accountability: [],
  committeeConclusion: "",
  managementDecision: "",
});
const hasScrumLeadTag = (user) =>
  Array.isArray(user?.accessTags) && user.accessTags.includes("scrum_lead");
const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "Not recorded";
const titleCase = (value) =>
  String(value || "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "The request could not be completed.");
  return data;
};

const FieldArrayActions = ({ onAdd, label }) => (
  <button type="button" className="dcmr-add-row" onClick={onAdd}>+ {label}</button>
);

const DisciplinaryReports = ({ user, portal = "client" }) => {
  const isAdmin = user?.role === "admin";
  const allowed = isAdmin || hasScrumLeadTag(user);
  const [tab, setTab] = useState("reports");
  const [reports, setReports] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(() => emptyForm(user));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [rankingFilters, setRankingFilters] = useState({ from: "", to: "", department: "" });
  const [evidenceFiles, setEvidenceFiles] = useState([]);
  const [managementDecision, setManagementDecision] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadWorkspace = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError("");
    try {
      const [reportData, rankingData, peopleData, projectData] = await Promise.all([
        requestJson("/api/disciplinary-reports"),
        requestJson("/api/disciplinary-reports/ranking"),
        requestJson("/api/disciplinary-reports/directory"),
        requestJson("/api/disciplinary-reports/projects"),
      ]);
      setReports(reportData);
      setRanking(rankingData);
      setDirectory(peopleData);
      setProjects(projectData);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);

  useEffect(() => {
    if (!projectSearch.trim()) return;
    const timer = window.setTimeout(async () => {
      try {
        setProjects(await requestJson(`/api/disciplinary-reports/projects?search=${encodeURIComponent(projectSearch)}`));
      } catch (requestError) {
        setError(requestError.message);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [projectSearch]);

  const filteredReports = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reports.filter((report) => {
      if (statusFilter && report.status !== statusFilter) return false;
      if (!term) return true;
      return [report.reportNumber, report.challengeTitle, report.projectSnapshot?.orderId, report.projectSnapshot?.projectName]
        .some((value) => String(value || "").toLowerCase().includes(term));
    });
  }, [reports, search, statusFilter]);

  const stats = useMemo(() => ({
    total: reports.length,
    awaiting: reports.filter((report) => report.status === "submitted").length,
    finalized: reports.filter((report) => report.status === "finalized").length,
    openActions: ranking.reduce((sum, entry) => sum + entry.openCorrectiveActions, 0),
  }), [reports, ranking]);

  const departments = useMemo(
    () => Array.from(new Set(directory.flatMap((entry) => entry.department || []))).sort(),
    [directory],
  );

  const applyRankingFilters = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      Object.entries(rankingFilters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      setRanking(await requestJson(`/api/disciplinary-reports/ranking?${params.toString()}`));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setMeetingField = (field, value) => setForm((current) => ({ ...current, meeting: { ...current.meeting, [field]: value } }));
  const setArrayField = (key, index, field, value) => setForm((current) => ({
    ...current,
    [key]: current[key].map((entry, entryIndex) => entryIndex === index ? { ...entry, [field]: value } : entry),
  }));
  const removeArrayRow = (key, index) => setForm((current) => ({ ...current, [key]: current[key].filter((_, entryIndex) => entryIndex !== index) }));

  const toggleAttendee = (employeeId) => setForm((current) => ({
    ...current,
    attendees: current.attendees.some((entry) => entry.user === employeeId)
      ? current.attendees.filter((entry) => entry.user !== employeeId)
      : [...current.attendees, { user: employeeId, attendanceStatus: "present" }],
  }));

  const resetEditor = () => {
    setEditingId("");
    setForm(emptyForm(user));
    setEvidenceFiles([]);
    setNotice("");
    setError("");
  };

  const openEditor = (report = null) => {
    if (report) {
      setEditingId(report._id);
      setForm({
        project: report.project,
        challengeTitle: report.challengeTitle || "",
        moderator: report.moderator?.user || "",
        meeting: {
          startedAt: localDateTime(new Date(report.meeting?.startedAt)),
          endedAt: report.meeting?.endedAt ? localDateTime(new Date(report.meeting.endedAt)) : "",
          location: report.meeting?.location || "",
        },
        attendees: (report.attendees || []).map((entry) => ({ user: entry.user, role: entry.role, attendanceStatus: entry.attendanceStatus })),
        challengeBrief: report.challengeBrief || "",
        projectImpact: report.projectImpact || "",
        findings: report.findings?.length ? report.findings : [emptyFinding()],
        proposals: report.proposals?.length ? report.proposals : [emptyProposal()],
        accountability: (report.accountability || []).map((entry) => ({
          ...entry,
          user: entry.user || "",
          correctiveOwner: entry.correctiveOwner?.user || "",
          effectiveDate: entry.effectiveDate ? String(entry.effectiveDate).slice(0, 10) : "",
          correctiveDueDate: entry.correctiveDueDate ? String(entry.correctiveDueDate).slice(0, 10) : "",
        })),
        committeeConclusion: report.committeeConclusion || "",
        managementDecision: report.managementDecision || "",
      });
    } else {
      resetEditor();
    }
    setSelectedReport(null);
    setTab("create");
  };

  const uploadEvidence = async (reportId) => {
    if (!evidenceFiles.length) return;
    const body = new FormData();
    evidenceFiles.forEach((file) => body.append("disciplinaryEvidence", file));
    const response = await fetch(`/api/disciplinary-reports/${reportId}/evidence`, {
      method: "POST",
      credentials: "include",
      body,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Evidence could not be uploaded.");
  };

  const saveReport = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        ...form,
        findings: form.findings.filter((entry) => entry.title.trim() || entry.conclusion.trim()),
        proposals: form.proposals.filter((entry) => entry.recommendation.trim()),
        accountability: form.accountability.filter((entry) => entry.user && entry.summary.trim()),
      };
      const saved = await requestJson(
        editingId ? `/api/disciplinary-reports/${editingId}` : "/api/disciplinary-reports",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      await uploadEvidence(saved._id);
      setNotice(`${saved.reportNumber} saved as a draft.`);
      await loadWorkspace();
      setSelectedReport(saved);
      setTab("reports");
      resetEditor();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (path, body, successMessage) => {
    setSaving(true);
    setError("");
    try {
      const updated = await requestJson(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      setSelectedReport(updated);
      setManagementDecision(updated.managementDecision || "");
      setNotice(successMessage);
      await loadWorkspace();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const downloadDocument = async (report) => {
    setError("");
    try {
      const response = await fetch(`/api/disciplinary-reports/${report._id}/export.docx`, { credentials: "include" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Report export failed.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${report.reportNumber}.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  if (!allowed) {
    return <main className="dcmr-shell"><section className="dcmr-access-denied"><strong>Restricted workspace</strong><p>Only assigned Scrum Leads and administrators can access Disciplinary Committee reports.</p></section></main>;
  }

  return (
    <main className={`dcmr-shell dcmr-${portal}`}>
      <section className="dcmr-hero">
        <div><span className="dcmr-kicker">Restricted committee workspace</span><h1>Disciplinary Committee<br />meeting reports</h1><p>Record project challenges, evidence, committee findings, decisions, and corrective actions in one traceable report.</p></div>
        <button type="button" className="dcmr-primary" onClick={() => openEditor()}>Create meeting report</button>
      </section>

      <section className="dcmr-stats" aria-label="Report summary">
        <article><span>Total reports</span><strong>{stats.total}</strong></article>
        <article><span>Awaiting decision</span><strong>{stats.awaiting}</strong></article>
        <article><span>Finalized</span><strong>{stats.finalized}</strong></article>
        <article><span>Open corrective actions</span><strong>{stats.openActions}</strong></article>
      </section>

      <nav className="dcmr-tabs" aria-label="Disciplinary report views">
        <button type="button" className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}>Reports</button>
        <button type="button" className={tab === "ranking" ? "active" : ""} onClick={() => setTab("ranking")}>Accountability ranking</button>
        <button type="button" className={tab === "create" ? "active" : ""} onClick={() => openEditor()}>New report</button>
      </nav>

      {error && <div className="dcmr-message error" role="alert">{error}</div>}
      {notice && <div className="dcmr-message success" role="status">{notice}</div>}

      {loading ? (
        <section className="dcmr-skeleton" aria-label="Loading reports"><i /><i /><i /></section>
      ) : tab === "reports" ? (
        <section className="dcmr-panel">
          <header className="dcmr-panel-head"><div><h2>Meeting report register</h2><p>Drafts, submitted cases, and approved decisions.</p></div><div className="dcmr-filters"><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search report, order, or challenge" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="finalized">Finalized</option><option value="voided">Voided</option></select></div></header>
          {filteredReports.length ? <div className="dcmr-report-list">{filteredReports.map((report) => (
            <article className="dcmr-report-card" key={report._id}>
              <button type="button" className="dcmr-card-main" onClick={() => { setSelectedReport(report); setManagementDecision(report.managementDecision || ""); setVoidReason(""); }}>
                <span className={`dcmr-status ${report.status}`}>{titleCase(report.status)}</span>
                <div><small>{report.reportNumber} · {report.projectSnapshot?.orderId}</small><h3>{report.challengeTitle}</h3><p>{report.projectSnapshot?.projectName}</p></div>
                <div className="dcmr-card-meta"><span>{formatDate(report.meeting?.startedAt)}</span><strong>{report.accountability?.length || 0} accountability finding(s)</strong></div>
              </button>
            </article>
          ))}</div> : <div className="dcmr-empty"><strong>No reports match this view.</strong><p>Create a meeting report or change the current filters.</p><button type="button" onClick={() => openEditor()}>Create the first report</button></div>}
        </section>
      ) : tab === "ranking" ? (
        <section className="dcmr-panel">
          <header className="dcmr-panel-head"><div><h2>Accountability ranking</h2><p>Calculated only from confirmed findings in finalized reports.</p></div><span className="dcmr-score-key">Minor 1 · Moderate 3 · Major 5 · Critical 8</span></header>
          <div className="dcmr-ranking-filters"><label><span>From</span><input type="date" value={rankingFilters.from} onChange={(event) => setRankingFilters((current) => ({ ...current, from: event.target.value }))} /></label><label><span>To</span><input type="date" value={rankingFilters.to} onChange={(event) => setRankingFilters((current) => ({ ...current, to: event.target.value }))} /></label><label><span>Department</span><select value={rankingFilters.department} onChange={(event) => setRankingFilters((current) => ({ ...current, department: event.target.value }))}><option value="">All departments</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label><button type="button" onClick={applyRankingFilters}>Apply filters</button></div>
          {ranking.length ? <div className="dcmr-table-wrap"><table className="dcmr-ranking"><thead><tr><th>Rank</th><th>Employee</th><th>Score</th><th>Findings</th><th>Severity record</th><th>Penalties</th><th>Open actions</th><th>Latest</th></tr></thead><tbody>{ranking.map((entry, index) => <tr key={entry.user}><td><span className="dcmr-rank">{index + 1}</span></td><td><button type="button" className="dcmr-person-link" onClick={() => { const report = reports.find((item) => String(item._id) === String(entry.reports?.[0]?._id)); if (report) setSelectedReport(report); }}><strong>{entry.name}</strong><small>{entry.employeeId} · {(entry.department || []).join(", ")}</small></button></td><td><b>{entry.score}</b></td><td>{entry.findingCount}</td><td><span className="dcmr-severity-record"><i className="critical">{entry.severityCounts.critical}</i><i className="major">{entry.severityCounts.major}</i><i className="moderate">{entry.severityCounts.moderate}</i><i className="minor">{entry.severityCounts.minor}</i></span></td><td>{entry.penaltiesIssued}</td><td>{entry.openCorrectiveActions}</td><td>{formatDate(entry.latestIncidentAt)}</td></tr>)}</tbody></table></div> : <div className="dcmr-empty"><strong>No finalized accountability findings yet.</strong><p>Employees appear here only after an administrator finalizes a report.</p></div>}
        </section>
      ) : (
        <form className="dcmr-form" onSubmit={saveReport}>
          <header><div><span className="dcmr-kicker">{editingId ? "Edit draft" : "New report"}</span><h2>Committee meeting record</h2><p>Complete the known information now and save the report as a draft.</p></div><button type="button" className="dcmr-secondary" onClick={() => { resetEditor(); setTab("reports"); }}>Cancel</button></header>

          <fieldset><legend><span>1</span> Meeting and project</legend><div className="dcmr-form-grid">
            <label className="wide"><span>Find project</span><input type="search" value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Search order number or project name" /></label>
            <label className="wide"><span>Linked project *</span><select required value={form.project} onChange={(event) => setField("project", event.target.value)}><option value="">Select a project</option>{projects.map((project) => <option key={project._id} value={project._id}>{project.orderId} · {project.details?.projectName || "Untitled project"}</option>)}</select></label>
            <label className="wide"><span>Challenge title *</span><input required value={form.challengeTitle} onChange={(event) => setField("challengeTitle", event.target.value)} placeholder="Describe the production or execution challenge" /></label>
            <label><span>Scrum Lead / Moderator *</span><select required value={form.moderator} onChange={(event) => setField("moderator", event.target.value)}><option value="">Select moderator</option>{directory.filter((entry) => entry.accessTags?.includes("scrum_lead") || entry.user === user?._id || isAdmin).map((entry) => <option key={entry.user} value={entry.user}>{entry.name}</option>)}</select></label>
            <label><span>Location</span><input value={form.meeting.location} onChange={(event) => setMeetingField("location", event.target.value)} placeholder="Boardroom or meeting point" /></label>
            <label><span>Meeting start *</span><input type="datetime-local" required value={form.meeting.startedAt} onChange={(event) => setMeetingField("startedAt", event.target.value)} /></label>
            <label><span>Meeting end</span><input type="datetime-local" value={form.meeting.endedAt} onChange={(event) => setMeetingField("endedAt", event.target.value)} /></label>
          </div></fieldset>

          <fieldset><legend><span>2</span> Attendance <em>{form.attendees.length} selected</em></legend><div className="dcmr-people-grid">{directory.map((employee) => { const checked = form.attendees.some((entry) => entry.user === employee.user); return <label className={checked ? "selected" : ""} key={employee.user}><input type="checkbox" checked={checked} onChange={() => toggleAttendee(employee.user)} /><strong>{employee.name}</strong><small>{employee.employeeId} · {(employee.department || []).join(", ")}</small></label>; })}</div></fieldset>

          <fieldset><legend><span>3</span> Challenge brief</legend><div className="dcmr-form-grid"><label className="wide"><span>Summary of the challenge *</span><textarea required rows="5" value={form.challengeBrief} onChange={(event) => setField("challengeBrief", event.target.value)} /></label><label className="wide"><span>Impact on the project</span><textarea rows="3" value={form.projectImpact} onChange={(event) => setField("projectImpact", event.target.value)} /></label><label className="wide"><span>Supporting evidence</span><input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" onChange={(event) => setEvidenceFiles(Array.from(event.target.files || []))} /><small>{evidenceFiles.length ? `${evidenceFiles.length} file(s) ready to upload` : "Images and common office documents are supported."}</small></label></div></fieldset>

          <fieldset><legend><span>4</span> Team discussion and findings</legend>{form.findings.map((finding, index) => <div className="dcmr-repeat" key={index}><div className="dcmr-repeat-head"><strong>Finding {index + 1}</strong>{form.findings.length > 1 && <button type="button" onClick={() => removeArrayRow("findings", index)}>Remove</button>}</div><div className="dcmr-form-grid"><label className="wide"><span>Topic or question</span><input value={finding.title} onChange={(event) => setArrayField("findings", index, "title", event.target.value)} /></label><label className="wide"><span>Discussion and responses</span><textarea rows="3" value={finding.discussion} onChange={(event) => setArrayField("findings", index, "discussion", event.target.value)} /></label><label><span>Evidence considered</span><textarea rows="3" value={finding.evidence} onChange={(event) => setArrayField("findings", index, "evidence", event.target.value)} /></label><label><span>Finding established</span><textarea rows="3" value={finding.conclusion} onChange={(event) => setArrayField("findings", index, "conclusion", event.target.value)} /></label></div></div>)}<FieldArrayActions label="Add finding" onAdd={() => setForm((current) => ({ ...current, findings: [...current.findings, emptyFinding()] }))} /></fieldset>

          <fieldset><legend><span>5</span> Proposed actions and votes</legend>{form.proposals.map((proposal, index) => <div className="dcmr-repeat compact" key={index}><div className="dcmr-repeat-head"><strong>Recommendation {index + 1}</strong>{form.proposals.length > 1 && <button type="button" onClick={() => removeArrayRow("proposals", index)}>Remove</button>}</div><div className="dcmr-form-grid vote-grid"><label className="wide"><span>Action or recommendation</span><textarea rows="2" value={proposal.recommendation} onChange={(event) => setArrayField("proposals", index, "recommendation", event.target.value)} /></label><label><span>For</span><input type="number" min="0" value={proposal.votesFor} onChange={(event) => setArrayField("proposals", index, "votesFor", event.target.value)} /></label><label><span>Against</span><input type="number" min="0" value={proposal.votesAgainst} onChange={(event) => setArrayField("proposals", index, "votesAgainst", event.target.value)} /></label><label><span>Abstentions</span><input type="number" min="0" value={proposal.abstentions} onChange={(event) => setArrayField("proposals", index, "abstentions", event.target.value)} /></label><label className="dcmr-check"><input type="checkbox" checked={proposal.selected} onChange={(event) => setArrayField("proposals", index, "selected", event.target.checked)} /><span>Selected action</span></label></div></div>)}<FieldArrayActions label="Add recommendation" onAdd={() => setForm((current) => ({ ...current, proposals: [...current.proposals, emptyProposal()] }))} /></fieldset>

          <fieldset><legend><span>6</span> Accountability and corrective action</legend>{form.accountability.map((entry, index) => <div className="dcmr-repeat" key={index}><div className="dcmr-repeat-head"><strong>Employee finding {index + 1}</strong><button type="button" onClick={() => removeArrayRow("accountability", index)}>Remove</button></div><div className="dcmr-form-grid"><label><span>Responsible employee</span><select value={entry.user} onChange={(event) => setArrayField("accountability", index, "user", event.target.value)}><option value="">Select employee</option>{directory.map((employee) => <option key={employee.user} value={employee.user}>{employee.name} · {employee.employeeId}</option>)}</select></label><label><span>Responsibility level</span><select value={entry.severity} onChange={(event) => setArrayField("accountability", index, "severity", event.target.value)}><option value="minor">Minor</option><option value="moderate">Moderate</option><option value="major">Major</option><option value="critical">Critical</option></select></label><label className="wide"><span>Responsibility or failure identified</span><textarea rows="3" value={entry.summary} onChange={(event) => setArrayField("accountability", index, "summary", event.target.value)} /></label><label className="dcmr-check"><input type="checkbox" checked={entry.penalized} onChange={(event) => { setArrayField("accountability", index, "penalized", event.target.checked); if (!event.target.checked) setArrayField("accountability", index, "penaltyType", "none"); }} /><span>Penalty applies</span></label>{entry.penalized && <><label><span>Penalty type</span><select value={entry.penaltyType} onChange={(event) => setArrayField("accountability", index, "penaltyType", event.target.value)}><option value="coaching">Coaching</option><option value="verbal_warning">Verbal warning</option><option value="written_warning">Written warning</option><option value="restitution">Restitution</option><option value="suspension">Suspension</option><option value="other">Other</option></select></label><label className="wide"><span>Penalty details</span><textarea rows="2" value={entry.penaltyDetails} onChange={(event) => setArrayField("accountability", index, "penaltyDetails", event.target.value)} /></label></>}<label className="wide"><span>Corrective action</span><textarea rows="2" value={entry.correctiveAction} onChange={(event) => setArrayField("accountability", index, "correctiveAction", event.target.value)} /></label><label><span>Action owner</span><select value={entry.correctiveOwner} onChange={(event) => setArrayField("accountability", index, "correctiveOwner", event.target.value)}><option value="">Select owner</option>{directory.map((employee) => <option key={employee.user} value={employee.user}>{employee.name}</option>)}</select></label><label><span>Due date</span><input type="date" value={entry.correctiveDueDate || ""} onChange={(event) => { setArrayField("accountability", index, "correctiveDueDate", event.target.value); setArrayField("accountability", index, "correctiveStatus", event.target.value ? "open" : "not_required"); }} /></label></div></div>)}<FieldArrayActions label="Add employee finding" onAdd={() => setForm((current) => ({ ...current, accountability: [...current.accountability, emptyAccountability()] }))} /></fieldset>

          <fieldset><legend><span>7</span> Conclusion and decision</legend><div className="dcmr-form-grid"><label className="wide"><span>Committee conclusion</span><textarea rows="5" value={form.committeeConclusion} onChange={(event) => setField("committeeConclusion", event.target.value)} /></label>{isAdmin && <label className="wide"><span>Management decision</span><textarea rows="5" value={form.managementDecision} onChange={(event) => setField("managementDecision", event.target.value)} /></label>}</div></fieldset>

          <footer className="dcmr-form-actions"><span>Saving creates an editable draft. Submit it from the report register when the committee record is complete.</span><button className="dcmr-primary" type="submit" disabled={saving}>{saving ? "Saving report…" : editingId ? "Update draft" : "Save draft report"}</button></footer>
        </form>
      )}

      {selectedReport && <div className="dcmr-overlay" role="presentation" onMouseDown={() => setSelectedReport(null)}><section className="dcmr-detail" role="dialog" aria-modal="true" aria-labelledby="dcmr-detail-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span className={`dcmr-status ${selectedReport.status}`}>{titleCase(selectedReport.status)}</span><small>{selectedReport.reportNumber} · {selectedReport.projectSnapshot?.orderId}</small><h2 id="dcmr-detail-title">{selectedReport.challengeTitle}</h2><p>{selectedReport.projectSnapshot?.projectName}</p></div><button type="button" onClick={() => setSelectedReport(null)} aria-label="Close report">×</button></header><div className="dcmr-detail-body"><dl><div><dt>Moderator</dt><dd>{selectedReport.moderator?.name}</dd></div><div><dt>Meeting</dt><dd>{formatDate(selectedReport.meeting?.startedAt)}</dd></div><div><dt>People present</dt><dd>{selectedReport.attendees?.filter((entry) => entry.attendanceStatus === "present").length || 0}</dd></div><div><dt>Version</dt><dd>{selectedReport.version}</dd></div></dl><article><h3>Challenge brief</h3><p>{selectedReport.challengeBrief}</p></article><article><h3>Committee findings</h3>{selectedReport.findings?.map((entry) => <div className="dcmr-detail-entry" key={entry._id}><strong>{entry.title}</strong><p>{entry.conclusion}</p></div>)}</article><article><h3>Accountability</h3>{selectedReport.accountability?.length ? selectedReport.accountability.map((entry) => <div className="dcmr-detail-entry" key={entry._id}><span className={`dcmr-severity ${entry.severity}`}>{titleCase(entry.severity)}</span><strong>{entry.name}</strong><p>{entry.summary}</p><small>{entry.penalized ? `Penalty: ${titleCase(entry.penaltyType)}` : "No penalty recorded"}</small></div>) : <p>No employee accountability finding was recorded.</p>}</article><article><h3>Committee conclusion</h3><p>{selectedReport.committeeConclusion || "Pending"}</p></article><article><h3>Management decision</h3><p>{selectedReport.managementDecision || "Awaiting management decision"}</p></article>{selectedReport.evidenceFiles?.length > 0 && <article><h3>Evidence files</h3><div className="dcmr-evidence-list">{selectedReport.evidenceFiles.map((file) => <a key={file._id} href={file.fileUrl} target="_blank" rel="noreferrer">{file.originalName}</a>)}</div></article>}{isAdmin && selectedReport.status === "submitted" && <article className="dcmr-decision"><h3>Record management decision</h3><textarea rows="4" value={managementDecision} onChange={(event) => setManagementDecision(event.target.value)} /><button type="button" className="dcmr-primary" disabled={saving || !managementDecision.trim()} onClick={() => runAction(`/api/disciplinary-reports/${selectedReport._id}/finalize`, { managementDecision }, `${selectedReport.reportNumber} finalized.`)}>Finalize report</button></article>}{isAdmin && selectedReport.status !== "voided" && <article className="dcmr-void"><h3>Void report</h3><input value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="Required reason" /><button type="button" disabled={saving || !voidReason.trim()} onClick={() => runAction(`/api/disciplinary-reports/${selectedReport._id}/void`, { reason: voidReason }, `${selectedReport.reportNumber} voided.`)}>Void report</button></article>}</div><footer>{selectedReport.status === "draft" && (isAdmin || String(selectedReport.createdBy?._id || selectedReport.createdBy) === String(user?._id)) && <><button type="button" onClick={() => openEditor(selectedReport)}>Edit draft</button><button type="button" className="dcmr-primary" disabled={saving} onClick={() => runAction(`/api/disciplinary-reports/${selectedReport._id}/submit`, {}, `${selectedReport.reportNumber} submitted for management decision.`)}>Submit report</button></>}{isAdmin && ["submitted", "finalized"].includes(selectedReport.status) && <button type="button" onClick={() => runAction(`/api/disciplinary-reports/${selectedReport._id}/reopen`, { reason: "Reopened for amendment" }, `${selectedReport.reportNumber} reopened as a draft.`)}>Reopen</button>}<button type="button" onClick={() => downloadDocument(selectedReport)}>Download Word report</button></footer></section></div>}
    </main>
  );
};

export default DisciplinaryReports;
