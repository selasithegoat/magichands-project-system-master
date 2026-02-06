import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // Import useNavigate
import { format, differenceInHours } from "date-fns";
import Spinner from "../../components/ui/Spinner";
import { DownloadIcon } from "../../components/icons/DownloadIcon"; // Assuming exists or I will create an inline SVG
import "./EndOfDayUpdate.css";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";

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
        const activeProjects = data.filter((p) => p.status !== "Completed");
        setProjects(activeProjects);
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

  const formatTime = (timeString) => {
    if (!timeString) return "";
    return timeString;
  };

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
            "Final Update",
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
        const leadName = project.projectLeadId
          ? `${project.projectLeadId.firstName} ${project.projectLeadId.lastName}`
          : project.details?.lead || "Unassigned";

        const deliveryContent = `${formatDate(
          project.details?.deliveryDate,
        )} ${formatTime(project.details?.deliveryTime)}`;

        const updateContent = project.endOfDayUpdate
          ? project.endOfDayUpdate
          : "No final update yet";

        // Urgency Check
        let isUrgent = false;
        if (project.details?.deliveryDate) {
          const deliveryDate = new Date(project.details.deliveryDate);
          const hoursDiff = differenceInHours(deliveryDate, new Date());
          if (hoursDiff <= 72) {
            isUrgent = true;
          }
        }

        const textColor = isUrgent ? "FF0000" : "000000";

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
              project.orderId || "N/A",
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
          <p>Final updates on all active projects</p>
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
              <th>Final Update</th>
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

                return (
                  <tr
                    key={project._id}
                    className={`${getRowClass(project.projectType)} ${isUrgent ? "is-urgent" : ""}`}
                  >
                    <td>
                      {project.projectLeadId
                        ? `${project.projectLeadId.firstName} ${project.projectLeadId.lastName}`
                        : project.details?.lead || "Unassigned"}
                    </td>
                    <td>{project.orderId || "N/A"}</td>
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
                      <span
                        className={`status-badge ${project.status
                          ?.toLowerCase()
                          .replace(/\s+/g, "-")}`}
                      >
                        {project.status}
                      </span>
                    </td>
                    <td className="update-cell">
                      {project.endOfDayUpdate ? (
                        <div className="update-content">
                          <p>{project.endOfDayUpdate}</p>
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
                        <span className="no-update">No final update yet</span>
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
          <div className="pagination-controls">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="pagination-btn"
            >
              Previous
            </button>
            <span className="page-info">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="pagination-btn"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EndOfDayUpdate;
