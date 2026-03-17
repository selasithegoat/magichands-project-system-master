const mongoose = require("mongoose");

const InventoryItemIdentitySchema = new mongoose.Schema(
  {
    itemName: {
      type: String,
      required: true,
      trim: true,
    },
    itemId: {
      type: String,
      required: true,
      trim: true,
    },
    itemNameKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    itemIdKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
  },
  { timestamps: true },
);

InventoryItemIdentitySchema.index({ itemNameKey: 1 }, { unique: true });
InventoryItemIdentitySchema.index({ itemIdKey: 1 }, { unique: true });

module.exports = mongoose.model(
  "InventoryItemIdentity",
  InventoryItemIdentitySchema,
);
