const MOCKUP_SOURCE_SET = new Set(["client", "graphics"]);
const MOCKUP_GRAPHICS_REVIEW_STATUS_SET = new Set([
  "pending",
  "validated",
  "superseded",
  "not_required",
]);

const getAttachmentNameFromUrl = (fileUrl = "") => {
  const rawName = String(fileUrl || "")
    .split("?")[0]
    .split("/")
    .pop();
  if (!rawName) return "";
  try {
    return decodeURIComponent(rawName);
  } catch {
    return rawName;
  }
};

const normalizeMockupAttachment = (attachment = {}) => {
  const fileUrl = String(attachment?.fileUrl || attachment?.url || "").trim();
  if (!fileUrl) return null;
  return {
    fileUrl,
    fileName:
      String(attachment?.fileName || attachment?.name || "").trim() ||
      getAttachmentNameFromUrl(fileUrl),
    fileType: String(attachment?.fileType || attachment?.type || "").trim(),
    uploadedBy: attachment?.uploadedBy || null,
    uploadedAt: attachment?.uploadedAt || null,
  };
};

const normalizeMockupAttachmentList = (attachments = []) => {
  if (!Array.isArray(attachments)) return [];
  return attachments.map(normalizeMockupAttachment).filter(Boolean);
};

export const getMockupApprovalStatus = (approval = {}) => {
  const explicit = String(approval?.status || "")
    .trim()
    .toLowerCase();
  if (["pending", "approved", "rejected"].includes(explicit)) {
    return explicit;
  }
  if (approval?.isApproved) return "approved";
  if (
    approval?.rejectedAt ||
    approval?.rejectedBy ||
    approval?.rejectionReason ||
    approval?.rejectionAttachment?.fileUrl ||
    normalizeMockupAttachmentList(approval?.rejectionAttachments).length > 0
  ) {
    return "rejected";
  }
  return "pending";
};

export const getMockupSource = (value, fallback = "graphics") => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return MOCKUP_SOURCE_SET.has(normalized) ? normalized : fallback;
};

export const getMockupGraphicsReviewStatus = (
  review = {},
  source = "graphics",
  intakeUpload = false,
) => {
  const explicit = String(review?.status || "")
    .trim()
    .toLowerCase();
  if (MOCKUP_GRAPHICS_REVIEW_STATUS_SET.has(explicit)) {
    return explicit;
  }

  if (source === "client" || intakeUpload) {
    if (review?.reviewedAt || review?.reviewedBy) {
      return "validated";
    }
    return "pending";
  }

  return "not_required";
};

