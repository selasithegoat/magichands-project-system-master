import React from "react";
import { Link, useLocation } from "react-router-dom";

const END_OF_DAY_ROUTES = [
  { path: "/end-of-day", label: "Project Updates" },
  { path: "/end-of-day/department-updates", label: "Department Updates" },
];

const EndOfDayRouteTabs = () => {
  const location = useLocation();

  return (
    <div className="eod-route-tabs" role="tablist" aria-label="End of day views">
      {END_OF_DAY_ROUTES.map((route) => {
        const isActive = location.pathname === route.path;
        return (
          <Link
            key={route.path}
            to={route.path}
            className={`eod-route-tab ${isActive ? "active" : ""}`}
            role="tab"
            aria-selected={isActive}
          >
            {route.label}
          </Link>
        );
      })}
    </div>
  );
};

export default EndOfDayRouteTabs;
