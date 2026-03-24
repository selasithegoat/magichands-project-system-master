import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import OrderMeetingCard from "../../components/OrderMeetingCard/OrderMeetingCard";
import { getLeadDisplay } from "../../utils/leadDisplay";
import "./OrderGroupDetails.css";

const toEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object") {
    if (value._id) return String(value._id);
    if (value.id) return String(value.id);
  }
  return "";
};

const formatDate = (dateString) => {
  if (!dateString) return "-";
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatDateTime = (dateString) => {
  if (!dateString) return "-";
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatTime = (timeStr) => {
  if (!timeStr) return "-";
  if (timeStr.includes("T")) {
    return new Date(timeStr).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return timeStr;
};

const toDepartmentArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
};

const normalizeDepartmentValue = (value) => {
  if (value && typeof value === "object") {
    const optionValue = value.value || value.label || "";
    return String(optionValue).trim();
  }
  return String(value || "").trim();
};

const normalizeDepartmentLabel = (value) =>
  normalizeDepartmentValue(value) || "Unassigned";

const normalizeReferenceAttachments = (attachments) => {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .map((item) => {
      if (!item) return null;
      if (typeof item === "string") {
        const url = item.trim();
        if (!url) return null;
        const name = url.split("?")[0].split("/").pop() || url;
        return { fileUrl: url, fileName: name, note: "" };
      }
      const fileUrl =
        item.fileUrl || item.url || item.path || item.file || item.location;
      if (!fileUrl) return null;
      const fileName =
        item.fileName ||
        item.name ||
        fileUrl.split("?")[0].split("/").pop() ||
        fileUrl;
      return {
        fileUrl,
        fileName,
        note: item.note || item.notes || "",
      };
    })
    .filter(Boolean);
};

const buildLeadGroups = (projects = []) => {
  const map = new Map();
  projects.forEach((project) => {
    const lead = getLeadDisplay(project, "Unassigned");
    if (!map.has(lead)) {
      map.set(lead, []);
    }
    map.get(lead).push(project);
  });
  return Array.from(map.entries()).map(([lead, items]) => ({
    lead,
    projects: items,
  }));
};

const renderDepartmentTags = (departments) => {
  const list = toDepartmentArray(departments)
    .map(normalizeDepartmentLabel)
    .filter(Boolean);
  if (list.length === 0) return <span className="group-muted">None</span>;
  return list.map((dept) => (
    <span key={dept} className="dept-pill">
      {dept}
    </span>
  ));
};

const ProjectDetailBlock = ({ project }) => {
  const details = project?.details || {};
  const items = Array.isArray(project?.items) ? project.items : [];
  const attachments = normalizeReferenceAttachments(
    project?.attachments || details.attachments || [],
  );
  const sampleImage = project?.sampleImage || details.sampleImage;
  if (sampleImage) {
    attachments.unshift({
      fileUrl: sampleImage,
      fileName: "Sample Image",
      note: details.sampleImageNote || "",
    });
  }

  const lead = getLeadDisplay(project, "Unassigned");
  const assistantLead =
    project?.assistantLeadId &&
    (project?.assistantLeadId?.firstName || project?.assistantLeadId?.lastName)
      ? `${project.assistantLeadId.firstName || ""} ${
          project.assistantLeadId.lastName || ""
        }`.trim()
      : project?.assistantLeadId
        ? String(project.assistantLeadId)
        : "None";

  return (
    <article className="group-project-card">
      <header className="group-project-header">
        <div>
          <h3>{details.projectName || "Untitled Project"}</h3>
          <p className="group-project-subtitle">
            {project?.projectType || "Standard"} •{" "}
            <span className="group-status-pill">{project?.status || "N/A"}</span>
          </p>
        </div>
        <div className="group-project-actions">
          <span className="group-project-id">
            Order ID: {project?.orderId || "N/A"}
          </span>
          <span className="group-project-id">
            Project ID: {String(project?._id || "").slice(-6).toUpperCase()}
          </span>
        </div>
      </header>

      <div className="group-project-grid">
        <div className="group-project-section">
          <h4>Lead &amp; Team</h4>
          <p>
            <strong>Lead:</strong> {lead}
          </p>
          <p>
            <strong>Assistant Lead:</strong> {assistantLead}
          </p>
          <div className="group-project-tags">
            <strong>Departments:</strong>
            <div className="group-tag-list">
              {renderDepartmentTags(project?.departments)}
            </div>
          </div>
        </div>

        <div className="group-project-section">
          <h4>Client &amp; Contact</h4>
          <p>
            <strong>Client:</strong> {details.client || "-"}
          </p>
          <p>
            <strong>Email:</strong> {details.clientEmail || "-"}
          </p>
          <p>
            <strong>Phone:</strong> {details.clientPhone || "-"}
          </p>
          <p>
            <strong>Contact Type:</strong> {details.contactType || "-"}
          </p>
        </div>

        <div className="group-project-section">
          <h4>Schedule</h4>
          <p>
            <strong>Order Date:</strong>{" "}
            {formatDate(project?.orderDate || project?.createdAt)}
          </p>
          <p>
            <strong>Received Time:</strong> {formatTime(project?.receivedTime)}
          </p>
          <p>
            <strong>Delivery Date:</strong> {formatDate(details.deliveryDate)}
          </p>
          <p>
            <strong>Delivery Time:</strong> {details.deliveryTime || "All Day"}
          </p>
          <p>
            <strong>Delivery Location:</strong> {details.deliveryLocation || "-"}
          </p>
        </div>

        <div className="group-project-section">
          <h4>Packaging &amp; Supply</h4>
          <p>
            <strong>Packaging Type:</strong> {details.packagingType || "-"}
          </p>
          <p>
            <strong>Supply Source:</strong> {details.supplySource || "-"}
          </p>
        </div>
      </div>

      {details.briefOverview && (
        <div className="group-project-brief">
          <h4>Brief Overview</h4>
          <p>{details.briefOverview}</p>
        </div>
      )}

      <div className="group-project-section">
        <h4>Order Items</h4>
        {items.length === 0 ? (
          <p className="group-muted">No items listed.</p>
        ) : (
          <table className="group-items-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Detailed Specs</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={`${item.description || "item"}-${index}`}>
                  <td>{item.description || "-"}</td>
                  <td>{item.breakdown || "-"}</td>
                  <td>{item.qty || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="group-project-section">
        <h4>Reference Materials</h4>
        {attachments.length === 0 ? (
          <p className="group-muted">No reference materials uploaded.</p>
        ) : (
          <div className="group-reference-list">
            {attachments.map((file, index) => (
              <a
                key={`${file.fileUrl}-${index}`}
                href={file.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="group-reference-item"
              >
                <span className="group-reference-name">{file.fileName}</span>
                {file.note && (
                  <span className="group-reference-note">{file.note}</span>
                )}
              </a>
            ))}
          </div>
        )}
      </div>

      <details className="group-project-raw">
        <summary>Full Project Data</summary>
        <pre>{JSON.stringify(project, null, 2)}</pre>
      </details>
    </article>
  );
};

const OrderGroupDetails = ({ user }) => {
  const { orderNumber: orderNumberParam } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [group, setGroup] = useState(null);
  const [selectedLead, setSelectedLead] = useState("All");

  const orderNumber = String(orderNumberParam || "").trim();

  const fetchGroup = async () => {
    if (!orderNumber) {
      setError("Order number is missing.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/projects/orders/${encodeURIComponent(orderNumber)}?source=admin&collapseRevisions=true`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to load order group.");
      }
      const data = await res.json();
      setGroup(data);
    } catch (fetchError) {
      console.error("Failed to load order group:", fetchError);
      setError(fetchError.message || "Failed to load order group.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroup();
  }, [orderNumber]);

  const projects = Array.isArray(group?.projects) ? group.projects : [];
  const leadGroups = useMemo(() => buildLeadGroups(projects), [projects]);
  const leadPills = useMemo(() => {
    const pills = leadGroups.map((groupEntry) => ({
      id: groupEntry.lead,
      label: groupEntry.lead,
      count: groupEntry.projects.length,
    }));
    pills.sort((a, b) => a.label.localeCompare(b.label));
    return [{ id: "All", label: "All Leads", count: projects.length }, ...pills];
  }, [leadGroups, projects.length]);

  const filteredLeadGroups = useMemo(() => {
    if (selectedLead === "All") return leadGroups;
    return leadGroups.filter((entry) => entry.lead === selectedLead);
  }, [leadGroups, selectedLead]);

  if (loading) {
    return (
      <div className="order-group-page">
        <div className="group-loading">Loading group projects...</div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="order-group-page">
        <div className="group-error">{error || "Order group not found."}</div>
        <button
          type="button"
          className="group-back-btn"
          onClick={() => navigate("/projects")}
        >
          Back to Projects
        </button>
      </div>
    );
  }

  const client =
    group?.client ||
    projects[0]?.details?.client ||
    group?.orderRef?.client ||
    "-";
  const orderDate =
    group?.orderDate ||
    group?.orderRef?.orderDate ||
    projects[0]?.orderDate ||
    projects[0]?.createdAt;

  return (
    <div className="order-group-page">
      <header className="order-group-header">
        <div>
          <button
            type="button"
            className="group-back-btn"
            onClick={() => navigate("/projects")}
          >
            Back to Projects
          </button>
          <h1>Order Group: {group?.orderNumber || orderNumber}</h1>
          <p>
            <strong>Client:</strong> {client} •{" "}
            <strong>Order Date:</strong> {formatDate(orderDate)} •{" "}
            <strong>Projects:</strong> {projects.length}
          </p>
        </div>
        <div className="order-group-meta">
          <span className="group-meta-pill">
            Updated {formatDateTime(group?.updatedAt || projects[0]?.updatedAt)}
          </span>
          <span className="group-meta-pill">Order Ref: {group?.orderNumber}</span>
        </div>
      </header>

      <section className="order-group-meeting">
        <OrderMeetingCard
          orderNumber={group?.orderNumber || orderNumber}
          orderGroupProjects={projects}
          user={user}
          showHistory={true}
        />
      </section>

      <section className="order-group-leads">
        <h2>Lead Filters</h2>
        <div className="lead-pill-list">
          {leadPills.map((pill) => (
            <button
              key={pill.id}
              type="button"
              className={`lead-pill ${
                selectedLead === pill.id ? "active" : ""
              }`}
              onClick={() => setSelectedLead(pill.id)}
            >
              {pill.label}
              <span className="lead-pill-count">{pill.count}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="order-group-content">
        {filteredLeadGroups.length === 0 ? (
          <div className="group-empty">No projects match this lead.</div>
        ) : (
          filteredLeadGroups.map((entry) => (
            <div key={entry.lead} className="lead-group-block">
              <div className="lead-group-header">
                <h2>{entry.lead}</h2>
                <span>{entry.projects.length} project(s)</span>
              </div>
              <div className="lead-group-grid">
                {entry.projects.map((project) => (
                  <ProjectDetailBlock
                    key={project._id || toEntityId(project)}
                    project={project}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
};

export default OrderGroupDetails;
