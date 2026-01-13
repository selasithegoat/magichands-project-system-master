import React from "react";

const TruckIcon = ({
  width = "16",
  height = "16",
  className = "",
  color = "currentColor",
}) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M1 3H15V13H1V3ZM15 8H19L23 13V16H15V8ZM5 16C5 17.1046 4.10457 18 3 18C1.89543 18 1 17.1046 1 16M19 16C19 17.1046 18.1046 18 17 18C15.8954 18 15 17.1046 15 16"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="5.5" cy="18.5" r="2.5" stroke={color} strokeWidth="2" />
    <circle cx="18.5" cy="18.5" r="2.5" stroke={color} strokeWidth="2" />
  </svg>
);

export default TruckIcon;
