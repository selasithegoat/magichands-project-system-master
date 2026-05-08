import {
  getMockupVersionSourceLabel,
  getMockupVersions,
  getMockupWorkflowLabel,
} from "@client/utils/mockupWorkflow";
import { getLeadDisplay } from "./leadDisplay";
import { formatProjectDisplayName } from "./projectName";

const REFERENCE_SNIPPET_LIMIT = 6;
const MOCKUP_SNIPPET_LIMIT = 6;

const toText = (value) =>
  value === null || value === undefined ? "" : String(value).trim();

const normalizeSentenceText = (value) =>
  toText(value)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();

const ensureSentence = (value, fallback = "-") => {
  const sentence = normalizeSentenceText(value);
  if (!sentence) return fallback;
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
};

const getBriefOverviewLines = (value) => {
  const rawText = toText(value);
  if (!rawText) return ["No brief overview recorded."];

  const lines = rawText
    .split(/\r?\n/)
    .map(normalizeSentenceText)
    .filter(Boolean);

  if (lines.length === 0) return ["No brief overview recorded."];
  return lines.map((line) => (/[.!?]$/.test(line) ? line : `${line}.`));
};

const escapeHtml = (value) =>
  toText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const escapeAttribute = (value) => escapeHtml(value);

const normalizeReferenceAttachments = (attachments) => {
  if (!Array.isArray(attachments)) return [];

  return attachments
    .map((item) => {
      if (!item) return null;

      if (typeof item === "string") {
        const fileUrl = item.trim();
        if (!fileUrl) return null;
        const fileName = fileUrl.split("?")[0].split("/").pop() || fileUrl;
        return { fileUrl, fileName, note: "", fileType: "" };
      }

      const fileUrl =
        item.fileUrl || item.url || item.path || item.file || item.location;
      if (!fileUrl) return null;

      const fileName =
        item.fileName ||
        item.name ||
        fileUrl.split("?")[0].split("/").pop() ||
        fileUrl;

      return {
        fileUrl,
        fileName,
        note: item.note || item.notes || "",
        fileType: item.fileType || item.type || "",
      };
    })
    .filter(Boolean);
};

const isImageReference = (fileUrl = "", fileType = "") => {
  const normalizedType = String(fileType || "").toLowerCase();
  if (normalizedType.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(fileUrl || ""));
};

const getFileExtension = (fileName = "") => {
  const normalized = String(fileName || "");
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === normalized.length - 1) return "FILE";
  return normalized.slice(dotIndex + 1).toUpperCase().slice(0, 6);
};

const getAbsoluteUrl = (fileUrl = "") => {
  const normalized = toText(fileUrl);
  if (!normalized) return "";
  try {
    return new URL(normalized, window.location.origin).href;
  } catch {
    return normalized;
  }
};

const getImageExtension = (mimeType = "", fileName = "") => {
  const normalizedMime = String(mimeType || "").toLowerCase();
  if (normalizedMime.includes("png")) return "png";
  if (normalizedMime.includes("jpeg") || normalizedMime.includes("jpg")) return "jpg";
  if (normalizedMime.includes("gif")) return "gif";
  if (normalizedMime.includes("webp")) return "webp";
  if (normalizedMime.includes("bmp")) return "bmp";
  if (normalizedMime.includes("svg")) return "svg";

  const extension = getFileExtension(fileName).toLowerCase();
  return extension === "file" ? "png" : extension;
};

const getImageMimeType = (blob, file = {}) => {
  const blobType = toText(blob?.type).toLowerCase();
  if (blobType.startsWith("image/")) return blobType;

  const fileType = toText(file.fileType).toLowerCase();
  if (fileType.startsWith("image/")) return fileType;

  const extension = getImageExtension("", file.fileName);
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "svg") return "image/svg+xml";
  return `image/${extension}`;
};

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return window.btoa(binary);
};

const wrapBase64 = (value) => String(value || "").replace(/.{1,76}/g, "$&\r\n");

const formatDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatDeliveryTime = (value) => toText(value) || "All Day";

