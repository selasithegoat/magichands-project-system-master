import React from "react";

const PhoneIcon = ({ width = "18", height = "18", color = "currentColor" }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M7.1 4.5C6.7 4.5 6.3 4.74 6.15 5.1L5.05 7.8C4.88 8.21 4.96 8.69 5.27 9.02L7.36 11.23C6.88 12.3 7.81 13.83 9.4 15.42C10.99 17.01 12.52 17.94 13.59 17.46L15.8 19.55C16.13 19.86 16.61 19.94 17.02 19.77L19.7 18.67C20.06 18.52 20.3 18.12 20.3 17.72V15.9C20.3 15.46 20.01 15.08 19.6 14.96L16.1 13.95C15.73 13.85 15.34 13.98 15.1 14.28L14.2 15.4C13.21 15.16 12.03 14.38 10.9 13.25C9.76 12.11 8.98 10.93 8.74 9.94L9.86 9.04C10.16 8.8 10.29 8.41 10.19 8.04L9.18 4.54C9.06 4.13 8.68 3.84 8.24 3.84H6.42C6.21 3.84 6.01 3.92 5.86 4.06"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default PhoneIcon;
