const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} = require("docx");

const CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const FONT = "Aptos";
const toText = (value) => String(value || "").trim();
const formatDateTime = (value) => {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : new Intl.DateTimeFormat("en-GB", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Africa/Accra",
      }).format(date);
};

const run = (text, options = {}) =>
  new TextRun({ text: toText(text), font: FONT, size: 20, ...options });

const paragraph = (text, options = {}) =>
  new Paragraph({
    children: [run(text, options.run)],
    spacing: { after: options.after ?? 120, line: 260 },
    alignment: options.alignment,
    bullet: options.bullet ? { level: 0 } : undefined,
  });

const heading = (text) =>
  new Paragraph({
    children: [run(text, { bold: true, color: "1D4ED8", size: 22 })],
    spacing: { before: 220, after: 100 },
  });

const cell = (text, { bold = false, fill } = {}) =>
  new TableCell({
    shading: fill ? { fill } : undefined,
    margins: { top: 70, bottom: 70, left: 90, right: 90 },
    children: [new Paragraph({ children: [run(text, { bold })] })],
  });

const table = (rows, widths) =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: "CBD5E1" },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: "CBD5E1" },
      left: { style: BorderStyle.SINGLE, size: 2, color: "CBD5E1" },
      right: { style: BorderStyle.SINGLE, size: 2, color: "CBD5E1" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
    },
    rows,
  });

const generateDisciplinaryReportDocument = async (report) => {
  const attendees = (report.attendees || []).filter((entry) => entry.attendanceStatus === "present");
  const children = [
    new Paragraph({
      children: [run("DISCIPLINARY COMMITTEE MEETING REPORT", { bold: true, size: 30 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [run("CHALLENGE REVIEW • FINDINGS • ACTIONS • FINAL DECISION", { bold: true, color: "2563EB", size: 18 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    }),
    table([
      new TableRow({ children: [cell("Report number", { bold: true, fill: "EFF6FF" }), cell(report.reportNumber)] }),
      new TableRow({ children: [cell("Order number", { bold: true, fill: "EFF6FF" }), cell(report.projectSnapshot?.orderId)] }),
      new TableRow({ children: [cell("Challenge title", { bold: true, fill: "EFF6FF" }), cell(report.challengeTitle)] }),
      new TableRow({ children: [cell("Project", { bold: true, fill: "EFF6FF" }), cell(report.projectSnapshot?.projectName)] }),
      new TableRow({ children: [cell("Scrum Lead / Moderator", { bold: true, fill: "EFF6FF" }), cell(report.moderator?.name)] }),
      new TableRow({ children: [cell("Meeting started", { bold: true, fill: "EFF6FF" }), cell(formatDateTime(report.meeting?.startedAt))] }),
      new TableRow({ children: [cell("Meeting ended", { bold: true, fill: "EFF6FF" }), cell(formatDateTime(report.meeting?.endedAt))] }),
      new TableRow({ children: [cell("Number present", { bold: true, fill: "EFF6FF" }), cell(String(attendees.length))] }),
    ], [2800, 6500]),
    heading("1. Attendance — names of people present"),
    table([
      new TableRow({ children: [cell("S/N", { bold: true, fill: "DBEAFE" }), cell("Name", { bold: true, fill: "DBEAFE" }), cell("Department / role", { bold: true, fill: "DBEAFE" })] }),
      ...attendees.map((entry, index) => new TableRow({ children: [cell(String(index + 1)), cell(entry.name), cell(`${(entry.department || []).join(", ")}${entry.role ? ` / ${entry.role}` : ""}`)] })),
    ], [800, 3600, 4900]),
    heading("2. Challenge brief"),
    paragraph(report.challengeBrief || "Not recorded"),
  ];

  if (report.projectImpact) {
    children.push(paragraph(`Project impact: ${report.projectImpact}`));
  }

  children.push(heading("3. Team probing, discussion and findings"));
  (report.findings || []).forEach((finding) => {
    children.push(paragraph(finding.title, { run: { bold: true } }));
    if (finding.discussion) children.push(paragraph(`Discussion: ${finding.discussion}`));
    if (finding.evidence) children.push(paragraph(`Evidence considered: ${finding.evidence}`));
    children.push(paragraph(`Finding: ${finding.conclusion}`));
  });
  if (!(report.findings || []).length) children.push(paragraph("No findings recorded."));

  children.push(heading("4. Proposed next line of action and votes"));
  children.push(table([
    new TableRow({ children: [cell("S/N", { bold: true, fill: "DBEAFE" }), cell("Action / recommendation", { bold: true, fill: "DBEAFE" }), cell("For", { bold: true, fill: "DBEAFE" }), cell("Against", { bold: true, fill: "DBEAFE" }), cell("Abstain", { bold: true, fill: "DBEAFE" })] }),
    ...(report.proposals || []).map((entry, index) => new TableRow({ children: [cell(String(index + 1)), cell(`${entry.selected ? "Selected: " : ""}${entry.recommendation}`), cell(String(entry.votesFor || 0)), cell(String(entry.votesAgainst || 0)), cell(String(entry.abstentions || 0))] })),
  ], [650, 5450, 1000, 1100, 1100]));

  children.push(heading("5. Accountability and corrective action"));
  children.push(table([
    new TableRow({ children: [cell("Employee", { bold: true, fill: "DBEAFE" }), cell("Finding", { bold: true, fill: "DBEAFE" }), cell("Severity", { bold: true, fill: "DBEAFE" }), cell("Decision", { bold: true, fill: "DBEAFE" })] }),
    ...(report.accountability || []).map((entry) => new TableRow({ children: [cell(entry.name), cell(entry.summary), cell(entry.severity), cell(entry.penalized ? `${String(entry.penaltyType || "").replace(/_/g, " ")}: ${entry.penaltyDetails || "Details pending"}` : "No penalty") ] })),
  ], [2100, 3700, 1200, 2300]));

  children.push(
    heading("6. Final conclusion drawn by the committee"),
    paragraph(report.committeeConclusion || "Pending"),
    heading("7. Management decision"),
    paragraph(report.managementDecision || "Pending"),
    paragraph(`Report status: ${String(report.status || "draft").toUpperCase()}`, { run: { bold: true }, after: 0 }),
  );

  const document = new Document({
    sections: [{
      properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      children,
      footers: {
        default: new Footer({
          children: [new Paragraph({ children: [run("CONFIDENTIAL — FOR AUTHORIZED INTERNAL USE ONLY", { bold: true, color: "64748B", size: 16 })], alignment: AlignmentType.CENTER })],
        }),
      },
    }],
  });

  return {
    buffer: await Packer.toBuffer(document),
    contentType: CONTENT_TYPE,
    filename: `${toText(report.reportNumber).replace(/[^a-z0-9_-]/gi, "-") || "disciplinary-report"}.docx`,
  };
};

module.exports = { generateDisciplinaryReportDocument };
