const assert = require("node:assert/strict");
const {
  __riskRoutingTestUtils: {
    buildProductionItemSubjectsByDepartment,
    buildFallbackRiskSuggestions,
    filterRiskSuggestionsToItemAssignments,
  },
} = require("../src/controllers/projectController");

const woodenPortrait = {
  description: "Wooden Portrait",
  breakdown: "Engraved hardwood portrait",
  quantity: 1,
  productionAssignments: [
    { department: "woodme", scope: "Cut, engrave, and finish" },
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
          scope: "Cut, engrave, and finish",
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

console.log("Production risk item-routing regression checks passed.");
