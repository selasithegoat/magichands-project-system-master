const Project = require("../models/Project");
const ProjectUpdate = require("../models/ProjectUpdate");
const User = require("../models/User");

const PROJECT_ACCESS_FIELDS =
  "createdBy projectLeadId assistantLeadId departments orderId details.projectName";
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const PROJECT_BOUND_CATEGORIES = new Set([
  "project-updates",
  "mockups",
  "scope-reference-materials",
  "client-feedback",
]);
const GLOBAL_DIRECTORY_DEPARTMENT_ALLOWLIST = new Set(
  String(process.env.AUTH_USERS_GLOBAL_DEPARTMENTS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

if (GLOBAL_DIRECTORY_DEPARTMENT_ALLOWLIST.size === 0) {
  ["Administration", "Front Desk", "Stores"].forEach((value) =>
    GLOBAL_DIRECTORY_DEPARTMENT_ALLOWLIST.add(value.toLowerCase()),
  );
}

const toObjectIdString = (value) => {
  if (!value) return "";
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
};

const toDepartmentArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
};

const normalizeDepartmentValue = (value) => {
  if (value && typeof value === "object") {
    const optionValue = value.value || value.label || "";
    return String(optionValue).trim().toLowerCase();
  }
  return String(value || "")
    .trim()
    .toLowerCase();
};

const PRODUCTION_DEPARTMENT_TOKENS = new Set([
  "production",
  "dtf",
  "uv-dtf",
  "uv-printing",
  "engraving",
  "large-format",
  "digital-press",
  "digital-heat-press",
  "offset-press",
  "screen-printing",
  "embroidery",
  "sublimation",
  "digital-cutting",
  "pvc-id",
  "business-cards",
  "installation",
  "overseas",
  "woodme",
  "fabrication",
  "signage",
]);
const GRAPHICS_DEPARTMENT_TOKENS = new Set([
  "graphics/design",
  "graphics",
  "design",
]);
const STORES_DEPARTMENT_TOKENS = new Set(["stores", "stock", "packaging"]);
const PHOTOGRAPHY_DEPARTMENT_TOKENS = new Set(["photography"]);

const canonicalizeDepartment = (value) => {
  const token = normalizeDepartmentValue(value);
  if (!token) return "";
  if (PRODUCTION_DEPARTMENT_TOKENS.has(token)) return "production";
  if (GRAPHICS_DEPARTMENT_TOKENS.has(token)) return "graphics";
  if (STORES_DEPARTMENT_TOKENS.has(token)) return "stores";
  if (PHOTOGRAPHY_DEPARTMENT_TOKENS.has(token)) return "photography";
  return token;
};

const hasDepartmentOverlap = (userDepartments, projectDepartments) => {
  const userCanonical = new Set(
    toDepartmentArray(userDepartments)
      .map(canonicalizeDepartment)
      .filter(Boolean),
  );
  if (userCanonical.size === 0) return false;

  const projectCanonical = new Set(
    toDepartmentArray(projectDepartments)
      .map(canonicalizeDepartment)
      .filter(Boolean),
  );
  if (projectCanonical.size === 0) return false;

  for (const dept of userCanonical) {
    if (projectCanonical.has(dept)) return true;
  }
  return false;
};

const canAccessProjectUpload = (user, project) => {
  if (!user || !project) return false;
  if (user.role === "admin") return true;

  const userId = toObjectIdString(user._id || user.id);
  const stakeholderIds = new Set(
    [
      toObjectIdString(project.createdBy),
      toObjectIdString(project.projectLeadId),
      toObjectIdString(project.assistantLeadId),
    ].filter(Boolean),
  );
  if (userId && stakeholderIds.has(userId)) return true;

  const userDepartmentTokens = toDepartmentArray(user.department).map(
    normalizeDepartmentValue,
  );
  const isFrontDesk = userDepartmentTokens.includes("front desk");
  if (isFrontDesk) return true;

  return hasDepartmentOverlap(user.department, project.departments);
};

const normalizeUploadPath = (rawPath) => {
  const value = String(rawPath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  let decoded = "";
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return "";
  }

  if (!decoded) return "";

  const parts = decoded.split("/").filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.some((part) => part === "." || part === "..")) return "";

  return parts.join("/");
};

const sanitizeSegment = (value, fallback = "") => {
  if (!value || typeof value !== "string") return fallback;
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
};

const extractProjectLocator = (relativePath) => {
  const parts = relativePath.split("/");
  if (parts.length < 5) {
    return { token: "", projectSlug: "" };
  }

  const projectFolder = String(parts[3] || "");
  const [token = "", ...slugParts] = projectFolder.split("_");
  return {
    token: token.trim(),
    projectSlug: slugParts.join("_").trim().toLowerCase(),
  };
};

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildLooseOrderIdRegex = (token) => {
  const parts = String(token || "")
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(escapeRegex);

  if (parts.length === 0) return null;
  if (parts.length === 1) {
    return new RegExp(`^${parts[0]}$`, "i");
  }

  const separator = "[-_\\s/]*";
  return new RegExp(`^${parts.join(separator)}$`, "i");
};

