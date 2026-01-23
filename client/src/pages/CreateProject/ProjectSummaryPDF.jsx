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
});

const ProjectSummaryPDF = ({
  formData,
  imageUrls = {},
  pdfType = "STANDARD",
}) => {
  console.log("PDF Component Rendering. Attachments:", formData.attachments);

  // Theme Colors
  const THEME = {
    EMERGENCY: "#EF4444", // Red
    QUOTE: "#F97316", // Orange
    STANDARD: "#10B981", // Green (Default)
  };

  const themeColor = THEME[pdfType] || THEME.STANDARD;

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

        {/* Basics */}
        <View style={styles.section}>
          <Text
            style={[styles.sectionTitle, { borderBottomColor: themeColor }]}
          >
            Project Basics
          </Text>
          <View style={styles.row}>
            <Text style={styles.label}>Project Name:</Text>
            <Text style={styles.value}>{formData.projectName || "N/A"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Contact Type:</Text>
            <Text style={styles.value}>{formData.contactType}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Supply Source:</Text>
            <Text style={styles.value}>{formData.supplySource}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Brief Overview:</Text>
            <Text style={styles.value}>{formData.briefOverview || "N/A"}</Text>
          </View>
          {/* Sample Image */}
          {(formData.sampleImage ||
            (formData.details && formData.details.sampleImage)) &&
            imageUrls[formData.sampleImage || formData.details.sampleImage] && (
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
                  src={
                    imageUrls[
                      formData.sampleImage || formData.details.sampleImage
                    ]
                  }
                />
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
              formData.departments.map((dept, index) => (
                <Text key={index} style={styles.departmentBadge}>
                  {dept}
                </Text>
              ))
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
      {(formData.sampleImage ||
        (formData.details && formData.details.sampleImage)) &&
        imageUrls[formData.sampleImage || formData.details.sampleImage] && (
          <Page size="A4" style={styles.page}>
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Reference Material</Text>
                <Text style={styles.subtitle}>
                  {formData.projectName} - Sample Image
                </Text>
              </View>
            </View>
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              {/* Note: React-PDF Image requires valid source. Localhost URL might work if accessible, 
                 otherwise might need base64 or absolute path. 
                 Since this is client-side generation, http://localhost:5000/... matches browser access.
             */}
              <Image
                src={
                  imageUrls[
                    formData.sampleImage || formData.details.sampleImage
                  ]
                }
                format="png"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </View>
            <View style={styles.footer}>
              <Text>
                MagicHands Project Management System • Confidential Document
              </Text>
            </View>
          </Page>
        )}

      {/* [NEW] Attachments Pages - FORCE RENDER */}
      {formData.attachments &&
        formData.attachments.length > 0 &&
        formData.attachments.map((path, index) => {
          // Render only if we have a resolved blob URL
          if (!imageUrls[path]) return null;

          console.log(`Rendering PDF Page for: ${path}`);

          return (
            <Page key={index} size="A4" style={styles.page}>
              <View style={styles.header}>
                <View>
                  <Text style={styles.title}>Reference Material</Text>
                  <Text style={styles.subtitle}>
                    {formData.projectName} - Attachment #{index + 1}
                  </Text>
                </View>
              </View>
              <View
                style={{
                  flex: 1,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Image
                  src={imageUrls[path]}
                  format="png"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                  }}
                />
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