const getDateMs = (value, fallback = Infinity) => {
  if (!value) return fallback;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getProjectName = (project, fallback = "Untitled Project") =>
  formatProjectDisplayName(project?.details || {}, null, fallback);

const getUniqueValues = (values) =>
  Array.from(new Set(values.map(toText).filter(Boolean)));

const stripTrailingPhrase = (name, phrase) => {
  const projectName = normalizeSentenceText(name);
  const suffix = normalizeSentenceText(phrase);
  if (!projectName || !suffix) return projectName;

  const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return projectName
    .replace(new RegExp(`\\s+for\\s+${escapedSuffix}$`, "i"), "")
    .replace(new RegExp(`\\s*-\\s*${escapedSuffix}$`, "i"), "")
    .trim();
};

const compactProductName = (name) =>
  normalizeSentenceText(name)
    .replace(/^branded\s+/i, "")
    .replace(/\s+for\s+.+$/i, "")
    .trim();

const joinReadableList = (items) => {
  const list = getUniqueValues(items);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
};

const getProjectIndicatorSummary = (projects = []) =>
  joinReadableList(
    projects.map((project) => project?.details?.projectIndicator),
  );

const getProjectReferenceAttachments = (project = {}) => {
  const details = project?.details || {};
  const attachments = normalizeReferenceAttachments(
    project?.attachments || details.attachments || [],
  );
  const sampleImage = project?.sampleImage || details.sampleImage;

  if (!sampleImage) return attachments;

  return [
    {
      fileUrl: sampleImage,
      fileName: "Sample Image",
      note: details.sampleImageNote || "",
      fileType: "image",
    },
    ...attachments,
  ];
};

const getProjectMockupAttachments = (project = {}) =>
  getMockupVersions(project?.mockup || {}).map((version) => ({
    fileUrl: version.fileUrl,
    fileName:
      toText(version.fileName) ||
      `${getMockupVersionSourceLabel(version)} Mockup v${version.version}`,
    fileType: version.fileType,
    note: version.note,
    label: `${getMockupVersionSourceLabel(version)} v${version.version}`,
    status: getMockupWorkflowLabel(version),
  }));

const collectEmbeddableImages = (projects = []) => {
  const entries = [];
  const seen = new Set();

  const addFile = (file) => {
    if (!isImageReference(file?.fileUrl, file?.fileType)) return;
    const absoluteUrl = getAbsoluteUrl(file.fileUrl);
    if (!absoluteUrl || seen.has(absoluteUrl)) return;
    seen.add(absoluteUrl);

    const extension = getImageExtension(file.fileType, file.fileName);
    entries.push({
      file,
      absoluteUrl,
      contentLocation: `group-brief-image-${entries.length + 1}.${extension}`,
    });
  };

  projects.forEach((project) => {
    getProjectMockupAttachments(project)
      .slice(0, MOCKUP_SNIPPET_LIMIT)
      .forEach(addFile);
    getProjectReferenceAttachments(project)
      .slice(0, REFERENCE_SNIPPET_LIMIT)
      .forEach(addFile);
  });

  return entries;
};

const fetchEmbeddedImage = async (entry) => {
  try {
    const response = await fetch(entry.absoluteUrl, {
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) return null;

    const blob = await response.blob();
    const mimeType = getImageMimeType(blob, entry.file);
    if (!mimeType.startsWith("image/")) return null;

    const base64 = arrayBufferToBase64(await blob.arrayBuffer());
    return {
      absoluteUrl: entry.absoluteUrl,
      contentLocation: entry.contentLocation,
      mimeType,
      base64,
    };
  } catch (error) {
    console.warn("Failed to embed group brief image:", entry.absoluteUrl, error);
    return null;
  }
};

const buildEmbeddedImageMap = async (projects = []) => {
  const entries = collectEmbeddableImages(projects);
  const embeddedImages = await Promise.all(entries.map(fetchEmbeddedImage));

  return new Map(
    embeddedImages
      .filter(Boolean)
      .map((entry) => [entry.absoluteUrl, entry]),
  );
};

const buildLeadGroups = (projects = []) => {
  const map = new Map();
  projects.forEach((project) => {
    const lead = getLeadDisplay(project, "Unassigned");
    if (!map.has(lead)) {
      map.set(lead, []);
    }
    map.get(lead).push(project);
  });

  return Array.from(map.entries())
    .map(([lead, items]) => ({ lead, projects: items }))
    .sort((left, right) => left.lead.localeCompare(right.lead));
};

const resolveMainProject = (projects = []) => {
  if (!Array.isArray(projects) || projects.length === 0) return null;
  return [...projects].sort((left, right) => {
    const leftDate = getDateMs(left?.details?.deliveryDate);
    const rightDate = getDateMs(right?.details?.deliveryDate);
    if (leftDate !== rightDate) return leftDate - rightDate;
    return getDateMs(left?.createdAt, 0) - getDateMs(right?.createdAt, 0);
  })[0];
};

const resolveDocumentTitle = (group, projects, orderNumber) => {
  const projectNames = getUniqueValues(
    projects.map((project) => getProjectName(project, "")),
  );
  const projectIndicator = getProjectIndicatorSummary(projects);
  const client =
    toText(group?.client) ||
    toText(projects[0]?.details?.client) ||
    toText(group?.orderRef?.client);
  const products = projectNames
    .map((name) => stripTrailingPhrase(name, projectIndicator))
    .map((name) => stripTrailingPhrase(name, client))
    .map(compactProductName)
    .filter(Boolean);
  const productSummary = joinReadableList(products);

  if (productSummary && projectIndicator) {
    return `${productSummary} for ${projectIndicator}`;
  }
  if (productSummary) return productSummary;

  const mainProject = resolveMainProject(projects);
  return getProjectName(mainProject, "") || `Order ${orderNumber || "Group"}`;
};

const resolveDeliveryDateSummary = (projects) => {
  const dates = getUniqueValues(
    projects
      .map((project) => formatDate(project?.details?.deliveryDate))
      .filter((value) => value !== "-"),
  );

  if (dates.length === 0) return "-";
  if (dates.length === 1) return dates[0];
  return dates.join(", ");
};

const resolveDeliveryTimeSummary = (projects) => {
  const times = getUniqueValues(
    projects.map((project) => formatDeliveryTime(project?.details?.deliveryTime)),
  );
  if (times.length === 0) return "All Day";
  if (times.length === 1) return times[0];
  return times.join(", ");
};

const renderSummarySentence = (label, value) => `
  <p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(
    ensureSentence(value),
  )}</p>
`;

const renderAttachmentSnippet = ({
  attachments,
  embeddedImages,
  emptyMessage,
  limit,
  remainingLabel,
}) => {
  if (attachments.length === 0) {
    return `<p class="muted">${escapeHtml(emptyMessage)}</p>`;
  }

  const visibleReferences = attachments.slice(0, limit);
  const rows = [];
  for (let index = 0; index < visibleReferences.length; index += 3) {
    rows.push(visibleReferences.slice(index, index + 3));
  }

  const tableRows = rows
    .map(
      (row) => `
        <tr>
          ${row
            .map((file) => {
              const absoluteUrl = getAbsoluteUrl(file.fileUrl);
              const fileName = toText(file.fileName) || "Reference file";
              const isImage = isImageReference(file.fileUrl, file.fileType);
              const embeddedImage = embeddedImages?.get(absoluteUrl);
              const preview = isImage && embeddedImage
                ? `<img src="${escapeAttribute(embeddedImage.contentLocation)}" alt="${escapeAttribute(fileName)}" width="72" height="42" style="width:72px;height:42px;max-width:72px;max-height:42px;" />`
                : `<div class="file-preview">${escapeHtml(getFileExtension(fileName))}</div>`;

              return `
                <td>
                  <a href="${escapeAttribute(absoluteUrl)}">
                    <div class="reference-preview">${preview}</div>
                    ${
                      file.label
                        ? `<div class="reference-label">${escapeHtml(file.label)}</div>`
                        : ""
                    }
                    <div class="reference-name">${escapeHtml(fileName)}</div>
                    ${
                      file.status
                        ? `<div class="reference-status">${escapeHtml(file.status)}</div>`
                        : ""
                    }
                    ${
                      file.note
                        ? `<div class="reference-note">${escapeHtml(file.note)}</div>`
                        : ""
                    }
                  </a>
                </td>
              `;
            })
            .join("")}
        </tr>
      `,
    )
    .join("");

  const remainingCount = attachments.length - visibleReferences.length;

  return `
    <table class="reference-table">${tableRows}</table>
    ${
      remainingCount > 0
        ? `<p class="muted">${remainingCount} additional ${remainingLabel}${
            remainingCount === 1 ? "" : "s"
          } available in the project page.</p>`
        : ""
    }
  `;
};

const renderReferenceSnippet = (project, embeddedImages) =>
  renderAttachmentSnippet({
    attachments: getProjectReferenceAttachments(project),
    embeddedImages,
    emptyMessage: "No reference files uploaded for this project.",
    limit: REFERENCE_SNIPPET_LIMIT,
    remainingLabel: "reference file",
  });

const renderMockupSnippet = (project, embeddedImages) =>
  renderAttachmentSnippet({
    attachments: getProjectMockupAttachments(project),
    embeddedImages,
    emptyMessage: "No mockup uploaded for this project.",
    limit: MOCKUP_SNIPPET_LIMIT,
    remainingLabel: "mockup file",
  });

const renderMockupSection = (project, embeddedImages) => {
  if (getProjectMockupAttachments(project).length === 0) return "";
  return `
    <h4>Mockup Images</h4>
    ${renderMockupSnippet(project, embeddedImages)}
  `;
};

const renderBriefOverview = (value) => `
  <div class="brief-overview">
    ${getBriefOverviewLines(value)
      .map((line) => `<p class="brief-line">${escapeHtml(line)}</p>`)
      .join("")}
  </div>
`;

const renderProjectBrief = (project, embeddedImages) => {
  const details = project?.details || {};
  const projectName = getProjectName(project);

  return `
    <article class="project-brief">
      <h3>${escapeHtml(projectName)}</h3>
      <h4>Brief Overview</h4>
      ${renderBriefOverview(details.briefOverview)}
      ${renderMockupSection(project, embeddedImages)}
      <h4>Reference File Snippets</h4>
      ${renderReferenceSnippet(project, embeddedImages)}
    </article>
  `;
};

const renderLeadSection = (leadGroup, embeddedImages) => `
  <section class="lead-section">
    <h2>${escapeHtml(leadGroup.lead)}</h2>
    ${leadGroup.projects
      .map((project) => renderProjectBrief(project, embeddedImages))
      .join("")}
  </section>
`;

const buildBriefHtml = ({ group, projects, orderNumber, embeddedImages }) => {
  const documentTitle = resolveDocumentTitle(group, projects, orderNumber);
  const leadGroups = buildLeadGroups(projects);
  const client =
    toText(group?.client) ||
    toText(projects[0]?.details?.client) ||
    toText(group?.orderRef?.client) ||
    "-";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(documentTitle)}</title>
  <style>
    body {
      margin: 0;
      padding: 32px;
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.45;
      background: #ffffff;
    }
    h1 {
      margin: 0 0 8px;
      color: #0f172a;
      font-size: 30px;
      line-height: 1.15;
    }
    h2 {
      margin: 26px 0 12px;
      padding-bottom: 8px;
      color: #1d4ed8;
      border-bottom: 2px solid #bfdbfe;
      font-size: 20px;
    }
    h3 {
      margin: 0 0 10px;
      color: #111827;
      font-size: 17px;
    }
    h4 {
      margin: 16px 0 6px;
      color: #374151;
      font-size: 12px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    a {
      color: #1d4ed8;
      text-decoration: none;
    }
    .subtitle {
      margin: 0 0 20px;
      color: #4b5563;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .lead-section {
      page-break-inside: avoid;
    }
    .project-brief {
      margin: 0 0 18px;
      padding: 16px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      page-break-inside: avoid;
    }
    .project-brief p {
      margin: 0;
    }
    .summary-panel {
      margin: 14px 0 24px;
      padding: 14px 16px;
      border: 1px solid #d1d5db;
      background: #f9fafb;
    }
    .summary-panel p {
      margin: 0 0 8px;
      color: #111827;
      font-size: 14px;
      line-height: 1.55;
      white-space: normal;
    }
    .summary-panel p:last-child {
      margin-bottom: 0;
    }
    .brief-overview {
      margin: 0;
      padding: 8px 10px;
      border-left: 3px solid #bfdbfe;
      background: #f9fafb;
    }
    .brief-line {
      margin: 0 0 6px;
      padding: 0 0 6px;
      color: #111827;
      font-size: 14px;
      line-height: 1.6;
      white-space: normal;
      word-break: normal;
      overflow-wrap: normal;
      border-bottom: 1px solid #e5e7eb;
    }
    .brief-line:last-child {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: 0;
    }
    .reference-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 8px;
    }
    .reference-table td {
      width: 33.33%;
      padding: 8px;
      border: 1px solid #d1d5db;
      vertical-align: top;
      background: #f9fafb;
    }
    .reference-preview {
      height: 44px;
      margin-bottom: 8px;
      background: #e5e7eb;
      overflow: hidden;
      text-align: center;
    }
    .reference-preview img {
      width: 72px;
      height: 42px;
      max-width: 72px;
      max-height: 42px;
    }
    .file-preview {
      padding-top: 13px;
      color: #374151;
      font-weight: 700;
      letter-spacing: 0.08em;
    }
    .reference-name {
      color: #111827;
      font-size: 12px;
      font-weight: 700;
      word-break: break-word;
    }
    .reference-label,
    .reference-status {
      color: #1d4ed8;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .reference-status {
      color: #374151;
      font-weight: 600;
      text-transform: none;
      letter-spacing: 0;
    }
    .reference-note,
    .muted {
      color: #6b7280;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(documentTitle)}</h1>
  <p class="subtitle">Group Project Brief</p>
  <section class="summary-panel">
    ${renderSummarySentence("Order No.", group?.orderNumber || orderNumber || "-")}
    ${renderSummarySentence("Client", client)}
    ${renderSummarySentence("Delivery Date", resolveDeliveryDateSummary(projects))}
    ${renderSummarySentence("Delivery Time", resolveDeliveryTimeSummary(projects))}
  </section>
  ${leadGroups.map((entry) => renderLeadSection(entry, embeddedImages)).join("")}
</body>
</html>`;
};

const buildMhtmlDocument = (html, embeddedImages) => {
  const boundary = `----=_GroupProjectBrief_${Date.now()}`;
  const imageParts = Array.from(embeddedImages.values())
    .map(
      (image) => `
--${boundary}
Content-Type: ${image.mimeType}
Content-Transfer-Encoding: base64
Content-Location: ${image.contentLocation}

${wrapBase64(image.base64)}`,
    )
    .join("");

  return `MIME-Version: 1.0
Content-Type: multipart/related; boundary="${boundary}"; type="text/html"

--${boundary}
Content-Type: text/html; charset="utf-8"
Content-Transfer-Encoding: 8bit
Content-Location: group-project-brief.html

${html}
${imageParts}
--${boundary}--`.replace(/\r?\n/g, "\r\n");
};

const sanitizeFileName = (value) =>
  (toText(value) || "Group Project Brief")
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

export const downloadGroupProjectBrief = async ({ group, projects, orderNumber }) => {
  const projectList = Array.isArray(projects) ? projects : [];
  const documentTitle = resolveDocumentTitle(group, projectList, orderNumber);
  const embeddedImages = await buildEmbeddedImageMap(projectList);
  const html = buildBriefHtml({
    group,
    projects: projectList,
    orderNumber,
    embeddedImages,
  });
  const documentContent = buildMhtmlDocument(html, embeddedImages);
  const blob = new Blob([documentContent], {
    type: "application/msword;charset=utf-8",
  });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = downloadUrl;
  link.download = `${sanitizeFileName(documentTitle)} - Group Project Brief.doc`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
};
