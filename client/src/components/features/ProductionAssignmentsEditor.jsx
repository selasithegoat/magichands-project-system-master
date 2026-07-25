import React from "react";
import {
  DEPARTMENTS,
  PRODUCTION_SUB_DEPARTMENTS,
  normalizeDepartmentId,
} from "../../constants/departments";
import "./ProductionAssignmentsEditor.css";

const productionDepartments = DEPARTMENTS.filter((department) =>
  PRODUCTION_SUB_DEPARTMENTS.includes(department.id),
);

const normalizeProductionAssignments = (assignments = []) => {
  const seen = new Set();
  return (Array.isArray(assignments) ? assignments : [])
    .map((assignment) => {
      const department = normalizeDepartmentId(
        assignment?.department || assignment?.departmentId || assignment,
      );
      return {
        department,
        scope: String(assignment?.scope || "").trimStart(),
      };
    })
    .filter((assignment) => {
      if (
        !PRODUCTION_SUB_DEPARTMENTS.includes(assignment.department) ||
        seen.has(assignment.department)
      ) {
        return false;
      }
      seen.add(assignment.department);
      return true;
    });
};

const ProductionAssignmentsEditor = ({
  assignments = [],
  onChange,
  compact = false,
}) => {
  const normalized = normalizeProductionAssignments(assignments);
  const selected = new Set(normalized.map((item) => item.department));

  const toggleDepartment = (department) => {
    if (selected.has(department)) {
      onChange(normalized.filter((item) => item.department !== department));
      return;
    }
    onChange([...normalized, { department, scope: "" }]);
  };

  const updateScope = (department, scope) => {
    onChange(
      normalized.map((item) =>
        item.department === department ? { ...item, scope } : item,
      ),
    );
  };

  return (
    <div className={`production-assignment-editor ${compact ? "compact" : ""}`}>
      <div className="production-assignment-heading">
        <strong>Production required</strong>
        <span>Select every team working on this item.</span>
      </div>
      <div className="production-assignment-options">
        {productionDepartments.map((department) => (
          <button
            key={department.id}
            type="button"
            className={selected.has(department.id) ? "selected" : ""}
            onClick={() => toggleDepartment(department.id)}
            aria-pressed={selected.has(department.id)}
          >
            {department.label}
          </button>
        ))}
      </div>
      {normalized.length > 0 && (
        <div className="production-assignment-scopes">
          {normalized.map((assignment) => {
            const label =
              productionDepartments.find(
                (department) => department.id === assignment.department,
              )?.label || assignment.department;
            return (
              <label key={assignment.department}>
                <span>{label} scope</span>
                <input
                  type="text"
                  value={assignment.scope}
                  onChange={(event) =>
                    updateScope(assignment.department, event.target.value)
                  }
                  placeholder="Optional: what this team will do"
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProductionAssignmentsEditor;