const dedupeProjectsById = (projects = []) => {
  const seen = new Set();
  const deduped = [];

  for (const project of projects) {
    const id = toObjectIdString(project?._id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push(project);
  }

  return deduped;
};

const buildCandidateFileUrls = (relativePath) => {
  const normalized = String(relativePath || "").replace(/\\/g, "/");
  if (!normalized) return [];

  const fileName = normalized.split("/").filter(Boolean).pop();
  const urls = [`/uploads/${normalized}`];
  if (fileName) {
    urls.push(`/uploads/${fileName}`);
  }
  return Array.from(new Set(urls));
};

const findProjectForFileUrl = async (relativePath) => {
  const candidateUrls = buildCandidateFileUrls(relativePath);
  if (candidateUrls.length === 0) return null;

  const update = await ProjectUpdate.findOne({
    "attachments.url": { $in: candidateUrls },
  })
    .sort({ createdAt: -1 })
    .select("project")
    .lean();

  const updateProjectId = toObjectIdString(update?.project);
  if (updateProjectId) {
    const projectFromUpdate = await Project.findById(updateProjectId)
      .select(PROJECT_ACCESS_FIELDS)
      .lean();
    if (projectFromUpdate) return projectFromUpdate;
  }

  const project = await Project.findOne({
    $or: [
      { "details.sampleImage": { $in: candidateUrls } },
      { "details.attachments": { $in: candidateUrls } },
      { "mockup.fileUrl": { $in: candidateUrls } },
      { "feedbacks.attachments.fileUrl": { $in: candidateUrls } },
    ],
  })
    .sort({ createdAt: -1 })
    .select(PROJECT_ACCESS_FIELDS)
    .lean();

  return project || null;
};

const findProjectForToken = async ({ token, projectSlug, requester }) => {
  if (!token) return null;
  if (OBJECT_ID_REGEX.test(token)) {
    return Project.findById(token).select(PROJECT_ACCESS_FIELDS).lean();
  }

  const exactInsensitive = new RegExp(`^${escapeRegex(token)}$`, "i");
  const exactCandidates = await Project.find({ orderId: { $regex: exactInsensitive } })
    .sort({ createdAt: -1 })
    .select(PROJECT_ACCESS_FIELDS)
    .lean();

  let candidates = Array.isArray(exactCandidates) ? exactCandidates : [];

  if (candidates.length === 0) {
    const looseRegex = buildLooseOrderIdRegex(token);
    if (!looseRegex) return null;

    const looseCandidates = await Project.find({ orderId: { $regex: looseRegex } })
      .sort({ createdAt: -1 })
      .select(PROJECT_ACCESS_FIELDS)
      .lean();
    candidates = Array.isArray(looseCandidates) ? looseCandidates : [];
  }

  candidates = dedupeProjectsById(candidates);

  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  if (projectSlug) {
    const slugMatch = candidates.find((candidate) => {
      const slug = sanitizeSegment(candidate?.details?.projectName || "");
      return Boolean(slug) && slug === projectSlug;
    });
    if (slugMatch) return slugMatch;
  }

  if (requester) {
    const accessibleCandidate = candidates.find((candidate) =>
      canAccessProjectUpload(requester, candidate),
    );
    if (accessibleCandidate) return accessibleCandidate;
  }

  return candidates[0];
};

const hasGlobalDirectoryAccess = (requesterDepartments) =>
  requesterDepartments.some((department) =>
    GLOBAL_DIRECTORY_DEPARTMENT_ALLOWLIST.has(department),
  );

const canAccessAvatar = (requester, owner) => {
  if (!requester || !owner) return false;
  if (requester.role === "admin") return true;

  const requesterId = toObjectIdString(requester._id || requester.id);
  const ownerId = toObjectIdString(owner._id || owner.id);
  if (requesterId && ownerId && requesterId === ownerId) return true;

  const requesterDepartments = toDepartmentArray(requester.department)
    .map((department) => String(department || "").trim().toLowerCase())
    .filter(Boolean);
  if (hasGlobalDirectoryAccess(requesterDepartments)) return true;

  const ownerDepartments = toDepartmentArray(owner.department)
    .map((department) => String(department || "").trim().toLowerCase())
    .filter(Boolean);

  return ownerDepartments.some((department) =>
    requesterDepartments.includes(department),
  );
};

const enforceUploadAccess = async (req, res, next) => {
  try {
    const relativePath = normalizeUploadPath(req.path);
    if (!relativePath) {
      return res.status(400).json({ message: "Invalid upload path." });
    }

    const parts = relativePath.split("/");
    const category = parts[0];

    if (PROJECT_BOUND_CATEGORIES.has(category)) {
      const locator = extractProjectLocator(relativePath);
      let project = await findProjectForToken({
        ...locator,
        requester: req.user,
      });

      if (!project) {
        project = await findProjectForFileUrl(relativePath);
      }

      if (!project && req.user?.role === "admin") {
        return next();
      }

      if (!project || !canAccessProjectUpload(req.user, project)) {
        return res
          .status(403)
          .json({ message: "Not authorized to access this file." });
      }

      return next();
    }

    if (category === "misc") {
      const fileUrl = `/uploads/${relativePath}`;
      const owner = await User.findOne({ avatarUrl: fileUrl })
        .select("_id role department")
        .lean();

      if (!owner || !canAccessAvatar(req.user, owner)) {
        return res
          .status(403)
          .json({ message: "Not authorized to access this file." });
      }

      return next();
    }

    if (req.user?.role === "admin") {
      return next();
    }

    const project = await findProjectForFileUrl(relativePath);
    if (project && canAccessProjectUpload(req.user, project)) {
      return next();
    }

    return res.status(403).json({ message: "Not authorized to access this file." });
  } catch (error) {
    console.error("Upload access check failed:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

module.exports = enforceUploadAccess;
