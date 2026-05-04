const fs = require("fs");
const path = require("path");

const Project = require("../models/Project");
const upload = require("../middleware/upload");
const { sendEmailDetailed } = require("./emailService");

const toText = (value) => (value === null || value === undefined ? "" : String(value).trim());
const unique = (items = []) => Array.from(new Set((Array.isArray(items) ? items : []).filter(Boolean)));

const escapeHtml = (value = "") =>
  toText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatDateTime = (value) => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatBoolean = (value) => (value ? "Yes" : "No");

const isPlainObject = (value) =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.prototype.toString.call(value) === "[object Object]";

const normalizeObjectForEmail = (value) => {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((entry) => normalizeObjectForEmail(entry));
  if (typeof value === "object") {
    if (typeof value.toHexString === "function") return value.toHexString();
    if (typeof value.toString === "function" && value.constructor?.name === "ObjectId") {
      return value.toString();
    }

    const result = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (key === "__v") return;
      result[key] = normalizeObjectForEmail(entry);
    });
    return result;
  }
  return value;
};

const getUserDisplayName = (value = {}) => {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  const firstName = toText(value.firstName);
  const lastName = toText(value.lastName);
  const combined = `${firstName} ${lastName}`.trim().replace(/\s+/g, " ");
  return combined || toText(value.name) || toText(value.email) || toText(value.employeeId);
};

const formatValue = (value) => {
  if (value === null || value === undefined || value === "") return "N/A";
  if (typeof value === "boolean") return formatBoolean(value);
  if (value instanceof Date) return formatDateTime(value);
  if (Array.isArray(value)) {
    if (!value.length) return "N/A";
    return value
      .map((entry) => {
        if (isPlainObject(entry)) {
          const name = getUserDisplayName(entry);
          if (name) return name;
          return JSON.stringify(normalizeObjectForEmail(entry));
        }
        return toText(entry);
      })
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "object") {
    const userName = getUserDisplayName(value);
    if (userName) return userName;
    return JSON.stringify(normalizeObjectForEmail(value));
  }
  return toText(value) || "N/A";
};

