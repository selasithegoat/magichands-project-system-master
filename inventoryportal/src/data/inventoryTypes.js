export const inventoryTypeRows = [
  {
    id: "type-raw",
    name: "Raw Materials",
    description: "Primary production components and unprocessed stock.",
    fields: 12,
    records: "1,240",
    created: "Oct 12, 2023",
  },
  {
    id: "type-finished",
    name: "Finished Goods",
    description: "Completed products ready for customer fulfillment.",
    fields: 8,
    records: "850",
    created: "Nov 05, 2023",
  },
  {
    id: "type-mro",
    name: "MRO Supplies",
    description: "Maintenance, Repair, and Operating materials.",
    fields: 6,
    records: "420",
    created: "Dec 01, 2023",
  },
];

export const inventoryTypeFields = [
  {
    id: "field-material-name",
    name: "Material Name",
    type: "Text",
    required: true,
    defaultValue: "None",
  },
  {
    id: "field-unit-cost",
    name: "Unit Cost",
    type: "Currency",
    required: true,
    defaultValue: "0.00",
  },
  {
    id: "field-supplier-type",
    name: "Supplier Type",
    type: "Dropdown",
    required: false,
    defaultValue: "None",
  },
  {
    id: "field-arrival-date",
    name: "Arrival Date",
    type: "Date",
    required: false,
    defaultValue: "",
  },
];
