import React from "react";

const ReminderBellIcon = ({
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
      d="M18 8C18 4.68629 15.3137 2 12 2C8.68629 2 6 4.68629 6 8C6 15 3 15 3 17H21C21 15 18 15 18 8Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M13.73 21C13.5542 21.3031 13.3018 21.5544 12.9981 21.7291C12.6944 21.9038 12.3502 21.9957 12 21.9957C11.6498 21.9957 11.3056 21.9038 11.0019 21.7291C10.6982 21.5544 10.4458 21.3031 10.27 21"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default ReminderBellIcon;
