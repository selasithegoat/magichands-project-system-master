import React from "react";

const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : "";

export const formatProjectIndicatorInput = (value) =>
  typeof value === "string" ? value.toUpperCase() : "";

export const normalizeProjectIndicator = (value) => {
  const trimmed = normalizeText(value);
  return trimmed ? trimmed.toUpperCase() : "";
};

export const resolveProjectNameBase = (details = {}) => {
  const raw = normalizeText(details?.projectNameRaw);
  if (raw) return raw;
  return normalizeText(details?.projectName);
};

export const formatProjectDisplayName = (
  detailsOrName,
  indicator,
  fallback = "Untitled Project",
) => {
  if (detailsOrName && typeof detailsOrName === "object") {
    const base = resolveProjectNameBase(detailsOrName);
    const indicatorText = normalizeProjectIndicator(
      detailsOrName?.projectIndicator,
    );
    if (!base) return fallback;
    return indicatorText ? `${base} for ${indicatorText}` : base;
  }

  const base = normalizeText(detailsOrName);
  const indicatorText = normalizeProjectIndicator(indicator);
  if (!base) return fallback;
  return indicatorText ? `${base} for ${indicatorText}` : base;
};

export const renderProjectName = (
  detailsOrName,
  indicator,
  fallback = "Untitled Project",
) => {
  if (detailsOrName && typeof detailsOrName === "object") {
    const base = resolveProjectNameBase(detailsOrName);
    const indicatorText = normalizeProjectIndicator(
      detailsOrName?.projectIndicator,
    );
    if (!base && !indicatorText) return fallback;
    if (!indicatorText) return base || fallback;
    return (
      <>
        {base || fallback} for <strong>{indicatorText}</strong>
      </>
    );
  }

  const base = normalizeText(detailsOrName);
  const indicatorText = normalizeProjectIndicator(indicator);
  if (!base && !indicatorText) return fallback;
  if (!indicatorText) return base || fallback;
  return (
    <>
      {base || fallback} for <strong>{indicatorText}</strong>
    </>
  );
};

export const buildProjectNameRuns = (
  detailsOrName,
  indicator,
  fallback = "Untitled Project",
) => {
  if (detailsOrName && typeof detailsOrName === "object") {
    const base = resolveProjectNameBase(detailsOrName) || fallback;
    const indicatorText = normalizeProjectIndicator(
      detailsOrName?.projectIndicator,
    );
    if (!indicatorText) return [{ text: base || fallback, bold: false }];
    return [
      { text: `${base || fallback} for `, bold: false },
      { text: indicatorText, bold: true },
    ];
  }

  const base = normalizeText(detailsOrName) || fallback;
  const indicatorText = normalizeProjectIndicator(indicator);
  if (!indicatorText) return [{ text: base || fallback, bold: false }];
  return [
    { text: `${base || fallback} for `, bold: false },
    { text: indicatorText, bold: true },
  ];
};

export const resolveProjectNameForForm = (details = {}) =>
  resolveProjectNameBase(details);
