import React from "react";

const MailIcon = ({ width = "18", height = "18", color = "currentColor" }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M4 5.5H20C20.8284 5.5 21.5 6.17157 21.5 7V17C21.5 17.8284 20.8284 18.5 20 18.5H4C3.17157 18.5 2.5 17.8284 2.5 17V7C2.5 6.17157 3.17157 5.5 4 5.5Z"
      stroke={color}
      strokeWidth="1.5"
    />
    <path
      d="M3.5 7L12 12.5L20.5 7"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default MailIcon;
