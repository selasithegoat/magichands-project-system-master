import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { getQuoteAwareStatusLabel } from "../../utils/quoteStatusLabels";
import "./Drafts.css";

const CONVERSION_TYPE_OPTIONS = ["Standard", "Emergency", "Corporate Job"];
const QUOTE_DECISION_LABELS = {
  pending: "Pending",
  accepted: "Accepted",
  accepted_draft: "Accepted Draft",
  declined: "Declined",
  cancelled: "Cancelled",
};

const normalizeDecisionStatus = (project) =>
  String(project?.quoteDetails?.decision?.status || "pending")
    .trim()
    .toLowerCase();

const getDecisionLabel = (status) =>
  QUOTE_DECISION_LABELS[String(status || "").trim().toLowerCase()] || "Pending";

const isAcceptedDraftQuote = (project) =>
  project?.projectType === "Quote" &&
  project?.status === "Finished" &&
  project?.isLatestVersion !== false &&
  normalizeDecisionStatus(project) === "accepted_draft" &&
  !project?.cancellation?.isCancelled;

const formatDateTime = (value) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getDecisionTimestamp = (project) =>
  project?.quoteDetails?.decision?.decidedAt || project?.updatedAt || project?.createdAt;

const Drafts = () => {
  const navigate = useNavigate();
  const [draftQuotes, setDraftQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [conversionTargets, setConversionTargets] = useState({});
  const [convertingId, setConvertingId] = useState("");

  const fetchDraftQuotes = async () => {
    try {
      setError("");
      const res = await fetch("/api/projects?source=admin", {
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error("Failed to load quote drafts.");
      }

      const data = await res.json();
      const rows = (Array.isArray(data) ? data : [])
        .filter((project) => isAcceptedDraftQuote(project))
        .sort((a, b) => {
          const aMs = new Date(getDecisionTimestamp(a)).getTime() || 0;
          const bMs = new Date(getDecisionTimestamp(b)).getTime() || 0;
          return bMs - aMs;
        });

      setDraftQuotes(rows);
    } catch (fetchError) {
      console.error("Quote drafts fetch error:", fetchError);
      setError(fetchError.message || "Failed to load quote drafts.");
      setDraftQuotes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDraftQuotes();
  }, []);

  useRealtimeRefresh(() => fetchDraftQuotes());

  const filteredDraftQuotes = useMemo(() => {
    const token = searchQuery.trim().toLowerCase();
    if (!token) return draftQuotes;
    return draftQuotes.filter((project) => {
      const orderId = String(project?.orderId || "").toLowerCase();
      const projectName = String(project?.details?.projectName || "").toLowerCase();
      const client = String(project?.details?.client || "").toLowerCase();
      return (
        orderId.includes(token) ||
        projectName.includes(token) ||
        client.includes(token)
      );
    });
  }, [draftQuotes, searchQuery]);

  const getTargetTypeFor = (projectId) =>
    conversionTargets[projectId] || CONVERSION_TYPE_OPTIONS[0];

  const handleTargetTypeChange = (projectId, targetType) => {
    if (!projectId) return;
    setConversionTargets((prev) => ({
      ...prev,
      [projectId]: targetType,
    }));
  };

  const handleConvertNow = async (project) => {
    const projectId = project?._id;
    if (!projectId || convertingId) return;

    setConvertingId(projectId);
    setError("");

    try {
      const targetType = getTargetTypeFor(projectId);
      const res = await fetch(
        `/api/projects/${projectId}/quote-decision?source=admin`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            decision: "accepted",
            targetType,
          }),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to convert quote draft.");
      }

      const convertedProject = await res.json();
      navigate(`/projects/${convertedProject?._id || projectId}`);
    } catch (convertError) {
      console.error("Quote draft conversion error:", convertError);
      setError(convertError.message || "Failed to convert quote draft.");
    } finally {
      setConvertingId("");
    }
  };

  return (
    <div className="drafts-page">
      <header className="drafts-header">
        <div>
          <h1>Quote Drafts</h1>
          <p>
            Accepted quote drafts are stored here until they are converted into
            active project workflows.
          </p>
        </div>
        <input
          type="text"
          className="drafts-search"
          placeholder="Search order, project, client..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </header>

      {loading ? (
        <div className="drafts-empty">Loading quote drafts...</div>
      ) : error ? (
        <div className="drafts-empty error">{error}</div>
      ) : filteredDraftQuotes.length === 0 ? (
        <div className="drafts-empty">No quote drafts available.</div>
      ) : (
        <div className="drafts-grid">
          {filteredDraftQuotes.map((project) => {
            const projectId = project?._id;
            const isConverting = convertingId === projectId;
            const decisionStatus = normalizeDecisionStatus(project);
            const statusLabel = getQuoteAwareStatusLabel(project?.status, project);
            const targetType = getTargetTypeFor(projectId);

            return (
              <article key={projectId} className="draft-card">
                <div className="draft-card-head">
                  <div>
                    <h2>{project?.details?.projectName || "Unnamed Project"}</h2>
                    <p>{project?.details?.client || "Unknown Client"}</p>
                  </div>
                  <span className="draft-pill">{statusLabel}</span>
                </div>

                <div className="draft-meta">
                  <p>
                    <strong>Order:</strong> {project?.orderId || "N/A"}
                  </p>
                  <p>
                    <strong>Decision:</strong> {getDecisionLabel(decisionStatus)}
                  </p>
                  <p>
                    <strong>Saved At:</strong>{" "}
                    {formatDateTime(getDecisionTimestamp(project))}
                  </p>
                </div>

                <div className="draft-convert-row">
                  <label htmlFor={`draft-target-type-${projectId}`}>
                    Convert As
                  </label>
                  <select
                    id={`draft-target-type-${projectId}`}
                    value={targetType}
                    onChange={(event) =>
                      handleTargetTypeChange(projectId, event.target.value)
                    }
                    disabled={isConverting}
                  >
                    {CONVERSION_TYPE_OPTIONS.map((entry) => (
                      <option key={entry} value={entry}>
                        {entry}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="draft-actions">
                  <button
                    type="button"
                    className="draft-btn secondary"
                    onClick={() => navigate(`/projects/${projectId}`)}
                    disabled={isConverting}
                  >
                    Open Quote
                  </button>
                  <button
                    type="button"
                    className="draft-btn primary"
                    onClick={() => handleConvertNow(project)}
                    disabled={isConverting}
                  >
                    {isConverting ? "Converting..." : "Convert Now"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Drafts;
