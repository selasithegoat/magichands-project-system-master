const LEGACY_DEPARTMENT_ID_ALIASES = {
  "outside-production": "local-outsourcing",
  "outside production": "local-outsourcing",
};

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
  { id: "local-outsourcing", label: "Local Outsourcing" },
];

export const PRODUCTION_SUB_DEPARTMENTS = [
  "dtf",
  "uv-dtf",
  "uv-printing",
  "engraving",
  "large-format",
  "digital-press",
  "digital-heat-press",
  "offset-press",
  "screen-printing",
  "embroidery",
  "sublimation",
  "digital-cutting",
  "pvc-id",
  "business-cards",
  "installation",
  "overseas",
  "woodme",
  "fabrication",
  "signage",
  "local-outsourcing",
];

export const GRAPHICS_SUB_DEPARTMENTS = ["graphics"];
export const STORES_SUB_DEPARTMENTS = ["stock", "packaging"];
export const PHOTOGRAPHY_SUB_DEPARTMENTS = ["photography"];

export const ALL_ENGAGED_DEPARTMENTS = [
  "Production",
  "Graphics",
  "Stores",
  "Photography",
];

const DEPARTMENT_ID_LOOKUP = new Map(
  DEPARTMENTS.flatMap((dept) => [
    [String(dept.id || "").trim().toLowerCase(), dept.id],
    [String(dept.label || "").trim().toLowerCase(), dept.id],
  ]),
);

export const normalizeDepartmentId = (value) => {
  if (value === null || value === undefined) return "";

  const raw =
    typeof value === "object"
      ? value.id || value.value || value.label || value.name || ""
      : value;
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";

  const normalized = trimmed.toLowerCase().replace(/_/g, "-");
  if (LEGACY_DEPARTMENT_ID_ALIASES[normalized]) {
    return LEGACY_DEPARTMENT_ID_ALIASES[normalized];
  }

  return DEPARTMENT_ID_LOOKUP.get(normalized) || trimmed;
};

export const getDepartmentLabel = (id) => {
  const normalizedId = normalizeDepartmentId(id);
  const dept = DEPARTMENTS.find((d) => d.id === normalizedId);
  return dept ? dept.label : id;
};
