export const DEPARTMENTS = [
  { id: "graphics", label: "Graphics" },
  { id: "stock", label: "Stock" },
  { id: "packaging", label: "Packaging" },
  { id: "photography", label: "Photography" },
  { id: "dtf", label: "DTF Printing" },
  { id: "uv-dtf", label: "UV DTF Printing" },
  { id: "uv-printing", label: "UV Printing" },
  { id: "engraving", label: "Engraving" },
  { id: "large-format", label: "Large Format" },
  { id: "digital-press", label: "Digital Press" },
  { id: "digital-heat-press", label: "Digital Heat Press" },
  { id: "offset-press", label: "Offset Press" },
  { id: "screen-printing", label: "Screen Printing" },
  { id: "embroidery", label: "Embroidery" },
  { id: "sublimation", label: "Sublimation" },
  { id: "digital-cutting", label: "Digital Cutting" },
  { id: "pvc-id", label: "PVC ID Cards" },
  { id: "business-cards", label: "Business Cards" },
  { id: "installation", label: "Installation" },
  { id: "overseas", label: "Overseas" },
  { id: "woodme", label: "Woodme" },
  { id: "fabrication", label: "Fabrication" },
  { id: "signage", label: "Signage" },
  { id: "outside-production", label: "Outside Production" },
];

export const getDepartmentLabel = (id) => {
  const dept = DEPARTMENTS.find((d) => d.id === id);
  return dept ? dept.label : id;
};
