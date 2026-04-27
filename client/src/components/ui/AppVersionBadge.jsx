import React from "react";
import useSystemVersionInfo from "../../hooks/useSystemVersionInfo";
import { formatVersionDisplay } from "../../utils/systemVersionInfo";
import "./AppVersionBadge.css";

const formatTimestamp = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString();
};

const AppVersionBadge = () => {
  const versionInfo = useSystemVersionInfo();
  const version = String(versionInfo?.version || "").trim();
  if (!version) return null;

  const builtAt = formatTimestamp(versionInfo?.builtAt);
  const startedAt = formatTimestamp(versionInfo?.startedAt);
  const title = [
    `${versionInfo?.name || "App"} v${version}`,
    versionInfo?.nickname ? `Nickname: ${versionInfo.nickname}` : "",
    versionInfo?.commit ? `Commit: ${versionInfo.commit}` : "",
    versionInfo?.branch ? `Branch: ${versionInfo.branch}` : "",
    builtAt ? `Built: ${builtAt}` : "",
    !builtAt && startedAt ? `Server started: ${startedAt}` : "",
    versionInfo?.environment ? `Environment: ${versionInfo.environment}` : "",
    versionInfo?.dirty ? "Working tree has uncommitted changes" : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div
      className="app-version-badge"
      title={title}
      aria-label={`Application version ${formatVersionDisplay(versionInfo)}`}
    >
      {formatVersionDisplay(versionInfo)}
    </div>
  );
};

export default AppVersionBadge;
