import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // Import useNavigate
import { format, differenceInHours } from "date-fns";
import Spinner from "../../components/ui/Spinner";
import { DownloadIcon } from "../../components/icons/DownloadIcon"; // Assuming exists or I will create an inline SVG
import "./EndOfDayUpdate.css";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { getLeadDisplay } from "../../utils/leadDisplay";

const isEmergencyProject = (project) =>
  project?.projectType === "Emergency" || project?.priority === "Urgent";

const EndOfDayUpdate = ({ user }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate(); // Hook

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  useEffect(() => {
    // Redirect if user is loaded but not Front Desk
    if (user && !user.department?.includes("Front Desk")) {
      navigate("/");
      return;
    }

    fetchProjects();
  }, [user, navigate]);

  const isFrontDesk = user?.department?.includes("Front Desk");
  useRealtimeRefresh(() => fetchProjects(), { enabled: Boolean(isFrontDesk) });

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects?mode=report");
      if (res.ok) {
        const data = await res.json();
        const nowMs = Date.now();
        const activeProjects = data.filter((project) =>
          shouldShowProjectInEndOfDay(project, nowMs),
        );
        setProjects(sortProjectsByLeadName(activeProjects));
        setCurrentPage(1); // Reset to page 1 on new fetch
      }
    } catch (err) {
      console.error("Failed to fetch projects", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    });
  };

  const stripDepartmentNudge = (content) =>
    String(content || "").replace(/^\[[^\]]+\]\s*/, "").trim();

  const getUpdateSourceName = (project) => {
    const source = project?.endOfDayUpdateBy;
    if (!source || typeof source === "string") return "";

    return `${source.firstName || ""} ${source.lastName || ""}`.trim();
  };

  const formatTime = (timeString) => {
    if (!timeString) return "";
    return timeString;
  };

  const getProjectVersion = (project) => {
    const parsedVersion = Number(project?.versionNumber);
    return Number.isFinite(parsedVersion) && parsedVersion > 0
      ? parsedVersion
      : 1;
  };

  const shouldShowProjectInEndOfDay = (project, nowMs = Date.now()) => {
    if (project?.status === "Completed") return false;
    if (project?.status !== "Finished") return true;

    const feedbackEntries = Array.isArray(project?.feedbacks)
      ? project.feedbacks
      : [];
    if (feedbackEntries.length === 0) return true;

    const latestFeedbackMs = feedbackEntries.reduce((latest, feedback) => {
      const rawDate = feedback?.createdAt || feedback?.date;
      if (!rawDate) return latest;
      const ms = new Date(rawDate).getTime();
      if (Number.isNaN(ms)) return latest;
      return Math.max(latest, ms);
    }, 0);

    if (!latestFeedbackMs) return true;

    const elapsedHours = (nowMs - latestFeedbackMs) / (1000 * 60 * 60);
    return elapsedHours < 24;
  };

  const sortProjectsByLeadName = (list) =>
    [...list].sort((a, b) => {
      const aLead = getLeadDisplay(a, "Unassigned").trim();
      const bLead = getLeadDisplay(b, "Unassigned").trim();
      const aIsUnassigned = aLead.toLowerCase() === "unassigned";
      const bIsUnassigned = bLead.toLowerCase() === "unassigned";

      if (aIsUnassigned && !bIsUnassigned) return 1;
      if (!aIsUnassigned && bIsUnassigned) return -1;

      const leadCompare = aLead.localeCompare(bLead, "en", {
        sensitivity: "base",
      });
      if (leadCompare !== 0) return leadCompare;

      const aProjectName = a?.details?.projectName || "";
      const bProjectName = b?.details?.projectName || "";
      return aProjectName.localeCompare(bProjectName, "en", {
        sensitivity: "base",
      });
    });

  const handleDownload = async () => {
    if (!projects.length) return;

    try {
      const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        Table,
        TableRow,
        TableCell,
        WidthType,
        BorderStyle,
        PageOrientation,
        AlignmentType,
        Footer,
        Header,
      } = await import("docx");
      const { saveAs } = await import("file-saver");
      const userName = user
        ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
        : "User";
      // Refinement: Month in words (MMMM)
      const dateStr = format(new Date(), "EEEE. dd MMMM yy");
      // Title text is now used in Header, not body

      const tableRows = [
        new TableRow({
          children: [
            "Lead Name",
            "Order Number",
            "Order Name",
            "Delivery Date & Time",
            "Status",
            "Latest Update",
          ].map(
            (text) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text,
                        bold: true,
                        size: 24,
                        color: "000000",
                        font: "Calibri",
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                  }),
                ],
                width: { size: 16, type: WidthType.PERCENTAGE },
                shading: { fill: "ffffff" },
                margins: { top: 100, bottom: 100, left: 100, right: 100 },
              }),
          ),
        }),
      ];

      projects.forEach((project) => {
        const leadName = getLeadDisplay(project, "Unassigned");
        const projectVersion = getProjectVersion(project);
        const orderNumber = project.orderId || "N/A";
        const orderNumberWithVersion =
          projectVersion > 1 ? `${orderNumber} (v${projectVersion})` : orderNumber;

        const deliveryContent = `${formatDate(
          project.details?.deliveryDate,
        )} ${formatTime(project.details?.deliveryTime)}`;

        const updateContent = project.endOfDayUpdate
          ? stripDepartmentNudge(project.endOfDayUpdate)
          : "No updates yet";

        // Urgency Check
        const isEmergency = isEmergencyProject(project);
        let isUrgent = false;
        if (project.details?.deliveryDate) {
          const deliveryDate = new Date(project.details.deliveryDate);
          const hoursDiff = differenceInHours(deliveryDate, new Date());
          if (hoursDiff <= 72) {
            isUrgent = true;
          }
        }

        const textColor = isUrgent || isEmergency ? "FF0000" : "000000";

        const getRowColor = (type) => {
          switch (type) {
            case "Emergency":
              return "FEF2F2";
            case "Corporate Job":
              return "F0FDF4";
            case "Quote":
              return "FFFBEB";
            default:
              return "EFF6FF";
          }
        };

        const rowColor = getRowColor(project.projectType);

        tableRows.push(
          new TableRow({
            children: [
              leadName,
              orderNumberWithVersion,
              project.details?.projectName || "Untitled",
              deliveryContent,
              project.status || "N/A",
              updateContent,
            ].map(
              (text) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: text || "",
                          color: textColor,
                          font: "Calibri",
                        }),
                      ],
                      alignment: AlignmentType.LEFT,
                    }),
                  ],
                  width: { size: 16, type: WidthType.PERCENTAGE },
                  shading: { fill: rowColor },
                  margins: { top: 100, bottom: 100, left: 100, right: 100 },
                }),
            ),
          }),
        );
      });

      // Custom Header Table (Invisible Borders)
      const headerTable = new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: userName,
                        bold: true,
                        font: "Calibri",
                      }),
                    ],
                    alignment: AlignmentType.LEFT,
                  }),
                ],
                width: { size: 30, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.NONE },
                  bottom: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.NONE },
                  insideVertical: { style: BorderStyle.NONE },
                },
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: "SCRUM UPDATE",
                        bold: true,
                        size: 28,
                        font: "Calibri",
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                  }),
                ],
                width: { size: 40, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.NONE },
                  bottom: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.NONE },
                  insideVertical: { style: BorderStyle.NONE },
                },
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: dateStr,
                        bold: true,
                        font: "Calibri",
                      }),
                    ],
                    alignment: AlignmentType.RIGHT,
                  }),
                ],
                width: { size: 30, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.NONE },
                  bottom: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.NONE },
                  insideVertical: { style: BorderStyle.NONE },
                },
              }),
            ],
          }),
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
          insideVertical: { style: BorderStyle.NONE },
        },
      });

      const doc = new Document({
        styles: {
          default: {
            document: {
              run: {
                font: "Calibri",
              },
            },
          },
        },
        sections: [
          {
            properties: {
              page: {
                size: {
                  orientation: PageOrientation.LANDSCAPE,
                },
              },
            },
            headers: {
              default: new Header({
                children: [headerTable],
              }),
            },
            footers: {
              default: new Footer({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: "OFFICIAL DOCUMENT OF MAGICHANDS CO. LTD.",
                        bold: true,
                        size: 20, // 10pt
                        color: "64748B",
                        font: "Calibri",
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                  }),
                ],
              }),
            },
            children: [
              // No Title Paragraph here anymore
              new Table({
                rows: tableRows,
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
                  bottom: {
                    style: BorderStyle.SINGLE,
                    size: 1,
                    color: "E2E8F0",
                  },
                  left: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
                  right: {
                    style: BorderStyle.SINGLE,
                    size: 1,
                    color: "E2E8F0",
                  },
                  insideHorizontal: {
                    style: BorderStyle.SINGLE,
                    size: 1,
                    color: "E2E8F0",
                  },
                  insideVertical: {
                    style: BorderStyle.SINGLE,
                    size: 1,
                    color: "E2E8F0",
                  },
                },
              }),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `SCRUM UPDATE - ${userName} - ${dateStr}.docx`);
    } catch (error) {
      console.error("Error generating document:", error);
      alert("Failed to generate document.");
    }
  };

  // Derived Pagination Data
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const paginatedProjects = projects.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(projects.length / itemsPerPage);

  if (loading) {
    return (
      <div className="spinner-container">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="end-of-day-container">
      <div
        className="page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1>End of Day Update</h1>
          <p>Latest updates on all active projects</p>
        </div>
        <button
          className="download-btn"
          onClick={handleDownload}
          disabled={projects.length === 0}
        >
          Download Report
        </button>
      </div>

      <div className="table-container">
        <table className="update-table">
          <thead>
            <tr>
              <th>Lead Name</th>
              <th>Order Number</th>
              <th>Order Name</th>
              <th>Delivery Date & Time</th>
              <th>Status</th>
              <th>Latest Update</th>
            </tr>
          </thead>
          <tbody>
            {projects.length > 0 ? (
              paginatedProjects.map((project) => {
                const getRowClass = (type) => {
                  switch (type) {
                    case "Emergency":
                      return "row-emergency";
                    case "Corporate Job":
                      return "row-corporate";
                    case "Quote":
                      return "row-quote";
                    default:
                      return "row-standard";
                  }
                };
                const isUrgent =
                  project.details?.deliveryDate &&
                  differenceInHours(
                    new Date(project.details.deliveryDate),
                    new Date(),
                  ) <= 72;
                const isEmergency = isEmergencyProject(project);
                const projectVersion = getProjectVersion(project);
                const updateSourceName = getUpdateSourceName(project);

                return (
                  <tr
                    key={project._id}
                    className={`${getRowClass(project.projectType)} ${isUrgent ? "is-urgent" : ""} ${isEmergency ? "is-emergency" : ""}`}
                  >
                    <td>
                      {getLeadDisplay(project, "Unassigned")}
                    </td>
                    <td>
                      <div className="order-number-cell">
                        <span>{project.orderId || "N/A"}</span>
                        {projectVersion > 1 && (
                          <span className="order-version-sub">
                            Version v{projectVersion}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{project.details?.projectName || "Untitled"}</td>
                    <td>
                      <div className="delivery-cell">
                        <span>{formatDate(project.details?.deliveryDate)}</span>
                        <span className="time-sub">
                          {formatTime(project.details?.deliveryTime)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="status-cell">
                        <span
                          className={`status-badge ${project.status
                            ?.toLowerCase()
                            .replace(/\s+/g, "-")}`}
                        >
                          {project.status}
                        </span>
                        {isEmergency && (
                          <span className="emergency-marker">Emergency</span>
                        )}
                      </div>
                    </td>
                    <td className="update-cell">
                      {project.endOfDayUpdate ? (
                        <div className="update-content">
                          <p>{stripDepartmentNudge(project.endOfDayUpdate)}</p>
                          {updateSourceName && (
                            <span className="update-source">{updateSourceName}</span>
                          )}
                          <span
                            className="update-date"
                            style={{
                              fontSize: "0.75rem",
                              color: "#64748b",
                              display: "block",
                              marginTop: "4px",
                            }}
                          >
                            Last updated:{" "}
                            {formatDateTime(project.endOfDayUpdateDate)}
                          </span>
                        </div>
                      ) : (
                        <span className="no-update">No updates yet</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="6" className="empty-state">
                  No active projects found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="eod-pagination">
            <span className="eod-pagination-summary">
              Showing {indexOfFirstItem + 1}-{indexOfFirstItem + paginatedProjects.length} of{" "}
              {projects.length} projects
            </span>
            <div className="eod-pagination-controls">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="eod-pagination-btn"
              >
                Previous
              </button>
              <span className="eod-page-info">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="eod-pagination-btn"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EndOfDayUpdate;