const buildSectionHtml = (title, rows = []) => {
  const validRows = rows.filter(([, value]) => value !== undefined);
  if (!validRows.length) return "";

  const rowHtml = validRows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:10px 12px;border:1px solid #dbe3ef;background:#f8fafc;width:220px;font-weight:700;color:#0f172a;vertical-align:top;">
            ${escapeHtml(label)}
          </td>
          <td style="padding:10px 12px;border:1px solid #dbe3ef;color:#0f172a;vertical-align:top;">
            ${escapeHtml(formatValue(value))}
          </td>
        </tr>
      `.trim(),
    )
    .join("");

  return `
    <div style="margin-top:22px;">
      <div style="font-size:18px;font-weight:800;color:#1e293b;margin:0 0 10px;">${escapeHtml(title)}</div>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid #dbe3ef;border-radius:12px;overflow:hidden;">
        ${rowHtml}
      </table>
    </div>
  `.trim();
};

const buildItemsSectionHtml = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) return "";

  const rowHtml = items
    .map((item, index) => {
      const cells = [
        index + 1,
        item?.description || "",
        item?.breakdown || "",
        item?.qty ?? "",
      ];

      return `
        <tr>
          ${cells
            .map(
              (cell) => `
                <td style="padding:10px 12px;border:1px solid #dbe3ef;vertical-align:top;color:#0f172a;">
                  ${escapeHtml(formatValue(cell))}
                </td>
              `.trim(),
            )
            .join("")}
        </tr>
      `.trim();
    })
    .join("");

  return `
    <div style="margin-top:22px;">
      <div style="font-size:18px;font-weight:800;color:#1e293b;margin:0 0 10px;">Items</div>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid #dbe3ef;">
        <thead>
          <tr>
            ${["#", "Description", "Breakdown", "Qty"]
              .map(
                (label) => `
                  <th style="padding:10px 12px;border:1px solid #dbe3ef;background:#e2e8f0;text-align:left;color:#0f172a;font-size:13px;">
                    ${escapeHtml(label)}
                  </th>
                `.trim(),
              )
              .join("")}
          </tr>
        </thead>
        <tbody>${rowHtml}</tbody>
      </table>
    </div>
  `.trim();
};

const resolveBaseUrl = (requestBaseUrl = "") =>
  toText(process.env.EMAIL_LINK_BASE_URL) ||
  toText(process.env.CLIENT_PORTAL_FALLBACK_URL) ||
  toText(process.env.CLIENT_PORTAL_URL) ||
  toText(requestBaseUrl);

const joinUrl = (baseUrl = "", relativePath = "") => {
  const normalizedBase = toText(baseUrl).replace(/\/+$/, "");
  const normalizedPath = `/${toText(relativePath).replace(/^\/+/, "")}`;
  if (!normalizedBase) return normalizedPath;
  return `${normalizedBase}${normalizedPath}`;
};

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);
const isImageAsset = (fileName = "", fileType = "") => {
  const normalizedType = toText(fileType).toLowerCase();
  if (normalizedType.startsWith("image/")) return true;
  return IMAGE_EXTENSIONS.has(path.extname(toText(fileName)).toLowerCase());
};

const getMockupFileLabel = (entry = {}) => {
  const source = toText(entry?.source).toLowerCase();
  const isClientUpload = source === "client" || Boolean(entry?.intakeUpload);
  if (isClientUpload && entry?.clientApprovedAtIntake) {
    return "Already Approved Mockup";
  }
  if (isClientUpload) return "Client Mockup";
  return "Mockup";
};

const collectProjectFiles = (project) => {
  const files = [];
  const pushFile = (entry, label, category = "general") => {
    const fileUrl =
      toText(entry?.fileUrl) || toText(entry?.url) || toText(entry?.path);
    if (!fileUrl) return;
    const fileName =
      toText(entry?.fileName) ||
      toText(entry?.name) ||
      path.basename(fileUrl.split("?")[0]);
    const fileType = toText(entry?.fileType) || toText(entry?.type);
    const note = toText(entry?.note);
    const localPath = upload.resolveUploadPathFromUrl(fileUrl);
    files.push({
      label,
      fileUrl,
      fileName,
      fileType,
      note,
      localPath,
      isImage: isImageAsset(fileName, fileType),
      category,
    });
  };

  if (toText(project?.details?.sampleImage)) {
    pushFile(
      {
        fileUrl: project.details.sampleImage,
        fileName: path.basename(project.details.sampleImage),
        fileType: "",
        note: toText(project?.details?.sampleImageNote),
      },
      "Sample Image",
      "sampleImage",
    );
  }

  (Array.isArray(project?.details?.attachments) ? project.details.attachments : []).forEach(
    (entry) => pushFile(entry, "Order Attachment", "referenceMaterial"),
  );

  const mockupVersions = Array.isArray(project?.mockup?.versions)
    ? project.mockup.versions
    : [];
  const mockupEntries =
    mockupVersions.length > 0
      ? mockupVersions
      : toText(project?.mockup?.fileUrl)
        ? [project.mockup]
        : [];
  mockupEntries.forEach((entry) =>
    pushFile(entry, getMockupFileLabel(entry), "mockup"),
  );

  (
    Array.isArray(project?.quoteDetails?.bidSubmission?.documents)
      ? project.quoteDetails.bidSubmission.documents
      : []
  ).forEach((entry) => pushFile(entry, "Bid Submission Document", "bidSubmission"));

  return files;
};

const buildEmailAttachments = (files = []) => {
  const attachments = [];
  const seenAttachmentKeys = new Set();

  (Array.isArray(files) ? files : []).forEach((file) => {
    if (!file.localPath || !fs.existsSync(file.localPath)) return;
    const key = `${file.localPath}|${file.label}`;
    if (seenAttachmentKeys.has(key)) return;
    seenAttachmentKeys.add(key);

    const attachment = {
      filename: file.fileName || path.basename(file.localPath),
      path: file.localPath,
    };

    if (file.fileType) {
      attachment.contentType = file.fileType;
    }

    attachments.push(attachment);
  });

  return attachments;
};

const collectRevisionEmailFiles = (project, revisionParts = []) => {
  const cleanParts = (Array.isArray(revisionParts) ? revisionParts : [])
    .map((part) => toText(part).toLowerCase())
    .filter(Boolean);
  if (cleanParts.length === 0) return [];

  const includesPart = (label) => cleanParts.includes(label.toLowerCase());
  const includesMockupPart = cleanParts.some((part) => part.includes("mockup"));
  const includesDocumentPart = cleanParts.some(
    (part) => part.includes("document") || part.includes("bid"),
  );

  return collectProjectFiles(project).filter((file) => {
    if (file.category === "sampleImage") {
      return includesPart("Primary Reference Image");
    }
    if (file.category === "referenceMaterial") {
      return includesPart("Reference Materials");
    }
    if (file.category === "mockup") {
      return includesMockupPart;
    }
    if (file.category === "bidSubmission") {
      return includesDocumentPart;
    }
    return false;
  });
};

const buildProjectCreationEmailHtml = ({ project, creatorName, requestBaseUrl }) => {
  const details = project?.details || {};
  const orderRef = project?.orderRef || {};
  const checklist = project?.quoteDetails?.checklist || {};
  const enabledQuoteRequirements = Object.entries(checklist)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([key]) => key)
    .join(", ");

  const summarySection = buildSectionHtml("Creation Summary", [
    ["Project Type", project?.projectType],
    ["Status", project?.status],
    ["Order ID", project?.orderId],
    ["Created At", formatDateTime(project?.createdAt)],
    ["Created By", creatorName],
    ["Project Lead", getUserDisplayName(project?.projectLeadId) || details.lead],
    ["Assistant Lead", getUserDisplayName(project?.assistantLeadId)],
    ["Departments", project?.departments],
  ]);

  const clientSection = buildSectionHtml("Client Details", [
    ["Client", details?.client || orderRef?.client],
    ["Client Email", details?.clientEmail || orderRef?.clientEmail],
    ["Client Phone", details?.clientPhone || orderRef?.clientPhone],
    ["Contact Type", details?.contactType],
  ]);

  const projectSection = buildSectionHtml("Project Details", [
    ["Project Name", details?.projectName],
    ["Project Name Raw", details?.projectNameRaw],
    ["Project Indicator", details?.projectIndicator],
    ["Brief Overview", details?.briefOverview],
    ["Order Date", formatDateTime(project?.orderDate)],
    ["Received Time", project?.receivedTime],
    ["Delivery Date", formatDateTime(details?.deliveryDate)],
    ["Delivery Time", details?.deliveryTime],
    ["Delivery Location", details?.deliveryLocation],
    ["Supply Source", details?.supplySource],
    ["Packaging Type", details?.packagingType],
    ["Sample Required", project?.sampleRequirement?.isRequired],
    ["Corporate Emergency", project?.corporateEmergency?.isEnabled],
  ]);

  const quoteSection =
    project?.projectType === "Quote"
      ? buildSectionHtml("Quote Details", [
          ["Quote Number", project?.quoteDetails?.quoteNumber],
          ["Quote Date", formatDateTime(project?.quoteDetails?.quoteDate)],
          ["Selected Requirements", enabledQuoteRequirements || "N/A"],
          ["Scope Approved", project?.quoteDetails?.scopeApproved],
          ["Bid Submission Sensitive", project?.quoteDetails?.bidSubmission?.isSensitive],
        ])
      : "";

  const portalUrl = resolveBaseUrl(requestBaseUrl)
    ? joinUrl(resolveBaseUrl(requestBaseUrl), `/new-orders/${project?._id}`)
    : "";

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(project?.orderId || project?._id || "New Project Created")}</title>
      </head>
      <body style="margin:0;padding:24px;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
        <div style="max-width:920px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 20px 40px rgba(15,23,42,0.12);">
          <div style="padding:26px 30px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);color:#f8fafc;">
            <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#cbd5e1;">Automatic Order Creation Alert</div>
            <div style="margin-top:8px;font-size:30px;font-weight:800;line-height:1.2;">${escapeHtml(
              details?.projectName || project?.orderId || "New Project",
            )}</div>
            <div style="margin-top:10px;font-size:16px;line-height:1.6;color:#e2e8f0;">
              A new ${escapeHtml((project?.projectType || "Project").toLowerCase())} order was successfully created by ${escapeHtml(
                creatorName || "Front Desk",
              )}</div>
            ${
              portalUrl
                ? `<div style="margin-top:14px;font-size:14px;color:#bfdbfe;">Open order: <a href="${escapeHtml(
                    portalUrl,
                  )}" style="color:#93c5fd;text-decoration:underline;">${escapeHtml(portalUrl)}</a></div>`
                : ""
            }
          </div>
          <div style="padding:28px 30px 34px;">
            ${summarySection}
            ${clientSection}
            ${projectSection}
            ${quoteSection}
            ${buildItemsSectionHtml(project?.items || [])}
          </div>
        </div>
      </body>
    </html>
  `.trim();
};

const getProjectItemCount = (items = []) =>
  (Array.isArray(items) ? items : []).length;

const getProjectItemQtyTotal = (items = []) =>
  (Array.isArray(items) ? items : []).reduce(
    (total, item) => total + (Number(item?.qty) || 0),
    0,
  );

const formatItemSummary = (item = {}) => {
  const parts = [];
  const description = toText(item?.description);
  const breakdown = toText(item?.breakdown);
  const qty = Number(item?.qty);

  if (description) parts.push(description);
  if (breakdown) parts.push(breakdown);
  if (Number.isFinite(qty) && qty > 0) parts.push(`Qty: ${qty}`);

  return parts.join(" | ") || "N/A";
};

const buildChangeDetailsSectionHtml = (changeDetails = []) => {
  const rows = (Array.isArray(changeDetails) ? changeDetails : [])
    .map((detail) => ({
      label: toText(detail?.label),
      before: formatValue(detail?.before),
      after: formatValue(detail?.after),
    }))
    .filter((detail) => detail.label);

  if (!rows.length) return "";

  const rowHtml = rows
    .map(
      (detail) => `
        <tr>
          <td style="padding:10px 12px;border:1px solid #dbe3ef;background:#f8fafc;width:220px;font-weight:700;color:#0f172a;vertical-align:top;">
            ${escapeHtml(detail.label)}
          </td>
          <td style="padding:10px 12px;border:1px solid #dbe3ef;color:#0f172a;vertical-align:top;">
            ${escapeHtml(detail.before)}
          </td>
          <td style="padding:10px 12px;border:1px solid #dbe3ef;color:#0f172a;vertical-align:top;">
            ${escapeHtml(detail.after)}
          </td>
        </tr>
      `.trim(),
    )
    .join("");

  return `
    <div style="margin-top:22px;">
      <div style="font-size:18px;font-weight:800;color:#1e293b;margin:0 0 10px;">What Changed</div>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid #dbe3ef;">
        <thead>
          <tr>
            ${["Field", "Previous", "Current"]
              .map(
                (label) => `
                  <th style="padding:10px 12px;border:1px solid #dbe3ef;background:#e2e8f0;text-align:left;color:#0f172a;font-size:13px;">
                    ${escapeHtml(label)}
                  </th>
                `.trim(),
              )
              .join("")}
          </tr>
        </thead>
        <tbody>${rowHtml}</tbody>
      </table>
    </div>
  `.trim();
};

const buildProjectCreationEmailSubject = (project = {}) => {
  const subjectPrefix =
    project?.projectType === "Quote" ? "New Quote Created" : "New Order Created";
  return `${subjectPrefix}: #${project?.orderId || project?._id} - ${toText(
    project?.details?.projectName || "Untitled Project",
  )}`;
};

const buildProjectRevisionEmailSubject = ({ project, threadSubject = "" }) => {
  const baseSubject = toText(threadSubject) || buildProjectCreationEmailSubject(project);
  if (!baseSubject) {
    return `Order Revision: #${project?.orderId || project?._id || "N/A"}`;
  }
  return /^re:/i.test(baseSubject) ? baseSubject : `Re: ${baseSubject}`;
};

