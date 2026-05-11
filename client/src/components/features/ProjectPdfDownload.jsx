import React, { useCallback, useMemo, useRef, useState } from "react";
import { getLeadDisplay } from "../../utils/leadDisplay";
import {
  normalizeReferenceAttachments,
} from "../../utils/referenceAttachments";
import { resolveProjectNameForForm } from "../../utils/projectName";

const DOWNLOAD_BUTTON_STYLE = {
  textDecoration: "none",
  padding: "0.5rem 1rem",
  color: "#fff",
  backgroundColor: "#475569",
  border: "none",
  borderRadius: "6px",
  fontSize: "0.875rem",
  fontWeight: "500",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  cursor: "pointer",
};

const DISABLED_BUTTON_STYLE = {
  opacity: 0.75,
  cursor: "wait",
};

const isImageAttachment = (fileUrl = "", fileType = "") => {
  const normalizedType = String(fileType || "").toLowerCase();
  if (normalizedType.startsWith("image/")) return true;
  return /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(String(fileUrl || ""));
};

const canUseObjectUrls = () =>
  typeof URL !== "undefined" &&
  typeof URL.createObjectURL === "function" &&
  typeof URL.revokeObjectURL === "function";

const revokeObjectUrlMap = (urls = {}) => {
  if (!canUseObjectUrls()) return;

  Object.values(urls).forEach((url) => {
    if (url) URL.revokeObjectURL(url);
  });
};

const processImageForPdf = async (path) => {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    !canUseObjectUrls()
  ) {
    return "";
  }

  let sourceUrl = "";

  try {
    const res = await fetch(`${path}`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const blob = await res.blob();

    const img = new window.Image();
    sourceUrl = URL.createObjectURL(blob);
    img.src = sourceUrl;

    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (event) => reject(event);
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return "";
    }

    ctx.drawImage(img, 0, 0);

    const pngBlob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!pngBlob) return "";

    return URL.createObjectURL(pngBlob);
  } catch (err) {
    console.error(`Error processing image ${path}:`, err);
    return "";
  } finally {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  }
};

const buildPdfImageUrls = async (imagePaths) => {
  if (imagePaths.length === 0) return {};

  const entries = await Promise.all(
    imagePaths.map(async (path) => [path, await processImageForPdf(path)]),
  );

  return entries.reduce((urls, [path, url]) => {
    if (url) urls[path] = url;
    return urls;
  }, {});
};

const triggerBlobDownload = (blob, fileName) => {
  if (
    typeof document === "undefined" ||
    typeof window === "undefined" ||
    !canUseObjectUrls()
  ) {
    throw new Error("PDF downloads are not available in this browser.");
  }

  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(downloadUrl);
  }, 1000);
};

const ProjectPdfDownload = ({ project }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const generatingRef = useRef(false);
  const details = useMemo(() => project?.details || {}, [project?.details]);

  const imagePaths = useMemo(() => {
    if (!project) return [];

    const nextPaths = [];
    const sampleImg = project.sampleImage || details.sampleImage;
    if (
      sampleImg &&
      typeof sampleImg === "string" &&
      sampleImg.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i)
    ) {
      nextPaths.push(sampleImg);
    }

    const attachments = normalizeReferenceAttachments(
      project.attachments || details.attachments || [],
    );
    attachments.forEach((attachment) => {
      if (isImageAttachment(attachment.fileUrl, attachment.fileType)) {
        nextPaths.push(attachment.fileUrl);
      }
    });

    return [...new Set(nextPaths)];
  }, [project, details]);

  const pdfFormData = useMemo(() => {
    if (!project) return {};

    const normalizedAttachments = normalizeReferenceAttachments(
      project.attachments || details.attachments || [],
    );
    const imageAttachments = normalizedAttachments.filter((attachment) =>
      isImageAttachment(attachment.fileUrl, attachment.fileType),
    );
    const sampleApprovalRequired = Boolean(project?.sampleRequirement?.isRequired);
    const corporateEmergencyEnabled =
      project?.projectType === "Corporate Job" &&
      Boolean(project?.corporateEmergency?.isEnabled);
    const sampleImageNote = String(details?.sampleImageNote || "").trim();

    return {
      projectName: resolveProjectNameForForm(details) || details.projectName,
      projectIndicator: details.projectIndicator || "",
      contactType: details.contactType,
      supplySource: details.supplySource,
      deliveryDate: details.deliveryDate
        ? new Date(details.deliveryDate).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "N/A",
      deliveryTime: details.deliveryTime,
      deliveryLocation: details.deliveryLocation,
      briefOverview: details.briefOverview,
      leadLabel: getLeadDisplay(project, details.lead || "Unassigned"),
      departments: project.departments,
      acknowledgements: project.acknowledgements || [],
      items: project.items,
      uncontrollableFactors: project.uncontrollableFactors,
      productionRisks: project.productionRisks,
      attachments: imageAttachments,
      sampleImage: project.sampleImage || details.sampleImage,
      sampleImageNote,
      details,
      sampleRequired: sampleApprovalRequired,
      corporateEmergency: corporateEmergencyEnabled,
    };
  }, [details, project]);

  const pdfType = useMemo(() => {
    if (!project) return "STANDARD";
    if (project.projectType === "Emergency" || project.priority === "Urgent") {
      return "EMERGENCY";
    }
    if (project.projectType === "Quote") {
      return "QUOTE";
    }
    if (project.projectType === "Corporate Job") {
      return "CORPORATE";
    }
    return "STANDARD";
  }, [project]);

  const fileName = useMemo(
    () => `Project_${project?.orderId || "Brief"}.pdf`,
    [project?.orderId],
  );

  const handleDownload = useCallback(async () => {
    if (!project || generatingRef.current) return;

    generatingRef.current = true;
    setIsGenerating(true);
    setError("");

    let imageUrls = {};

    try {
      const [{ pdf }, { default: ProjectSummaryPDF }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("../../pages/CreateProject/ProjectSummaryPDF"),
      ]);

      imageUrls = await buildPdfImageUrls(imagePaths);
      const blob = await pdf(
        <ProjectSummaryPDF
          formData={pdfFormData}
          imageUrls={imageUrls}
          pdfType={pdfType}
        />,
      ).toBlob();

      triggerBlobDownload(blob, fileName);
    } catch (err) {
      console.error("Failed to generate project PDF:", err);
      setError("PDF download failed. Try again.");
    } finally {
      revokeObjectUrlMap(imageUrls);
      generatingRef.current = false;
      setIsGenerating(false);
    }
  }, [fileName, imagePaths, pdfFormData, pdfType, project]);

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={isGenerating || !project}
      title={error || undefined}
      aria-busy={isGenerating}
      style={{
        ...DOWNLOAD_BUTTON_STYLE,
        ...(isGenerating ? DISABLED_BUTTON_STYLE : {}),
      }}
    >
      {isGenerating ? "Generating..." : "Download Brief"}
    </button>
  );
};

export default React.memo(ProjectPdfDownload);
