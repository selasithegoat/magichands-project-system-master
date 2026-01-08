import React from "react";

const ProgressDonutIcon = ({
  width = "120",
  height = "120",
  percentage = 75,
  color = "#2563eb",
  className = "",
}) => {
  const radius = 50;
  const circumference = 2 * Math.PI * radius; // ~314
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 120 120"
      className={className}
    >
      <circle
        cx="60"
        cy="60"
        r="50"
        fill="none"
        stroke="#e2e8f0"
        strokeWidth="10"
      />
      <circle
        cx="60"
        cy="60"
        r="50"
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 60 60)"
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
      <text
        x="60"
        y="55"
        textAnchor="middle"
        fontSize="20"
        fontWeight="700"
        fill="#1e293b"
      >
        {percentage}%
      </text>
      <text
        x="60"
        y="75"
        textAnchor="middle"
        fontSize="10"
        fontWeight="600"
        fill="#64748b"
      >
        COMPLETE
      </text>
    </svg>
  );
};

export default ProgressDonutIcon;
