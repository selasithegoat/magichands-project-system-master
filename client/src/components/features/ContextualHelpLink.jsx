import React from "react";
import { Link } from "react-router-dom";
import HelpIcon from "../icons/HelpIcon";
import "./ContextualHelpLink.css";

const toText = (value) => String(value || "").trim();

const getProjectReference = (project = {}) => {
  const quoteNumber = toText(project?.quoteDetails?.quoteNumber);
  if (quoteNumber) return quoteNumber;

  const orderId = toText(project?.orderId || project?.orderNumber);
  if (!orderId) return "";
  return orderId.startsWith("#") ? orderId : `#${orderId}`;
};

const ContextualHelpLink = ({
  label = "Help",
  topic = "",
  category = "",
  question = "",
  project = null,
  className = "",
}) => {
  const params = new URLSearchParams();
  const projectId = toText(project?._id || project?.id || project?.projectId);
  const reference = getProjectReference(project || {});
  const resolvedQuestion = reference && question ? `${question} (${reference})` : question;

  if (topic) params.set("topic", topic);
  if (category) params.set("category", category);
  if (resolvedQuestion) params.set("q", resolvedQuestion);
  if (projectId) params.set("projectId", projectId);

  const href = `/faq${params.toString() ? `?${params.toString()}` : ""}`;

  return (
    <Link className={`contextual-help-link ${className}`.trim()} to={href}>
      <HelpIcon width="16" height="16" />
      <span>{label}</span>
    </Link>
  );
};

export default ContextualHelpLink;