const buildProjectRevisionEmailText = ({
  project,
  actorName,
  revisionParts = [],
  changeDetails = [],
  eventType = "update",
  reopenContext = null,
}) => {
  const lines = [
    eventType === "reopen"
      ? `Project reopened as revision v${project?.versionNumber || 1}`
      : `Order revision ${project?.orderRevisionCount || 0}`,
    `Order ID: ${project?.orderId || project?._id || "N/A"}`,
    `Project Name: ${project?.details?.projectName || "N/A"}`,
    `Client: ${project?.details?.client || project?.orderRef?.client || "N/A"}`,
    `Updated By: ${actorName}`,
    `Status: ${project?.status || "N/A"}`,
    `Changed Parts: ${(Array.isArray(revisionParts) ? revisionParts : [])
      .filter(Boolean)
      .join(", ") || "N/A"}`,
  ];

  if (eventType === "reopen") {
    lines.push(
      `Version: v${project?.versionNumber || 1}`,
      `Previous Version: v${Number(reopenContext?.sourceVersion || 0) || "N/A"}`,
      `Reason: ${toText(reopenContext?.reason) || "N/A"}`,
    );
  }

  const detailLines = (Array.isArray(changeDetails) ? changeDetails : [])
    .map((detail) => {
      const label = toText(detail?.label);
      if (!label) return "";
      const before = formatValue(detail?.before);
      const after = formatValue(detail?.after);
      return `- ${label}: ${before} -> ${after}`;
    })
    .filter(Boolean);

  if (detailLines.length > 0) {
    lines.push("", "Change Details:", ...detailLines);
  }

  return lines.join("\n");
};