export const getMockupVersions = (mockup = {}) => {
  const rawVersions = Array.isArray(mockup?.versions) ? mockup.versions : [];
  const normalized = rawVersions
    .map((entry, index) => {
      const parsedVersion = Number.parseInt(entry?.version, 10);
      const version =
        Number.isFinite(parsedVersion) && parsedVersion > 0
          ? parsedVersion
          : index + 1;
      const source = getMockupSource(
        entry?.source,
        entry?.intakeUpload ? "client" : "graphics",
      );
      const intakeUpload = Boolean(entry?.intakeUpload ?? source === "client");
      const approvalStatus = getMockupApprovalStatus(entry?.clientApproval || {});
      const rejectionAttachments = normalizeMockupAttachmentList(
        entry?.clientApproval?.rejectionAttachments,
      );
      const rejectionAttachment =
        rejectionAttachments[0] ||
        normalizeMockupAttachment(entry?.clientApproval?.rejectionAttachment || {});

      return {
        entryId: entry?._id || entry?.id || null,
        version,
        fileUrl: String(entry?.fileUrl || "").trim(),
        fileName: String(entry?.fileName || "").trim(),
        fileType: String(entry?.fileType || "").trim(),
        note: String(entry?.note || "").trim(),
        uploadedBy: entry?.uploadedBy || null,
        uploadedAt: entry?.uploadedAt || null,
        source,
        intakeUpload,
        clientApprovedAtIntake: Boolean(entry?.clientApprovedAtIntake),
        graphicsReview: {
          status: getMockupGraphicsReviewStatus(
            entry?.graphicsReview || {},
            source,
            intakeUpload,
          ),
          reviewedAt: entry?.graphicsReview?.reviewedAt || null,
          reviewedBy: entry?.graphicsReview?.reviewedBy || null,
          note: String(entry?.graphicsReview?.note || "").trim(),
        },
        clientApproval: {
          status: approvalStatus,
          isApproved: approvalStatus === "approved",
          approvedAt: entry?.clientApproval?.approvedAt || null,
          approvedBy: entry?.clientApproval?.approvedBy || null,
          rejectedAt: entry?.clientApproval?.rejectedAt || null,
          rejectedBy: entry?.clientApproval?.rejectedBy || null,
          rejectionReason: String(
            entry?.clientApproval?.rejectionReason ||
              entry?.clientApproval?.note ||
              "",
          ).trim(),
          note: String(entry?.clientApproval?.note || "").trim(),
          rejectionAttachment,
          rejectionAttachments,
        },
      };
    })
    .filter((entry) => entry.fileUrl);

  if (normalized.length === 0 && mockup?.fileUrl) {
    const parsedVersion = Number.parseInt(mockup?.version, 10);
    const version =
      Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1;
    const source = getMockupSource(
      mockup?.source,
      mockup?.intakeUpload ? "client" : "graphics",
    );
    const intakeUpload = Boolean(mockup?.intakeUpload ?? source === "client");
    const approvalStatus = getMockupApprovalStatus(mockup?.clientApproval || {});
    const rejectionAttachments = normalizeMockupAttachmentList(
      mockup?.clientApproval?.rejectionAttachments,
    );
    const rejectionAttachment =
      rejectionAttachments[0] ||
      normalizeMockupAttachment(mockup?.clientApproval?.rejectionAttachment || {});
    normalized.push({
      entryId: mockup?._id || mockup?.id || null,
      version,
      fileUrl: String(mockup.fileUrl || "").trim(),
      fileName: String(mockup.fileName || "").trim(),
      fileType: String(mockup.fileType || "").trim(),
      note: String(mockup.note || "").trim(),
      uploadedBy: mockup?.uploadedBy || null,
      uploadedAt: mockup?.uploadedAt || null,
      source,
      intakeUpload,
      clientApprovedAtIntake: Boolean(mockup?.clientApprovedAtIntake),
      graphicsReview: {
        status: getMockupGraphicsReviewStatus(
          mockup?.graphicsReview || {},
          source,
          intakeUpload,
        ),
        reviewedAt: mockup?.graphicsReview?.reviewedAt || null,
        reviewedBy: mockup?.graphicsReview?.reviewedBy || null,
        note: String(mockup?.graphicsReview?.note || "").trim(),
      },
      clientApproval: {
        status: approvalStatus,
        isApproved: approvalStatus === "approved",
        approvedAt: mockup?.clientApproval?.approvedAt || null,
        approvedBy: mockup?.clientApproval?.approvedBy || null,
        rejectedAt: mockup?.clientApproval?.rejectedAt || null,
        rejectedBy: mockup?.clientApproval?.rejectedBy || null,
        rejectionReason: String(
          mockup?.clientApproval?.rejectionReason ||
            mockup?.clientApproval?.note ||
            "",
        ).trim(),
        note: String(mockup?.clientApproval?.note || "").trim(),
        rejectionAttachment,
        rejectionAttachments,
      },
    });
  }

  return normalized.sort((left, right) => {
    if (left.version !== right.version) return left.version - right.version;
    const leftTime = left.uploadedAt ? new Date(left.uploadedAt).getTime() : 0;
    const rightTime = right.uploadedAt ? new Date(right.uploadedAt).getTime() : 0;
    return leftTime - rightTime;
  });
};

export const getLatestMockupVersion = (mockup = {}) => {
  const versions = getMockupVersions(mockup);
  return versions.length > 0 ? versions[versions.length - 1] : null;
};

export const isClientProvidedMockupVersion = (version = {}) =>
  getMockupSource(version?.source, version?.intakeUpload ? "client" : "graphics") ===
  "client";

