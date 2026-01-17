import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // Import useNavigate
import {
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
} from "docx";
import { saveAs } from "file-saver";
import { format, differenceInHours } from "date-fns";
import Spinner from "../../components/ui/Spinner";
import { DownloadIcon } from "../../components/icons/DownloadIcon"; // Assuming exists or I will create an inline SVG
import "./EndOfDayUpdate.css";

const EndOfDayUpdate = ({ user }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate(); // Hook

  useEffect(() => {
    // Redirect if user is loaded but not Front Desk
    if (user && !user.department?.includes("Front Desk")) {
      navigate("/");
      return;
    }

    fetchProjects();
  }, [user, navigate]);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        const activeProjects = data.filter(
          (p) =>
            p.status !== "Completed" && p.status !== "Pending Scope Approval"
        );
        setProjects(activeProjects);
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
      const userName = user
        ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
        : "User";
      // Refinement: Month in words (MMMM)
      const dateStr = format(new Date(), "EEEE. dd MMMM yy");
      const titleText = `SCRUM UPDATE - ${userName} - ${dateStr}`;

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
                        color: "FFFFFF",
                      }), // White text
                    ],
                    alignment: AlignmentType.CENTER,
                  }),
                ],
                width: { size: 16, type: WidthType.PERCENTAGE },
                shading: { fill: "4F46E5" }, // Indigo Header Background
                margins: { top: 100, bottom: 100, left: 100, right: 100 }, // Padding
              })
          ),
        }),
      ];

      projects.forEach((project) => {
        const leadName = project.projectLeadId
          ? `${project.projectLeadId.firstName} ${project.projectLeadId.lastName}`
          : project.details?.lead || "Unassigned";

        const deliveryContent = `${formatDate(
          project.details?.deliveryDate
        )} ${formatTime(project.details?.deliveryTime)}`;

        const updateContent = project.endOfDayUpdate
          ? project.endOfDayUpdate
          : "No final update yet";

        // Urgency Check: Red text if delivery date is within 24 hours (or past)
        let isUrgent = false;
        if (project.details?.deliveryDate) {
          const deliveryDate = new Date(project.details.deliveryDate);
          const hoursDiff = differenceInHours(deliveryDate, new Date());
          if (hoursDiff <= 24) {
            isUrgent = true;
          }
        }

        const textColor = isUrgent ? "FF0000" : "000000";

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
                        new TextRun({ text: text || "", color: textColor }),
                      ],
                      alignment: AlignmentType.LEFT,
                    }),
                  ],
                  width: { size: 16, type: WidthType.PERCENTAGE },
                  margins: { top: 100, bottom: 100, left: 100, right: 100 }, // Padding
                })
            ),
          })
        );
      });

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                size: {
                  orientation: PageOrientation.LANDSCAPE,
                },
              },
            },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: titleText, bold: true, size: 32 }),
                ],
                spacing: { after: 400 },
              }),
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
      saveAs(blob, `${titleText}.docx`);
    } catch (error) {
      console.error("Error generating document:", error);
      alert("Failed to generate document.");
    }
  };

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
              projects.map((project) => (
                <tr key={project._id}>
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
              ))
            ) : (
              <tr>
                <td colSpan="6" className="empty-state">
                  No active projects found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EndOfDayUpdate;
