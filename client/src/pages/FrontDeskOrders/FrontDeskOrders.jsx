import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import OrdersList from "../NewOrders/OrdersList";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import {
  getQuoteRequirementMode,
  getQuoteStatusDisplay,
} from "../../utils/quoteStatus";
import "./FrontDeskOrders.css";

const CLOSED_STATUSES = new Set([
  "Completed",
  "Finished",
  "Delivered",
  "Feedback Completed",
]);

const ACTION_STATUSES = new Set([
  "Order Created",
  "Pending Acceptance",
  "Pending Scope Approval",
  "Pending Departmental Meeting",
  "Pending Departmental Engagement",
  "Quote Created",
  "Pending Mockup",
  "Pending Cost Verification",
  "Pending Sample Retrieval",
  "Pending Sample / Work done Retrieval",
  "Pending Quote Submission",
  "Pending Sample / Work done Sent",
  "Quote Submission Completed",
  "Pending Client Decision",
  "Pending Feedback",
]);

const getSampleApprovalStatus = (sampleApproval = {}) => {
  const explicit = String(sampleApproval?.status || "")
    .trim()
    .toLowerCase();
  if (explicit === "approved") return "approved";
  if (explicit === "rejected") return "rejected";
  if (sampleApproval?.approvedAt || sampleApproval?.approvedBy) return "approved";
  return "pending";
};

const formatDate = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

const getOrderLabel = (project) => {
  const raw =
    project?.orderId || project?.orderRef?.orderNumber || project?._id || "";
  if (!raw) return "Order";
  return raw.startsWith("#") ? raw : `#${raw}`;
};

const isQuoteProject = (project) => project?.projectType === "Quote";
const resolveProjectStatus = (project) =>
  isQuoteProject(project)
    ? getQuoteStatusDisplay(
        project?.status || "",
        getQuoteRequirementMode(project?.quoteDetails?.checklist || {}),
      )
    : project?.status || "";

const hasBillingBlock = (project) => {
  if (!project || isQuoteProject(project)) return false;
  const status = project.status || "";
  const invoiceSent = Boolean(project.invoice?.sent);
  const paymentTypes = new Set(
    (project.paymentVerifications || []).map((entry) => entry?.type),
  );
  const hasAnyPayment = paymentTypes.size > 0;
  const hasFullOrAuthorized =
    paymentTypes.has("full_payment") || paymentTypes.has("authorized");

  if (["Pending Master Approval", "Pending Production"].includes(status)) {
    return !invoiceSent || !hasAnyPayment;
  }

  if (["Pending Packaging", "Pending Delivery/Pickup"].includes(status)) {
    return !hasFullOrAuthorized;
  }

  return false;
};

const getDeliveryRisk = (project) => {
  if (!project?.details?.deliveryDate) return { risk: false, overdue: false };
  const deliveryDate = new Date(project.details.deliveryDate);
  if (Number.isNaN(deliveryDate.getTime())) return { risk: false, overdue: false };
  const now = new Date();
  const diffMs = deliveryDate.getTime() - now.getTime();
  const risk = diffMs <= 72 * 60 * 60 * 1000;
  return { risk, overdue: diffMs < 0 };
};

const FrontDeskOrders = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects?mode=report");
      if (res.ok) {
        const data = await res.json();
        setOrders(Array.isArray(data) ? data : []);
      } else {
        setOrders([]);
      }
    } catch (error) {
      console.error("Failed to load orders summary", error);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useRealtimeRefresh(() => fetchOrders());

  const billingBlocks = useMemo(
    () =>
      orders.filter((project) => {
        const status = resolveProjectStatus(project);
        return !CLOSED_STATUSES.has(status) && hasBillingBlock(project);
      }).length,
    [orders],
  );
  const actionNeeded = useMemo(
    () =>
      orders.filter(
        (project) => {
          const status = resolveProjectStatus(project);
          return !CLOSED_STATUSES.has(status) && ACTION_STATUSES.has(status);
        },
      ).length,
    [orders],
  );
  const deliveryRisk = useMemo(
    () =>
      orders.filter(
        (project) => {
          const status = resolveProjectStatus(project);
          return !CLOSED_STATUSES.has(status) && getDeliveryRisk(project).risk;
        },
      ).length,
    [orders],
  );
  const quoteResponses = useMemo(
    () =>
      orders.filter(
        (project) => {
          if (!isQuoteProject(project)) return false;
          const status = resolveProjectStatus(project);
          return [
            "Pending Cost Verification",
            "Pending Mockup",
            "Pending Sample Retrieval",
            "Pending Sample / Work done Retrieval",
            "Pending Quote Submission",
            "Pending Sample / Work done Sent",
            "Quote Submission Completed",
            "Pending Client Decision",
          ].includes(status);
        },
      ).length,
    [orders],
  );
  const mockupPending = useMemo(
    () =>
      orders.filter(
        (project) => {
          const status = resolveProjectStatus(project);
          return !CLOSED_STATUSES.has(status) && status === "Pending Mockup";
        },
      ).length,
    [orders],
  );
  const samplePending = useMemo(
    () =>
      orders.filter((project) => {
        const status = resolveProjectStatus(project);
        if (CLOSED_STATUSES.has(status)) return false;
        const required = Boolean(project?.sampleRequirement?.isRequired);
        if (!required) return false;
        return getSampleApprovalStatus(project?.sampleApproval || {}) !== "approved";
      }).length,
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
      key: "sample",
      label: "Sample Approval",
      value: samplePending,
      description: "Sample required but not approved",
      tone: "success",
    },
  ];

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
        <div className="frontdesk-orders-chip">All Orders & History</div>
      </div>

      <div className="frontdesk-kpi-grid">
        {kpiCards.map((card) => (
          <div key={card.key} className={`frontdesk-kpi-card ${card.tone}`}>
            <div className="frontdesk-kpi-header">
              <span>{card.label}</span>
              <strong>{loading ? "..." : card.value}</strong>
            </div>
            <p>{card.description}</p>
          </div>
        ))}
      </div>

      <div className="frontdesk-orders-content">
        <OrdersList />
      </div>
    </div>
  );
};

export default FrontDeskOrders;
