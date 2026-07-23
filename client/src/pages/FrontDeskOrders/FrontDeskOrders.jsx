import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import OrdersList from "../NewOrders/OrdersList";
import SavedCreationDrafts from "./SavedCreationDrafts";
import {
  CLOSED_ORDER_STATUSES,
  hasPendingClientMockupApproval,
  hasOrderBillingBlock,
  matchesOrdersManagementKpi,
  resolveOrderManagementStatus,
} from "../../utils/ordersManagementKpis";
import usePersistedState from "../../hooks/usePersistedState";
import { canManageProjectCreationDrafts } from "../../utils/projectDraftApi";
import { appendPortalSource, resolvePortalSource } from "../../utils/portalSource";
import "./FrontDeskOrders.css";

const FRONT_DESK_KPI_KEYS = [
  "all",
  "billing",
  "actions",
  "delivery",
  "quotes",
  "mockup",
  "mockupApproval",
  "sample",
];

const FrontDeskOrders = ({ user = null }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const canManageCreationDrafts = canManageProjectCreationDrafts(user);
  const portalSource = useMemo(() => resolvePortalSource(), []);
  const { data: orders = [], isPending: loading } = useQuery({
    queryKey: ["projects", "report", portalSource],
    queryFn: async () => {
      const response = await fetch(
        appendPortalSource("/api/projects?mode=report", portalSource),
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Failed to load orders summary.");
      const payload = await response.json();
      return Array.isArray(payload) ? payload : [];
    },
    meta: {
      realtimePaths: ["/api/projects"],
    },
  });
  const [activeKpi, setActiveKpi] = usePersistedState(
    "portal-frontdesk-orders-kpi",
    "all",
    {
      sanitize: (value) =>
        FRONT_DESK_KPI_KEYS.includes(value) ? value : "all",
    },
  );

  const billingBlocks = useMemo(
    () =>
      orders.filter((project) => {
        const status = resolveOrderManagementStatus(project);
        return !CLOSED_ORDER_STATUSES.has(status) && hasOrderBillingBlock(project);
      }).length,
    [orders],
  );
  const actionNeeded = useMemo(
    () =>
      orders.filter(
        (project) => {
          return matchesOrdersManagementKpi(project, "actions");
        },
      ).length,
    [orders],
  );
  const deliveryRisk = useMemo(
    () =>
      orders.filter(
        (project) => {
          return matchesOrdersManagementKpi(project, "delivery");
        },
      ).length,
    [orders],
  );
  const quoteResponses = useMemo(
    () =>
      orders.filter(
        (project) => {
          return matchesOrdersManagementKpi(project, "quotes");
        },
      ).length,
    [orders],
  );
  const mockupPending = useMemo(
    () =>
      orders.filter(
        (project) => {
          return matchesOrdersManagementKpi(project, "mockup");
        },
      ).length,
    [orders],
  );
  const samplePending = useMemo(
    () =>
      orders.filter((project) => {
        return matchesOrdersManagementKpi(project, "sample");
      }).length,
    [orders],
  );
  const clientMockupApproval = useMemo(
    () =>
      orders.filter((project) => hasPendingClientMockupApproval(project)).length,
    [orders],
  );

  const kpiCards = [
    {
      key: "billing",
      label: "Billing Blocks",
      value: billingBlocks,
      description: "Invoice/payment missing for next step",
      tone: "danger",
    },
    {
      key: "actions",
      label: "Next-Step Actions",
      value: actionNeeded,
      description: "Orders waiting on Front Desk action",
      tone: "warning",
    },
    {
      key: "delivery",
      label: "Delivery Risk",
      value: deliveryRisk,
      description: "Due within 72 hours or overdue",
      tone: "critical",
    },
    {
      key: "quotes",
      label: "Quote Responses",
      value: quoteResponses,
      description: "Pending quote cost/submission/decision",
      tone: "info",
    },
    {
      key: "mockup",
      label: "Mockup Pending",
      value: mockupPending,
      description: "Awaiting mockup uploads",
      tone: "neutral",
    },
    {
      key: "mockupApproval",
      label: "Client Mockup Approval",
      value: clientMockupApproval,
      description: "Uploaded mockups waiting for Front Desk/Admin approval",
      tone: "info",
    },
    {
      key: "sample",
      label: "Sample Approval",
      value: samplePending,
      description: "Sample required but not approved",
      tone: "success",
    },
  ];
  const activeKpiLabel =
    kpiCards.find((card) => card.key === activeKpi)?.label || "All Orders";
  const workspaceView =
    canManageCreationDrafts &&
    new URLSearchParams(location.search).get("tab") === "drafts"
      ? "drafts"
      : "orders";

  const setWorkspaceView = (nextView) => {
    const params = new URLSearchParams(location.search);
    if (nextView === "drafts") {
      params.set("tab", "drafts");
    } else {
      params.delete("tab");
    }
    const query = params.toString();
    navigate(`${location.pathname}${query ? `?${query}` : ""}`);
  };

  return (
    <div className="frontdesk-orders-page">
      <div className="frontdesk-orders-hero">
        <div>
          <div className="frontdesk-orders-eyebrow">Front Desk</div>
          <h1 className="frontdesk-orders-title">Orders Management</h1>
          <p className="frontdesk-orders-subtitle">
            All orders and history in one organized workspace.
          </p>
        </div>
        <div className="frontdesk-orders-chip">
          {workspaceView === "drafts"
            ? "Saved Drafts"
            : activeKpi === "all"
              ? "All Orders & History"
              : `Filtered: ${activeKpiLabel}`}
        </div>
      </div>

      {canManageCreationDrafts && (
        <div className="frontdesk-workspace-tabs" aria-label="Orders workspace">
          <button
            type="button"
            className={workspaceView === "orders" ? "active" : ""}
            onClick={() => setWorkspaceView("orders")}
            aria-pressed={workspaceView === "orders"}
          >
            Orders
          </button>
          <button
            type="button"
            className={workspaceView === "drafts" ? "active" : ""}
            onClick={() => setWorkspaceView("drafts")}
            aria-pressed={workspaceView === "drafts"}
          >
            Saved Drafts
          </button>
        </div>
      )}

      {workspaceView === "orders" && (
        <div className="frontdesk-kpi-grid">
          {kpiCards.map((card) => (
            <button
              type="button"
              key={card.key}
              className={`frontdesk-kpi-card ${card.tone} ${activeKpi === card.key ? "active" : ""}`}
              onClick={() =>
                setActiveKpi((current) => (current === card.key ? "all" : card.key))
              }
              aria-pressed={activeKpi === card.key}
            >
              <div className="frontdesk-kpi-header">
                <span>{card.label}</span>
                <strong>{loading ? "..." : card.value}</strong>
              </div>
              <p>{card.description}</p>
            </button>
          ))}
        </div>
      )}

      <div className="frontdesk-orders-content">
        {workspaceView === "drafts" ? (
          <SavedCreationDrafts />
        ) : (
          <OrdersList kpiFilter={activeKpi} />
        )}
      </div>
    </div>
  );
};

export default FrontDeskOrders;
