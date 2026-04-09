import React from "react";
import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
  Font,
  Image, // [NEW]
} from "@react-pdf/renderer";
import { normalizeReferenceAttachments } from "../../utils/referenceAttachments";
import {
  buildProjectNameRuns,
  formatProjectDisplayName,
} from "../../utils/projectName";

// Register fonts if needed (optional, using standard fonts for now)
// Font.register({
//   family: 'Inter',
//   src: 'path/to/Inter.ttf'
// });

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    padding: 30,
    fontFamily: "Helvetica",
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 2,
    // borderBottomColor: "#10B981", // Removed static color
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1E293B",
  },
  subtitle: {
    fontSize: 12,
    color: "#64748B",
  },
  section: {
    marginBottom: 15,
    padding: 10,
    backgroundColor: "#F8FAFC",
    borderRadius: 5,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#0F172A",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingBottom: 4,
  },
  row: {
    flexDirection: "row",
    marginBottom: 5,
  },
  label: {
    width: "35%",
    fontSize: 10,
    color: "#64748B",
    fontWeight: "bold",
  },
  value: {
    width: "65%",
    fontSize: 10,
    color: "#334155",
  },
  valueBold: {
    fontWeight: "bold",
  },
  badge: {
    padding: "3 8",
    borderRadius: 12,
    fontSize: 8,
    color: "#FFFFFF",
  },
  departmentBadge: {
    backgroundColor: "#EC4899", // Pink
    marginRight: 5,
    padding: "2 6",
    borderRadius: 4,
    color: "white",
    fontSize: 9,
  },
  departmentBadgeAcknowledged: {
    backgroundColor: "#10B981", // Green
  },
  itemRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingVertical: 4,
  },
  itemHeader: {
    flexDirection: "row",
    backgroundColor: "#E2E8F0",
    paddingVertical: 5,
    marginBottom: 5,
  },
  colQty: {
    width: "15%",
    fontSize: 9,
    textAlign: "center",
    fontWeight: "bold",
  },
  colDesc: { width: "50%", fontSize: 9, fontWeight: "bold" },
  colLoc: { width: "35%", fontSize: 9, fontWeight: "bold" },
  colQtyVal: { width: "15%", fontSize: 9, textAlign: "center" },
  colDescVal: { width: "50%", fontSize: 9 },
  colLocVal: { width: "35%", fontSize: 9 },

  footer: {
    position: "absolute",
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 8,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 10,
  },
  specialStampRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 10,
  },
  specialStamp: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 8,
    fontSize: 8,
    fontWeight: "bold",
    textTransform: "uppercase",
    marginRight: 6,
    marginBottom: 6,
  },
  specialWatermark: {
    position: "absolute",
    top: "42%",
    left: 35,
    right: 35,
    alignItems: "center",
    justifyContent: "center",
  },
  specialWatermarkText: {
    fontSize: 30,
    fontWeight: "bold",
    textTransform: "uppercase",
    color: "rgba(127,29,29,0.12)",
    textAlign: "center",
  },
  referenceCaption: {
    fontSize: 9,
    color: "#64748B",
    marginTop: 4,
    lineHeight: 1.4,
  },
  referencePageBody: {
    flexGrow: 1,
    paddingTop: 10,
  },
  referenceImageFrame: {
    width: "100%",
    height: 620,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  referencePageImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },
});

const SUPPLY_SOURCE_LABELS = {
  "in-house": "In-house",
  purchase: "Purchase",
  "client-supply": "Client Supply",
};

const formatSupplySource = (value) => {
  const list = Array.isArray(value)
    ? value.filter(Boolean)
    : typeof value === "string" && value.trim()
      ? value.trim().startsWith("[") && value.trim().endsWith("]")
        ? (() => {
            try {
              const parsed = JSON.parse(value.trim());
              return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
            } catch {
              return value
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean);
            }
          })()
        : value
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
      : [];

  if (!list.length) return "N/A";
  return list.map((entry) => SUPPLY_SOURCE_LABELS[entry] || entry).join(", ");
};

