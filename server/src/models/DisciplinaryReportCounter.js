const mongoose = require("mongoose");

const DisciplinaryReportCounterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  value: { type: Number, default: 0, min: 0 },
});

module.exports = mongoose.model(
  "DisciplinaryReportCounter",
  DisciplinaryReportCounterSchema,
);
