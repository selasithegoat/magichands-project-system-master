import React from "react";

const getInitials = (name) => {
  if (!name) return "?";
  const cleaned = String(name).replace(/\s*\(.*?\)\s*/g, " ").trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  const first = parts[0][0] || "";
  const last = parts[parts.length - 1][0] || "";
  return `${first}${last}`.toUpperCase() || "?";
};

const UserAvatar = ({
  name = "",
  width = "24px",
  height = "24px",
  backgroundColor = "#0F172A",
  textColor = "#FFFFFF",
}) => {
  const widthNum = parseInt(width, 10) || 24;
  const heightNum = parseInt(height, 10) || 24;
  const size = Math.min(widthNum, heightNum);
  const fontSize = Math.max(10, Math.round(size * 0.45));
  const initials = getInitials(name);

  return (
    <div
      style={{
        width,
        height,
        borderRadius: "50%",
        backgroundColor,
        marginRight: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: textColor,
        fontWeight: 700,
        fontSize,
        textTransform: "uppercase",
        lineHeight: 1,
        flexShrink: 0,
      }}
      aria-label={name || "User"}
      title={name || "User"}
    >
      {initials}
    </div>
  );
};

export default UserAvatar;
