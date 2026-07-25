const assert = require("node:assert/strict");
const {
  __riskRoutingTestUtils: {
    PRODUCTION_DEPARTMENT_PROFILES,
    buildProductionItemSubjectsByDepartment,
    buildFallbackRiskSuggestions,
    filterRiskSuggestionsToItemAssignments,
  },
} = require("../src/controllers/projectController");

const woodenPortrait = {
  description: "Wooden Portrait",
  breakdown: "Hardwood portrait",
  quantity: 1,
  productionAssignments: [
    { department: "woodme", scope: "Cut, sand, polish, and finish" },
  ],
};

const subjectsByDepartment = buildProductionItemSubjectsByDepartment([
  woodenPortrait,
]);
assert.deepEqual(subjectsByDepartment.get("woodme"), ["Wooden Portrait"]);
assert.equal(subjectsByDepartment.has("dtf"), false);

const context = {
  projectName: "Wooden Portrait",
  productionDepartments: ["woodme", "dtf"],
  items: [woodenPortrait],
  itemInsights: [
    {
      itemRef: "Wooden Portrait",
      subject: "Wooden Portrait",
      familyId: "wood",
      familyLabel: "Wood",
      department: "woodme",
      departmentLabel: "Woodme",
      productionAssignments: [
        {
          department: "woodme",
          departmentLabel: "Woodme",
          scope: "Cut, sand, polish, and finish",
        },
      ],
      quantity: 1,
    },
  ],
  constraintTags: [],
  requiredFacets: [],
  productionDepartmentLabels: ["Woodme", "DTF Printing"],
  existingRiskDescriptions: [],
  previousShownDescriptions: [],
};

const fallback = buildFallbackRiskSuggestions(context);
assert.ok(fallback.length > 0);
assert.equal(
  fallback.some((suggestion) => suggestion.department === "dtf"),
  false,
);
assert.equal(
  fallback.some((suggestion) => /\[DTF Printing\]/i.test(suggestion.description)),
  false,
);
assert.equal(
  fallback.some((suggestion) =>
    /\b(dtf|screen print|heat press|ink adhesion|printhead|icc profile|engraving)\b/i.test(
      `${suggestion.description} ${suggestion.preventive}`,
    ),
  ),
  false,
);
assert.match(
  PRODUCTION_DEPARTMENT_PROFILES.woodme.description,
  /wooden items/i,
);

const invalidAiSuggestion = {
  department: "dtf",
  itemRef: "Wooden Portrait",
  description:
    '[DTF Printing] Machine setup may drift while producing "Wooden Portrait".',
  preventive: "Validate the first piece.",
  facet: "setup",
};
const validAiSuggestion = {
  department: "woodme",
  itemRef: "Wooden Portrait",
  description:
    '[Woodme] Wood moisture variation may affect "Wooden Portrait".',
  preventive: "Condition and inspect the wood before production.",
  facet: "material",
};

assert.deepEqual(
  filterRiskSuggestionsToItemAssignments(
    [invalidAiSuggestion, validAiSuggestion],
    context,
  ).map((suggestion) => suggestion.department),
  ["woodme"],
);

const semanticSuggestions = [
  {
    department: "woodme",
    itemRef: "Wooden Portrait",
    description:
      '[Woodme] DTF ink adhesion may fail on "Wooden Portrait".',
    preventive: "Calibrate the heat press.",
    facet: "quality",
  },
  validAiSuggestion,
  {
    department: "local-outsourcing",
    itemRef: "Branded Mug",
    description:
      '[Local Outsourcing] Our machine operator shift may delay "Branded Mug".',
    preventive: "Calibrate our machine before the shift.",
    facet: "capacity",
  },
  {
    department: "local-outsourcing",
    itemRef: "Branded Mug",
    description:
      '[Local Outsourcing] Vendor material substitution may affect "Branded Mug".',
    preventive: "Approve a sample and lock the vendor specification.",
    facet: "supplier",
  },
  {
    department: "overseas",
    itemRef: "Custom Bottle",
    description:
      '[Overseas] Machine operator shift changes may affect "Custom Bottle".',
    preventive: "Brief our machine operator.",
    facet: "capacity",
  },
  {
    department: "overseas",
    itemRef: "Custom Bottle",
    description:
      '[Overseas] Customs clearance may delay "Custom Bottle".',
    preventive: "Verify import documents before shipment.",
    facet: "logistics",
  },
];
const multiDepartmentContext = {
  ...context,
  productionDepartments: ["woodme", "local-outsourcing", "overseas"],
  items: [
    woodenPortrait,
    {
      description: "Branded Mug",
      productionAssignments: [
        {
          department: "local-outsourcing",
          scope: "External local vendor production and delivery",
        },
      ],
    },
    {
      description: "Custom Bottle",
      productionAssignments: [
        {
          department: "overseas",
          scope: "International supplier production and import",
        },
      ],
    },
  ],
};
assert.deepEqual(
  filterRiskSuggestionsToItemAssignments(
    semanticSuggestions,
    multiDepartmentContext,
  ).map((suggestion) => suggestion.department),
  ["woodme", "local-outsourcing", "overseas"],
);

console.log("Production risk item-routing regression checks passed.");