const ProjectSummaryPDF = ({
  formData,
  imageUrls = {},
  pdfType = "STANDARD",
}) => {
  const sampleImage =
    formData.sampleImage || (formData.details && formData.details.sampleImage);
  const sampleImageNote = String(
    formData.sampleImageNote ||
      (formData.details && formData.details.sampleImageNote) ||
      "",
  ).trim();
  const attachmentItems = normalizeReferenceAttachments(
    formData.attachments ||
      (formData.details && formData.details.attachments) ||
      [],
  );
  const acknowledgedDepartments = new Set(
    (formData.acknowledgements || []).map((ack) => ack.department),
  );
  const sampleApprovalRequired = Boolean(formData.sampleRequired);
  const corporateEmergencyEnabled = Boolean(formData.corporateEmergency);
  const specialRequirements = [];
  if (sampleApprovalRequired) {
    specialRequirements.push("Sample Approval Required");
  }
  if (corporateEmergencyEnabled) {
    specialRequirements.push("Corporate Emergency");
  }
  // Theme Colors
  const THEME = {
    EMERGENCY: "#e74c3c", // Red
    QUOTE: "#f39c12", // Orange
    CORPORATE: "#42a165", // Green
    STANDARD: "#3498db", // Blue (Default)
  };

  const themeColor = THEME[pdfType] || THEME.STANDARD;
  const projectNameText = formatProjectDisplayName(
    formData,
    null,
    formData.projectName || "N/A",
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: themeColor }]}>
          <View>
            <Text style={styles.title}>Project Brief</Text>
            <Text style={styles.subtitle}>
              Generated on {new Date().toLocaleDateString()}
            </Text>
          </View>
          <View>
            <Text
              style={{ color: themeColor, fontSize: 12, fontWeight: "bold" }}
            >
              TYPE: {pdfType}
            </Text>
          </View>
        </View>

        {specialRequirements.length > 0 && (
          <View style={styles.specialStampRow}>
            {specialRequirements.map((entry, index) => (
              <Text
                key={`${entry}-${index}`}
                style={[
                  styles.specialStamp,
                  {
                    borderColor: "#fda4af",
                    color: "#9f1239",
                    backgroundColor: "#fff1f2",
                  },
                ]}
              >
                {entry}
              </Text>
            ))}
          </View>
        )}

        {specialRequirements.length > 0 && (
          <View style={styles.specialWatermark} fixed>
            <Text style={styles.specialWatermarkText}>
              {specialRequirements.join(" • ")}
            </Text>
          </View>
        )}

        {/* Basics */}
        <View style={styles.section}>
          <Text
            style={[styles.sectionTitle, { borderBottomColor: themeColor }]}
          >
            Project Basics
          </Text>
          <View style={styles.row}>
            <Text style={styles.label}>Project Name:</Text>
            <Text style={styles.value}>
              {buildProjectNameRuns(formData, null, "N/A").map(
                (run, index) => (
                  <Text
                    key={`project-name-${index}`}
                    style={run.bold ? styles.valueBold : null}
                  >
                    {run.text}
                  </Text>
                ),
              )}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Contact Type:</Text>
            <Text style={styles.value}>
              {formData.contactType || "None"}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Supply Source:</Text>
            <Text style={styles.value}>
              {formatSupplySource(formData.supplySource)}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Brief Overview:</Text>
            <Text style={styles.value}>{formData.briefOverview || "N/A"}</Text>
          </View>
          {specialRequirements.length > 0 && (
            <View style={styles.row}>
              <Text style={styles.label}>Special Requirements:</Text>
              <Text style={styles.value}>
                {specialRequirements.join(", ")}
              </Text>
            </View>
          )}
          {/* Sample Image */}
          {sampleImage && imageUrls[sampleImage] && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.label}>Reference Image:</Text>
              <Image
                style={{
                  width: 100,
                  height: 100,
                  objectFit: "contain",
                  marginTop: 5,
                }}
                format="png"
                src={imageUrls[sampleImage]}
              />
              {sampleImageNote && (
                <Text style={styles.referenceCaption}>
                  Note: {sampleImageNote}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Delivery */}
        <View style={styles.section}>
          <Text
            style={[styles.sectionTitle, { borderBottomColor: themeColor }]}
          >
            Delivery & Logistics
          </Text>
          <View style={styles.row}>
            <Text style={styles.label}>Delivery Date:</Text>
            <Text style={styles.value}>{formData.deliveryDate}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Delivery Time:</Text>
            <Text style={styles.value}>{formData.deliveryTime}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Location:</Text>
            <Text style={styles.value}>
              {formData.deliveryLocation || "N/A"}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Assigned Lead:</Text>
            <Text style={styles.value}>
              {formData.leadLabel || "Unassigned"}
            </Text>
          </View>
        </View>

        {/* Departments */}
        <View style={styles.section}>
          <Text
            style={[styles.sectionTitle, { borderBottomColor: themeColor }]}
          >
            Engaged Departments
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {formData.departments && formData.departments.length > 0 ? (
              formData.departments.map((dept, index) => {
                const isAcknowledged = acknowledgedDepartments.has(dept);
                return (
                  <Text
                    key={index}
                    style={[
                      styles.departmentBadge,
                      isAcknowledged && styles.departmentBadgeAcknowledged,
                    ]}
                  >
                    {dept}
                    {isAcknowledged ? " - Acknowledged" : ""}
                  </Text>
                );
              })
            ) : (
              <Text style={{ fontSize: 10, color: "#64748B" }}>
                None Selected
              </Text>
            )}
          </View>
        </View>

        {/* Items */}
        <View style={styles.section}>
          <Text
            style={[styles.sectionTitle, { borderBottomColor: themeColor }]}
          >
            Item Breakdown
          </Text>
          {/* Table Header */}
          <View style={styles.itemHeader}>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colDesc}>Description</Text>
            <Text style={styles.colLoc}>Breakdown</Text>
          </View>
          {/* Rows */}
          {formData.items &&
            formData.items.map((item, index) => (
              <View key={index} style={styles.itemRow}>
                <Text style={styles.colQtyVal}>{item.qty}</Text>
                <Text style={styles.colDescVal}>{item.description}</Text>
                <Text style={styles.colLocVal}>{item.breakdown}</Text>
              </View>
            ))}
          {(!formData.items || formData.items.length === 0) && (
            <Text
              style={{
                fontSize: 10,
                textAlign: "center",
                padding: 10,
                color: "#94A3B8",
              }}
            >
              No items listed.
            </Text>
          )}
        </View>

        {/* Risks */}
        <View style={styles.section}>
          <Text
            style={[styles.sectionTitle, { borderBottomColor: themeColor }]}
          >
            Risk Assessment
          </Text>
          <Text
            style={{
              fontSize: 10,
              fontWeight: "bold",
              color: "#475569",
              marginBottom: 4,
            }}
          >
            Uncontrollable Factors:
          </Text>
          {formData.uncontrollableFactors &&
          formData.uncontrollableFactors.length > 0 ? (
            formData.uncontrollableFactors.map((item, index) => (
              <View key={index} style={styles.row}>
                <Text style={{ fontSize: 9, color: "#334155" }}>
                  • {item.description} (Resp: {item.responsible?.label || "N/A"}
                  )
                </Text>
              </View>
            ))
          ) : (
            <Text style={{ fontSize: 9, color: "#94A3B8", marginBottom: 5 }}>
              None
            </Text>
          )}

          <Text
            style={{
              fontSize: 10,
              fontWeight: "bold",
              color: "#475569",
              marginTop: 8,
              marginBottom: 4,
            }}
          >
            Production Risks:
          </Text>
          {formData.productionRisks && formData.productionRisks.length > 0 ? (
            formData.productionRisks.map((item, index) => (
              <View key={index} style={{ marginBottom: 3 }}>
                <Text style={{ fontSize: 9, color: "#334155" }}>
                  • {item.description}
                </Text>
                <Text style={{ fontSize: 8, color: "#64748B", marginLeft: 8 }}>
                  {" "}
                  Preventive: {item.preventive}
                </Text>
              </View>
            ))
          ) : (
            <Text style={{ fontSize: 9, color: "#94A3B8" }}>None</Text>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>
            MagicHands Project Management System • Confidential Document
          </Text>
        </View>
      </Page>

      {/* [NEW] Image Page */}
      {sampleImage && imageUrls[sampleImage] && (
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Reference Material</Text>
              <Text style={styles.subtitle}>
                {projectNameText} - Sample Image
              </Text>
            </View>
          </View>
          <View style={styles.referencePageBody}>
            {/* Note: React-PDF Image requires valid source. 
               Since this is client-side generation, relative URLs match browser access through the Vite proxy.
           */}
            <View style={styles.referenceImageFrame}>
              <Image
                src={imageUrls[sampleImage]}
                format="png"
                style={styles.referencePageImage}
              />
            </View>
            {sampleImageNote && (
              <Text style={styles.referenceCaption}>
                Note: {sampleImageNote}
              </Text>
            )}
          </View>
          <View style={styles.footer}>
            <Text>
              MagicHands Project Management System • Confidential Document
            </Text>
          </View>
        </Page>
      )}

      {/* [NEW] Attachments Pages - FORCE RENDER */}
      {attachmentItems.length > 0 &&
        attachmentItems.map((attachment, index) => {
          const fileUrl = attachment.fileUrl;
          const note = String(attachment.note || "").trim();
          // Render only if we have a resolved blob URL
          if (!imageUrls[fileUrl]) return null;

          return (
            <Page key={index} size="A4" style={styles.page}>
              <View style={styles.header}>
                <View>
                  <Text style={styles.title}>Reference Material</Text>
                  <Text style={styles.subtitle}>
                    {projectNameText} - Attachment #{index + 1}
                  </Text>
                </View>
              </View>
              <View
                style={styles.referencePageBody}
              >
                <View style={styles.referenceImageFrame}>
                  <Image
                    src={imageUrls[fileUrl]}
                    format="png"
                    style={styles.referencePageImage}
                  />
                </View>
                {note && (
                  <Text style={styles.referenceCaption}>Note: {note}</Text>
                )}
              </View>
              <View style={styles.footer}>
                <Text>
                  MagicHands Project Management System • Confidential Document
                </Text>
              </View>
            </Page>
          );
        })}

      </Document>
  );
};

export default ProjectSummaryPDF;
