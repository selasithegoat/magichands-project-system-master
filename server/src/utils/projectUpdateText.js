const toText = (value) => String(value || "").trim();

const MOCKUP_PENDING_CLIENT_APPROVAL_UPDATE_TEXT =
  "Mockup pending Client Approval";
const MOCKUP_APPROVED_BY_CLIENT_UPDATE_TEXT = "Mockup approved by client";
const SAMPLE_PENDING_CLIENT_APPROVAL_UPDATE_TEXT =
  "Sample pending Client Approval";
const SAMPLE_APPROVED_BY_CLIENT_UPDATE_TEXT = "Sample approved by client";

const SAMPLE_REQUIREMENT_ENABLED_LEGACY_REGEX =
  /^Sample requirement enabled for project #.+Client sample approval is now required before Production can be completed\.?$/i;
const SAMPLE_REQUIREMENT_DISABLED_LEGACY_REGEX =
  /^Sample requirement disabled for project #.+Production can proceed without client sample approval\.?$/i;

const normalizeProjectUpdateContent = (value) => {
  const content = toText(value);
  if (!content) return "";

  const lowered = content.toLowerCase();

  if (
    lowered === "pending mockup approval from client" ||
    lowered === "mockup pending client approval"
  ) {
    return MOCKUP_PENDING_CLIENT_APPROVAL_UPDATE_TEXT;
  }

  if (
    lowered === "mockup approved by client" ||
    lowered === "mockup approval confirmed by client" ||
    lowered === "mockup approved by client."
  ) {
    return MOCKUP_APPROVED_BY_CLIENT_UPDATE_TEXT;
  }

  if (
    lowered === "pending sample approval from client" ||
    lowered === "sample pending client approval"
  ) {
    return SAMPLE_PENDING_CLIENT_APPROVAL_UPDATE_TEXT;
  }

  if (
    lowered === "sample approved by client" ||
    lowered === "sample approved by client."
  ) {
    return SAMPLE_APPROVED_BY_CLIENT_UPDATE_TEXT;
  }

  if (SAMPLE_REQUIREMENT_ENABLED_LEGACY_REGEX.test(content)) {
    return SAMPLE_PENDING_CLIENT_APPROVAL_UPDATE_TEXT;
  }

  if (SAMPLE_REQUIREMENT_DISABLED_LEGACY_REGEX.test(content)) {
    return SAMPLE_APPROVED_BY_CLIENT_UPDATE_TEXT;
  }

  return content;
};

module.exports = {
  MOCKUP_PENDING_CLIENT_APPROVAL_UPDATE_TEXT,
  MOCKUP_APPROVED_BY_CLIENT_UPDATE_TEXT,
  SAMPLE_PENDING_CLIENT_APPROVAL_UPDATE_TEXT,
  SAMPLE_APPROVED_BY_CLIENT_UPDATE_TEXT,
  normalizeProjectUpdateContent,
};
