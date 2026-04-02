import {
  getQuoteRequirementMode,
  getQuoteStatusDisplay,
} from "./quoteStatus";

export const CLOSED_ORDER_STATUSES = new Set([
  "Completed",
  "Finished",
  "Delivered",
  "Feedback Completed",
]);

export const ACTION_ORDER_STATUSES = new Set([
  "Order Created",
  "Pending Acceptance",
  "Pending Scope Approval",
  "Pending Departmental Meeting",
  "Pending Departmental Engagement",
  "Quote Created",
  "Pending Quote Requirements",
  "Pending Mockup",
  "Pending Cost",
  "Pending Cost Verification",
  "Pending Sample Retrieval",
  "Pending Sample / Work done Retrieval",
  "Pending Quote Submission",
  "Pending Sample / Work done Sent",
  "Quote Submission Completed",
  "Pending Client Decision",
  "Pending Feedback",
]);

export const isQuoteOrder = (project) => project?.projectType === "Quote";

export const resolveOrderManagementStatus = (project) =>
  isQuoteOrder(project)
    ? getQuoteStatusDisplay(
        project?.status || "",
        getQuoteRequirementMode(project?.quoteDetails?.checklist || {}),
      )
    : project?.status || "";

export const getOrderSampleApprovalStatus = (sampleApproval = {}) => {
  const explicit = String(sampleApproval?.status || "")
    .trim()
    .toLowerCase();
  if (explicit === "approved") return "approved";
  if (explicit === "rejected") return "rejected";
  if (sampleApproval?.approvedAt || sampleApproval?.approvedBy) return "approved";
  return "pending";
};

export const getOrderMockupApprovalStatus = (approval = {}) => {
  const explicit = String(approval?.status || "")
    .trim()
    .toLowerCase();
  if (["pending", "approved", "rejected"].includes(explicit)) {
    return explicit;
  }
  if (approval?.isApproved) return "approved";
  if (approval?.rejectedAt || approval?.rejectedBy || approval?.rejectionReason) {
    return "rejected";
  }
  return "pending";
};

export const getLatestOrderMockupVersion = (mockup = {}) => {
  const versions = Array.isArray(mockup?.versions) ? mockup.versions : [];
  const normalizedVersions = versions
    .map((entry, index) => {
      const parsedVersion = Number.parseInt(entry?.version, 10);
      const version =
        Number.isFinite(parsedVersion) && parsedVersion > 0
          ? parsedVersion
          : index + 1;
      return {
        version,
        fileUrl: String(entry?.fileUrl || "").trim(),
        uploadedAt: entry?.uploadedAt || null,
        clientApproval: entry?.clientApproval || {},
      };
    })
    .filter((entry) => entry.fileUrl)
    .sort((left, right) => {
      if (left.version !== right.version) return left.version - right.version;
      const leftTime = left.uploadedAt ? new Date(left.uploadedAt).getTime() : 0;
      const rightTime = right.uploadedAt
        ? new Date(right.uploadedAt).getTime()
        : 0;
      return leftTime - rightTime;
    });

  if (normalizedVersions.length > 0) {
    return normalizedVersions[normalizedVersions.length - 1];
  }

  if (mockup?.fileUrl) {
    const parsedVersion = Number.parseInt(mockup?.version, 10);
    return {
      version:
        Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1,
      fileUrl: String(mockup.fileUrl || "").trim(),
      uploadedAt: mockup.uploadedAt || null,
      clientApproval: mockup?.clientApproval || {},
    };
  }

  return null;
};

export const hasPendingClientMockupApproval = (project) => {
  const status = resolveOrderManagementStatus(project);
  if (CLOSED_ORDER_STATUSES.has(status)) return false;

  const latestMockup = getLatestOrderMockupVersion(project?.mockup || {});
  if (!latestMockup?.fileUrl) return false;

  return (
    getOrderMockupApprovalStatus(latestMockup.clientApproval || {}) === "pending"
  );
};

export const hasOrderBillingBlock = (project) => {
  if (!project || isQuoteOrder(project)) return false;
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

export const getOrderDeliveryRisk = (project) => {
  if (!project?.details?.deliveryDate) return { risk: false, overdue: false };
  const deliveryDate = new Date(project.details.deliveryDate);
  if (Number.isNaN(deliveryDate.getTime())) return { risk: false, overdue: false };
  const now = new Date();
  const diffMs = deliveryDate.getTime() - now.getTime();
  const risk = diffMs <= 72 * 60 * 60 * 1000;
  return { risk, overdue: diffMs < 0 };
};

export const matchesOrdersManagementKpi = (project, kpiKey) => {
  const status = resolveOrderManagementStatus(project);

  switch (kpiKey) {
    case "billing":
      return !CLOSED_ORDER_STATUSES.has(status) && hasOrderBillingBlock(project);
    case "actions":
      return !CLOSED_ORDER_STATUSES.has(status) && ACTION_ORDER_STATUSES.has(status);
    case "delivery":
      return !CLOSED_ORDER_STATUSES.has(status) && getOrderDeliveryRisk(project).risk;
    case "quotes":
      if (!isQuoteOrder(project)) return false;
      return [
        "Pending Cost",
        "Pending Cost Verification",
        "Pending Mockup",
        "Pending Sample Retrieval",
        "Pending Sample / Work done Retrieval",
        "Pending Sample Production",
        "Pending Bid Submission / Documents",
        "Pending Quote Requirements",
        "Pending Quote Submission",
        "Pending Sample / Work done Sent",
        "Quote Submission Completed",
        "Pending Client Decision",
      ].includes(status);
    case "mockup":
      return !CLOSED_ORDER_STATUSES.has(status) && status === "Pending Mockup";
    case "mockupApproval":
      return hasPendingClientMockupApproval(project);
    case "sample":
      if (CLOSED_ORDER_STATUSES.has(status)) return false;
      if (!Boolean(project?.sampleRequirement?.isRequired)) return false;
      return getOrderSampleApprovalStatus(project?.sampleApproval || {}) !== "approved";
    default:
      return true;
  }
};
