const toText = (value) => (typeof value === "string" ? value.trim() : "");

const STANDARD_PROGRESS_MAP = {
  "Order Created": 5,
  "Pending Scope Approval": 15,
  "Scope Approval Completed": 22,
  "Pending Departmental Meeting": 25,
  "Pending Departmental Engagement": 27,
  "Departmental Engagement Completed": 32,
  "Pending Mockup": 38,
  "Mockup Completed": 44,
  "Pending Master Approval": 48,
  "Master Approval Completed": 52,
  "Pending Production": 58,
  "Production Completed": 66,
  "Pending Quality Control": 72,
  "Quality Control Completed": 76,
  "Pending Photography": 80,
  "Photography Completed": 84,
  "Pending Packaging": 88,
  "Packaging Completed": 92,
  "Pending Delivery/Pickup": 95,
  Delivered: 97,
  "Pending Feedback": 98,
  "Feedback Completed": 99,
  Completed: 100,
  Finished: 100,
};

const QUOTE_PROGRESS_MAP = {
  "Order Created": 5,
  "Pending Scope Approval": 25,
  "Scope Approval Completed": 35,
  "Pending Departmental Meeting": 38,
  "Pending Departmental Engagement": 42,
  "Departmental Engagement Completed": 48,
  "Pending Quote Request": 50,
  "Quote Request Completed": 60,
  "Pending Send Response": 75,
  "Response Sent": 90,
  Delivered: 95,
  "Pending Feedback": 97,
  "Feedback Completed": 99,
  Completed: 100,
  Finished: 100,
};

const STATUS_TITLE_MAP = {
  "Order Created": "Project Started",
  "Pending Scope Approval": "Project Started",
  "Scope Approval Completed": "Project Started",
  "Pending Departmental Meeting": "Project Started",
  "Pending Departmental Engagement": "Project Started",
  "Departmental Engagement Completed": "Project Started",
  "In Progress": "Project Started",
  "Pending Mockup": "Mockup Design in Progress",
  "Mockup Completed": "Mockup Design Completed",
  "Pending Production": "Production in Progress",
  "Production Completed": "Production Completed",
  "Photography Completed": "Ready for Delivery/Pickup",
  "Pending Delivery/Pickup": "Ready for Delivery/Pickup",
  Delivered: "Ready for Delivery/Pickup",
};

const resolveClientName = (project = {}) =>
  toText(project?.details?.client) ||
  toText(project?.details?.clientName) ||
  "";

const resolveProjectName = (project = {}) =>
  toText(project?.details?.projectName) || "";

const resolveProgressPercent = (status = "", projectType = "") => {
  const map =
    projectType === "Quote" ? QUOTE_PROGRESS_MAP : STANDARD_PROGRESS_MAP;
  return map[status] ?? 5;
};

const resolveProjectIdentifier = (project = {}) => {
  const orderId = toText(project?.orderId);
  if (orderId) return orderId;
  if (project?._id) return String(project._id);
  return "your order";
};

const resolveOrderNumber = (project = {}) => {
  const orderId = toText(project?.orderId);
  if (orderId) return orderId;
  const orderRef = toText(project?.orderRef?.orderNumber);
  if (orderRef) return orderRef;
  return "";
};

const buildStatusSmsTitle = ({ project = {}, status = "" }) => {
  const baseTitle = STATUS_TITLE_MAP[status] || "Project Update";
  const orderNumber = resolveOrderNumber(project);
  const orderLabel = orderNumber ? `your Order ${orderNumber}` : "your Order";
  return `${baseTitle} for ${orderLabel}`;
};

const buildStatusSmsMessage = ({ project = {}, status = "" }) => {
  const progressPercent = resolveProgressPercent(
    status,
    toText(project?.projectType),
  );
  const clientName = resolveClientName(project);
  const projectName = resolveProjectName(project);
  const greeting = clientName ? `Dear ${clientName},` : "Hello,";
  const orderNumber = toText(project?.orderId);
  const orderRef = orderNumber ? `order ${orderNumber}` : "your order";
  const orderLabel = projectName
    ? `your ${orderRef} for ${projectName}`
    : `${orderRef}`;
  const deliveryLabel = projectName
    ? `your order for ${projectName}`
    : "your order";
  const message =
    status === "Pending Delivery/Pickup"
      ? `${greeting} ${deliveryLabel} is ready for dispatch or pickup. Kindly contact us on our Whatsapp number +233 24 068 3462 for follow-up or more details.`
      : `${greeting} ${orderLabel} is currently in progress and is ${progressPercent}% complete. Kindly contact us on our Whatsapp number +233 24 068 3462 for follow-up or more details.`;
  const title = buildStatusSmsTitle({ project, status });
  const messageWithTitle = title ? `${title}. ${message}` : message;
  return { message: messageWithTitle, progressPercent, title };
};

const buildFeedbackSmsMessage = ({ project = {} }) => {
  const projectRef = resolveProjectIdentifier(project);
  const orderLabel =
    projectRef === "your order" ? "your order" : `your order #${projectRef}`;
  return `Thank you for choosing us! We truly appreciate your positive feedback on ${orderLabel}. Your support means a lot to us, and we look forward to serving you again soon.`;
};

module.exports = {
  resolveProgressPercent,
  buildStatusSmsMessage,
  buildFeedbackSmsMessage,
};