const buildProjectRevisionEmailHtml = ({
  project,
  actorName,
  requestBaseUrl,
  revisionParts = [],
  changeDetails = [],
  eventType = "update",
  reopenContext = null,
}) => {
  const portalUrl = resolveBaseUrl(requestBaseUrl)
    ? joinUrl(resolveBaseUrl(requestBaseUrl), `/new-orders/${project?._id}`)
    : "";
  const cleanParts = (Array.isArray(revisionParts) ? revisionParts : []).filter(Boolean);
  const summarySection = buildSectionHtml("Revision Summary", [
    ["Project Type", project?.projectType],
    ["Status", project?.status],
    ["Order ID", project?.orderId],
    ["Version", `v${Number(project?.versionNumber || 1)}`],
    ["Revision Count", project?.orderRevisionCount],
    [
      eventType === "reopen" ? "Reopened By" : "Updated By",
      actorName,
    ],
    ["Changed Parts", cleanParts.join(", ") || "N/A"],
    [
      eventType === "reopen" ? "Reopened At" : "Updated At",
      eventType === "reopen"
        ? project?.reopenMeta?.reopenedAt || project?.createdAt
        : project?.orderRevisionMeta?.updatedAt || project?.updatedAt,
    ],
    [
      "Reopen Reason",
      eventType === "reopen" ? toText(reopenContext?.reason) || "N/A" : undefined,
    ],
  ]);

  const snapshotSection = buildSectionHtml("Current Order Snapshot", [
    ["Client", project?.details?.client || project?.orderRef?.client],
    ["Client Email", project?.details?.clientEmail || project?.orderRef?.clientEmail],
    ["Client Phone", project?.details?.clientPhone || project?.orderRef?.clientPhone],
    ["Project Name", project?.details?.projectName],
    ["Project Indicator", project?.details?.projectIndicator],
    ["Brief Overview", project?.details?.briefOverview],
    ["Delivery Date", formatDateTime(project?.details?.deliveryDate)],
    ["Delivery Time", project?.details?.deliveryTime],
    ["Delivery Location", project?.details?.deliveryLocation],
    ["Packaging Type", project?.details?.packagingType],
    [
      "Items Summary",
      `${getProjectItemCount(project?.items)} item(s), ${getProjectItemQtyTotal(project?.items)} total qty`,
    ],
  ]);

  const itemsSection = cleanParts.includes("Order Items")
    ? buildItemsSectionHtml(project?.items || [])
    : "";
  const changeSection = buildChangeDetailsSectionHtml(changeDetails);

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(project?.orderId || project?._id || "Order Revision")}</title>
      </head>
      <body style="margin:0;padding:24px;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
        <div style="max-width:920px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 20px 40px rgba(15,23,42,0.12);">
          <div style="padding:26px 30px;background:linear-gradient(135deg,#7c2d12 0%,#9a3412 100%);color:#f8fafc;">
            <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#fdba74;">Order Revision Reply</div>
            <div style="margin-top:8px;font-size:30px;font-weight:800;line-height:1.2;">${escapeHtml(
              project?.details?.projectName || project?.orderId || "Order Revision",
            )}</div>
            <div style="margin-top:10px;font-size:16px;line-height:1.6;color:#ffedd5;">
              ${
                eventType === "reopen"
                  ? `${escapeHtml(actorName || "Front Desk")} reopened this project as revision v${escapeHtml(
                      String(project?.versionNumber || 1),
                    )}.`
                  : `${escapeHtml(actorName || "Front Desk")} updated this order and recorded a new revision.`
              }
              ${cleanParts.length ? ` Changed parts: ${escapeHtml(cleanParts.join(", "))}.` : ""}
            </div>
            ${
              portalUrl
                ? `<div style="margin-top:14px;font-size:14px;color:#fed7aa;">Open order: <a href="${escapeHtml(
                    portalUrl,
                  )}" style="color:#ffedd5;text-decoration:underline;">${escapeHtml(portalUrl)}</a></div>`
                : ""
            }
          </div>
          <div style="padding:28px 30px 34px;">
            <div style="font-size:15px;line-height:1.7;color:#334155;">
              This reply highlights the latest approved change against the prior saved version of the order.
            </div>
            ${summarySection}
            ${changeSection}
            ${snapshotSection}
            ${itemsSection}
          </div>
        </div>
      </body>
    </html>
  `.trim();
};

const resolveRecipientList = (primaryEnvKey, fallbackEnvKey = "") =>
  unique(
    [primaryEnvKey, fallbackEnvKey]
      .map((envKey) => toText(process.env[envKey]))
      .filter(Boolean)
      .flatMap((value) => value.split(","))
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

const resolveRecipients = () =>
  resolveRecipientList("ORDER_CREATION_NOTIFICATION_EMAIL");

const resolveRevisionRecipients = () =>
  resolveRecipientList(
    "ORDER_REVISION_NOTIFICATION_EMAIL",
    "ORDER_CREATION_NOTIFICATION_EMAIL",
  );

const loadProjectForEmail = async (projectId) =>
  Project.findById(projectId)
    .populate("createdBy", "firstName lastName email employeeId role department")
    .populate("projectLeadId", "firstName lastName email employeeId department")
    .populate("assistantLeadId", "firstName lastName email employeeId department")
    .populate("orderRef", "orderNumber orderDate client clientEmail clientPhone")
    .lean();

const getMessageIdList = (entries = []) =>
  unique(
    (Array.isArray(entries) ? entries : [])
      .map((entry) => toText(entry?.messageId))
      .filter(Boolean),
  );

const resolveThreadSourceProject = async (project) => {
  const threadMessageId = toText(project?.emailNotifications?.orderCreated?.messageId);
  const lineageId = project?.lineageId?._id || project?.lineageId;
  const currentProjectId = project?._id?.toString?.() || toText(project?._id);

  if (
    threadMessageId ||
    !lineageId ||
    String(lineageId) === currentProjectId
  ) {
    return project;
  }

  const lineageProject = await loadProjectForEmail(lineageId);
  return lineageProject || project;
};

const resolveEmailThread = async (project) => {
  const threadSource = await resolveThreadSourceProject(project);
  const orderCreated =
    threadSource?.emailNotifications?.orderCreated ||
    project?.emailNotifications?.orderCreated ||
    {};
  const references = unique([
    toText(orderCreated?.messageId),
    ...getMessageIdList(threadSource?.emailNotifications?.revisions),
    ...getMessageIdList(project?.emailNotifications?.revisions),
  ]).filter(Boolean);

  return {
    threadSource,
    orderCreated,
    references,
    inReplyTo:
      references[references.length - 1] || toText(orderCreated?.messageId),
  };
};

const persistOrderCreatedEmailMetadata = async ({
  projectId,
  subject,
  recipients,
  messageId,
}) => {
  if (!projectId || !toText(messageId)) return;

  await Project.findByIdAndUpdate(projectId, {
    $set: {
      "emailNotifications.orderCreated": {
        sentAt: new Date(),
        subject: toText(subject),
        recipients: Array.isArray(recipients) ? recipients.filter(Boolean) : [],
        messageId: toText(messageId),
      },
    },
  });
};

const appendRevisionEmailMetadata = async ({
  projectId,
  eventType = "update",
  orderRevisionCount = 0,
  versionNumber = 1,
  subject,
  recipients,
  messageId,
  changedParts = [],
  triggeredBy = null,
  triggeredByName = "",
}) => {
  if (!projectId || !toText(messageId)) return;

  await Project.findByIdAndUpdate(projectId, {
    $push: {
      "emailNotifications.revisions": {
        eventType,
        orderRevisionCount: Number(orderRevisionCount || 0),
        versionNumber: Math.max(1, Number(versionNumber || 1)),
        sentAt: new Date(),
        subject: toText(subject),
        recipients: Array.isArray(recipients) ? recipients.filter(Boolean) : [],
        messageId: toText(messageId),
        changedParts: unique(
          (Array.isArray(changedParts) ? changedParts : []).filter(Boolean),
        ),
        triggeredBy: triggeredBy || undefined,
        triggeredByName: toText(triggeredByName),
      },
    },
  });
};

const sendProjectCreationEmail = async ({ projectId, creator = null, requestBaseUrl = "" } = {}) => {
  const recipients = resolveRecipients();
  if (!projectId || recipients.length === 0) {
    return {
      skipped: true,
      sent: false,
      status: "skipped",
      message: "Order created, but notification email was skipped because no recipient is configured.",
    };
  }

  const project = await loadProjectForEmail(projectId);
  if (!project) {
    return {
      skipped: true,
      sent: false,
      status: "skipped",
      message: "Order created, but notification email was skipped because the saved project could not be loaded.",
    };
  }

  const creatorName =
    getUserDisplayName(project?.createdBy) || getUserDisplayName(creator) || "Front Desk";
  const files = collectProjectFiles(project);
  const attachments = buildEmailAttachments(files);

  const subjectPrefix = project?.projectType === "Quote" ? "New Quote Created" : "New Order Created";
  const subject = buildProjectCreationEmailSubject(project);
  const text = [
    `${subjectPrefix}`,
    `Order ID: ${project?.orderId || project?._id || "N/A"}`,
    `Project Name: ${project?.details?.projectName || "N/A"}`,
    `Client: ${project?.details?.client || project?.orderRef?.client || "N/A"}`,
    `Created By: ${creatorName}`,
    `Status: ${project?.status || "N/A"}`,
  ].join("\n");
  const html = buildProjectCreationEmailHtml({
    project,
    creatorName,
    requestBaseUrl,
  });

  const delivery = await sendEmailDetailed(recipients.join(", "), subject, text, {
    html,
    attachments,
  });
  const sent = Boolean(delivery?.sent);

  if (!sent) {
    console.error("Project creation email was not sent successfully.", {
      projectId: project?._id?.toString?.() || String(project?._id || ""),
      recipients,
    });
  } else {
    await persistOrderCreatedEmailMetadata({
      projectId: project._id,
      subject,
      recipients,
      messageId: delivery.messageId,
    });
  }

  return {
    skipped: false,
    sent,
    status: sent ? "sent" : "failed",
    recipientCount: recipients.length,
    messageId: toText(delivery?.messageId),
    message: sent
      ? "Notification email sent successfully."
      : "Order created, but notification email failed to send.",
  };
};

const sendProjectRevisionEmail = async ({
  projectId,
  actor = null,
  requestBaseUrl = "",
  revisionParts = [],
  changeDetails = [],
  eventType = "update",
  reopenContext = null,
} = {}) => {
  const recipients = resolveRevisionRecipients();
  if (!projectId || recipients.length === 0) {
    return {
      skipped: true,
      sent: false,
      status: "skipped",
      message: "Revision email skipped because no recipient is configured.",
    };
  }

  const project = await loadProjectForEmail(projectId);
  if (!project) {
    return {
      skipped: true,
      sent: false,
      status: "skipped",
      message: "Revision email skipped because the project could not be loaded.",
    };
  }

  const actorName =
    getUserDisplayName(actor) || getUserDisplayName(project?.createdBy) || "Front Desk";
  const cleanParts = unique(
    (Array.isArray(revisionParts) ? revisionParts : []).filter(Boolean),
  );
  const thread = await resolveEmailThread(project);
  const subject = buildProjectRevisionEmailSubject({
    project,
    threadSubject: thread?.orderCreated?.subject,
  });
  const text = buildProjectRevisionEmailText({
    project,
    actorName,
    revisionParts: cleanParts,
    changeDetails,
    eventType,
    reopenContext,
  });
  const html = buildProjectRevisionEmailHtml({
    project,
    actorName,
    requestBaseUrl,
    revisionParts: cleanParts,
    changeDetails,
    eventType,
    reopenContext,
  });
  const attachments =
    eventType === "update"
      ? buildEmailAttachments(collectRevisionEmailFiles(project, cleanParts))
      : [];

  const delivery = await sendEmailDetailed(
    recipients.join(", "),
    subject,
    text,
    {
      html,
      inReplyTo: thread?.inReplyTo,
      references: thread?.references,
      attachments,
    },
  );
  const sent = Boolean(delivery?.sent);

  if (!sent) {
    console.error("Project revision email was not sent successfully.", {
      projectId: project?._id?.toString?.() || String(project?._id || ""),
      recipients,
      revisionParts: cleanParts,
      eventType,
    });
  } else {
    await appendRevisionEmailMetadata({
      projectId: project._id,
      eventType,
      orderRevisionCount: project?.orderRevisionCount,
      versionNumber: project?.versionNumber,
      subject,
      recipients,
      messageId: delivery.messageId,
      changedParts: cleanParts,
      triggeredBy: actor?._id || actor?.id || null,
      triggeredByName: actorName,
    });
  }

  return {
    skipped: false,
    sent,
    status: sent ? "sent" : "failed",
    recipientCount: recipients.length,
    messageId: toText(delivery?.messageId),
    threaded: Boolean(thread?.inReplyTo),
    message: sent
      ? "Revision email sent successfully."
      : "Revision email failed to send.",
  };
};

module.exports = {
  sendProjectCreationEmail,
  sendProjectRevisionEmail,
};
