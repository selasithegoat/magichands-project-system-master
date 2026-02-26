import React, { useState, useEffect, useMemo } from "react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import ProjectSummaryPDF from "../../pages/CreateProject/ProjectSummaryPDF";
import { getLeadDisplay } from "../../utils/leadDisplay";

const ProjectPdfDownload = ({ project }) => {
  const [imageUrls, setImageUrls] = useState({});
  const [isReady, setIsReady] = useState(false);
  const details = project?.details || {};
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

    const attachments = project.attachments || details.attachments;
    if (Array.isArray(attachments)) {
      attachments.forEach((path) => {
        if (
          typeof path === "string" &&
          path.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i)
        ) {
          nextPaths.push(path);
        }
      });
    }

    return [...new Set(nextPaths)];
  }, [project, details]);

  // PDF Image Processing
  useEffect(() => {
    if (!project) {
      setImageUrls({});
      setIsReady(false);
      return;
    }

    let cancelled = false;
    setIsReady(false);

    const fetchImages = async () => {
      if (imagePaths.length === 0) {
        if (!cancelled) {
          setImageUrls((prev) => {
            Object.values(prev).forEach((url) => URL.revokeObjectURL(url));
            return {};
          });
          setIsReady(true);
        }
        return;
      }

      const urls = {};
      await Promise.all(
        imagePaths.map(async (path) => {
          try {
            const res = await fetch(`${path}`);
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const blob = await res.blob();

            const img = new Image();
            const blobUrl = URL.createObjectURL(blob);
            img.src = blobUrl;

            await new Promise((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = (e) => reject(e);
            });

            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            const pngBlob = await new Promise((resolve) =>
              canvas.toBlob(resolve, "image/png"),
            );
            if (!pngBlob) {
              URL.revokeObjectURL(blobUrl);
              return;
            }

            const pngUrl = URL.createObjectURL(pngBlob);
            urls[path] = pngUrl;

            URL.revokeObjectURL(blobUrl);
          } catch (err) {
            console.error(`Error processing image ${path}:`, err);
          }
        }),
      );

      if (cancelled) {
        Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      setImageUrls((prev) => {
        Object.values(prev).forEach((url) => URL.revokeObjectURL(url));
        return urls;
      });
      setIsReady(true);
    };

    fetchImages();
    return () => {
      cancelled = true;
    };
  }, [imagePaths]);

  useEffect(
    () => () => {
      Object.values(imageUrls).forEach((url) => URL.revokeObjectURL(url));
    },
    [imageUrls],
  );

  const pdfFormData = useMemo(() => {
    if (!project) return {};

    const allAttachments = project.attachments || details.attachments || [];
    const imageAttachments = allAttachments.filter(
      (path) =>
        typeof path === "string" && path.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i),
    );
    const sampleApprovalRequired = Boolean(project?.sampleRequirement?.isRequired);
    const corporateEmergencyEnabled =
      project?.projectType === "Corporate Job" &&
      Boolean(project?.corporateEmergency?.isEnabled);

    return {
      projectName: details.projectName || project.projectName,
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

  return (
    <PDFDownloadLink
      document={
        <ProjectSummaryPDF
          formData={pdfFormData}
          imageUrls={imageUrls}
          pdfType={pdfType}
        />
      }
      fileName={fileName}
      style={{
        textDecoration: "none",
        padding: "0.5rem 1rem",
        color: "#fff",
        backgroundColor: "#475569", // Slate color
        borderRadius: "6px",
        fontSize: "0.875rem",
        fontWeight: "500",
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
      }}
    >
      {({ loading }) => (
        <>{loading || !isReady ? "Generating..." : "Download Brief"}</>
      )}
    </PDFDownloadLink>
  );
};

export default React.memo(ProjectPdfDownload);