export const isClientApprovedAtIntakeMockupVersion = (version = {}) =>
  isClientProvidedMockupVersion(version) &&
  Boolean(version?.clientApprovedAtIntake);

export const isGraphicsManagedMockupVersion = (version = {}) =>
  getMockupSource(version?.source, version?.intakeUpload ? "client" : "graphics") ===
  "graphics";

export const isMockupGraphicsValidated = (version = {}) =>
  Boolean(version?.fileUrl) &&
  isClientProvidedMockupVersion(version) &&
  getMockupGraphicsReviewStatus(
    version?.graphicsReview || {},
    getMockupSource(version?.source, version?.intakeUpload ? "client" : "graphics"),
    Boolean(version?.intakeUpload),
  ) === "validated";

export const isMockupAwaitingGraphicsValidation = (version = {}) =>
  Boolean(version?.fileUrl) &&
  isClientProvidedMockupVersion(version) &&
  getMockupGraphicsReviewStatus(
    version?.graphicsReview || {},
    getMockupSource(version?.source, version?.intakeUpload ? "client" : "graphics"),
    Boolean(version?.intakeUpload),
  ) === "pending";

export const isMockupPendingClientApproval = (version = {}) =>
  Boolean(version?.fileUrl) &&
  isGraphicsManagedMockupVersion(version) &&
  getMockupApprovalStatus(version?.clientApproval || {}) === "pending";

export const isMockupClientApproved = (version = {}) =>
  Boolean(version?.fileUrl) &&
  isGraphicsManagedMockupVersion(version) &&
  getMockupApprovalStatus(version?.clientApproval || {}) === "approved";

export const isMockupClientRejected = (version = {}) =>
  Boolean(version?.fileUrl) &&
  isGraphicsManagedMockupVersion(version) &&
  getMockupApprovalStatus(version?.clientApproval || {}) === "rejected";

export const isMockupReadyForCompletion = (version = {}) =>
  Boolean(version?.fileUrl) &&
  (isMockupGraphicsValidated(version) || isMockupClientApproved(version));

export const canFrontDeskReviewMockupVersion = (version = {}) =>
  Boolean(version?.fileUrl) && isGraphicsManagedMockupVersion(version);

export const getMockupWorkflowState = (version = {}) => {
  if (!version?.fileUrl) return "missing";

  if (isClientProvidedMockupVersion(version)) {
    const reviewStatus = getMockupGraphicsReviewStatus(
      version?.graphicsReview || {},
      getMockupSource(version?.source, version?.intakeUpload ? "client" : "graphics"),
      Boolean(version?.intakeUpload),
    );
    if (reviewStatus === "validated") return "graphics_validated";
    if (reviewStatus === "superseded") return "superseded";
    return "awaiting_graphics_review";
  }

  const approvalStatus = getMockupApprovalStatus(version?.clientApproval || {});
  if (approvalStatus === "approved") return "client_approved";
  if (approvalStatus === "rejected") return "client_rejected";
  return "pending_client_approval";
};

export const getMockupWorkflowLabel = (version = {}, options = {}) => {
  const { readyForQuote = false } = options;
  const state = getMockupWorkflowState(version);

  if (state === "graphics_validated") {
    return readyForQuote
      ? "Graphics Validated - Ready for Quote"
      : "Graphics Validated - Ready to Proceed";
  }
  if (state === "awaiting_graphics_review") {
    return "Awaiting Graphics Validation";
  }
  if (state === "superseded") {
    return "Superseded by Graphics Revision";
  }
  if (state === "client_approved") {
    return readyForQuote ? "Client Approved - Ready for Quote" : "Client Approved";
  }
  if (state === "client_rejected") {
    return "Client Rejected";
  }
  if (state === "pending_client_approval") {
    return "Pending Client Approval";
  }
  return "No Mockup";
};

export const getMockupVersionSourceLabel = (version = {}) =>
  isClientApprovedAtIntakeMockupVersion(version)
    ? "Client (Approved)"
    : isClientProvidedMockupVersion(version)
      ? "Client"
      : "Graphics";
