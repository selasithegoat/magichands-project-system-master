import React from "react";
import "./CheckIcon.css";

const CheckIcon = ({
  className = "",
  width = "12",
  height = "12",
  color = "currentColor",
}) => (
  <svg
    className={className}
    width={width}
    height={height}
    viewBox="0 0 12 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M10 3L4.5 8.5L2 6"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default CheckIcon;
