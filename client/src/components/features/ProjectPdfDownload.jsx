import React, { useState, useEffect } from "react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import ProjectSummaryPDF from "../../pages/CreateProject/ProjectSummaryPDF";
import { getLeadDisplay } from "../../utils/leadDisplay";

const ProjectPdfDownload = ({ project }) => {
  const [imageUrls, setImageUrls] = useState({});
  const [isReady, setIsReady] = useState(false);

  // PDF Image Processing
  useEffect(() => {
    if (!project) return;

    const fetchImages = async () => {
      const urls = {};
      const pathsToFetch = [];
      const details = project.details || {};

      // Add Sample Image
      const sampleImg = project.sampleImage || details.sampleImage;
      if (
        sampleImg &&
        typeof sampleImg === "string" &&
        sampleImg.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i)
      ) {
        pathsToFetch.push(sampleImg);
      }

      // Add Attachments
      const attachments = project.attachments || details.attachments;
      if (attachments && Array.isArray(attachments)) {
        attachments.forEach((path) => {
          if (
            typeof path === "string" &&
            path.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i)
          ) {
            pathsToFetch.push(path);
          }
        });
      }

      if (pathsToFetch.length === 0) {
        setIsReady(true);
        return;
      }

      await Promise.all(
        pathsToFetch.map(async (path) => {
          try {
            // 1. Fetch Blob (from localhost:5000 proxied or direct)
            const res = await fetch(`${path}`);
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const blob = await res.blob();

            // 2. Load into Image to allow Canvas conversion
            const img = new Image();
            const blobUrl = URL.createObjectURL(blob);
            img.src = blobUrl;

            await new Promise((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = (e) => reject(e);
            });

            // 3. Draw to Canvas and Export as PNG
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            // 4. Get PNG Blob
            const pngBlob = await new Promise((resolve) =>
              canvas.toBlob(resolve, "image/png"),
            );

            // 5. Create Object URL for the PNG
            const pngUrl = URL.createObjectURL(pngBlob);
            urls[path] = pngUrl;

            // Cleanup temp url
            URL.revokeObjectURL(blobUrl);
          } catch (err) {
            console.error(`Error processing image ${path}:`, err);
          }
        }),
      );

      setImageUrls(urls);
      setIsReady(true);
    };

    fetchImages();
  }, [project]);

  // Helper to map project data to PDF formData structure
  const getPdfFormData = () => {
    if (!project) return {};
    const details = project.details || {};
    const allAttachments = project.attachments || details.attachments || [];
    const imageAttachments = allAttachments.filter(
      (path) => typeof path === "string" && path.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i),
    );
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
      items: project.items,
      uncontrollableFactors: project.uncontrollableFactors,
      productionRisks: project.productionRisks,
      attachments: imageAttachments,
      sampleImage: project.sampleImage || details.sampleImage,
      details: details,
    };
  };

  return (
    <PDFDownloadLink
      document={
        <ProjectSummaryPDF
          formData={getPdfFormData()}
          imageUrls={imageUrls}
          pdfType={
            project.projectType === "Emergency" || project.priority === "Urgent"
              ? "EMERGENCY"
              : project.projectType === "Quote"
                ? "QUOTE"
                : project.projectType === "Corporate Job"
                  ? "CORPORATE"
                  : "STANDARD"
          }
        />
      }
      fileName={`Project_${project.orderId || "Brief"}.pdf`}
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

export default ProjectPdfDownload;
