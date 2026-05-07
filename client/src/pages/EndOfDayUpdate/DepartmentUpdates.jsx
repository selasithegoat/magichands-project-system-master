import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Spinner from "../../components/ui/Spinner";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import EndOfDayRouteTabs from "./EndOfDayRouteTabs";
import "./EndOfDayUpdate.css";
import "./DepartmentUpdates.css";

const createClientId = (prefix = "dept-update") =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const toText = (value) => String(value || "").trim();
const toEditableText = (value) =>
  value === null || value === undefined ? "" : String(value);
const cloneBoard = (value) =>
  value ? JSON.parse(JSON.stringify(value)) : value;

const getUserDisplayName = (user) => {
  const firstName = toText(user?.firstName);
  const lastName = toText(user?.lastName);
  const fullName = `${firstName} ${lastName}`.trim().replace(/\s+/g, " ");
  return fullName || toText(user?.employeeId) || "Unknown";
};

const getCellValue = (row, column) => {
  if (column.id === "dept") return toEditableText(row?.dept);
  if (column.id === "lead") return toEditableText(row?.leadName);
  return toEditableText(row?.values?.[column.id]);
};

const formatDateDisplay = (value) => {
  const normalized = toText(value);
  if (!normalized) return "";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const buildComparableBoard = (board) => ({
  columns: Array.isArray(board?.columns)
    ? board.columns.map((column) => ({
        id: toText(column?.id),
        label: toText(column?.label),
        kind: toText(column?.kind) || "text",
        isCore: Boolean(column?.isCore),
      }))
    : [],
  sections: Array.isArray(board?.sections)
    ? board.sections.map((section) => ({
        id: toText(section?.id),
        title: toText(section?.title),
        rows: Array.isArray(section?.rows)
          ? section.rows.map((row) => ({
              id: toText(row?.id),
              dept: toText(row?.dept),
              leadName: toText(row?.leadName),
              leadUserId: toText(row?.leadUserId),
              values:
                row?.values && typeof row.values === "object" && !Array.isArray(row.values)
                  ? Object.keys(row.values)
                      .sort()
                      .reduce((acc, key) => {
                        acc[key] = toText(row.values[key]);
                        return acc;
                      }, {})
                  : {},
            }))
          : [],
      }))
    : [],
});

const DepartmentUpdates = ({ user }) => {
  const navigate = useNavigate();
  const [board, setBoard] = useState(null);
  const [draftBoard, setDraftBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  const [employees, setEmployees] = useState([]);

  const isFrontDesk = Array.isArray(user?.department)
    ? user.department.includes("Front Desk")
    : user?.department === "Front Desk";

  const fetchBoard = useCallback(async () => {
    try {
      setError("");
      const response = await fetch("/api/projects/department-updates", {
        credentials: "include",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to load Department Updates.");
      }
      setBoard(payload);
      setDraftBoard((currentDraft) =>
        isEditing ? currentDraft : cloneBoard(payload),
      );
    } catch (fetchError) {
      console.error("Failed to load Department Updates board:", fetchError);
      setError(fetchError.message || "Failed to load Department Updates.");
    } finally {
      setLoading(false);
    }
  }, [isEditing]);

  const fetchEmployees = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/users", {
        credentials: "include",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to load employee directory.");
      }
      setEmployees(Array.isArray(payload) ? payload : []);
    } catch (fetchError) {
      console.error("Failed to load employee directory:", fetchError);
    }
  }, []);

  useEffect(() => {
    if (user && !isFrontDesk) {
      navigate("/client", { replace: true });
      return;
    }

    if (!isFrontDesk) {
      return;
    }

    void fetchBoard();
    void fetchEmployees();
  }, [fetchBoard, fetchEmployees, isFrontDesk, navigate, user]);

  useRealtimeRefresh(
    () => {
      if (!isEditing) {
        void fetchBoard();
      }
    },
    {
      enabled: Boolean(isFrontDesk),
      paths: ["/api/projects/department-updates"],
    },
  );

  const comparableBoard = useMemo(() => buildComparableBoard(board), [board]);
  const comparableDraftBoard = useMemo(
    () => buildComparableBoard(draftBoard),
    [draftBoard],
  );
  const hasUnsavedChanges =
    JSON.stringify(comparableBoard) !== JSON.stringify(comparableDraftBoard);

  const leadOptions = useMemo(
    () =>
      employees
        .map((employee) => ({
          id: toText(employee?._id),
          label: getUserDisplayName(employee),
        }))
        .filter((entry) => entry.id && entry.label),
    [employees],
  );

  const departmentSuggestions = useMemo(() => {
    const values = new Set();
    (draftBoard?.sections || []).forEach((section) => {
      (section.rows || []).forEach((row) => {
        const dept = toText(row?.dept);
        if (dept) values.add(dept);
      });
    });
    return Array.from(values).sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" }),
    );
  }, [draftBoard]);

  const updateDraft = (updater) => {
    setDraftBoard((currentBoard) => {
      if (!currentBoard) return currentBoard;
      return updater(currentBoard);
    });
  };

  const handleToggleEditing = () => {
    if (!board) return;
    setDraftBoard(cloneBoard(board));
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setDraftBoard(cloneBoard(board));
    setIsEditing(false);
    setError("");
  };

  const updateSectionTitle = (sectionId, title) => {
    updateDraft((currentBoard) => ({
      ...currentBoard,
      sections: (currentBoard.sections || []).map((section) =>
        section.id === sectionId ? { ...section, title } : section,
      ),
    }));
  };

  const updateColumnLabel = (columnId, label) => {
    updateDraft((currentBoard) => ({
      ...currentBoard,
      columns: (currentBoard.columns || []).map((column) =>
        column.id === columnId ? { ...column, label } : column,
      ),
    }));
  };

  const updateRowField = (sectionId, rowId, field, value) => {
    updateDraft((currentBoard) => ({
      ...currentBoard,
      sections: (currentBoard.sections || []).map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          rows: (section.rows || []).map((row) =>
            row.id === rowId
              ? {
                  ...row,
                  [field]: value,
                }
              : row,
          ),
        };
      }),
    }));
  };

  const updateRowCellValue = (sectionId, rowId, columnId, value) => {
    updateDraft((currentBoard) => ({
      ...currentBoard,
      sections: (currentBoard.sections || []).map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          rows: (section.rows || []).map((row) =>
            row.id === rowId
              ? {
                  ...row,
                  values: {
                    ...(row.values || {}),
                    [columnId]: value,
                  },
                }
              : row,
          ),
        };
      }),
    }));
  };

  const handleLeadChange = (sectionId, rowId, nextLeadName) => {
    const matchedLead = leadOptions.find(
      (option) => option.label.toLowerCase() === nextLeadName.trim().toLowerCase(),
    );
    updateDraft((currentBoard) => ({
      ...currentBoard,
      sections: (currentBoard.sections || []).map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          rows: (section.rows || []).map((row) =>
            row.id === rowId
              ? {
                  ...row,
                  leadName: nextLeadName,
                  leadUserId: matchedLead?.id || "",
                }
              : row,
          ),
        };
      }),
    }));
  };

  const handleAddColumn = () => {
    updateDraft((currentBoard) => {
      const customColumnCount = (currentBoard.columns || []).filter(
        (column) => !column.isCore,
      ).length;
      const nextColumn = {
        id: createClientId("column"),
        label: `Custom Column ${customColumnCount + 1}`,
        kind: "text",
        isCore: false,
      };

      return {
        ...currentBoard,
        columns: [...(currentBoard.columns || []), nextColumn],
        sections: (currentBoard.sections || []).map((section) => ({
          ...section,
          rows: (section.rows || []).map((row) => ({
            ...row,
            values: {
              ...(row.values || {}),
              [nextColumn.id]: "",
            },
          })),
        })),
      };
    });
  };

  const handleAddRow = (sectionId) => {
    updateDraft((currentBoard) => {
      const nextColumns = Array.isArray(currentBoard.columns)
        ? currentBoard.columns
        : [];

      return {
        ...currentBoard,
        sections: (currentBoard.sections || []).map((section) => {
          if (section.id !== sectionId) return section;
          return {
            ...section,
            rows: [
              ...(section.rows || []),
              {
                id: createClientId("row"),
                dept: "",
                leadName: "",
                leadUserId: "",
                values: nextColumns.reduce((acc, column) => {
                  if (column.id !== "dept" && column.id !== "lead") {
                    acc[column.id] = "";
                  }
                  return acc;
                }, {}),
              },
            ],
          };
        }),
      };
    });
  };

  const handleSave = async () => {
    if (!draftBoard || !hasUnsavedChanges) {
      setIsEditing(false);
      return;
    }

    try {
      setSaving(true);
      setError("");
      const response = await fetch("/api/projects/department-updates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          columns: draftBoard.columns,
          sections: draftBoard.sections,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to save Department Updates.");
      }
      setBoard(payload);
      setDraftBoard(cloneBoard(payload));
      setIsEditing(false);
    } catch (saveError) {
      console.error("Failed to save Department Updates:", saveError);
      setError(saveError.message || "Failed to save Department Updates.");
    } finally {
      setSaving(false);
    }
  };

  const activeBoard = isEditing ? draftBoard : board;
  const columns = Array.isArray(activeBoard?.columns) ? activeBoard.columns : [];
  const sections = Array.isArray(activeBoard?.sections) ? activeBoard.sections : [];
  const boardUpdatedByLabel = board?.lastUpdatedBy
    ? getUserDisplayName(board.lastUpdatedBy)
    : "Not recorded yet";

  if (loading) {
    return (
      <div className="spinner-container">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="end-of-day-container">
      <div className="page-header department-updates-header">
        <div>
          <h1>Department Updates</h1>
          <p>
            Keep the daily departmental engagement board current for the Front Desk
            report and export.
          </p>
        </div>
        <div className="department-updates-actions">
          {!isEditing ? (
            <button
              type="button"
              className="download-btn"
              onClick={handleToggleEditing}
            >
              Edit Board
            </button>
          ) : (
            <>
              <button
                type="button"
                className="department-updates-secondary-btn"
                onClick={handleCancelEditing}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="download-btn"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </>
          )}
        </div>
      </div>

      <EndOfDayRouteTabs />

      <section className="department-updates-summary">
        <div>
          <span className="department-updates-summary-label">Board Status</span>
          <strong>{isEditing ? "Editing in progress" : "Live board"}</strong>
        </div>
        <div>
          <span className="department-updates-summary-label">Last Updated</span>
          <strong>
            {board?.lastUpdatedAt
              ? new Date(board.lastUpdatedAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "Not updated yet"}
          </strong>
        </div>
        <div>
          <span className="department-updates-summary-label">Updated By</span>
          <strong>{boardUpdatedByLabel}</strong>
        </div>
      </section>

      {error && <div className="department-updates-error">{error}</div>}

      <div className="department-updates-board-card">
        {isEditing && (
          <div className="department-updates-toolbar">
            <p>
              Add rows or columns, edit section titles, and update cells before
              saving the board.
            </p>
            <button
              type="button"
              className="department-updates-secondary-btn"
              onClick={handleAddColumn}
            >
              Add Column
            </button>
          </div>
        )}

        <div className="department-updates-table-wrap">
          <table className="department-updates-table">
            <tbody>
              {sections.map((section, sectionIndex) => (
                <React.Fragment key={section.id || `section-${sectionIndex}`}>
                  <tr className="department-updates-section-row">
                    <td colSpan={Math.max(columns.length, 1)}>
                      <div className="department-updates-section-head">
                        {isEditing ? (
                          <input
                            type="text"
                            className="department-updates-section-input"
                            value={section.title || ""}
                            onChange={(event) =>
                              updateSectionTitle(section.id, event.target.value)
                            }
                          />
                        ) : (
                          <span>{section.title}</span>
                        )}
                        {isEditing && (
                          <button
                            type="button"
                            className="department-updates-inline-btn"
                            onClick={() => handleAddRow(section.id)}
                          >
                            Add Row
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {sectionIndex === 0 && (
                    <tr className="department-updates-header-row">
                      {columns.map((column) => (
                        <th key={column.id}>
                          {isEditing ? (
                            <input
                              type="text"
                              className={`department-updates-column-input ${
                                column.isCore ? "core" : ""
                              }`}
                              value={column.label || ""}
                              onChange={(event) =>
                                updateColumnLabel(column.id, event.target.value)
                              }
                            />
                          ) : (
                            column.label
                          )}
                        </th>
                      ))}
                    </tr>
                  )}

                  {(section.rows || []).map((row) => (
                    <tr key={row.id} className="department-updates-data-row">
                      {columns.map((column) => {
                        const cellValue = getCellValue(row, column);
                        const rowMeta = row?.lastUpdatedAt
                          ? `Updated ${new Date(row.lastUpdatedAt).toLocaleString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              },
                            )} by ${getUserDisplayName(row.lastUpdatedBy)}`
                          : "No daily update yet";

                        return (
                          <td key={`${row.id}-${column.id}`}>
                            {isEditing ? (
                              column.id === "dept" ? (
                                <input
                                  type="text"
                                  list="department-updates-departments"
                                  value={row.dept || ""}
                                  onChange={(event) =>
                                    updateRowField(
                                      section.id,
                                      row.id,
                                      "dept",
                                      event.target.value,
                                    )
                                  }
                                />
                              ) : column.id === "lead" ? (
                                <input
                                  type="text"
                                  list="department-updates-leads"
                                  value={row.leadName || ""}
                                  onChange={(event) =>
                                    handleLeadChange(
                                      section.id,
                                      row.id,
                                      event.target.value,
                                    )
                                  }
                                />
                              ) : column.kind === "textarea" ? (
                                <textarea
                                  rows={3}
                                  value={cellValue}
                                  onChange={(event) =>
                                    updateRowCellValue(
                                      section.id,
                                      row.id,
                                      column.id,
                                      event.target.value,
                                    )
                                  }
                                />
                              ) : (
                                <input
                                  type={column.kind === "date" ? "date" : "text"}
                                  value={cellValue}
                                  onChange={(event) =>
                                    updateRowCellValue(
                                      section.id,
                                      row.id,
                                      column.id,
                                      event.target.value,
                                    )
                                  }
                                />
                              )
                            ) : (
                              <div className="department-updates-cell-stack">
                                <span className="department-updates-cell-value">
                                  {column.kind === "date"
                                    ? formatDateDisplay(cellValue) || "-"
                                    : cellValue || "-"}
                                </span>
                                {column.id === "statusUpdate" && (
                                  <span className="department-updates-cell-meta">
                                    {rowMeta}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {isEditing && (
          <>
            <datalist id="department-updates-departments">
              {departmentSuggestions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <datalist id="department-updates-leads">
              {leadOptions.map((option) => (
                <option key={option.id} value={option.label} />
              ))}
            </datalist>
          </>
        )}
      </div>
    </div>
  );
};

export default DepartmentUpdates;
