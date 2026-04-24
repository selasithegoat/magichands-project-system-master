import { getProjectStatusSla } from "../../utils/statusSla";
import "./StatusSlaBadge.css";

const formatStartedAt = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const StatusSlaBadge = ({ project, compact = false, className = "" }) => {
  const sla = getProjectStatusSla(project);
  if (!sla?.label) return null;

  const severity = sla.severity || "normal";
  const title = [
    sla.label,
    sla.since ? `Started ${formatStartedAt(sla.since)}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <span
      className={[
        "status-sla-badge",
        `status-sla-${severity}`,
        compact ? "status-sla-compact" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      title={title}
    >
      {sla.label}
    </span>
  );
};

export default StatusSlaBadge;
