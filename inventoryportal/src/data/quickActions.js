export const quickActions = [
  {
    key: "add-record",
    title: "Add Inventory Item",
    description: "Create a new SKU and assign it to a location.",
    target: "inventory-records",
  },
  {
    key: "receive-shipment",
    title: "Receive Shipment",
    description: "Log supplier deliveries and update stock counts.",
    target: "purchase-orders",
  },
  {
    key: "adjust-stock",
    title: "Adjust Stock",
    description: "Record cycle count adjustments and variances.",
    target: "stock-transactions",
  },
];
