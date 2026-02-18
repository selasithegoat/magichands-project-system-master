import React from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { STORES_SUB_DEPARTMENTS } from "../../constants/departments";
import ClientItemsInventory from "./ClientItemsInventory";
import PurchasingOrdersInventory from "./PurchasingOrdersInventory";
import "./Inventory.css";

const normalizeDepartments = (departmentValue) => {
  if (Array.isArray(departmentValue)) return departmentValue;
  if (departmentValue) return [departmentValue];
  return [];
};

const Inventory = ({ user }) => {
  const departments = normalizeDepartments(user?.department).map((dept) =>
    String(dept).trim().toLowerCase(),
  );

  const hasStoresAccess =
    user?.role === "admin" ||
    departments.includes("stores") ||
    departments.some((dept) => STORES_SUB_DEPARTMENTS.includes(dept));

  if (!hasStoresAccess) {
    return <Navigate to="/client" replace />;
  }

  return (
    <div className="inventory-page">
      <div className="inventory-page-header">
        <h1>Inventory</h1>
        <p>Manage client items and purchasing orders from one workspace.</p>
      </div>

      <nav className="inventory-subnav">
        <NavLink
          to="/inventory/client-items"
          className={({ isActive }) =>
            `inventory-subnav-link ${isActive ? "active" : ""}`
          }
        >
          Client Items
        </NavLink>
        <NavLink
          to="/inventory/purchasing-orders"
          className={({ isActive }) =>
            `inventory-subnav-link ${isActive ? "active" : ""}`
          }
        >
          Purchasing Order
        </NavLink>
      </nav>

      <Routes>
        <Route index element={<Navigate to="/inventory/client-items" replace />} />
        <Route path="client-items" element={<ClientItemsInventory />} />
        <Route
          path="purchasing-orders"
          element={<PurchasingOrdersInventory />}
        />
        <Route path="*" element={<Navigate to="/inventory/client-items" replace />} />
      </Routes>
    </div>
  );
};

export default Inventory;
